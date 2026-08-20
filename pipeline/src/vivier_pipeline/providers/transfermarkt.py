"""Provider Transfermarkt — dataset Kaggle `davidcariboo/player-scores`.

Ce provider ne télécharge rien lui-même : Kaggle exige un compte et des
identifiants API que ce pipeline ne gère pas (et kaggle.com est hors de
portée réseau dans l'environnement où ce module a été écrit — impossible
de vérifier le schéma contre un vrai fichier ici). Télécharge le dataset
toi-même (`kaggle datasets download -d davidcariboo/player-scores`, ou
depuis kaggle.com) et dézippe-le dans `pipeline/data/raw/transfermarkt/`
— `.gitignore` exclut déjà tout `pipeline/data/`.

Les colonnes attendues sont validées explicitement à la lecture : si le
schéma du dataset a changé depuis l'écriture de ce module, l'ingestion
échoue avec un message clair plutôt que de charger des colonnes vides en
silence.
"""

from pathlib import Path

import pandas as pd
from unidecode import unidecode

from vivier_pipeline.core.identity import normalize_name
from vivier_pipeline.core.positions import normalize_transfermarkt_position

RAW_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "transfermarkt"

PLAYER_COLUMNS = [
    "player_id", "name", "date_of_birth", "country_of_citizenship",
    "sub_position", "foot", "height_in_cm", "contract_expiration_date",
    "market_value_in_eur", "current_club_id",
]

CLUB_COLUMNS = ["club_id", "name", "domestic_competition_id"]

FOOT_MAP = {"left": "left", "right": "right", "both": "both"}


def _read_csv(filename: str, expected_columns: list[str]) -> pd.DataFrame:
    path = RAW_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"{path} introuvable. Télécharge le dataset Kaggle "
            "davidcariboo/player-scores et place-le dans ce dossier "
            "(cf. docstring de vivier_pipeline.providers.transfermarkt)."
        )
    df = pd.read_csv(path)
    missing = set(expected_columns) - set(df.columns)
    if missing:
        raise ValueError(
            f"{filename} ne contient pas les colonnes attendues : {sorted(missing)}. "
            "Le schéma du dataset Kaggle a peut-être changé — vérifie avant de continuer."
        )
    return df


def load_players() -> pd.DataFrame:
    return _read_csv("players.csv", PLAYER_COLUMNS)


def load_clubs() -> pd.DataFrame:
    return _read_csv("clubs.csv", CLUB_COLUMNS)


def normalize_foot(raw_foot: object) -> str | None:
    if not isinstance(raw_foot, str):
        return None
    return FOOT_MAP.get(raw_foot.strip().lower())


def normalize_player(row: pd.Series) -> dict:
    """Transforme une ligne players.csv vers le schéma canonique `players`."""
    birth_date = pd.to_datetime(row["date_of_birth"], errors="coerce")
    contract_until = pd.to_datetime(row["contract_expiration_date"], errors="coerce")
    market_value = row["market_value_in_eur"]

    return {
        "full_name": row["name"],
        "normalized_name": normalize_name(str(row["name"])),
        "birth_date": None if pd.isna(birth_date) else birth_date.date(),
        "nationality": (
            [row["country_of_citizenship"]] if pd.notna(row["country_of_citizenship"]) else []
        ),
        "foot": normalize_foot(row["foot"]),
        "height_cm": None if pd.isna(row["height_in_cm"]) else int(row["height_in_cm"]),
        "position_group": normalize_transfermarkt_position(row["sub_position"]),
        "contract_until": None if pd.isna(contract_until) else contract_until.date(),
        "market_value_eur": None if pd.isna(market_value) else int(market_value),
        "source_ids": {"transfermarkt": str(row["player_id"])},
    }


def normalize_club(row: pd.Series) -> dict:
    return {
        "name": row["name"],
        "normalized_name": unidecode(str(row["name"])).lower().strip(),
        "source_ids": {"transfermarkt_club": str(row["club_id"])},
    }
