"""Correspondance entre les taxonomies de poste de chaque source et les
8 groupes de poste VIVIER (packages/metrics POSITION_GROUPS).

`position_group` est NOT NULL dans le schéma : un poste non reconnu doit
faire échouer l'ingestion plutôt que de deviner, silencieusement, un mauvais
groupe (un DM classé CM à tort fausse tous ses percentiles)."""

# StatsBomb — 23 libellés, table exhaustive vérifiée contre l'intégralité
# des lineups de la Coupe du monde 2022 (cf. tests/test_aggregate.py).
STATSBOMB_POSITION_GROUP_MAP: dict[str, str] = {
    "Goalkeeper": "GK",
    "Center Back": "DC",
    "Left Center Back": "DC",
    "Right Center Back": "DC",
    "Left Back": "FB",
    "Right Back": "FB",
    "Left Wing Back": "FB",
    "Right Wing Back": "FB",
    "Center Defensive Midfield": "DM",
    "Left Defensive Midfield": "DM",
    "Right Defensive Midfield": "DM",
    "Left Center Midfield": "CM",
    "Right Center Midfield": "CM",
    "Center Attacking Midfield": "AM",
    "Left Attacking Midfield": "AM",
    "Right Attacking Midfield": "AM",
    "Left Midfield": "W",
    "Right Midfield": "W",
    "Left Wing": "W",
    "Right Wing": "W",
    "Center Forward": "ST",
    "Left Center Forward": "ST",
    "Right Center Forward": "ST",
}


def normalize_statsbomb_position(statsbomb_position: str) -> str:
    try:
        return STATSBOMB_POSITION_GROUP_MAP[statsbomb_position]
    except KeyError as exc:
        raise ValueError(f"Poste StatsBomb inconnu : {statsbomb_position!r}") from exc


# Transfermarkt — `sub_position`, tel qu'observé sur le dataset Kaggle
# davidcariboo/player-scores. Non vérifié contre un export réel (Kaggle est
# hors de portée réseau dans l'environnement où ce module a été écrit) :
# à confirmer/ajuster dès le premier import réel, `normalize_transfermarkt_position`
# échoue explicitement sur tout libellé absent de cette table plutôt que de
# deviner.
TRANSFERMARKT_POSITION_GROUP_MAP: dict[str, str] = {
    "Goalkeeper": "GK",
    "Centre-Back": "DC",
    "Left-Back": "FB",
    "Right-Back": "FB",
    "Defensive Midfield": "DM",
    "Central Midfield": "CM",
    "Attacking Midfield": "AM",
    "Left Midfield": "W",
    "Right Midfield": "W",
    "Left Winger": "W",
    "Right Winger": "W",
    "Second Striker": "AM",
    "Centre-Forward": "ST",
}


def normalize_transfermarkt_position(sub_position: str) -> str:
    try:
        return TRANSFERMARKT_POSITION_GROUP_MAP[sub_position]
    except KeyError as exc:
        raise ValueError(
            f"Poste Transfermarkt inconnu : {sub_position!r} — "
            "ajoute-le à TRANSFERMARKT_POSITION_GROUP_MAP après vérification manuelle."
        ) from exc
