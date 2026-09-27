"""Journal des runs (ingestions et recalculs) dans `ingestion_runs`.

Un run est inscrit « running » DÈS son démarrage, sur une connexion à part
en autocommit : le job travaille, lui, dans une transaction qui ne sera
visible qu'à la fin — sans ça, l'app ne pourrait pas montrer en direct
qu'une mise à jour est en cours. Il est clos en « success » (avec le
nombre de lignes écrites) ou en « failed » (avec l'erreur), y compris sur
interruption clavier.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from vivier_pipeline.config import get_conn


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
def tracked_run(source: str, scope: str) -> Iterator[RunState]:
    """`with tracked_run("statsbomb", scope) as run: ... run.rows_written = n`"""
    run_id = start_run(source, scope)
    state = RunState()
    try:
        yield state
    except BaseException as exc:
        finish_run(run_id, "failed", state.rows_written, f"{type(exc).__name__}: {exc}")
        raise
    finish_run(run_id, "success", state.rows_written)
