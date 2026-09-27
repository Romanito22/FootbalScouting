"""Fixtures figées pour le provider Understat.

Colonnes écrites d'après le code source de soccerdata (Understat.
read_player_season_stats / read_player_match_stats), vérifié localement ;
understat.com étant hors de portée réseau ici, ces tests verrouillent le
contrat de normalisation lui-même (per-90, saisons, postes), pas la
question distincte « le site renvoie-t-il bien ces champs »."""

from datetime import date

import pandas as pd
import pytest

from vivier_pipeline.providers.understat import (
    current_season_code,
    infer_positions,
    normalize_row,
)

INDEX = ("ENG-Premier League", "2526", "Arsenal", "Bukayo Saka")


def _row(overrides: dict | None = None) -> pd.Series:
    base: dict = {
        "team_id": 83, "player_id": 7322, "position": "F M S", "matches": 30,
        "minutes": 2700, "goals": 12, "xg": 11.4, "np_goals": 10, "np_xg": 9.9,
        "assists": 9, "xa": 8.1, "shots": 90, "key_passes": 75, "yellow_cards": 3,
        "red_cards": 0, "xg_chain": 21.0, "xg_buildup": 6.0,
    }
    base.update(overrides or {})
    return pd.Series(base)


def test_normalize_row_computes_per90_from_totals() -> None:
    record = normalize_row(INDEX, _row())
    assert record is not None
    m = record["metrics"]
    assert m["goals"] == pytest.approx(12 / 30)
    assert m["npxg"] == pytest.approx(9.9 / 30)
    assert m["np_goals_minus_npxg"] == pytest.approx((10 - 9.9) / 30)
    assert m["xg_per_shot"] == pytest.approx(11.4 / 90)
    assert m["xg_chain"] == pytest.approx(21.0 / 30)
    assert m["xg_buildup"] == pytest.approx(6.0 / 30)


def test_normalize_row_identity_fields() -> None:
    record = normalize_row(INDEX, _row())
    assert record is not None
    assert record["source_id"] == "7322"  # identifiant stable d'une saison à l'autre
    assert record["season"] == "2025-2026"
    assert record["team_id"] == "83"
    assert record["clubs"] == ["arsenal"]
    assert record["source"] == "understat"


def test_zero_or_missing_minutes_are_skipped() -> None:
    assert normalize_row(INDEX, _row({"minutes": 0})) is None
    assert normalize_row(INDEX, _row({"minutes": pd.NA})) is None


def test_zero_shots_gives_zero_xg_per_shot_not_a_crash() -> None:
    record = normalize_row(INDEX, _row({"shots": 0, "xg": 0.0}))
    assert record is not None
    assert record["metrics"]["xg_per_shot"] == 0.0


def test_missing_counts_default_to_zero() -> None:
    record = normalize_row(INDEX, _row({"red_cards": pd.NA}))
    assert record is not None
    assert record["metrics"]["red_cards"] == 0.0


def test_current_season_starts_in_july() -> None:
    assert current_season_code(date(2026, 9, 27)) == "2627"
    assert current_season_code(date(2026, 6, 30)) == "2526"
    assert current_season_code(date(2099, 8, 1)) == "9900"


def _rosters(rows: list[tuple[int, str, int]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["player_id", "position", "minutes"])


def test_position_is_the_most_played_weighted_by_minutes() -> None:
    positions, unknown = infer_positions(_rosters([
        (1, "AMR", 90), (1, "AMR", 85), (1, "FW", 90),  # ailier droit surtout
        (2, "DMR", 90), (2, "DR", 90),                  # piston / latéral
        (3, "DMC", 90), (3, "MC", 20),
    ]))
    assert positions == {"1": "W", "2": "FB", "3": "DM"}
    assert unknown == {}


def test_substitute_bench_rows_are_ignored() -> None:
    positions, _ = infer_positions(_rosters([(4, "Sub", 0), (4, "FW", 25)]))
    assert positions == {"4": "ST"}


def test_unknown_position_codes_are_reported_not_guessed() -> None:
    positions, unknown = infer_positions(_rosters([(5, "XYZ", 90), (5, "XYZ", 90)]))
    assert positions == {}
    assert unknown == {"XYZ": 2}
