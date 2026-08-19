"""Recalcule les groupes de pairs et les percentiles pour tous les joueurs
au-dessus du seuil de minutes. Tables matérialisées : ce job les remplace
intégralement à chaque run.

Usage :
    uv run python -m vivier_pipeline.jobs.compute_percentiles
"""

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load import fetch_percentile_input, replace_percentiles
from vivier_pipeline.core.metrics_registry import load_registry
from vivier_pipeline.core.percentiles import compute_peer_groups


def run() -> None:
    registry = load_registry()
    min_minutes = registry["minMinutes"]
    season_span = registry["peerGroupSeasonSpan"]
    position_labels = registry["positionGroupLabels"]

    with get_conn() as conn:
        rows = fetch_percentile_input(conn, min_minutes)
        print(f"{len(rows)} ligne(s) player_season_stats au-dessus de {min_minutes} minutes")

        groups = compute_peer_groups(rows, min_minutes, season_span, position_labels)
        print(f"{len(groups)} groupe(s) de pairs")

        rows_written = replace_percentiles(conn, groups)
        conn.commit()
        print(f"OK — {rows_written} ligne(s) écrite(s) dans player_percentiles")


if __name__ == "__main__":
    run()
