"""Estime les coefficients de force des championnats (et leur intervalle
de confiance) à partir des joueurs observés dans plusieurs compétitions.
À lancer avant compute_percentiles, qui s'en sert pour les percentiles
« toutes compétitions » ajustés.

Usage :
    uv run python -m vivier_pipeline.jobs.compute_strength
    uv run python -m vivier_pipeline.jobs.compute_strength --reference-competition-id 3
"""

import argparse

from vivier_pipeline.config import get_conn
from vivier_pipeline.core.load_strength import (
    fetch_competition_ids,
    fetch_strength_input,
    write_strength,
)
from vivier_pipeline.core.metrics_registry import league_adjusted_keys, load_registry
from vivier_pipeline.core.strength import StrengthParams, estimate_strength


def run(reference_competition_id: int | None = None) -> None:
    params = StrengthParams.from_registry(load_registry()["leagueStrength"])

    with get_conn() as conn:
        rows = fetch_strength_input(conn, params.min_minutes)
        competition_ids = fetch_competition_ids(conn)
        print(
            f"{len(rows)} ligne(s) ≥ {params.min_minutes} min, "
            f"{len(competition_ids)} compétition(s)"
        )

        results = estimate_strength(
            rows, league_adjusted_keys(), params, competition_ids, reference_competition_id,
        )
        estimated = write_strength(conn, results)
        conn.commit()

        names = dict(conn.execute("SELECT id, name || ' (' || country || ')' FROM competitions"))
        for r in sorted(results, key=lambda r: -(r.coef or 0)):
            if r.coef is None:
                print(f"  {names[r.competition_id]:<45} —  {r.status} ({r.n_links} liaison(s))")
            else:
                print(
                    f"  {names[r.competition_id]:<45} {r.coef:.3f} "
                    f"[{r.low:.3f} – {r.high:.3f}]  {r.status} ({r.n_links} liaison(s))"
                )
        print(f"OK — {estimated} coefficient(s) estimé(s)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-competition-id", type=int, default=None)
    args = parser.parse_args()
    run(args.reference_competition_id)


if __name__ == "__main__":
    main()
