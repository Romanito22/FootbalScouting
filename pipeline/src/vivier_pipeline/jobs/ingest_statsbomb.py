"""Ingère des compétitions StatsBomb Open Data dans player_season_stats.

Usage :
    uv run python -m vivier_pipeline.jobs.ingest_statsbomb --competition-id 43 --season-id 106
    uv run python -m vivier_pipeline.jobs.ingest_statsbomb --preset big5-2015
    uv run python -m vivier_pipeline.jobs.ingest_statsbomb --all

Presets : big5-2015 (les 5 grands championnats 2015-2016, complets pour la
plupart), internationaux (Coupes du monde, Euros, Copa América, CAN
récents), recents (saisons récentes partielles : matchs d'une équipe).
--all : toutes les compétitions masculines de l'Open Data (long : plusieurs
milliers de matchs, ~8 Mo de cache par match).

Chaque compétition est un run journalisé à part : un échec est signalé et
n'empêche pas les suivantes. Lancer ensuite `pnpm pipeline:refresh`.
"""

import argparse
import sys

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.aggregate import aggregate_competition
from vivier_pipeline.core.load import load_competition
from vivier_pipeline.core.runs import tracked_run
from vivier_pipeline.providers import statsbomb

PRESETS: dict[str, list[tuple[int, int]]] = {
    "big5-2015": [(2, 27), (11, 27), (9, 27), (12, 27), (7, 27)],
    "internationaux": [(43, 106), (43, 3), (55, 282), (55, 43), (223, 282), (1267, 107)],
    "recents": [(7, 235), (7, 108), (9, 281), (11, 90), (44, 107)],
}


def run(competition_id: int, season_id: int) -> None:
    label = statsbomb.describe(competition_id, season_id)
    scope = f"statsbomb|{competition_id}|{season_id}|{label}"
    with tracked_run("statsbomb", scope) as tracked:
        matches = statsbomb.fetch_matches(competition_id, season_id)
        print(f"{len(matches)} match(es) — {scope}")

        events_by_match = {}
        lineups_by_match = {}
        for match_id in matches["match_id"]:
            match_id = int(match_id)
            events_by_match[match_id] = statsbomb.fetch_events(match_id)
            lineups_by_match[match_id] = statsbomb.fetch_lineups(match_id)

        agg = aggregate_competition(
            matches, events_by_match, lineups_by_match,
            is_international=statsbomb.is_international(competition_id, season_id),
        )
        print(f"{len(agg.players)} joueur(s) (gardiens compris), {len(agg.clubs)} équipe(s)")

        with get_conn() as conn:
            rows_written = load_competition(conn, agg)
            conn.commit()
        tracked.rows_written = rows_written
        print(f"OK — {rows_written} ligne(s) écrite(s) dans player_season_stats")


def all_men_competitions() -> list[tuple[int, int]]:
    competitions = statsbomb.fetch_competitions()
    men = competitions[competitions["competition_gender"] == "male"]
    return [(int(c), int(s)) for c, s in zip(men["competition_id"], men["season_id"], strict=True)]


def run_many(pairs: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Enchaîne les compétitions ; renvoie celles qui ont échoué."""
    failed = []
    for competition_id, season_id in pairs:
        try:
            run(competition_id, season_id)
        except Exception as exc:  # journalisé par tracked_run ; on passe à la suivante
            print(f"ÉCHEC {competition_id}/{season_id} : {exc}", file=sys.stderr)
            failed.append((competition_id, season_id))
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--competition-id", type=int)
    parser.add_argument("--season-id", type=int)
    parser.add_argument("--preset", choices=sorted(PRESETS))
    parser.add_argument("--all", action="store_true", help="toutes les compétitions masculines")
    args = parser.parse_args()

    if args.all:
        pairs = all_men_competitions()
    elif args.preset:
        pairs = PRESETS[args.preset]
    elif args.competition_id is not None and args.season_id is not None:
        pairs = [(args.competition_id, args.season_id)]
    else:
        parser.error("--competition-id et --season-id, ou --preset, ou --all")

    failed = run_many(pairs)
    if failed:
        sys.exit(f"{len(failed)} compétition(s) en échec : {failed}")


if __name__ == "__main__":
    main()
