"""Fixtures figées pour le modèle de force des championnats.

Les données sont synthétiques mais générées à partir de coefficients
« vrais » connus : c'est le seul moyen de vérifier qu'un modèle retrouve
ce qu'il est censé retrouver (sens de l'effet, ordre de grandeur,
couverture de l'intervalle), indépendamment des données réelles.
"""

import numpy as np
import pandas as pd
import pytest

from vivier_pipeline.core.strength import (
    StrengthParams,
    build_link_pairs,
    estimate_strength,
    link_counts,
)

KEYS = ["npxg", "xa", "shots"]
PARAMS = StrengthParams(
    min_minutes=450, max_season_gap=1, min_link_players=5, ci_level=0.9,
    bootstrap_samples=200, seed=0,
)


def _row(
    player_id: int, season: str, competition_id: int, level: float, strength: float,
    *, minutes: int = 2000, noise: float = 1.0, metrics: dict | None = None,
) -> dict:
    """Production observée = niveau du joueur / force de la compétition."""
    base = level / strength * noise
    return {
        "player_id": player_id,
        "season": season,
        "competition_id": competition_id,
        "minutes": minutes,
        "metrics": metrics if metrics is not None else {
            "npxg": 0.30 * base, "xa": 0.15 * base, "shots": 2.0 * base,
        },
    }


def _movers(
    comp_a: int, strength_a: float, comp_b: int, strength_b: float, n: int, start_id: int,
    *, rng: np.random.Generator | None = None, noise_sd: float = 0.0,
) -> list[dict]:
    rows = []
    for k in range(n):
        level = 0.6 + 0.05 * k
        noise_a = float(np.exp(rng.normal(0, noise_sd))) if rng is not None else 1.0
        noise_b = float(np.exp(rng.normal(0, noise_sd))) if rng is not None else 1.0
        rows.append(_row(start_id + k, "2022-2023", comp_a, level, strength_a, noise=noise_a))
        rows.append(_row(start_id + k, "2023-2024", comp_b, level, strength_b, noise=noise_b))
    return rows


def _by_comp(results: list) -> dict:
    return {r.competition_id: r for r in results}


def test_noiseless_data_recovers_true_coefficients_exactly() -> None:
    """Réf. 1 (force 1.0), ligue 2 plus faible (0.7), ligue 3 plus forte (1.3)."""
    rows = (
        _movers(1, 1.0, 2, 0.7, 8, 100)
        + _movers(2, 0.7, 3, 1.3, 8, 200)
        + _movers(3, 1.3, 1, 1.0, 8, 300)
    )
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 3], 1))
    assert result[1].status == "reference"
    assert result[1].coef == 1.0
    assert result[2].coef == pytest.approx(0.7, rel=1e-6)
    assert result[3].coef == pytest.approx(1.3, rel=1e-6)


def test_stronger_league_gets_coefficient_above_one() -> None:
    """Sens de l'effet : on produit MOINS dans la ligue la plus forte, donc
    une même production y vaut PLUS (coefficient > 1)."""
    rows = _movers(1, 1.0, 2, 1.5, 10, 100)
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2], 1))
    assert result[2].coef is not None
    assert result[2].coef > 1.0


def test_noisy_data_interval_covers_the_truth() -> None:
    rng = np.random.default_rng(42)
    rows = (
        _movers(1, 1.0, 2, 0.75, 40, 100, rng=rng, noise_sd=0.25)
        + _movers(2, 0.75, 1, 1.0, 40, 200, rng=rng, noise_sd=0.25)
    )
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2], 1))
    comp = result[2]
    assert comp.status == "estimated"
    assert comp.low is not None and comp.high is not None and comp.coef is not None
    assert comp.low < 0.75 < comp.high
    assert comp.low <= comp.coef <= comp.high
    assert len(comp.samples) == PARAMS.bootstrap_samples


def test_interval_narrows_with_more_link_players() -> None:
    def width(n: int) -> float:
        rng = np.random.default_rng(7)
        rows = _movers(1, 1.0, 2, 0.8, n, 100, rng=rng, noise_sd=0.3)
        comp = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2], 1))[2]
        assert comp.low is not None and comp.high is not None
        return comp.high - comp.low

    assert width(80) < width(10)


def test_reference_interval_is_exactly_one() -> None:
    rows = _movers(1, 1.0, 2, 0.7, 8, 100)
    ref = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2], 1))[1]
    assert (ref.coef, ref.low, ref.high) == (1.0, 1.0, 1.0)


def test_competition_under_link_threshold_is_not_estimated() -> None:
    rows = _movers(1, 1.0, 2, 0.7, 8, 100) + _movers(1, 1.0, 3, 0.5, 3, 200)
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 3], 1))
    assert result[3].status == "insufficient_links"
    assert result[3].n_links == 3
    assert result[3].coef is None and result[3].low is None and result[3].high is None


def test_pruning_cascades_to_neighbours() -> None:
    """3 n'est reliée qu'à 4, qui n'a que 3 liaisons en tout : retirer 4
    laisse 3 sans liaison, elle ne doit pas rester « estimée »."""
    rows = (
        _movers(1, 1.0, 2, 0.7, 8, 100)
        + _movers(3, 0.9, 4, 0.8, 3, 200)
    )
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 3, 4], 1))
    assert result[3].status == "insufficient_links"
    assert result[4].status == "insufficient_links"


def test_competition_without_path_to_reference_is_disconnected() -> None:
    rows = _movers(1, 1.0, 2, 0.7, 8, 100) + _movers(3, 1.0, 4, 0.5, 8, 200)
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 3, 4], 1))
    assert result[3].status == "disconnected"
    assert result[4].status == "disconnected"
    assert result[3].coef is None


def test_competition_without_any_data_is_reported_not_skipped() -> None:
    rows = _movers(1, 1.0, 2, 0.7, 8, 100)
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 99], 1))
    assert result[99].status == "insufficient_links"
    assert result[99].n_links == 0


def test_default_reference_is_the_most_connected_competition() -> None:
    rows = _movers(1, 1.0, 2, 0.7, 8, 100) + _movers(2, 0.7, 3, 1.2, 6, 200)
    result = _by_comp(estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 3]))
    assert result[2].status == "reference"
    assert result[1].coef == pytest.approx(1.0 / 0.7, rel=1e-6)


def test_unknown_reference_is_an_explicit_error() -> None:
    rows = _movers(1, 1.0, 2, 0.7, 8, 100)
    with pytest.raises(ValueError, match="référence"):
        estimate_strength(pd.DataFrame(rows), KEYS, PARAMS, [1, 2, 3], 3)


def test_pairs_ignore_seasons_too_far_apart() -> None:
    rows = pd.DataFrame([
        _row(1, "2020-2021", 1, 1.0, 1.0),
        _row(1, "2022-2023", 2, 1.0, 0.7),  # 2 saisons d'écart > 1
    ])
    assert build_link_pairs(rows, KEYS, PARAMS).empty


def test_same_season_club_and_tournament_form_a_pair() -> None:
    """Club + tournoi international la même année civile : une liaison."""
    rows = pd.DataFrame([
        _row(1, "2022-2023", 1, 1.0, 1.0),
        _row(1, "2022", 2, 1.0, 0.8, minutes=600),
    ])
    assert len(build_link_pairs(rows, KEYS, PARAMS)) == 1


def test_pairs_ignore_rows_under_minutes_threshold() -> None:
    rows = pd.DataFrame([
        _row(1, "2022-2023", 1, 1.0, 1.0),
        _row(1, "2023-2024", 2, 1.0, 0.7, minutes=300),
    ])
    assert build_link_pairs(rows, KEYS, PARAMS).empty


def test_same_competition_rows_never_form_a_pair() -> None:
    rows = pd.DataFrame([
        _row(1, "2022-2023", 1, 1.0, 1.0),
        _row(1, "2023-2024", 1, 1.2, 1.0),
    ])
    assert build_link_pairs(rows, KEYS, PARAMS).empty


def test_near_zero_offensive_volume_is_excluded() -> None:
    """Un log-ratio entre deux quasi-zéros n'est que du bruit."""
    rows = pd.DataFrame([
        _row(1, "2022-2023", 1, 1.0, 1.0),
        _row(2, "2022-2023", 1, 1.0, 1.0),
        _row(2, "2023-2024", 2, 1.0, 1.0,
             metrics={"npxg": 0.001, "xa": 0.0, "shots": 0.01}),
    ])
    assert build_link_pairs(rows, KEYS, PARAMS).empty


def test_pair_uses_only_metrics_present_in_both_rows() -> None:
    """Ligne FBref (sans xa) contre ligne StatsBomb : le ratio se calcule
    sur les métriques communes, sans que l'absence de xa se lise comme 0."""
    full = _row(1, "2022-2023", 1, 1.0, 1.0)
    partial = _row(1, "2023-2024", 2, 1.0, 0.5)
    del partial["metrics"]["xa"]
    others = [_row(10 + k, "2022-2023", 1, 1.0, 1.0) for k in range(3)]
    pairs = build_link_pairs(pd.DataFrame([full, partial, *others]), KEYS, PARAMS)
    assert len(pairs) == 1
    # production doublée dans la ligue 2 : log(2)
    assert pairs["y"].iloc[0] == pytest.approx(np.log(2.0))


def test_heavier_weight_for_more_minutes() -> None:
    rows = pd.DataFrame([
        _row(1, "2022-2023", 1, 1.0, 1.0, minutes=3000),
        _row(1, "2023-2024", 2, 1.0, 0.8, minutes=3000),
        _row(2, "2022-2023", 1, 1.0, 1.0, minutes=500),
        _row(2, "2023-2024", 2, 1.0, 0.8, minutes=500),
    ])
    pairs = build_link_pairs(rows, KEYS, PARAMS).set_index("player_id")
    assert pairs.loc[1, "weight"] > pairs.loc[2, "weight"]


def test_link_counts_are_distinct_players() -> None:
    rows = pd.DataFrame([
        _row(1, "2022-2023", 1, 1.0, 1.0),
        _row(1, "2023-2024", 2, 1.0, 0.8),
        _row(1, "2023", 3, 1.0, 0.9),  # même joueur, 2e liaison vers 1 et 2
    ])
    counts = link_counts(build_link_pairs(rows, KEYS, PARAMS))
    assert counts == {1: 1, 2: 1, 3: 1}
