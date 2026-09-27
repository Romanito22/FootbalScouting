"""Cycle de vie d'un run : « running » dès le départ, puis « success » avec
le nombre de lignes, ou « failed » avec l'erreur — y compris sur
interruption clavier (sinon l'app afficherait une mise à jour éternelle)."""

from collections.abc import Iterator
from contextlib import contextmanager

import pytest

from vivier_pipeline.core import runs


@pytest.fixture
def journal(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    calls: list[tuple] = []

    def start(source: str, scope: str) -> int:
        calls.append(("start", source, scope))
        return 42

    def finish(run_id: int, status: str, rows: int | None = None, error: str | None = None) -> None:
        calls.append(("finish", run_id, status, rows, error))

    @contextmanager
    def lock() -> Iterator[None]:
        calls.append(("lock",))
        try:
            yield
        finally:
            calls.append(("unlock",))

    monkeypatch.setattr(runs, "start_run", start)
    monkeypatch.setattr(runs, "finish_run", finish)
    monkeypatch.setattr(runs, "exclusive_pipeline", lock)
    return calls


def test_success_records_rows_written(journal: list[tuple]) -> None:
    with runs.tracked_run("understat", "scope") as run:
        run.rows_written = 12
    assert journal == [
        ("lock",),
        ("start", "understat", "scope"),
        ("finish", 42, "success", 12, None),
        ("unlock",),
    ]


def test_failure_is_recorded_and_reraised(journal: list[tuple]) -> None:
    with pytest.raises(ValueError), runs.tracked_run("statsbomb", "scope"):
        raise ValueError("colonne manquante")
    assert journal[-2:] == [
        ("finish", 42, "failed", None, "ValueError: colonne manquante"),
        ("unlock",),
    ]


def test_keyboard_interrupt_is_recorded_as_failed(journal: list[tuple]) -> None:
    with pytest.raises(KeyboardInterrupt), runs.tracked_run("pipeline", "percentiles"):
        raise KeyboardInterrupt
    assert journal[-2][2] == "failed"
    assert journal[-1] == ("unlock",)
