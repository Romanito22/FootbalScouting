"""Ingère les stats joueurs Understat (saison en cours par défaut) des
cinq grands championnats.

Usage :
    uv run python -m vivier_pipeline.jobs.ingest_understat
    uv run python -m vivier_pipeline.jobs.ingest_understat \\
        --leagues "FRA-Ligue 1" --seasons 2425 2526

Pause entre requêtes imposée (cf. providers/understat.py). Les feuilles de
match ne sont téléchargées que s'il faut créer des joueurs inconnus (poste),
et une seule fois : soccerdata les garde en cache. Lancer ensuite
`pnpm pipeline:refresh` (fait automatiquement par le job `live`).
"""

import argparse
from datetime import date

from vivier_pipeline.config import get_conn
from vivier_pipeline.core import load_understat
from vivier_pipeline.core.identity import IdentityCandidate, normalize_name
from vivier_pipeline.core.resolve import fetch_identity_candidates
from vivier_pipeline.core.runs import tracked_run
from vivier_pipeline.providers import understat


def run(leagues: list[str], seasons: list[str]) -> int:
    scope = f"understat|{','.join(leagues)}|{','.join(seasons)}"
    with tracked_run("understat", scope) as tracked:
        reader = understat.make_reader(leagues, seasons)
        df = understat.fetch_player_season_stats(reader)
        records = [r for r in (understat.normalize_row(i, row) for i, row in df.iterrows()) if r]
        print(f"{len(records)} ligne(s) joueur — {scope}")

        written = queued = created = 0
        with get_conn() as conn:
            candidates = fetch_identity_candidates(conn)
            to_create = []
            for record in records:
                outcome = load_understat.resolve(conn, record, candidates)
                if outcome.player_id is not None:
                    load_understat.write_season_stats(conn, outcome.player_id, record)
                    written += 1
                elif outcome.outcome == "new":
                    to_create.append(record)
                else:
                    queued += 1

            if to_create:
                print(f"{len(to_create)} joueur(s) inconnu(s) : postes via les feuilles de match…")
                positions, unknown = understat.infer_positions(
                    understat.fetch_roster_positions(reader),
                )
                if unknown:
                    print(f"ATTENTION codes de poste Understat inconnus (ignorés) : {unknown}")
                for record in to_create:
                    player_id = load_understat.existing_alias(conn, record["source_id"])
                    if player_id is None:
                        position = positions.get(record["source_id"])
                        if position is None:
                            load_understat.queue_without_position(conn, record)
                            queued += 1
                            continue
                        player_id = load_understat.create_player(conn, record, position)
                        candidates.append(IdentityCandidate(
                            player_id=player_id,
                            normalized_name=normalize_name(record["raw_name"]),
                            clubs=record["clubs"],
                        ))
                        created += 1
                    load_understat.write_season_stats(conn, player_id, record)
                    written += 1
            conn.commit()

        tracked.rows_written = written
        print(f"OK — {written} ligne(s) écrite(s) dont {created} joueur(s) créé(s), "
              f"{queued} en file d'arbitrage")
        return written


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--leagues", nargs="+", default=understat.LEAGUES)
    parser.add_argument(
        "--seasons", nargs="+", default=[understat.current_season_code(date.today())],
        help="codes soccerdata, ex. 2526 (défaut : saison en cours)",
    )
    args = parser.parse_args()
    run(args.leagues, args.seasons)


if __name__ == "__main__":
    main()
