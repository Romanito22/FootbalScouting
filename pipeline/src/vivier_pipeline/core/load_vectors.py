"""Écrit les vecteurs style/qualité en base. `player_vectors` est
recalculée intégralement à chaque run (même logique que `peer_groups` /
`player_percentiles`, cf. core/load.replace_percentiles) : pas d'upsert
ligne à ligne, on remplace tout."""

import pandas as pd
import psycopg

from vivier_pipeline.core.vectors import VectorResult


def fetch_vector_input(conn: psycopg.Connection, min_minutes: int) -> pd.DataFrame:
    """Une ligne par (player_id, season) au-dessus du seuil de minutes — la
    plus fournie en minutes si le joueur en a plusieurs (clé primaire de
    player_vectors, même règle de départage que core/percentiles) — avec ses
    percentiles déjà calculés (core/percentiles.py) agrégés en dict.

    Les percentiles viennent du SEUL groupe de pairs propre à cette ligne
    (saison-centre = sa saison, même compétition/club) : un joueur figure
    aussi dans les groupes des saisons voisines, et mélanger ces
    classements donnerait un vecteur qualité incohérent.

    Un joueur sans percentile pour cette saison (peer_groups pas encore
    recalculés) est exclu : pas de vecteur qualité sans percentile."""
    rows = conn.execute(
        """
        SELECT DISTINCT ON (pss.player_id, pss.season)
               pss.player_id, pss.season, p.position_group, pss.metrics,
               (
                   SELECT jsonb_object_agg(pp.metric, pp.percentile)
                   FROM player_percentiles pp
                   JOIN peer_groups pg ON pg.id = pp.peer_group_id
                   WHERE pp.player_id = pss.player_id
                     AND pp.season = pss.season
                     AND pg.season = pss.season
                     AND pp.competition_id = pss.competition_id
                     AND pp.club_id = pss.club_id
               ) AS percentiles
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        WHERE pss.minutes >= %s
        ORDER BY pss.player_id, pss.season, pss.minutes DESC,
                 pss.competition_id, pss.club_id
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
