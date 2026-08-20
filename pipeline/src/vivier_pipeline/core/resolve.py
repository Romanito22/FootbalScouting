"""Connecte la logique pure d'entity_resolution (core/identity.py) à
Postgres : charge les candidats existants, enregistre la décision.
"""

import json
from dataclasses import dataclass

import psycopg

from vivier_pipeline.core.identity import IdentityCandidate, IdentityQuery, resolve_identity


def fetch_identity_candidates(conn: psycopg.Connection) -> list[IdentityCandidate]:
    """Tous les joueurs déjà en base. À l'échelle actuelle (milliers de
    joueurs, pas millions), comparer contre l'ensemble complet à chaque
    résolution reste largement assez rapide ; un pré-filtre indexé (nom de
    famille, nationalité) sera à envisager si le volume grossit beaucoup."""
    rows = conn.execute(
        "SELECT id, normalized_name, birth_date, nationality FROM players",
    ).fetchall()
    return [
        IdentityCandidate(player_id=r[0], normalized_name=r[1], birth_date=r[2], nationality=r[3])
        for r in rows
    ]


@dataclass
class ResolveOutcome:
    outcome: str  # "already_known" | "auto_resolved" | "needs_review" | "new"
    player_id: int | None  # renseigné pour already_known et auto_resolved


def resolve_or_queue(
    conn: psycopg.Connection,
    source: str,
    source_id: str,
    query: IdentityQuery,
    raw_payload: dict,
    candidates: list[IdentityCandidate] | None = None,
) -> ResolveOutcome:
    """Ne crée jamais de joueur : ça reste la responsabilité de l'appelant,
    qui seul connaît les champs canoniques propres à sa source. Ce module ne
    fait que trancher QUI c'est, pas QUOI en faire."""
    existing = conn.execute(
        "SELECT player_id FROM player_aliases WHERE source = %s AND source_id = %s",
        (source, source_id),
    ).fetchone()
    if existing:
        return ResolveOutcome(outcome="already_known", player_id=existing[0])

    if candidates is None:
        candidates = fetch_identity_candidates(conn)

    result = resolve_identity(query, candidates)

    if result.outcome == "auto_resolved":
        assert result.player_id is not None
        assert result.confidence is not None
        conn.execute(
            """
            INSERT INTO player_aliases (player_id, source, source_id, raw_name, confidence)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (result.player_id, source, source_id, query.raw_name, result.confidence),
        )
        return ResolveOutcome(outcome="auto_resolved", player_id=result.player_id)

    if result.outcome == "needs_review":
        top_candidates = [
            {"playerId": c.player_id, "score": c.score} for c in result.candidates[:5]
        ]
        conn.execute(
            """
            INSERT INTO resolution_queue (source, source_id, raw_name, raw_payload, candidates)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (source, source_id) DO UPDATE SET
                raw_name = EXCLUDED.raw_name,
                raw_payload = EXCLUDED.raw_payload,
                candidates = EXCLUDED.candidates
            """,
            (
                source, source_id, query.raw_name,
                json.dumps(raw_payload), json.dumps(top_candidates),
            ),
        )
        return ResolveOutcome(outcome="needs_review", player_id=None)

    return ResolveOutcome(outcome="new", player_id=None)
