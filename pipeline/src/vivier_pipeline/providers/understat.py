"""Provider Understat, via `soccerdata` — la saison EN COURS des cinq grands
championnats, mise à jour par la source après chaque journée (xG, npxG, xA,
tirs, passes clés, xGChain, xGBuildup), de 2014-2015 à aujourd'hui.

Rate limiting (CLAUDE.md, obligatoire) : contrairement au lecteur FBref (7 s
entre pages), le lecteur Understat de soccerdata n'impose AUCUNE pause par
défaut (`rate_limit = 0`). On la fixe ici, explicitement. Cache local :
soccerdata écrit chaque réponse brute sous ~/soccerdata/data/Understat avant
tout traitement ; les feuilles de match terminées y restent définitivement,
seule la page de la saison en cours est re-téléchargée à chaque passage
(comportement soccerdata : `no_cache` pour la saison non terminée).

Identifiants : Understat expose un identifiant de joueur stable d'une saison
à l'autre (contrairement à FBref) — c'est lui qui sert d'alias.

Postes : la page de saison ne donne qu'un poste grossier (« F M S »,
inutilisable pour les 8 groupes VIVIER). Le poste d'un joueur INCONNU se
déduit donc de ses feuilles de match (poste occupé à chaque match, pondéré
par les minutes), récupérées seulement quand il faut créer des joueurs.

understat.com est hors de portée réseau dans l'environnement où ce module a
été écrit : les noms de colonnes ci-dessous sont ceux produits par le code
source de soccerdata (vérifiés), pas une réponse réelle du site. Validation
stricte des colonnes à la lecture ; codes de poste inconnus comptés et
signalés, jamais devinés (le joueur part alors en file d'arbitrage).
"""

from collections import defaultdict
from datetime import date

import pandas as pd
import soccerdata as sd

from vivier_pipeline.core.identity import normalize_club
from vivier_pipeline.core.metrics_registry import outfield_metric_keys
from vivier_pipeline.core.seasons import multi_year_code_to_canonical

RATE_LIMIT_SECONDS = 3.0
MAX_EXTRA_DELAY_SECONDS = 2.0

LEAGUES = [
    "ENG-Premier League", "ESP-La Liga", "GER-Bundesliga", "ITA-Serie A", "FRA-Ligue 1",
]

SEASON_COLUMNS = [
    "team_id", "player_id", "position", "matches", "minutes", "goals", "xg", "np_goals",
    "np_xg", "assists", "xa", "shots", "key_passes", "yellow_cards", "red_cards",
    "xg_chain", "xg_buildup",
]
ROSTER_COLUMNS = ["player_id", "position", "minutes"]

# Codes de poste des feuilles de match Understat (grille de formation :
# D = défense, DM = milieu défensif, M = milieu, AM = milieu offensif,
# FW = attaque ; R/C/L = droite/centre/gauche). Les pistons d'une défense à
# cinq sont codés DMR/DML : ce sont des latéraux.
UNDERSTAT_POSITION_GROUP_MAP: dict[str, str] = {
    "GK": "GK",
    "DC": "DC",
    "DR": "FB", "DL": "FB", "DMR": "FB", "DML": "FB",
    "DMC": "DM",
    "MC": "CM",
    "MR": "W", "ML": "W", "AMR": "W", "AML": "W",
    "AMC": "AM",
    "FW": "ST", "FWR": "ST", "FWL": "ST",
}
IGNORED_POSITION_CODES = {"Sub"}


def make_reader(leagues: list[str], seasons: list[str]) -> sd.Understat:
    reader = sd.Understat(leagues=leagues, seasons=seasons)
    reader.rate_limit = RATE_LIMIT_SECONDS
    reader.max_delay = MAX_EXTRA_DELAY_SECONDS
    return reader


def current_season_code(today: date) -> str:
    """Code soccerdata de la saison en cours : une saison commence en
    juillet (« 2627 » à partir de juillet 2026)."""
    start = today.year if today.month >= 7 else today.year - 1
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


def _validate(df: pd.DataFrame, expected: list[str], what: str) -> None:
    missing = [c for c in expected if c not in df.columns]
    if missing:
        raise ValueError(
            f"Understat ({what}) ne contient pas les colonnes attendues {missing}. Le format "
            "soccerdata a peut-être changé — vérifie avant de continuer. "
            f"Colonnes : {list(df.columns)}"
        )


def fetch_player_season_stats(reader: sd.Understat) -> pd.DataFrame:
    df = reader.read_player_season_stats()
    if not df.empty:
        _validate(df, SEASON_COLUMNS, "read_player_season_stats")
    return df


def fetch_roster_positions(reader: sd.Understat) -> pd.DataFrame:
    df = reader.read_player_match_stats()
    if not df.empty:
        _validate(df, ROSTER_COLUMNS, "read_player_match_stats")
    return df


def _num(value: object) -> float:
    return 0.0 if value is None or pd.isna(value) else float(value)  # type: ignore[arg-type]


def normalize_row(index: tuple[str, str, str, str], row: pd.Series) -> dict | None:
    """Une ligne de `read_player_season_stats` vers un enregistrement
    canonique ; None si aucune minute. Per-90 recalculés depuis les totaux,
    même formule que StatsBomb et FBref."""
    league, raw_season, team, player = index
    minutes = row["minutes"]
    if minutes is None or pd.isna(minutes) or minutes <= 0:
        return None
    nineties = float(minutes) / 90.0
    shots = _num(row["shots"])
    xg = _num(row["xg"])

    def per90(column: str) -> float:
        return _num(row[column]) / nineties

    metrics = {
        "goals": per90("goals"),
        "np_goals": per90("np_goals"),
        "xg": per90("xg"),
        "npxg": per90("np_xg"),
        "np_goals_minus_npxg": (_num(row["np_goals"]) - _num(row["np_xg"])) / nineties,
        "xg_per_shot": xg / shots if shots > 0 else 0.0,
        "shots": per90("shots"),
        "assists": per90("assists"),
        "xa": per90("xa"),
        "key_passes": per90("key_passes"),
        "yellow_cards": per90("yellow_cards"),
        "red_cards": per90("red_cards"),
        "xg_chain": per90("xg_chain"),
        "xg_buildup": per90("xg_buildup"),
    }
    assert set(metrics) <= outfield_metric_keys(), (
        "clé de métrique absente du registre packages/metrics — vérifie la casse/le nom"
    )
    matches = row["matches"]
    return {
        "source_id": str(int(row["player_id"])),
        "raw_name": str(player),
        "team_name": str(team),
        "team_id": str(int(row["team_id"])),
        "league": league,
        "season": multi_year_code_to_canonical(str(raw_season)),
        "minutes": int(minutes),
        "matches_played": None if matches is None or pd.isna(matches) else int(matches),
        "metrics": metrics,
        "coarse_position": None if pd.isna(row["position"]) else str(row["position"]),
        "clubs": [normalize_club(str(team))],
        "source": "understat",
    }


def infer_positions(rosters: pd.DataFrame) -> tuple[dict[str, str], dict[str, int]]:
    """player_id Understat -> groupe de poste le plus joué (pondéré par les
    minutes), à partir des feuilles de match. Renvoie aussi les codes
    inconnus rencontrés (et leur nombre) : jamais devinés."""
    minutes_by_group: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    unknown: dict[str, int] = defaultdict(int)
    for player_id, code, minutes in zip(
        rosters["player_id"], rosters["position"], rosters["minutes"], strict=True,
    ):
        if player_id is None or pd.isna(player_id) or code is None or pd.isna(code):
            continue
        code = str(code)
        if code in IGNORED_POSITION_CODES:
            continue
        group = UNDERSTAT_POSITION_GROUP_MAP.get(code)
        if group is None:
            unknown[code] += 1
            continue
        minutes_by_group[str(int(player_id))][group] += _num(minutes)
    positions = {
        pid: max(groups, key=lambda g: (groups[g], g))
        for pid, groups in minutes_by_group.items()
        if sum(groups.values()) > 0
    }
    return positions, dict(unknown)
