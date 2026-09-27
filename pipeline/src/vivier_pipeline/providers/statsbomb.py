"""Provider StatsBomb Open Data.

Cache local systématique : chaque payload est écrit sur disque avant toute
transformation, pour pouvoir rejouer l'agrégation sans re-scraper (règle
CLAUDE.md). Un court délai sépare les appels réseau, par courtoisie envers
un service qui rend ses données gratuitement.
"""

import time
from pathlib import Path

import pandas as pd
from statsbombpy import sb

RAW_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "statsbomb"
RATE_LIMIT_SECONDS = 0.5


def _cache_path(*parts: str) -> Path:
    return RAW_DIR.joinpath(*parts[:-1], f"{parts[-1]}.json")


def _load_or_fetch(path: Path, fetch) -> pd.DataFrame:
    if path.exists():
        return pd.read_json(path, orient="records")
    time.sleep(RATE_LIMIT_SECONDS)
    df = fetch()
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_json(path, orient="records")
    return df


def fetch_competitions() -> pd.DataFrame:
    return _load_or_fetch(_cache_path("competitions"), sb.competitions)


def is_international(competition_id: int, season_id: int) -> bool:
    """Sélections nationales (True) ou clubs (False), d'après le drapeau
    `competition_international` du référentiel StatsBomb."""
    competitions = fetch_competitions()
    match = competitions[
        (competitions["competition_id"] == competition_id)
        & (competitions["season_id"] == season_id)
    ]
    if match.empty:
        raise ValueError(
            f"Compétition StatsBomb inconnue : competition_id={competition_id}, "
            f"season_id={season_id}"
        )
    return bool(match.iloc[0]["competition_international"])


def describe(competition_id: int, season_id: int) -> str:
    """« Ligue 1 2015/2016 », pour un journal lisible (repli : les identifiants)."""
    competitions = fetch_competitions()
    match = competitions[
        (competitions["competition_id"] == competition_id)
        & (competitions["season_id"] == season_id)
    ]
    if match.empty:
        return f"{competition_id}/{season_id}"
    row = match.iloc[0]
    return f"{row['competition_name']} {row['season_name']}"


def fetch_matches(competition_id: int, season_id: int) -> pd.DataFrame:
    path = _cache_path("matches", f"{competition_id}_{season_id}")
    return _load_or_fetch(
        path, lambda: sb.matches(competition_id=competition_id, season_id=season_id)
    )


def fetch_events(match_id: int) -> pd.DataFrame:
    path = _cache_path("events", str(match_id))
    return _load_or_fetch(path, lambda: sb.events(match_id=match_id))


def fetch_lineups(match_id: int) -> dict[str, pd.DataFrame]:
    """Une entrée par équipe ; chacune cachée séparément pour rester réutilisable."""
    path = _cache_path("lineups", str(match_id))
    if path.exists():
        raw = pd.read_json(path, orient="records")
        return {
            team: rows.drop(columns="__team").reset_index(drop=True)
            for team, rows in raw.groupby("__team")
        }
    time.sleep(RATE_LIMIT_SECONDS)
    lineups = sb.lineups(match_id=match_id)
    combined = []
    for team, df in lineups.items():
        tagged = df.copy()
        tagged["__team"] = team
        combined.append(tagged)
    merged = pd.concat(combined, ignore_index=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    merged.to_json(path, orient="records")
    return lineups
