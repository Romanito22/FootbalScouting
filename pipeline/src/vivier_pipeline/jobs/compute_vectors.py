"""Recalcule les vecteurs style/qualité pour tous les joueurs au-dessus du
seuil de minutes et disposant déjà de percentiles (lancer
compute_percentiles avant celui-ci). Table matérialisée : ce job la
remplace intégralement à chaque run.

Usage :
    uv run python -m vivier_pipeline.jobs.compute_vectors
"""

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load_vectors import fetch_vector_input, replace_vectors
from vivier_pipeline.core.metrics_registry import (
    gk_metric_keys,
    load_registry,
    outfield_metric_keys,
)
from vivier_pipeline.core.runs import tracked_run
from vivier_pipeline.core.vectors import compute_vectors


def run() -> None:
    with tracked_run("pipeline", "vecteurs") as tracked:
        tracked.rows_written = _compute()


def _compute() -> int:
    registry = load_registry()
    min_minutes = registry["minMinutes"]
    direction = {m["key"]: m["higherIsBetter"] for m in registry["metrics"]}

    with get_conn() as conn:
        rows = fetch_vector_input(conn, min_minutes)
        print(f"{len(rows)} ligne(s) au-dessus de {min_minutes} minutes, avec percentiles")

        # Gardiens et joueurs de champ n'ont aucune métrique en commun : deux
        # espaces vectoriels distincts, réduits séparément, jamais comparés
        # entre eux (la similarité filtre sur le même jeu de métriques).
        is_gk = rows["position_group"] == "GK"
        results = (
            compute_vectors(rows[~is_gk], sorted(outfield_metric_keys()), direction)
            + compute_vectors(rows[is_gk], sorted(gk_metric_keys()), direction)
        )

        rows_written = replace_vectors(conn, results)
        conn.commit()
        print(f"OK — {rows_written} vecteur(s) écrit(s) dans player_vectors")
        return rows_written


if __name__ == "__main__":
    run()
