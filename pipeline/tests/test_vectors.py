"""Fixtures figées pour les vecteurs style/qualité — le vrai différenciateur
du produit (spec §3.2). Ces tests verrouillent les deux propriétés que le
design doit garantir mathématiquement, pas juste empiriquement :

1. Style : deux joueurs au même profil RELATIF mais à des niveaux de
   production différents doivent avoir une similarité cosinus de 1.0
   exactement — pas approximativement, un vrai bug a été trouvé et corrigé
   ici (le z-score classique, qui soustrait la moyenne, casse cette
   propriété ; la mise à l'échelle seule, sans centrage, la préserve).
2. Qualité : construite sur les percentiles (pas des z-scores bruts),
   parce que la similarité cosinus est par nature invariante à l'échelle
   — aucun encodage linéaire ne peut la rendre sensible au niveau absolu.
   Le percentile capture plutôt le PROFIL de forces relatives, ce qui
   reste une propriété utile et vérifiable : deux profils de forces
   opposés doivent avoir une similarité basse.
"""

import numpy as np
import pandas as pd
import pytest

from vivier_pipeline.core.vectors import VECTOR_DIM, compute_vectors

DIRECTION = {"goals": True, "assists": True, "tackles": True, "fouls": False}


def cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(va @ vb / (na * nb))


def _row(player_id: int, position_group: str, metrics: dict, percentiles: dict) -> dict:
    return {
        "player_id": player_id, "season": "2023", "position_group": position_group,
        "metrics": metrics, "percentiles": percentiles,
    }


def test_vectors_are_always_32_dimensional() -> None:
    rows = pd.DataFrame([
        _row(1, "CM", {"goals": 1.0, "assists": 2.0}, {"goals": 50, "assists": 60}),
        _row(2, "CM", {"goals": 2.0, "assists": 1.0}, {"goals": 80, "assists": 40}),
        _row(3, "CM", {"goals": 0.5, "assists": 0.5}, {"goals": 20, "assists": 20}),
    ])
    results = compute_vectors(rows, ["goals", "assists"], DIRECTION)
    for r in results:
        assert len(r.style_vec) == VECTOR_DIM
        assert len(r.quality_vec) == VECTOR_DIM


def test_small_sample_pads_with_zeros() -> None:
    """3 joueurs, 2 métriques -> au plus 2 composantes réelles ; le reste
    du vecteur (jusqu'à 32) doit être strictement nul."""
    rows = pd.DataFrame([
        _row(1, "CM", {"goals": 1.0, "assists": 2.0}, {"goals": 50, "assists": 60}),
        _row(2, "CM", {"goals": 2.0, "assists": 1.0}, {"goals": 80, "assists": 40}),
        _row(3, "CM", {"goals": 0.5, "assists": 0.5}, {"goals": 20, "assists": 20}),
    ])
    [r1, *_] = compute_vectors(rows, ["goals", "assists"], DIRECTION)
    assert all(v == 0.0 for v in r1.style_vec[2:])
    assert all(v == 0.0 for v in r1.quality_vec[2:])


def test_same_relative_profile_different_level_gives_perfect_style_similarity() -> None:
    """Régression : le z-score classique (soustraction de moyenne) cassait
    cette propriété (similarité mesurée à -0.81 avant correction, alors
    qu'elle doit être exactement 1.0 par construction mathématique)."""
    rows = pd.DataFrame([
        _row(1, "CM", {"goals": 1.0, "assists": 2.0}, {"goals": 50, "assists": 67}),
        # ratio identique à P1, x3 (même style, niveau différent)
        _row(2, "CM", {"goals": 3.0, "assists": 6.0}, {"goals": 100, "assists": 100}),
        _row(3, "CM", {"goals": 2.0, "assists": 0.5}, {"goals": 83, "assists": 33}),
        _row(4, "CM", {"goals": 0.5, "assists": 0.3}, {"goals": 0, "assists": 0}),
        _row(5, "CM", {"goals": 1.5, "assists": 1.5}, {"goals": 67, "assists": 50}),
        _row(6, "CM", {"goals": 0.8, "assists": 3.0}, {"goals": 33, "assists": 83}),
    ])
    results = {r.player_id: r for r in compute_vectors(rows, ["goals", "assists"], DIRECTION)}
    assert cosine(results[1].style_vec, results[2].style_vec) == pytest.approx(1.0)
    # un profil différent (buteur pur, pas créateur) doit rester nettement moins similaire
    assert cosine(results[1].style_vec, results[3].style_vec) < 0.9


def test_opposite_quality_profiles_have_low_similarity() -> None:
    """Un profil 'fort en attaque / faible en défense' et son inverse
    doivent être peu similaires en qualité, même à métriques brutes
    identiques — c'est le percentile qui porte le signal, pas la métrique."""
    rows = pd.DataFrame([
        _row(1, "CM", {"goals": 1.0, "tackles": 1.0}, {"goals": 90, "tackles": 10}),
        _row(2, "CM", {"goals": 1.0, "tackles": 1.0}, {"goals": 10, "tackles": 90}),
        _row(3, "CM", {"goals": 1.0, "tackles": 1.0}, {"goals": 85, "tackles": 15}),
        _row(4, "CM", {"goals": 1.0, "tackles": 1.0}, {"goals": 50, "tackles": 50}),
    ])
    results = {r.player_id: r for r in compute_vectors(rows, ["goals", "tackles"], DIRECTION)}
    assert cosine(results[1].quality_vec, results[2].quality_vec) < 0.5
    assert cosine(results[1].quality_vec, results[3].quality_vec) > 0.9


def test_position_groups_are_scaled_independently() -> None:
    """La mise à l'échelle (écart-type) est intra-groupe de poste : un ST
    et un DC ne doivent jamais partager la même référence de variance."""
    rows = pd.DataFrame([
        _row(1, "ST", {"goals": 5.0, "assists": 1.0}, {"goals": 90, "assists": 40}),
        _row(2, "ST", {"goals": 3.0, "assists": 0.5}, {"goals": 50, "assists": 20}),
        _row(3, "DC", {"goals": 0.1, "assists": 0.1}, {"goals": 60, "assists": 60}),
        _row(4, "DC", {"goals": 0.05, "assists": 0.05}, {"goals": 40, "assists": 40}),
    ])
    # ne doit pas lever d'exception malgré des échelles de métriques très différentes
    results = compute_vectors(rows, ["goals", "assists"], DIRECTION)
    assert len(results) == 4


def test_direction_harmonization_flips_lower_is_better_metrics() -> None:
    """fouls: higherIsBetter=False. Trois joueurs à fautes croissantes
    (0.2, 1.5, 3.0) : après harmonisation, la similarité doit décroître de
    façon monotone avec l'écart de fautes — P1 doit être plus proche de P2
    (fautes proches) que de P3 (fautes très différentes). Une comparaison
    relative plutôt qu'un seuil absolu arbitraire, plus robuste à la
    rotation introduite par la réduction de dimension."""
    rows = pd.DataFrame([
        _row(1, "CM", {"goals": 1.0, "fouls": 0.2}, {"goals": 50, "fouls": 90}),
        _row(2, "CM", {"goals": 1.0, "fouls": 1.5}, {"goals": 50, "fouls": 50}),
        _row(3, "CM", {"goals": 1.0, "fouls": 3.0}, {"goals": 50, "fouls": 10}),
    ])
    results = {r.player_id: r for r in compute_vectors(rows, ["goals", "fouls"], DIRECTION)}
    assert cosine(results[1].style_vec, results[2].style_vec) > cosine(
        results[1].style_vec, results[3].style_vec,
    )


def test_empty_input_returns_empty_list() -> None:
    assert compute_vectors(pd.DataFrame(), ["goals"], DIRECTION) == []


def test_realistic_scale_does_not_crash_and_keeps_shape() -> None:
    """50 joueurs, 10 métriques, 3 postes — plus proche d'un run réel que
    les cas ci-dessus, pour attraper un éventuel souci propre à l'échelle
    (ex. solveur SVD randomisé) que les petits exemples ne révèlent pas."""
    rng = np.random.default_rng(0)
    metric_keys = [f"metric_{i}" for i in range(10)]
    direction = dict.fromkeys(metric_keys, True)
    position_groups = ["CM", "ST", "DC"]

    rows = pd.DataFrame([
        _row(
            player_id=i,
            position_group=position_groups[i % 3],
            metrics={k: float(rng.uniform(0, 5)) for k in metric_keys},
            percentiles={k: float(rng.uniform(0, 100)) for k in metric_keys},
        )
        for i in range(50)
    ])

    results = compute_vectors(rows, metric_keys, direction)
    assert len(results) == 50
    for r in results:
        assert len(r.style_vec) == VECTOR_DIM
        assert len(r.quality_vec) == VECTOR_DIM
        assert all(np.isfinite(v) for v in r.style_vec)
        assert all(np.isfinite(v) for v in r.quality_vec)
