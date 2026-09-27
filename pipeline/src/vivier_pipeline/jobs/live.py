"""Mise à jour continue : stats Understat de la saison en cours, puis
recalcul complet (force, percentiles, vecteurs), toutes les N heures.
L'app se met à jour d'elle-même à la fin de chaque cycle (elle suit
`ingestion_runs` en direct).

Usage :
    uv run python -m vivier_pipeline.jobs.live                     # toutes les 6 h
    uv run python -m vivier_pipeline.jobs.live --interval-hours 12
    uv run python -m vivier_pipeline.jobs.live --once              # un cycle (ex. via cron)

Understat publie après chaque journée : un intervalle de quelques heures
suffit, et ménage la source (pause entre requêtes en plus, cf.
providers/understat.py). Ctrl+C pour arrêter.
"""

import argparse
import time
from datetime import date, datetime, timedelta

from vivier_pipeline.jobs import ingest_understat, refresh
from vivier_pipeline.providers import understat

MIN_INTERVAL_HOURS = 1.0


def cycle(leagues: list[str]) -> None:
    season = understat.current_season_code(date.today())
    print(f"[{datetime.now():%d/%m %H:%M}] cycle — saison {season}")
    ingest_understat.run(leagues, [season])
    refresh.run()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--leagues", nargs="+", default=understat.LEAGUES)
    parser.add_argument("--interval-hours", type=float, default=6.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    interval = max(args.interval_hours, MIN_INTERVAL_HOURS)

    try:
        while True:
            try:
                cycle(args.leagues)
            except Exception as exc:  # déjà journalisé en « failed » ; on réessaiera
                print(f"cycle en échec : {exc}")
            if args.once:
                break
            next_run = datetime.now() + timedelta(hours=interval)
            print(f"prochain cycle à {next_run:%d/%m %H:%M}")
            time.sleep(interval * 3600)
    except KeyboardInterrupt:
        print("arrêt demandé")


if __name__ == "__main__":
    main()
