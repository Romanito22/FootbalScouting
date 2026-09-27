"""Recalcule les groupes de pairs et les percentiles pour tous les joueurs
au-dessus du seuil de minutes. Tables matérialisées : ce job les remplace
intégralement à chaque run.

Usage :
    uv run python -m vivier_pipeline.jobs.compute_percentiles
"""

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load import fetch_percentile_input, replace_percentiles
from vivier_pipeline.core.load_strength import fetch_league_strengths
from vivier_pipeline.core.metrics_registry import load_registry
from vivier_pipeline.core.percentiles import compute_adjusted_groups, compute_peer_groups
from vivier_pipeline.core.runs import tracked_run


def run() -> None:
    with tracked_run("pipeline", "percentiles") as tracked:
        tracked.rows_written = _compute()


def _compute() -> int:
    registry = load_registry()
    min_minutes = registry["minMinutes"]
    season_span = registry["peerGroupSeasonSpan"]
    position_labels = registry["positionGroupLabels"]
    ci_level = registry["leagueStrength"]["ciLevel"]

    with get_conn() as conn:
        rows = fetch_percentile_input(conn, min_minutes)
        print(f"{len(rows)} ligne(s) player_season_stats au-dessus de {min_minutes} minutes")

        groups = compute_peer_groups(rows, min_minutes, season_span, position_labels)
        print(f"{len(groups)} groupe(s) de pairs par palier")

        strengths = fetch_league_strengths(conn)
        adjusted = compute_adjusted_groups(
            rows, strengths, min_minutes, season_span, position_labels, ci_level,
        )
        print(
            f"{len(adjusted)} groupe(s) « toutes compétitions » ajusté(s) "
            f"({len(strengths)} compétition(s) avec coefficient de force)"
        )
        groups += adjusted

        rows_written = replace_percentiles(conn, groups)
        conn.commit()
        print(f"OK — {rows_written} ligne(s) écrite(s) dans player_percentiles")
        return rows_written


if __name__ == "__main__":
    run()
