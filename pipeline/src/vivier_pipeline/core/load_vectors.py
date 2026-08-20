"""Écrit les vecteurs style/qualité en base. `player_vectors` est
recalculée intégralement à chaque run (même logique que `peer_groups` /
`player_percentiles`, cf. core/load.replace_percentiles) : pas d'upsert
ligne à ligne, on remplace tout."""

import pandas as pd
import psycopg

from vivier_pipeline.core.vectors import VectorResult


def fetch_vector_input(conn: psycopg.Connection, min_minutes: int) -> pd.DataFrame:
    """Une ligne par (player_id, season) au-dessus du seuil de minutes, avec
    ses percentiles déjà calculés (core/percentiles.py) agrégés en dict.
    Un joueur sans percentile pour cette saison (peer_groups pas encore
    recalculés) est exclu : pas de vecteur qualité sans percentile."""
    rows = conn.execute(
        """
        SELECT pss.player_id, pss.season, p.position_group, pss.metrics,
               (
                   SELECT jsonb_object_agg(pp.metric, pp.percentile)
                   FROM player_percentiles pp
                   WHERE pp.player_id = pss.player_id AND pp.season = pss.season
               ) AS percentiles
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        WHERE pss.minutes >= %s
        """,
        (min_minutes,),
    ).fetchall()
    df = pd.DataFrame(
        rows, columns=["player_id", "season", "position_group", "metrics", "percentiles"],
    )
    return df[df["percentiles"].notna()].reset_index(drop=True)


def _to_pgvector_literal(values: list[float]) -> str:
    return f"[{','.join(repr(v) for v in values)}]"


def replace_vectors(conn: psycopg.Connection, results: list[VectorResult]) -> int:
    conn.execute("TRUNCATE player_vectors")

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO player_vectors
                (player_id, season, style_vec, quality_vec, model_version)
            VALUES
                (%(player_id)s, %(season)s, %(style_vec)s::vector,
                 %(quality_vec)s::vector, %(model_version)s)
            """,
            [
                {
                    "player_id": r.player_id,
                    "season": r.season,
                    "style_vec": _to_pgvector_literal(r.style_vec),
                    "quality_vec": _to_pgvector_literal(r.quality_vec),
                    "model_version": r.model_version,
                }
                for r in results
            ],
        )
    return len(results)
