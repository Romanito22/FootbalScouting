"""Ingère les stats saison joueur FBref (via soccerdata) pour les
championnats/saisons demandés.

Usage :
    uv run python -m vivier_pipeline.jobs.ingest_fbref \\
        --leagues ENG-Premier-League --seasons 2223
"""

import argparse

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load import log_ingestion_run
from vivier_pipeline.core.load_fbref import upsert_fbref_season_stats
from vivier_pipeline.core.resolve import fetch_identity_candidates
from vivier_pipeline.providers import fbref


def run(leagues: list[str], seasons: list[str]) -> None:
    scope = f"fbref|{','.join(leagues)}|{','.join(seasons)}"
    df = fbref.fetch_player_season_stats(leagues, seasons)
    print(f"{len(df)} ligne(s) — {scope}")

    with get_conn() as conn:
        try:
            candidates = fetch_identity_candidates(conn)

            resolved = queued = skipped = 0
            for index, row in df.iterrows():
                record = fbref.normalize_row(index, row)
                if record is None:
                    skipped += 1
                    continue
                player_id = upsert_fbref_season_stats(conn, record, candidates)
                if player_id is None:
                    queued += 1
                else:
                    resolved += 1

            print(
                f"{resolved} ligne(s) écrite(s), {queued} en file d'attente, "
                f"{skipped} ignorée(s) (0 min)"
            )

            log_ingestion_run(conn, "fbref", scope, "success", rows_written=resolved)
            conn.commit()
        except Exception as exc:
            conn.rollback()
            log_ingestion_run(conn, "fbref", scope, "failed", error=str(exc))
            conn.commit()
            raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--leagues", nargs="+", required=True)
    parser.add_argument("--seasons", nargs="+", required=True)
    args = parser.parse_args()
    run(args.leagues, args.seasons)


if __name__ == "__main__":
    main()
