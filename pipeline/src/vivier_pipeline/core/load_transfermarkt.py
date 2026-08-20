"""Écrit les données Transfermarkt en base, via entity_resolution pour
rattacher chaque ligne à un joueur existant, une file d'attente, ou un
joueur tout neuf (cf. core/resolve.py — Transfermarkt est souvent la
première source à introduire un joueur, contrairement à StatsBomb)."""

import json

import psycopg

from vivier_pipeline.core.identity import IdentityCandidate, IdentityQuery
from vivier_pipeline.core.resolve import resolve_or_queue


def upsert_transfermarkt_club(conn: psycopg.Connection, club: dict) -> int:
    existing = conn.execute(
        """
        SELECT id FROM clubs
        WHERE source_ids->>'transfermarkt_club' = %s OR normalized_name = %s
        """,
        (club["source_ids"]["transfermarkt_club"], club["normalized_name"]),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE clubs SET source_ids = source_ids || %s WHERE id = %s",
            (json.dumps(club["source_ids"]), existing[0]),
        )
        return existing[0]

    row = conn.execute(
        """
        INSERT INTO clubs (name, normalized_name, source_ids)
        VALUES (%(name)s, %(normalized_name)s, %(source_ids)s)
        RETURNING id
        """,
        {**club, "source_ids": json.dumps(club["source_ids"])},
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return row[0]


def upsert_transfermarkt_player(
    conn: psycopg.Connection,
    tm_id: str,
    player: dict,
    club_id: int | None,
    candidates: list[IdentityCandidate] | None = None,
) -> int | None:
    """Retourne le player_id écrit, ou None si l'enregistrement part en
    file d'attente pour arbitrage humain."""
    query = IdentityQuery(
        raw_name=player["full_name"], birth_date=player["birth_date"],
        nationality=player["nationality"] or None,
    )
    raw_payload = {
        **player,
        "birth_date": str(player["birth_date"]) if player["birth_date"] else None,
        "contract_until": str(player["contract_until"]) if player["contract_until"] else None,
        "current_club_id": club_id,
    }
    resolution = resolve_or_queue(conn, "transfermarkt", tm_id, query, raw_payload, candidates)

    if resolution.outcome == "needs_review":
        return None

    if resolution.outcome in ("already_known", "auto_resolved"):
        conn.execute(
            """
            UPDATE players SET
                birth_date = %(birth_date)s,
                foot = %(foot)s,
                height_cm = %(height_cm)s,
                current_club_id = %(club_id)s,
                contract_until = %(contract_until)s,
                market_value_eur = %(market_value_eur)s,
                source_ids = source_ids || %(source_ids)s,
                updated_at = now()
            WHERE id = %(id)s
            """,
            {
                **player, "club_id": club_id, "id": resolution.player_id,
                "source_ids": json.dumps({"transfermarkt": tm_id}),
            },
        )
        return resolution.player_id

    # outcome == "new" : aucun candidat plausible, Transfermarkt introduit ce joueur
    row = conn.execute(
        """
        INSERT INTO players
            (full_name, normalized_name, birth_date, nationality, foot, height_cm,
             position_group, current_club_id, contract_until, market_value_eur, source_ids)
        VALUES
            (%(full_name)s, %(normalized_name)s, %(birth_date)s, %(nationality)s,
             %(foot)s, %(height_cm)s, %(position_group)s, %(club_id)s,
             %(contract_until)s, %(market_value_eur)s, %(source_ids)s)
        RETURNING id
        """,
        {**player, "club_id": club_id, "source_ids": json.dumps({"transfermarkt": tm_id})},
    ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    player_id = row[0]
    conn.execute(
        """
        INSERT INTO player_aliases (player_id, source, source_id, raw_name, confidence)
        VALUES (%s, 'transfermarkt', %s, %s, 1.0)
        """,
        (player_id, tm_id, player["full_name"]),
    )
    return player_id
