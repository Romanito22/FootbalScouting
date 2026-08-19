"""Fixtures figées pour le calcul des groupes de pairs et des percentiles —
la zone à couvrir en priorité selon CLAUDE.md : un bug silencieux ici détruit
la crédibilité de tout le produit."""

import pandas as pd
import pytest

from vivier_pipeline.core import percentiles as percentiles_module
from vivier_pipeline.core.percentiles import PeerGroupResult, compute_peer_groups, parse_season_year

POSITION_LABELS = {"CM": "Milieux centraux", "DC": "Défenseurs centraux"}


@pytest.fixture(autouse=True)
def fixed_metric_direction(monkeypatch: pytest.MonkeyPatch) -> None:
    """Registre figé et indépendant de packages/metrics, pour que ces tests
    ne bougent jamais sous l'effet d'un ajout de métrique ailleurs."""
    monkeypatch.setattr(
        percentiles_module, "metric_direction",
        lambda: {"goals": True, "fouls_committed": False},
    )


def _row(
    player_id: int, season: str, position_group: str, tier: int, goals: float, fouls: float,
) -> dict:
    return {
        "player_id": player_id,
        "season": season,
        "position_group": position_group,
        "tier": tier,
        "metrics": {"goals": goals, "fouls_committed": fouls},
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
    assert group.min_minutes == 600
    assert group.sample_size == 1


def test_empty_input_returns_no_groups() -> None:
    assert _compute([]) == []
