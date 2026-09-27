"""Championnats connus des sources soccerdata (FBref, Understat) : clé
soccerdata -> (nom, pays, palier). Nom et pays alignés sur les libellés
StatsBomb pour qu'une même compétition ne soit jamais dédoublée entre
sources (groupes de pairs et coefficients de force se calculent par
compétition). Un championnat absent d'ici fait échouer l'ingestion plutôt
que de deviner son niveau — ça fausserait les groupes de pairs."""

SOCCERDATA_LEAGUES: dict[str, tuple[str, str, int]] = {
    "ENG-Premier League": ("Premier League", "England", 1),
    "ESP-La Liga": ("La Liga", "Spain", 1),
    "GER-Bundesliga": ("1. Bundesliga", "Germany", 1),
    "ITA-Serie A": ("Serie A", "Italy", 1),
    "FRA-Ligue 1": ("Ligue 1", "France", 1),
}


def league_info(league: str) -> tuple[str, str, int]:
    try:
        return SOCCERDATA_LEAGUES[league]
    except KeyError as exc:
        raise ValueError(
            f"Championnat inconnu : {league!r} — ajoute-le à SOCCERDATA_LEAGUES (nom, pays, "
            "palier) après vérification manuelle."
        ) from exc
