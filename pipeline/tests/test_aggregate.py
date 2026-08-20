"""Fixtures figées pour la logique de calcul des minutes jouées.

Ces cas reproduisent des structures réelles observées dans StatsBomb Open
Data (Coupe du monde 2022), y compris le piège des matchs à tirs au but :
la dernière entrée `positions` d'un joueur resté sur le terrain jusqu'au
bout des prolongations décrit la séance de pénos avec une période qui
régresse et une horloge qui repart en arrière. Un bug ici sous-estime en
silence les minutes de tous les titulaires jamais remplacés — exactement
le genre de bug que CLAUDE.md interdit de laisser passer sans test.
"""

from vivier_pipeline.core.aggregate import _player_minutes, normalize_name
from vivier_pipeline.core.positions import normalize_statsbomb_position

# Horloges de période telles que dérivées des événements Half Start/Half End
# d'un match avec prolongations (ex. une finale de Coupe du monde).
PERIOD_START = {1: 0.0, 2: 45.0, 3: 90.0, 4: 105.0, 5: 120.0}
PERIOD_END = {1: 52.57, 2: 98.62, 3: 106.07, 4: 124.12, 5: 125.97}


def test_full_match_never_substituted_no_extra_time() -> None:
    """Titulaire jamais remplacé sur un match sans prolongations : `to` et
    `to_period` valent `null` dans la donnée brute — il ne faut pas les
    confondre avec une fin de première période."""
    positions = [
        {
            "position": "Goalkeeper", "from": "00:00", "to": None,
            "from_period": 1, "to_period": None,
            "start_reason": "Starting XI", "end_reason": "Final Whistle",
        },
    ]
    minutes = _player_minutes(positions, PERIOD_START, PERIOD_END, match_last_period=2)
    assert minutes == PERIOD_END[2]


def test_normal_substitution() -> None:
    positions = [
        {
            "position": "Left Wing", "from": "00:00", "to": "64:10",
            "from_period": 1, "to_period": 2,
            "start_reason": "Starting XI", "end_reason": "Substitution - Off (Tactical)",
        },
    ]
    minutes = _player_minutes(positions, PERIOD_START, PERIOD_END, match_last_period=2)
    assert minutes == 64 + 10 / 60


def test_substituted_on_and_plays_to_the_end() -> None:
    """Entré en jeu en 2e période, jamais ressorti : le fallback doit
    plafonner à la fin du match, pas à la fin de sa période d'entrée."""
    positions = [
        {
            "position": "Right Back", "from": "67:23", "to": None,
            "from_period": 2, "to_period": None,
            "start_reason": "Player On", "end_reason": "Final Whistle",
        },
    ]
    minutes = _player_minutes(positions, PERIOD_START, PERIOD_END, match_last_period=2)
    assert minutes == PERIOD_END[2] - (67 + 23 / 60)


def test_position_shift_mid_match_sums_continuously() -> None:
    """Un changement de poste (pas une sortie) split l'entrée en deux stints
    contigus : la somme doit rester continue, sans trou ni double-comptage."""
    positions = [
        {
            "position": "Right Wing", "from": "00:00", "to": "70:00",
            "from_period": 1, "to_period": 2,
            "start_reason": "Starting XI", "end_reason": "Tactical Shift",
        },
        {
            "position": "Center Forward", "from": "70:00", "to": None,
            "from_period": 2, "to_period": None,
            "start_reason": "Tactical Shift", "end_reason": "Final Whistle",
        },
    ]
    minutes = _player_minutes(positions, PERIOD_START, PERIOD_END, match_last_period=2)
    assert minutes == PERIOD_END[2]


def test_penalty_shootout_clock_regression_is_capped_and_stops() -> None:
    """Reproduction exacte du cas Messi / finale 2022 : la 2e entrée régresse
    (from_period=4 -> to_period=1, horloge 115:32 -> 28:11) et une 3e entrée
    ambiguë suit. Le joueur a joué l'intégralité du temps réglementaire +
    prolongations, jamais remplacé — la donnée de tirs au but ne doit ni
    soustraire, ni être comptée comme du temps de jeu."""
    positions = [
        {
            "position": "Right Wing", "from": "00:00", "to": "115:32",
            "from_period": 1, "to_period": 4,
            "start_reason": "Starting XI", "end_reason": "Tactical Shift",
        },
        {
            "position": "Right Center Forward", "from": "115:32", "to": "28:11",
            "from_period": 4, "to_period": 1,
            "start_reason": "Tactical Shift", "end_reason": "Player Off",
        },
        {
            "position": "Right Wing", "from": "28:19", "to": None,
            "from_period": 1, "to_period": None,
            "start_reason": "Player On", "end_reason": "Final Whistle",
        },
    ]
    minutes = _player_minutes(positions, PERIOD_START, PERIOD_END, match_last_period=4)
    assert minutes == PERIOD_END[4]


def test_stint_starting_after_match_last_period_is_ignored() -> None:
    """Une entrée qui démarre carrément en période 5 (tirs au but) ne doit
    jamais être comptée."""
    positions = [
        {
            "position": "Goalkeeper", "from": "00:00", "to": None,
            "from_period": 5, "to_period": None,
            "start_reason": "Player On", "end_reason": "Final Whistle",
        },
    ]
    minutes = _player_minutes(positions, PERIOD_START, PERIOD_END, match_last_period=4)
    assert minutes == 0.0


def test_normalize_name_strips_accents_and_case() -> None:
    assert normalize_name("Kylian Mbappé Lottin") == "kylian mbappe lottin"


def test_normalize_statsbomb_position_covers_all_statsbomb_labels() -> None:
    assert normalize_statsbomb_position("Goalkeeper") == "GK"
    assert normalize_statsbomb_position("Right Center Back") == "DC"
    assert normalize_statsbomb_position("Left Wing Back") == "FB"
    assert normalize_statsbomb_position("Center Defensive Midfield") == "DM"
    assert normalize_statsbomb_position("Right Center Midfield") == "CM"
    assert normalize_statsbomb_position("Center Attacking Midfield") == "AM"
    assert normalize_statsbomb_position("Right Wing") == "W"
    assert normalize_statsbomb_position("Left Center Forward") == "ST"
