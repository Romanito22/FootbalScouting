"""Écrit les données Understat en base, via la résolution d'identité.

Contrairement à FBref, Understat PEUT introduire un joueur inconnu : son
identifiant est stable et son poste se déduit des feuilles de match
(providers/understat.infer_positions). Faute de poste fiable, il part en
file d'arbitrage — jamais de poste deviné (il déterminerait son groupe de
pairs)."""

import json

import psycopg

from vivier_pipeline.core.identity import IdentityCandidate, IdentityQuery, normalize_name
from vivier_pipeline.core.leagues import league_info
from vivier_pipeline.core.resolve import ResolveOutcome, resolve_or_queue


def upsert_competition(conn: psycopg.Connection, league: str) -> int:
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
        (name, country, tier, json.dumps({"understat": league})),
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def upsert_club(conn: psycopg.Connection, record: dict, competition_id: int) -> int:
    """Identifiant d'équipe Understat d'abord, puis nom normalisé dans la
    même compétition (un club déjà connu d'une autre source)."""
    normalized = normalize_name(record["team_name"])
    existing = conn.execute(
        """
        SELECT id FROM clubs
        WHERE source_ids->>'understat_team' = %s
           OR (normalized_name = %s AND competition_id = %s AND is_national_team = false)
        ORDER BY (source_ids->>'understat_team' = %s) DESC NULLS LAST
        LIMIT 1
        """,
        (record["team_id"], normalized, competition_id, record["team_id"]),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE clubs SET source_ids = source_ids || %s WHERE id = %s",
            (json.dumps({"understat_team": record["team_id"]}), existing[0]),
        )
        return existing[0]
    row = conn.execute(
        """
        INSERT INTO clubs (name, normalized_name, competition_id, source_ids)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (record["team_name"], normalized, competition_id,
         json.dumps({"understat_team": record["team_id"]})),
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def resolve(
    conn: psycopg.Connection, record: dict, candidates: list[IdentityCandidate],
) -> ResolveOutcome:
    query = IdentityQuery(raw_name=record["raw_name"], clubs=record["clubs"])
    payload = {k: v for k, v in record.items() if k != "metrics"}
    return resolve_or_queue(conn, "understat", record["source_id"], query, payload, candidates)


def existing_alias(conn: psycopg.Connection, source_id: str) -> int | None:
    row = conn.execute(
        "SELECT player_id FROM player_aliases WHERE source = 'understat' AND source_id = %s",
        (source_id,),
    ).fetchone()
    return row[0] if row else None


def create_player(conn: psycopg.Connection, record: dict, position_group: str) -> int:
    row = conn.execute(
        """
        INSERT INTO players (full_name, normalized_name, position_group, source_ids)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (record["raw_name"], normalize_name(record["raw_name"]), position_group,
         json.dumps({"understat": record["source_id"]})),
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    player_id = row[0]
    conn.execute(
        """
        INSERT INTO player_aliases (player_id, source, source_id, raw_name, confidence)
        VALUES (%s, 'understat', %s, %s, 1.0)
        """,
        (player_id, record["source_id"], record["raw_name"]),
    )
    return player_id


def queue_without_position(conn: psycopg.Connection, record: dict) -> None:
    """Joueur inconnu dont aucune feuille de match ne donne un poste exploitable."""
    payload = {k: v for k, v in record.items() if k != "metrics"}
    payload["raison"] = "poste introuvable dans les feuilles de match Understat"
    conn.execute(
        """
        INSERT INTO resolution_queue (source, source_id, raw_name, raw_payload, candidates)
        VALUES ('understat', %s, %s, %s, '[]')
        ON CONFLICT (source, source_id) DO UPDATE SET
            raw_name = EXCLUDED.raw_name, raw_payload = EXCLUDED.raw_payload
        """,
        (record["source_id"], record["raw_name"], json.dumps(payload)),
    )


def write_season_stats(conn: psycopg.Connection, player_id: int, record: dict) -> None:
    competition_id = upsert_competition(conn, record["league"])
    club_id = upsert_club(conn, record, competition_id)
    conn.execute(
        """
        INSERT INTO player_season_stats
            (player_id, season, competition_id, club_id, minutes, matches_played, metrics, source)
        VALUES (%(player_id)s, %(season)s, %(competition_id)s, %(club_id)s,
                %(minutes)s, %(matches_played)s, %(metrics)s, 'understat')
        ON CONFLICT (player_id, season, competition_id, club_id) DO UPDATE SET
            minutes = EXCLUDED.minutes,
            matches_played = EXCLUDED.matches_played,
            -- fusion : Understat ne couvre qu'une partie du catalogue
            metrics = player_season_stats.metrics || EXCLUDED.metrics,
            source = 'understat',
            -- « nouveau » seulement si la ligne a réellement changé (journée jouée)
            ingested_at = CASE
                WHEN player_season_stats.minutes IS DISTINCT FROM EXCLUDED.minutes
                  OR player_season_stats.metrics IS DISTINCT FROM
                     player_season_stats.metrics || EXCLUDED.metrics
                THEN now() ELSE player_season_stats.ingested_at
            END
        """,
        {
            "player_id": player_id,
            "season": record["season"],
            "competition_id": competition_id,
            "club_id": club_id,
            "minutes": record["minutes"],
            "matches_played": record["matches_played"],
            "metrics": json.dumps(record["metrics"]),
        },
    )
