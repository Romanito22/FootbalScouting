"""Fixtures figées pour le calcul des groupes de pairs et des percentiles —
la zone à couvrir en priorité selon CLAUDE.md : un bug silencieux ici détruit
la crédibilité de tout le produit."""

import pandas as pd
import pytest

from vivier_pipeline.core import percentiles as percentiles_module
from vivier_pipeline.core.percentiles import PeerGroupResult, compute_peer_groups, parse_season_year

POSITION_LABELS = {"CM": "Milieux centraux", "DC": "Défenseurs centraux", "GK": "Gardiens"}


@pytest.fixture(autouse=True)
def fixed_metric_direction(monkeypatch: pytest.MonkeyPatch) -> None:
    """Registre figé et indépendant de packages/metrics, pour que ces tests
    ne bougent jamais sous l'effet d'un ajout de métrique ailleurs.
    `saves` ne s'applique qu'aux gardiens."""
    monkeypatch.setattr(
        percentiles_module, "metric_direction",
        lambda: {"goals": True, "fouls_committed": False, "saves": True},
    )
    monkeypatch.setattr(
        percentiles_module, "metrics_by_position",
        lambda: {
            "CM": ["goals", "fouls_committed"],
            "DC": ["goals", "fouls_committed"],
            "GK": ["saves"],
        },
    )


def _row(
    player_id: int, season: str, position_group: str, tier: int,
    goals: float | None, fouls: float,
    *, competition_id: int = 1, club_id: int = 1, minutes: int = 900,
    extra: dict | None = None,
) -> dict:
    metrics: dict = {"fouls_committed": fouls, **(extra or {})}
    if goals is not None:
        metrics["goals"] = goals
    return {
        "player_id": player_id,
        "season": season,
        "position_group": position_group,
        "tier": tier,
        "competition_id": competition_id,
        "club_id": club_id,
        "minutes": minutes,
        "metrics": metrics,
    }


def _compute(rows: list[dict], season_span: int = 2) -> list[PeerGroupResult]:
    return compute_peer_groups(
        pd.DataFrame(rows), min_minutes=600, season_span=season_span,
        position_labels=POSITION_LABELS,
    )


def test_parse_season_year() -> None:
    assert parse_season_year("2022") == 2022
    assert parse_season_year("2018-2019") == 2018


def test_higher_is_better_ranks_max_value_at_100() -> None:
    [group] = _compute([
        _row(1, "2022", "CM", 1, goals=0.0, fouls=1.0),
        _row(2, "2022", "CM", 1, goals=0.5, fouls=1.0),
        _row(3, "2022", "CM", 1, goals=1.0, fouls=1.0),
    ])
    by_player = {p["player_id"]: p for p in group.percentiles if p["metric"] == "goals"}
    assert by_player[3]["percentile"] == 100
    assert by_player[1]["percentile"] < by_player[2]["percentile"] < by_player[3]["percentile"]


def test_lower_is_better_inverts_ranking() -> None:
    """fouls_committed : higherIsBetter=False -> moins de fautes = meilleur percentile."""
    [group] = _compute([
        _row(1, "2022", "CM", 1, goals=0.0, fouls=0.0),
        _row(2, "2022", "CM", 1, goals=0.0, fouls=5.0),
    ])
    by_player = {p["player_id"]: p for p in group.percentiles if p["metric"] == "fouls_committed"}
    assert by_player[1]["percentile"] > by_player[2]["percentile"]


def test_ties_get_the_average_rank() -> None:
    """2 joueurs à égalité en tête : rang moyen (1+2)/2=1.5, soit 1.5/2=75 %
    — convention standard (identique à scipy percentileofscore kind='mean'),
    pas (rang-1)/(n-1) qui donnerait 50 aux deux."""
    [group] = _compute([
        _row(1, "2022", "CM", 1, goals=1.0, fouls=0.0),
        _row(2, "2022", "CM", 1, goals=1.0, fouls=0.0),
    ])
    by_player = {p["player_id"]: p for p in group.percentiles if p["metric"] == "goals"}
    assert by_player[1]["percentile"] == by_player[2]["percentile"] == 75


def test_peer_group_never_mixes_positions_or_tiers() -> None:
    """Un milieu ne doit jamais être comparé à un défenseur, ni un tier 1 à un tier 2."""
    groups = _compute([
        _row(1, "2022", "CM", 1, goals=0.0, fouls=0.0),
        _row(2, "2022", "DC", 1, goals=10.0, fouls=0.0),  # autre poste
        _row(3, "2022", "CM", 2, goals=10.0, fouls=0.0),  # autre palier
    ])
    cm_tier1 = next(g for g in groups if g.peer_group_id == "CM|tier1|2022")
    assert cm_tier1.sample_size == 1
    assert {p["player_id"] for p in cm_tier1.percentiles} == {1}


def test_season_span_excludes_seasons_too_far_apart() -> None:
    groups = _compute([
        _row(1, "2022", "CM", 1, goals=0.0, fouls=0.0),
        _row(2, "2025", "CM", 1, goals=1.0, fouls=0.0),  # écart de 3 ans > span de 2
    ])
    group_2022 = next(g for g in groups if g.peer_group_id == "CM|tier1|2022")
    assert group_2022.sample_size == 1
    assert {p["player_id"] for p in group_2022.percentiles} == {1}


def test_percentile_row_keeps_the_members_own_season_not_the_group_center() -> None:
    """Régression : un joueur inclus dans le groupe de pairs d'une saison
    voisine doit garder SA saison sur sa ligne de percentile, pas celle qui
    sert de centre à la fenêtre."""
    groups = _compute([
        _row(1, "2022", "CM", 1, goals=0.0, fouls=0.0),
        _row(2, "2023", "CM", 1, goals=1.0, fouls=0.0),
    ])
    group_2022 = next(g for g in groups if g.peer_group_id == "CM|tier1|2022")
    seasons_by_player = {p["player_id"]: p["season"] for p in group_2022.percentiles}
    assert seasons_by_player == {1: "2022", 2: "2023"}


def test_peer_group_label_and_metadata() -> None:
    [group] = _compute([_row(1, "2022", "CM", 1, goals=0.0, fouls=0.0)])
    assert group.peer_group_id == "CM|tier1|2022"
    assert group.label == "Milieux centraux · Niveau 1 · 2022"
    assert group.tier == 1
    assert group.min_minutes == 600
    assert group.sample_size == 1


def test_missing_metric_is_ranked_only_among_members_that_have_it() -> None:
    """Régression multi-sources : une ligne FBref sans `goals` ne doit ni
    faire planter le classement (NaN), ni être classée comme si elle avait
    0 but, ni gonfler l'effectif affiché pour cette métrique."""
    [group] = _compute([
        _row(1, "2022", "CM", 1, goals=0.2, fouls=1.0),
        _row(2, "2022", "CM", 1, goals=0.8, fouls=2.0),
        _row(3, "2022", "CM", 1, goals=None, fouls=3.0),  # source sans la métrique
    ])
    assert group.sample_size == 3
    goals = {p["player_id"]: p for p in group.percentiles if p["metric"] == "goals"}
    assert set(goals) == {1, 2}
    assert goals[2]["percentile"] == 100
    assert goals[1]["percentile"] == 50
    assert {p["sample_size"] for p in goals.values()} == {2}
    fouls = [p for p in group.percentiles if p["metric"] == "fouls_committed"]
    assert {p["sample_size"] for p in fouls} == {3}


def test_player_with_two_rows_same_season_counts_once_via_most_minutes() -> None:
    """Transfert en cours de saison dans le même palier : deux lignes
    player_season_stats. Le joueur ne compte qu'une fois (sinon il se
    classe contre lui-même et la clé primaire casse), via sa ligne la plus
    fournie en minutes, dont la compétition/le club sont conservés."""
    [group] = _compute([
        _row(1, "2022", "CM", 1, goals=0.1, fouls=0.0, competition_id=10, club_id=100,
             minutes=700),
        _row(1, "2022", "CM", 1, goals=0.9, fouls=0.0, competition_id=20, club_id=200,
             minutes=1500),
        _row(2, "2022", "CM", 1, goals=0.5, fouls=0.0),
    ])
    assert group.sample_size == 2
    goals = [p for p in group.percentiles if p["metric"] == "goals" and p["player_id"] == 1]
    assert len(goals) == 1
    assert goals[0]["raw_value"] == 0.9
    assert (goals[0]["competition_id"], goals[0]["club_id"]) == (20, 200)
    assert goals[0]["percentile"] == 100


def test_only_metrics_applying_to_the_position_are_ranked() -> None:
    """Jamais de percentile de gardien sur une métrique de joueur de champ,
    ni l'inverse — même si la ligne brute la contient."""
    groups = _compute([
        _row(1, "2022", "GK", 1, goals=0.0, fouls=0.0, extra={"saves": 3.0}),
        _row(2, "2022", "GK", 1, goals=0.0, fouls=0.0, extra={"saves": 2.0}),
        _row(3, "2022", "CM", 1, goals=0.5, fouls=0.0, extra={"saves": 9.0}),
    ])
    gk = next(g for g in groups if g.position_group == "GK")
    assert {p["metric"] for p in gk.percentiles} == {"saves"}
    cm = next(g for g in groups if g.position_group == "CM")
    assert {p["metric"] for p in cm.percentiles} == {"goals", "fouls_committed"}


def test_percentile_rows_carry_their_stat_row_identity() -> None:
    [group] = _compute([
        _row(7, "2022", "CM", 1, goals=0.3, fouls=1.0, competition_id=4, club_id=44),
    ])
    for p in group.percentiles:
        assert (p["player_id"], p["season"], p["competition_id"], p["club_id"]) == (
            7, "2022", 4, 44,
        )


def test_empty_input_returns_no_groups() -> None:
    assert _compute([]) == []
