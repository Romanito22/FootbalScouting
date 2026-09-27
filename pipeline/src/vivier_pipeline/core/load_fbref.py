"""Écrit les données FBref en base. Contrairement à Transfermarkt, FBref
n'introduit jamais un nouveau joueur : sans date de naissance ni poste
fiable dans `read_player_season_stats`, on ne peut pas remplir
`players.position_group` (NOT NULL) sans deviner. Un enregistrement FBref
qui ne rattache à personne part donc en file d'attente, point — jamais de
création automatique."""

import json

import psycopg
from unidecode import unidecode

from vivier_pipeline.core.identity import IdentityCandidate, IdentityQuery
from vivier_pipeline.core.leagues import league_info
from vivier_pipeline.core.resolve import resolve_or_queue


def league_tier(league: str) -> int:
    return league_info(league)[2]


def upsert_fbref_competition(conn: psycopg.Connection, league: str) -> int:
    name, country, tier = league_info(league)
    row = conn.execute(
        """
        INSERT INTO competitions (name, country, tier, source_ids)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (name, country) DO UPDATE SET
            tier = EXCLUDED.tier,
            source_ids = competitions.source_ids || EXCLUDED.source_ids
        RETURNING id
        """,
        (name, country, tier, json.dumps({"fbref": league})),
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def upsert_fbref_club(conn: psycopg.Connection, team_name: str, competition_id: int) -> int:
    normalized = unidecode(team_name).lower().strip()
    existing = conn.execute(
        "SELECT id FROM clubs WHERE normalized_name = %s AND competition_id = %s",
        (normalized, competition_id),
    ).fetchone()
    if existing:
        return existing[0]
    row = conn.execute(
        """
        INSERT INTO clubs (name, normalized_name, competition_id)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (team_name, normalized, competition_id),
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def upsert_fbref_season_stats(
    conn: psycopg.Connection,
    record: dict,
    candidates: list[IdentityCandidate] | None = None,
) -> int | None:
    """Retourne le player_id si la ligne a été écrite, None si elle part en
    file d'attente (aucune écriture dans player_season_stats dans ce cas)."""
    query = IdentityQuery(raw_name=record["raw_name"])
    resolution = resolve_or_queue(
        conn, "fbref", record["source_id"], query,
        {k: v for k, v in record.items() if k != "metrics"} | {"metrics": record["metrics"]},
        candidates,
    )
    if resolution.player_id is None:
        return None

    competition_id = upsert_fbref_competition(conn, record["league"])
    club_id = upsert_fbref_club(conn, record["team_name"], competition_id)

    conn.execute(
        """
        INSERT INTO player_season_stats
            (player_id, season, competition_id, club_id, minutes, matches_played, metrics, source)
        VALUES (%(player_id)s, %(season)s, %(competition_id)s, %(club_id)s,
                %(minutes)s, %(matches_played)s, %(metrics)s, 'fbref')
        ON CONFLICT (player_id, season, competition_id, club_id) DO UPDATE SET
            minutes = EXCLUDED.minutes,
            matches_played = EXCLUDED.matches_played,
            -- fusion, pas remplacement : FBref ne couvre qu'une partie du
            -- catalogue, les métriques d'une autre source restent en place
            metrics = player_season_stats.metrics || EXCLUDED.metrics,
            source = 'fbref',
            ingested_at = CASE
                WHEN player_season_stats.minutes IS DISTINCT FROM EXCLUDED.minutes
                  OR player_season_stats.metrics IS DISTINCT FROM
                     player_season_stats.metrics || EXCLUDED.metrics
                THEN now() ELSE player_season_stats.ingested_at
            END
        """,
        {
            "player_id": resolution.player_id,
            "season": record["season"],
            "competition_id": competition_id,
            "club_id": club_id,
            "minutes": record["minutes"],
            "matches_played": record["matches_played"],
            "metrics": json.dumps(record["metrics"]),
        },
    )
    return resolution.player_id
