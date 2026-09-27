"""Lit les stats pour le modèle de force des championnats et écrit ses
coefficients dans `competitions` (colonnes réservées dès la phase 0)."""

import json

import pandas as pd
import psycopg

from vivier_pipeline.core.percentiles import LeagueStrength
from vivier_pipeline.core.strength import MODEL_VERSION, CompetitionStrength


def fetch_strength_input(conn: psycopg.Connection, min_minutes: int) -> pd.DataFrame:
    rows = conn.execute(
        """
        SELECT player_id, season, competition_id, minutes, metrics
        FROM player_season_stats
        WHERE minutes >= %s
        """,
        (min_minutes,),
    ).fetchall()
    return pd.DataFrame(
        rows, columns=["player_id", "season", "competition_id", "minutes", "metrics"],
    )


def fetch_competition_ids(conn: psycopg.Connection) -> list[int]:
    return [r[0] for r in conn.execute("SELECT id FROM competitions ORDER BY id").fetchall()]


def write_strength(conn: psycopg.Connection, results: list[CompetitionStrength]) -> int:
    """Remplace intégralement l'estimation précédente : une compétition qui
    n'est plus estimable repasse à NULL (jamais un vieux coefficient
    orphelin)."""
    with conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE competitions SET
                strength_coef = %(coef)s,
                strength_coef_low = %(low)s,
                strength_coef_high = %(high)s,
                strength_status = %(status)s,
                strength_links = %(n_links)s,
                strength_samples = %(samples)s,
                strength_model_version = %(model_version)s,
                strength_computed_at = now()
            WHERE id = %(competition_id)s
            """,
            [
                {
                    "competition_id": r.competition_id,
                    "coef": r.coef,
                    "low": r.low,
                    "high": r.high,
                    "status": r.status,
                    "n_links": r.n_links,
                    "samples": json.dumps(r.samples) if r.coef is not None else None,
                    "model_version": MODEL_VERSION,
                }
                for r in results
            ],
        )
    return sum(1 for r in results if r.coef is not None)


def fetch_league_strengths(conn: psycopg.Connection) -> dict[int, LeagueStrength]:
    """Compétitions dotées d'un coefficient (référence comprise)."""
    rows = conn.execute(
        """
        SELECT id, strength_coef, strength_samples
        FROM competitions
        WHERE strength_coef IS NOT NULL AND strength_samples IS NOT NULL
        """,
    ).fetchall()
    return {
        r[0]: LeagueStrength(coef=float(r[1]), samples=list(r[2]))
        for r in rows
    }
