"""Recalcule les vecteurs style/qualité pour tous les joueurs au-dessus du
seuil de minutes et disposant déjà de percentiles (lancer
compute_percentiles avant celui-ci). Table matérialisée : ce job la
remplace intégralement à chaque run.

Usage :
    uv run python -m vivier_pipeline.jobs.compute_vectors
"""

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load_vectors import fetch_vector_input, replace_vectors
from vivier_pipeline.core.metrics_registry import load_registry, outfield_metric_keys
from vivier_pipeline.core.vectors import compute_vectors


def run() -> None:
    registry = load_registry()
    min_minutes = registry["minMinutes"]
    metric_keys = sorted(outfield_metric_keys())
    direction = {m["key"]: m["higherIsBetter"] for m in registry["metrics"]}

    with get_conn() as conn:
        rows = fetch_vector_input(conn, min_minutes)
        print(f"{len(rows)} ligne(s) au-dessus de {min_minutes} minutes, avec percentiles")

        results = compute_vectors(rows, metric_keys, direction)

        rows_written = replace_vectors(conn, results)
        conn.commit()
        print(f"OK — {rows_written} vecteur(s) écrit(s) dans player_vectors")


if __name__ == "__main__":
    run()
