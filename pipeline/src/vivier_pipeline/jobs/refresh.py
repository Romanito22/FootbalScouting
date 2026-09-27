"""Recalcule toutes les tables dérivées, dans l'ordre imposé par leurs
dépendances, après toute ingestion :

1. force des championnats (compute_strength) — lit player_season_stats ;
2. percentiles de palier ET « toutes compétitions » ajustés
   (compute_percentiles) — lit les coefficients de l'étape 1 ;
3. vecteurs style/niveau (compute_vectors) — lit les percentiles de 2.

Lancer une étape seule avec des entrées périmées donne des résultats
incohérents entre eux (ex. des percentiles ajustés d'anciens coefficients) :
ce job est le chemin normal.

Usage :
    uv run python -m vivier_pipeline.jobs.refresh
    uv run python -m vivier_pipeline.jobs.refresh --reference-competition-id 3
"""

import argparse

from vivier_pipeline.jobs import compute_percentiles, compute_strength, compute_vectors


def run(reference_competition_id: int | None = None) -> None:
    print("== 1/3 force des championnats")
    compute_strength.run(reference_competition_id)
    print("== 2/3 percentiles")
    compute_percentiles.run()
    print("== 3/3 vecteurs")
    compute_vectors.run()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-competition-id", type=int, default=None)
    args = parser.parse_args()
    run(args.reference_competition_id)


if __name__ == "__main__":
    main()
