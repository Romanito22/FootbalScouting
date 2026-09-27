"""Format canonique des saisons (cf. schéma `player_season_stats.season`) :
'2025-2026' pour une saison à cheval sur deux années, '2022' pour une
compétition sur une seule année civile (Coupe du monde, MLS...).

Chaque source a sa propre convention et doit être convertie à l'entrée,
jamais plus tard : deux libellés différents pour la même saison cassent en
silence les groupes de pairs (deux « saisons » distinctes) et la fenêtre de
saisons (`parse_season_year`).

- StatsBomb : '2015/2016' ou '2022'.
- soccerdata/FBref : codes compacts '2223' (= 2022-2023) pour les
  championnats à cheval sur deux années — cf. soccerdata.SeasonCode.
"""

import re

_SPLIT_RE = re.compile(r"^(\d{4})\s*[/-]\s*(\d{4})$")
_SINGLE_RE = re.compile(r"^\d{4}$")


def canonical_season(raw: str) -> str:
    """'2015/2016' -> '2015-2016' ; '2022' -> '2022'. Échoue sur tout autre
    format plutôt que de deviner."""
    value = str(raw).strip()
    split = _SPLIT_RE.match(value)
    if split:
        start, end = int(split.group(1)), int(split.group(2))
        if end != start + 1:
            raise ValueError(f"Saison incohérente : {raw!r}")
        return f"{start}-{end}"
    if _SINGLE_RE.match(value):
        return value
    raise ValueError(f"Format de saison non reconnu : {raw!r}")


def multi_year_code_to_canonical(code: str) -> str:
    """Code soccerdata multi-année '2223' -> '2022-2023', '9900' -> '1999-2000'.
    Accepte aussi une saison déjà canonique (idempotent)."""
    value = str(code).strip()
    if _SPLIT_RE.match(value):
        return canonical_season(value)
    if not re.fullmatch(r"\d{4}", value):
        raise ValueError(f"Code de saison soccerdata non reconnu : {code!r}")
    start_yy, end_yy = int(value[:2]), int(value[2:])
    if end_yy != (start_yy + 1) % 100:
        raise ValueError(
            f"{code!r} n'est pas un code multi-année (attendu 'AABB' avec BB = AA + 1)"
        )
    century = 1900 if start_yy >= 90 else 2000
    start = century + start_yy
    return f"{start}-{start + 1}"
