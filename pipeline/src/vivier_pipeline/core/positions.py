"""Correspondance entre la taxonomie de postes StatsBomb (23 libellés) et les
8 groupes de poste VIVIER (packages/metrics POSITION_GROUPS). Table exhaustive,
vérifiée contre l'intégralité des lineups de la Coupe du monde 2022.
"""

POSITION_GROUP_MAP: dict[str, str] = {
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


def normalize_position(statsbomb_position: str) -> str:
    try:
        return POSITION_GROUP_MAP[statsbomb_position]
    except KeyError as exc:
        raise ValueError(f"Poste StatsBomb inconnu : {statsbomb_position!r}") from exc
