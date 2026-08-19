"""Écrit une CompetitionAggregation en base, via player_aliases pour la
résolution d'identité (même en source unique, c'est la table qui fait foi)."""

import json

import pandas as pd
import psycopg

from vivier_pipeline.core.aggregate import CompetitionAggregation
from vivier_pipeline.core.percentiles import PeerGroupResult


def upsert_competition(conn: psycopg.Connection, comp: dict) -> int:
    row = conn.execute(
        """
        INSERT INTO competitions (name, country, tier, source_ids)
        VALUES (%(name)s, %(country)s, %(tier)s, %(source_ids)s)
        ON CONFLICT (name, country) DO UPDATE SET
            tier = EXCLUDED.tier,
            source_ids = competitions.source_ids || EXCLUDED.source_ids
        RETURNING id
        """,
        {**comp, "source_ids": json.dumps(comp["source_ids"])},
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def upsert_club(conn: psycopg.Connection, club: dict, competition_id: int) -> int:
    existing = conn.execute(
        "SELECT id FROM clubs WHERE normalized_name = %s AND is_national_team = true",
        (club["normalized_name"],),
    ).fetchone()
    if existing:
        return existing[0]
    row = conn.execute(
        """
        INSERT INTO clubs
            (name, normalized_name, country, competition_id, is_national_team, source_ids)
        VALUES
            (%(name)s, %(normalized_name)s, %(country)s,
             %(competition_id)s, %(is_national_team)s, %(source_ids)s)
        RETURNING id
        """,
        {**club, "competition_id": competition_id, "source_ids": json.dumps(club["source_ids"])},
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def upsert_player(conn: psycopg.Connection, statsbomb_id: int, player: dict) -> int:
    alias = conn.execute(
        "SELECT player_id FROM player_aliases WHERE source = 'statsbomb' AND source_id = %s",
        (str(statsbomb_id),),
    ).fetchone()
    if alias:
        player_id = alias[0]
        conn.execute(
            """
            UPDATE players SET
                position_group = %(position_group)s,
                nationality = %(nationality)s,
                updated_at = now()
            WHERE id = %(id)s
            """,
            {**player, "id": player_id},
        )
        return player_id

    row = conn.execute(
        """
        INSERT INTO players
            (full_name, normalized_name, nationality, position_group, source_ids)
        VALUES
            (%(full_name)s, %(normalized_name)s, %(nationality)s,
             %(position_group)s, %(source_ids)s)
        RETURNING id
        """,
        {**player, "source_ids": json.dumps({"statsbomb": str(statsbomb_id)})},
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    player_id = row[0]
    conn.execute(
        """
        INSERT INTO player_aliases (player_id, source, source_id, raw_name, confidence)
        VALUES (%s, 'statsbomb', %s, %s, 1.0)
        """,
        (player_id, str(statsbomb_id), player["full_name"]),
    )
    return player_id


def upsert_season_stats(
    conn: psycopg.Connection, player_id: int, competition_id: int, club_id: int, stat: dict,
) -> None:
    conn.execute(
        """
        INSERT INTO player_season_stats
            (player_id, season, competition_id, club_id, minutes, matches_played, metrics, source)
        VALUES (%(player_id)s, %(season)s, %(competition_id)s, %(club_id)s,
                %(minutes)s, %(matches_played)s, %(metrics)s, %(source)s)
        ON CONFLICT (player_id, season, competition_id, club_id) DO UPDATE SET
            minutes = EXCLUDED.minutes,
            matches_played = EXCLUDED.matches_played,
            metrics = EXCLUDED.metrics,
            ingested_at = now()
        """,
        {
            "player_id": player_id,
            "season": stat["season"],
            "competition_id": competition_id,
            "club_id": club_id,
            "minutes": stat["minutes"],
            "matches_played": stat["matches_played"],
            "metrics": json.dumps(stat["metrics"]),
            "source": stat["source"],
        },
    )


def load_competition(conn: psycopg.Connection, agg: CompetitionAggregation) -> int:
    competition_id = upsert_competition(conn, agg.competition)

    club_ids = {
        team_id: upsert_club(conn, club, competition_id)
        for team_id, club in agg.clubs.items()
    }

    rows_written = 0
    for statsbomb_player_id, player in agg.players.items():
        player_id = upsert_player(conn, statsbomb_player_id, player)
        stat = next(s for s in agg.season_stats if s["player_id"] == statsbomb_player_id)
        club_id = club_ids[stat["team_id"]]
        upsert_season_stats(conn, player_id, competition_id, club_id, stat)
        rows_written += 1

    return rows_written


def fetch_percentile_input(conn: psycopg.Connection, min_minutes: int) -> pd.DataFrame:
    rows = conn.execute(
        """
        SELECT pss.player_id, pss.season, p.position_group, c.tier, pss.metrics
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        JOIN competitions c ON c.id = pss.competition_id
        WHERE pss.minutes >= %s
        """,
        (min_minutes,),
    ).fetchall()
    return pd.DataFrame(
        rows, columns=["player_id", "season", "position_group", "tier", "metrics"],
    )


def replace_percentiles(conn: psycopg.Connection, groups: list[PeerGroupResult]) -> int:
    """`player_percentiles`/`peer_groups` sont des tables matérialisées,
    recalculées intégralement à chaque run (cf. commentaire du schéma)."""
    conn.execute("TRUNCATE player_percentiles, peer_groups CASCADE")

    for group in groups:
        conn.execute(
            """
            INSERT INTO peer_groups (id, label, position_group, season, min_minutes, sample_size)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                group.peer_group_id, group.label, group.position_group,
                group.season, group.min_minutes, group.sample_size,
            ),
        )

    rows_written = 0
    with conn.cursor() as cur:
        for group in groups:
            cur.executemany(
                """
                INSERT INTO player_percentiles
                    (player_id, season, peer_group_id, metric, raw_value, percentile)
                VALUES (%(player_id)s, %(season)s, %(peer_group_id)s,
                        %(metric)s, %(raw_value)s, %(percentile)s)
                """,
                [{**p, "peer_group_id": group.peer_group_id} for p in group.percentiles],
            )
            rows_written += len(group.percentiles)

    return rows_written


def log_ingestion_run(
    conn: psycopg.Connection, source: str, scope: str, status: str,
    rows_written: int | None = None, error: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO ingestion_runs
            (source, scope, started_at, finished_at, rows_written, status, error)
        VALUES (%s, %s, now(), now(), %s, %s, %s)
        """,
        (source, scope, rows_written, status, error),
    )
