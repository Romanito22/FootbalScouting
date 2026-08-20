"""Fixtures figées pour le provider Transfermarkt.

Écrites à la main (pas de vrai export Kaggle disponible dans cet
environnement — cf. docstring du provider) : elles verrouillent le contrat
attendu (colonnes requises, format des dates, mapping de poste) pour qu'un
premier import réel révèle vite un écart de schéma plutôt que de charger
des données silencieusement fausses."""

from pathlib import Path

import pandas as pd
import pytest

from vivier_pipeline.providers import transfermarkt


@pytest.fixture(autouse=True)
def raw_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(transfermarkt, "RAW_DIR", tmp_path)
    return tmp_path


def _write_csv(dir_: Path, filename: str, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_csv(dir_ / filename, index=False)


def test_load_players_missing_file_raises_clear_error(raw_dir: Path) -> None:
    with pytest.raises(FileNotFoundError, match="players.csv"):
        transfermarkt.load_players()


def test_load_players_missing_column_raises_clear_error(raw_dir: Path) -> None:
    _write_csv(raw_dir, "players.csv", [{"player_id": 1, "name": "Test Player"}])
    with pytest.raises(ValueError, match="colonnes attendues"):
        transfermarkt.load_players()


def test_load_players_happy_path(raw_dir: Path) -> None:
    _write_csv(raw_dir, "players.csv", [{
        "player_id": 28003, "name": "Kylian Mbappé", "date_of_birth": "1998-12-20",
        "country_of_citizenship": "France", "sub_position": "Centre-Forward",
        "foot": "right", "height_in_cm": 178, "contract_expiration_date": "2029-06-30",
        "market_value_in_eur": 180000000, "current_club_id": 583,
    }])
    df = transfermarkt.load_players()
    assert len(df) == 1


def test_normalize_player_happy_path() -> None:
    row = pd.Series({
        "player_id": 28003, "name": "Kylian Mbappé", "date_of_birth": "1998-12-20",
        "country_of_citizenship": "France", "sub_position": "Centre-Forward",
        "foot": "right", "height_in_cm": 178.0, "contract_expiration_date": "2029-06-30",
        "market_value_in_eur": 180000000.0, "current_club_id": 583,
    })
    player = transfermarkt.normalize_player(row)
    assert player["full_name"] == "Kylian Mbappé"
    assert player["normalized_name"] == "kylian mbappe"
    assert player["birth_date"].isoformat() == "1998-12-20"
    assert player["nationality"] == ["France"]
    assert player["foot"] == "right"
    assert player["height_cm"] == 178
    assert player["position_group"] == "ST"
    assert player["contract_until"].isoformat() == "2029-06-30"
    assert player["market_value_eur"] == 180000000
    assert player["source_ids"] == {"transfermarkt": "28003"}


def test_normalize_player_handles_missing_optional_fields() -> None:
    row = pd.Series({
        "player_id": 1, "name": "Joueur Inconnu", "date_of_birth": pd.NA,
        "country_of_citizenship": pd.NA, "sub_position": "Goalkeeper",
        "foot": pd.NA, "height_in_cm": pd.NA, "contract_expiration_date": pd.NA,
        "market_value_in_eur": pd.NA, "current_club_id": pd.NA,
    })
    player = transfermarkt.normalize_player(row)
    assert player["birth_date"] is None
    assert player["nationality"] == []
    assert player["foot"] is None
    assert player["height_cm"] is None
    assert player["contract_until"] is None
    assert player["market_value_eur"] is None


def test_normalize_player_unknown_position_raises() -> None:
    row = pd.Series({
        "player_id": 1, "name": "Joueur", "date_of_birth": "2000-01-01",
        "country_of_citizenship": "France", "sub_position": "Libéro Antique",
        "foot": "right", "height_in_cm": 180, "contract_expiration_date": "2025-01-01",
        "market_value_in_eur": 1000, "current_club_id": 1,
    })
    with pytest.raises(ValueError, match="Poste Transfermarkt inconnu"):
        transfermarkt.normalize_player(row)


@pytest.mark.parametrize(("raw", "expected"), [
    ("left", "left"), ("Right", "right"), (" both ", "both"),
    ("gauche", None), (None, None),
])
def test_normalize_foot(raw: object, expected: str | None) -> None:
    assert transfermarkt.normalize_foot(raw) == expected


def test_normalize_club() -> None:
    row = pd.Series(
        {"club_id": 583, "name": "Paris Saint-Germain", "domestic_competition_id": "FR1"}
    )
    club = transfermarkt.normalize_club(row)
    assert club["name"] == "Paris Saint-Germain"
    assert club["normalized_name"] == "paris saint-germain"
    assert club["source_ids"] == {"transfermarkt_club": "583"}
