"""Ingère une compétition StatsBomb Open Data dans player_season_stats.

Usage :
    uv run python -m vivier_pipeline.jobs.ingest_statsbomb --competition-id 43 --season-id 106
"""

import argparse

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.aggregate import aggregate_competition
from vivier_pipeline.core.load import load_competition, log_ingestion_run
from vivier_pipeline.providers import statsbomb


def run(competition_id: int, season_id: int) -> None:
    scope = f"statsbomb|{competition_id}|{season_id}"
    matches = statsbomb.fetch_matches(competition_id, season_id)
    print(f"{len(matches)} match(es) — {scope}")

    events_by_match = {}
    lineups_by_match = {}
    for match_id in matches["match_id"]:
        match_id = int(match_id)
        events_by_match[match_id] = statsbomb.fetch_events(match_id)
        lineups_by_match[match_id] = statsbomb.fetch_lineups(match_id)

    agg = aggregate_competition(matches, events_by_match, lineups_by_match)
    print(f"{len(agg.players)} joueur(s) de champ, {len(agg.clubs)} équipe(s)")

    with get_conn() as conn:
        try:
            rows_written = load_competition(conn, agg)
            log_ingestion_run(conn, "statsbomb", scope, "success", rows_written=rows_written)
            conn.commit()
            print(f"OK — {rows_written} ligne(s) écrite(s) dans player_season_stats")
        except Exception as exc:
            conn.rollback()
            log_ingestion_run(conn, "statsbomb", scope, "failed", error=str(exc))
            conn.commit()
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--competition-id", type=int, required=True)
    parser.add_argument("--season-id", type=int, required=True)
    args = parser.parse_args()
    run(args.competition_id, args.season_id)


if __name__ == "__main__":
    main()
