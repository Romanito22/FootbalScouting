"""Journal des runs (ingestions et recalculs) dans `ingestion_runs`.

Un run est inscrit « running » DÈS son démarrage, sur une connexion à part
en autocommit : le job travaille, lui, dans une transaction qui ne sera
visible qu'à la fin — sans ça, l'app ne pourrait pas montrer en direct
qu'une mise à jour est en cours. Il est clos en « success » (avec le
nombre de lignes écrites) ou en « failed » (avec l'erreur), y compris sur
interruption clavier.

Un seul run à la fois : le job `live` tourne en fond, une ingestion lancée
à la main pendant un de ses cycles pourrait sinon créer deux fois le même
joueur (deux résolutions d'identité concurrentes) ou recalculer les
percentiles sur une ingestion à moitié écrite. Les runs se sérialisent donc
sur un verrou consultatif Postgres, tenu pendant tout le run ; le second
attend (et le dit), il n'échoue pas.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from vivier_pipeline.config import get_conn

# Clé arbitraire, propre à VIVIER, du verrou consultatif des runs.
PIPELINE_LOCK_KEY = 0x56495649  # « VIVI »

_lock_held = False


@dataclass
class RunState:
    rows_written: int | None = None


def start_run(source: str, scope: str) -> int:
    with get_conn(autocommit=True) as conn:
        row = conn.execute(
            """
            INSERT INTO ingestion_runs (source, scope, status)
            VALUES (%s, %s, 'running')
            RETURNING id
            """,
            (source, scope),
        ).fetchone()
    assert row is not None, "INSERT ... RETURNING id doit renvoyer une ligne"
    return int(row[0])


def finish_run(
    run_id: int, status: str, rows_written: int | None = None, error: str | None = None,
) -> None:
    with get_conn(autocommit=True) as conn:
        conn.execute(
            """
            UPDATE ingestion_runs
            SET finished_at = now(), status = %s, rows_written = %s, error = %s
            WHERE id = %s
            """,
            (status, rows_written, error, run_id),
        )


@contextmanager
def exclusive_pipeline() -> Iterator[None]:
    """Verrou de session tenu sur une connexion dédiée : libéré à sa
    fermeture, y compris si le process meurt. Réentrant dans un même
    process (un run imbriqué ne s'attend pas lui-même)."""
    global _lock_held
    if _lock_held:
        yield
        return
    with get_conn(autocommit=True) as conn:
        acquired = conn.execute(
            "SELECT pg_try_advisory_lock(%s)", (PIPELINE_LOCK_KEY,),
        ).fetchone()
        if not (acquired and acquired[0]):
            current = conn.execute(
                """
                SELECT source, scope FROM ingestion_runs
                WHERE status = 'running' ORDER BY started_at DESC LIMIT 1
                """,
            ).fetchone()
            what = f"{current[0]} · {current[1]}" if current else "une autre tâche"
            print(f"En attente de la fin de la tâche en cours ({what})…", flush=True)
            conn.execute("SELECT pg_advisory_lock(%s)", (PIPELINE_LOCK_KEY,))
        _lock_held = True
        try:
            yield
        finally:
            _lock_held = False
            conn.execute("SELECT pg_advisory_unlock(%s)", (PIPELINE_LOCK_KEY,))


@contextmanager
def tracked_run(source: str, scope: str) -> Iterator[RunState]:
    """`with tracked_run("statsbomb", scope) as run: ... run.rows_written = n`

    Inscrit « running » seulement une fois le verrou obtenu : l'app ne
    montre en cours que ce qui tourne vraiment."""
    with exclusive_pipeline():
        run_id = start_run(source, scope)
        state = RunState()
        try:
            yield state
        except BaseException as exc:
            finish_run(run_id, "failed", state.rows_written, f"{type(exc).__name__}: {exc}")
            raise
        finish_run(run_id, "success", state.rows_written)
