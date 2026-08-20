"""Provider FBref, via `soccerdata`.

`soccerdata` gère lui-même le cache disque et la pause entre requêtes par
défaut — CLAUDE.md : ne jamais désactiver ce comportement.

Piège structurel : `read_player_season_stats` n'expose AUCUN identifiant
stable de joueur (contrairement à StatsBomb/Transfermarkt) — son index est
(league, season, team, player), un *nom*, pas un ID. La résolution
d'identité passe donc toujours par le nom (cf. core/identity.py), jamais
par un raccourci d'ID exact ; le "source_id" qu'on fabrique ici n'est qu'une
clé interne pour rendre les ré-ingestions idempotentes.

fbref.com est hors de portée réseau dans l'environnement où ce module a été
écrit. Les colonnes de 'standard' sont vérifiées à haute confiance (contre
un notebook d'exemple du dépôt soccerdata) ; celles de 'shooting'
s'appuient sur la structure connue et stable du site FBref mais n'ont pas
pu être confirmées contre une vraie sortie de soccerdata. Dans les deux cas,
la validation stricte ci-dessous fait échouer l'ingestion clairement si une
colonne manque, plutôt que de charger des stats fausses en silence — à
surveiller au premier run réel.

Les minutes/90s viennent toujours de la table 'standard' (vérifiée), même
pour normaliser les stats de 'shooting' : on ne fait jamais confiance aux
per-90 déjà calculés par FBref, recalculés nous-mêmes depuis les totaux
bruts pour rester cohérents avec la même formule que StatsBomb (cf.
CLAUDE.md : aucune formule dupliquée, mais aussi jamais deux méthodes de
calcul différentes selon la source).
"""

import pandas as pd
import soccerdata as sd

from vivier_pipeline.core.identity import normalize_name
from vivier_pipeline.core.metrics_registry import outfield_metric_keys

STANDARD_COLUMNS = [
    ("Playing Time", "Min"), ("Playing Time", "90s"), ("Playing Time", "MP"),
    ("Performance", "Gls"), ("Performance", "Ast"),
    ("Performance", "CrdY"), ("Performance", "CrdR"),
]
SHOOTING_COLUMNS = [
    ("Standard", "Sh"), ("Standard", "SoT"),
    ("Expected", "xG"), ("Expected", "npxG"),
]


def _validate_columns(df: pd.DataFrame, expected: list[tuple[str, str]], stat_type: str) -> None:
    missing = [c for c in expected if c not in df.columns]
    if missing:
        raise ValueError(
            f"read_player_season_stats(stat_type={stat_type!r}) ne contient pas les colonnes "
            f"attendues {missing}. Le format FBref/soccerdata a peut-être changé — vérifie "
            f"avant de continuer. Colonnes disponibles : {list(df.columns)}"
        )


def fetch_player_season_stats(leagues: list[str], seasons: list[str]) -> pd.DataFrame:
    """Fusionne 'standard' (identité + minutes, vérifié) et 'shooting' (tirs
    + xG, non vérifié dans cet environnement) sur leur index commun."""
    reader = sd.FBref(leagues=leagues, seasons=seasons)

    standard = reader.read_player_season_stats(stat_type="standard")
    _validate_columns(standard, STANDARD_COLUMNS, "standard")

    shooting = reader.read_player_season_stats(stat_type="shooting")
    _validate_columns(shooting, SHOOTING_COLUMNS, "shooting")

    return standard.join(shooting[SHOOTING_COLUMNS], how="left")


def normalize_row(index: tuple[str, str, str, str], row: pd.Series) -> dict | None:
    """Une ligne (index + Series) de `fetch_player_season_stats` vers un
    enregistrement canonique. None si minutes == 0 (rien à en tirer)."""
    league, season, team, player = index
    minutes = row[("Playing Time", "Min")]
    if pd.isna(minutes) or minutes <= 0:
        return None
    nineties = row[("Playing Time", "90s")]

    def per90(raw: float) -> float:
        return 0.0 if pd.isna(raw) else float(raw) / nineties

    shots = row[("Standard", "Sh")]
    matches_played = row[("Playing Time", "MP")]

    metrics = {
        "goals": per90(row[("Performance", "Gls")]),
        "assists": per90(row[("Performance", "Ast")]),
        "yellow_cards": per90(row[("Performance", "CrdY")]),
        "red_cards": per90(row[("Performance", "CrdR")]),
        "shots": per90(shots),
        "xg": per90(row[("Expected", "xG")]),
        "npxg": per90(row[("Expected", "npxG")]),
        "xg_per_shot": (
            0.0 if pd.isna(shots) or shots == 0
            else float(row[("Expected", "xG")]) / float(shots)
        ),
    }
    assert set(metrics) <= outfield_metric_keys(), (
        "clé de métrique absente du registre packages/metrics — vérifie la casse/le nom"
    )

    return {
        "source_id": f"{league}|{season}|{team}|{normalize_name(player)}",
        "raw_name": player,
        "team_name": team,
        "league": league,
        "season": season,
        "minutes": int(minutes),
        "matches_played": None if pd.isna(matches_played) else int(matches_played),
        "metrics": metrics,
        "source": "fbref",
    }
