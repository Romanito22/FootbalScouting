"""Ingère players.csv / clubs.csv (dataset Kaggle davidcariboo/player-scores,
téléchargé manuellement — cf. docstring de providers/transfermarkt.py).

Usage :
    uv run python -m vivier_pipeline.jobs.ingest_transfermarkt
"""

import pandas as pd

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load import log_ingestion_run
from vivier_pipeline.core.load_transfermarkt import (
    upsert_transfermarkt_club,
    upsert_transfermarkt_player,
)
from vivier_pipeline.core.resolve import fetch_identity_candidates
from vivier_pipeline.providers import transfermarkt


def run() -> None:
    players_df = transfermarkt.load_players()
    clubs_df = transfermarkt.load_clubs()
    print(f"{len(players_df)} joueur(s), {len(clubs_df)} club(s) dans le dataset")

    with get_conn() as conn:
        try:
            club_ids = {
                int(row["club_id"]): upsert_transfermarkt_club(
                    conn, transfermarkt.normalize_club(row),
                )
                for _, row in clubs_df.iterrows()
            }

            candidates = fetch_identity_candidates(conn)

            resolved = queued = 0
            for _, row in players_df.iterrows():
                player = transfermarkt.normalize_player(row)
                tm_club_id = row["current_club_id"]
                club_id = club_ids.get(int(tm_club_id)) if pd.notna(tm_club_id) else None
                tm_id = str(row["player_id"])

                player_id = upsert_transfermarkt_player(conn, tm_id, player, club_id, candidates)
                if player_id is None:
                    queued += 1
                else:
                    resolved += 1

            print(f"{resolved} joueur(s) rattaché(s) ou créé(s), {queued} en file d'attente")

            log_ingestion_run(
                conn, "transfermarkt", "players.csv", "success", rows_written=resolved,
            )
            conn.commit()
        except Exception as exc:
            conn.rollback()
            log_ingestion_run(conn, "transfermarkt", "players.csv", "failed", error=str(exc))
            conn.commit()
            raise


if __name__ == "__main__":
    run()
