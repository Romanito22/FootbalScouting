"""Fixtures figées pour les métriques de passe, progression, jeu aérien et
gardien (phase 8), calculées depuis les événements StatsBomb.

Chaque événement est écrit à la main dans le format réel de StatsBomb
Open Data (colonnes aplaties par statsbombpy, booléens relus en 1.0/NaN
depuis le cache local) : les cas limites de chaque définition sont
verrouillés un par un — une passe de 3 yards au bord de la surface n'est
pas « progressive », une touche ne compte pas dans le taux de passes, un
but contre son camp n'est jamais imputé au gardien.
"""

import math

import numpy as np
import pandas as pd
import pytest

from vivier_pipeline.core.aggregate import (
    _event_counts,
    _gk_per90_metrics,
    _per90_metrics,
    in_box,
    is_progressive,
)

NAN = float("nan")
PLAYER = 1
KEEPER = 99


def _event(type_: str, player_id: int = PLAYER, **fields: object) -> dict:
    base: dict = {"id": fields.pop("id", f"e{np.random.randint(1e9)}"), "period": 1,
                  "type": type_, "player_id": player_id}
    base.update(fields)
    return base


def _counts(events: list[dict]) -> pd.DataFrame:
    return _event_counts(pd.DataFrame(events))


def _count(events: list[dict], column: str, player_id: int = PLAYER) -> float:
    counts = _counts(events)
    if player_id not in counts.index:
        return 0.0
    return float(counts.loc[player_id, column])


def _pass(start: list[float], end: list[float], **fields: object) -> dict:
    return _event("Pass", location=start, pass_end_location=end, **fields)


# ---- géométrie ----

def test_progressive_requires_a_quarter_of_the_distance_and_ten_yards() -> None:
    start = np.array([[60.0, 40.0], [100.0, 40.0], [60.0, 40.0]])
    end = np.array([[80.0, 40.0], [105.0, 40.0], [62.0, 40.0]])
    # 60 -> 40 yards du but : 33 % et 20 yards ; 20 -> 15 : 25 % mais 5 yards ;
    # 60 -> 58 : 3 %
    assert is_progressive(start, end).tolist() == [True, False, False]


def test_missing_coordinates_are_never_progressive() -> None:
    start = np.array([[NAN, NAN]])
    end = np.array([[110.0, 40.0]])
    assert is_progressive(start, end).tolist() == [False]


def test_box_boundaries() -> None:
    xy = np.array([[102.0, 18.0], [101.9, 40.0], [110.0, 62.1], [NAN, NAN]])
    assert in_box(xy).tolist() == [True, False, False, False]


# ---- passes ----

def test_throw_ins_are_excluded_from_pass_volume_and_rate() -> None:
    events = [
        _pass([50, 40], [60, 40]),
        _pass([50, 40], [60, 40], pass_outcome="Incomplete"),
        _pass([50, 0], [55, 5], pass_type="Throw-in"),
    ]
    counts = _counts(events).loc[PLAYER]
    assert counts["passes_attempted"] == 2
    assert counts["passes_completed"] == 1
    assert counts["passes_attempted_all"] == 3


def test_progressive_pass_must_be_completed_and_in_open_play() -> None:
    events = [
        _pass([50, 40], [85, 40]),                               # progressive
        _pass([50, 40], [85, 40], pass_outcome="Incomplete"),    # ratée
        _pass([50, 40], [85, 40], pass_type="Free Kick"),        # coup de pied arrêté
        _pass([50, 40], [85, 40], pass_type="Recovery"),         # jeu ouvert : compte
    ]
    assert _count(events, "progressive_passes") == 2


def test_progressive_carry() -> None:
    events = [
        _event("Carry", location=[40, 40], carry_end_location=[75, 40]),
        _event("Carry", location=[40, 40], carry_end_location=[45, 40]),
    ]
    assert _count(events, "progressive_carries") == 1


def test_pass_into_box_must_start_outside_it() -> None:
    events = [
        _pass([90, 40], [110, 40]),            # entre dans la surface
        _pass([105, 30], [110, 40]),           # déjà dans la surface
        _pass([90, 40], [110, 40], pass_type="Corner"),
    ]
    assert _count(events, "passes_into_box") == 1


def test_pass_into_final_third() -> None:
    events = [_pass([70, 40], [85, 40]), _pass([82, 40], [90, 40])]
    assert _count(events, "passes_into_final_third") == 1


def test_box_receptions_count_only_successful_receipts_in_box() -> None:
    events = [
        _event("Ball Receipt*", location=[110, 40]),
        _event("Ball Receipt*", location=[110, 40], ball_receipt_outcome="Incomplete"),
        _event("Ball Receipt*", location=[90, 40]),
    ]
    assert _count(events, "box_receptions") == 1


# ---- duels aériens, pressions, pertes ----

def test_aerial_win_rate_from_won_flags_and_lost_duels() -> None:
    events = [
        _pass([50, 40], [60, 40], pass_aerial_won=1.0),
        _event("Clearance", clearance_aerial_won=True, location=[10, 40]),
        _event("Duel", duel_type="Aerial Lost", location=[50, 40]),
        _pass([50, 40], [60, 40], pass_aerial_won=NAN),
    ]
    counts = _counts(events).loc[PLAYER]
    assert counts["aerials_won"] == 2
    assert counts["aerials_lost"] == 1
    metrics = _per90_metrics(counts, nineties=1.0)
    assert metrics["aerial_win_rate"] == pytest.approx(2 / 3)


def test_turnovers_and_pressures() -> None:
    events = [
        _event("Dispossessed"), _event("Miscontrol"), _event("Pressure"), _event("Pressure"),
    ]
    counts = _counts(events).loc[PLAYER]
    assert counts["turnovers"] == 2
    assert counts["pressures"] == 2


def test_penalty_shootout_events_are_ignored() -> None:
    events = [_pass([50, 40], [85, 40]), {**_pass([50, 40], [85, 40]), "period": 5}]
    assert _count(events, "progressive_passes") == 1


# ---- gardiens ----

def _shot(shot_id: str, xg: float, outcome: str) -> dict:
    return _event("Shot", player_id=7, id=shot_id, shot_statsbomb_xg=xg,
                  shot_outcome=outcome, location=[108, 40])


def _keeper(type_: str, related: list[str], outcome: object = NAN) -> dict:
    return _event("Goal Keeper", player_id=KEEPER, goalkeeper_type=type_,
                  goalkeeper_outcome=outcome, related_events=related)


def test_goalkeeper_saves_conceded_and_goals_prevented() -> None:
    events = [
        _shot("s1", 0.30, "Saved"), _keeper("Shot Saved", ["s1"], "Success"),
        _shot("s2", 0.10, "Goal"), _keeper("Goal Conceded", ["s2"], "No Touch"),
        _shot("s3", 0.05, "Saved To Post"), _keeper("Shot Saved to Post", ["s3"]),
        _shot("s4", 0.20, "Off T"), _keeper("Shot Faced", ["s4"]),  # hors cadre : ni arrêt ni but
    ]
    counts = _counts(events).loc[KEEPER]
    assert counts["gk_saves"] == 2
    assert counts["gk_conceded"] == 1
    assert counts["gk_on_target_xg"] == pytest.approx(0.30 + 0.10 + 0.05)
    metrics = _gk_per90_metrics(counts, nineties=1.0)
    assert metrics["gk_save_rate"] == pytest.approx(2 / 3)
    assert metrics["gk_goals_prevented"] == pytest.approx(0.45 - 1.0)


def test_own_goal_is_never_charged_to_the_keeper() -> None:
    events = [
        _event("Own Goal Against", player_id=5),
        _keeper("Shot Saved", ["s1"]), _shot("s1", 0.2, "Saved"),
    ]
    counts = _counts(events).loc[KEEPER]
    assert counts["gk_conceded"] == 0


def test_penalty_conceded_counts_as_goal_conceded() -> None:
    events = [_shot("p1", 0.78, "Goal"), _keeper("Penalty Conceded", ["p1"])]
    counts = _counts(events).loc[KEEPER]
    assert counts["gk_conceded"] == 1
    assert counts["gk_on_target_xg"] == pytest.approx(0.78)


def test_failed_claims_do_not_count() -> None:
    events = [
        _keeper("Collected", [], "Success"),
        _keeper("Punch", [], "In Play Safe"),
        _keeper("Collected", [], "Fail"),
        _keeper("Keeper Sweeper", [], "Clear"),
    ]
    counts = _counts(events).loc[KEEPER]
    assert counts["gk_high_claims"] == 2
    assert counts["gk_sweeper_actions"] == 1


def test_goalkeeper_pass_rate_includes_goal_kicks() -> None:
    events = [
        _event("Pass", player_id=KEEPER, location=[6, 40], pass_end_location=[60, 40],
               pass_type="Goal Kick"),
        _event("Pass", player_id=KEEPER, location=[6, 40], pass_end_location=[60, 40],
               pass_type="Goal Kick", pass_outcome="Incomplete"),
    ]
    counts = _counts(events).loc[KEEPER]
    metrics = _gk_per90_metrics(counts, nineties=1.0)
    assert metrics["gk_pass_completion_rate"] == pytest.approx(0.5)


def test_no_shot_on_target_gives_zero_rate_not_a_division_error() -> None:
    counts = _counts([_keeper("Collected", [], "Success")]).loc[KEEPER]
    metrics = _gk_per90_metrics(counts, nineties=1.0)
    assert metrics["gk_save_rate"] == 0.0
    assert not math.isnan(metrics["gk_goals_prevented"])
