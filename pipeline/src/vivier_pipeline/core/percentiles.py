"""Calcule les groupes de pairs et les percentiles.

Règle non négociable (CLAUDE.md) : un percentile est toujours relatif à un
groupe de pairs EXPLICITE — même poste, même palier de championnat, saison à
moins de `season_span` ans d'écart, et seulement les joueurs au-dessus du
seuil de minutes. Rien de tout ça n'est réinventé ici : les seuils viennent
de metrics_registry (donc, en amont, de packages/metrics).

Trois pièges multi-sources gérés ici, chacun verrouillé par un test :

- Une métrique absente pour une partie des membres (FBref ne fournit
  qu'une partie du catalogue) n'est classée que parmi les membres qui la
  possèdent ; l'effectif réel de ce classement est stocké par ligne
  (`sample_size`) pour que l'UI n'affiche jamais un effectif de groupe
  plus flatteur que celui du classement réellement effectué.
- Un joueur peut avoir deux lignes la même saison dans le même palier
  (transfert en cours de saison) : il ne compte qu'une fois par groupe,
  via sa ligne la plus fournie en minutes — sinon il se classerait contre
  lui-même, et la clé primaire de player_percentiles casserait.
- Seules les métriques qui s'appliquent au poste (`appliesTo`) sont
  classées : jamais de percentile de gardien sur une métrique de joueur de
  champ, et inversement.
"""

import re
from dataclasses import dataclass

import pandas as pd

from vivier_pipeline.core.metrics_registry import metric_direction, metrics_by_position

_SEASON_YEAR_RE = re.compile(r"\d{4}")


def parse_season_year(season: str) -> int:
    match = _SEASON_YEAR_RE.search(season)
    if not match:
        raise ValueError(f"Saison sans année exploitable : {season!r}")
    return int(match.group())


@dataclass
class PeerGroupResult:
    peer_group_id: str
    label: str
    position_group: str
    tier: int
    season: str
    min_minutes: int
    sample_size: int
    # player_id, season, competition_id, club_id, metric, raw_value,
    # percentile, sample_size
    percentiles: list[dict]


def _percentile_rank(values: pd.Series, higher_is_better: bool) -> pd.Series:
    """0-100, moyenné sur les ex-aequo. `higher_is_better=False` inverse le
    sens (ex. moins de cartons = percentile plus élevé). `values` ne doit
    contenir aucune valeur manquante (cf. compute_peer_groups)."""
    ranks = values.rank(pct=True, method="average", ascending=higher_is_better)
    return (ranks * 100).round().astype(int).clip(0, 100)


def expand_metrics(rows: pd.DataFrame, metric_keys: list[str]) -> pd.DataFrame:
    """Aplatit la colonne `metrics` (dict) en une colonne par clé du
    registre ; une clé absente d'une ligne devient NaN (jamais 0 : « non
    mesuré » n'est pas « nul »)."""
    metrics_df = pd.json_normalize(rows["metrics"].tolist()).set_index(rows.index)
    metrics_df = metrics_df.reindex(columns=metric_keys).astype(float)
    return pd.concat([rows.drop(columns=["metrics"]), metrics_df], axis=1)


def dedupe_player_seasons(members: pd.DataFrame) -> pd.DataFrame:
    """Une seule ligne par (joueur, saison) : celle qui a le plus de
    minutes, départagée de façon déterministe par compétition puis club."""
    ordered = members.sort_values(
        ["minutes", "competition_id", "club_id"], ascending=[False, True, True],
    )
    return ordered.drop_duplicates(["player_id", "season"], keep="first")


def rank_members(
    members: pd.DataFrame, metric_keys: list[str], direction: dict[str, bool],
) -> list[dict]:
    """Classe `members` (déjà dédoublonnés) sur chaque métrique ; une
    métrique n'est classée que parmi les membres qui la possèdent."""
    # season du membre (sa propre ligne player_season_stats), pas la
    # saison-centre du groupe de pairs.
    identity = members[["player_id", "season", "competition_id", "club_id"]]
    frames = []
    for key in metric_keys:
        values = members[key].dropna()
        if values.empty:
            continue
        frames.append(identity.loc[values.index].assign(
            metric=key,
            raw_value=values.astype(float),
            percentile=_percentile_rank(values, direction[key]),
            sample_size=len(values),
        ))
    if not frames:
        return []
    records = pd.concat(frames).to_dict("records")
    return [
        {
            "player_id": int(r["player_id"]),
            "season": str(r["season"]),
            "competition_id": int(r["competition_id"]),
            "club_id": int(r["club_id"]),
            "metric": str(r["metric"]),
            "raw_value": float(r["raw_value"]),
            "percentile": int(r["percentile"]),
            "sample_size": int(r["sample_size"]),
        }
        for r in records
    ]


def compute_peer_groups(
    rows: pd.DataFrame, min_minutes: int, season_span: int, position_labels: dict[str, str],
) -> list[PeerGroupResult]:
    """`rows` : une ligne par ligne player_season_stats, colonnes player_id,
    season, position_group, tier, competition_id, club_id, minutes, metrics
    (dict), déjà filtrées sur minutes >= min_minutes en amont (cf.
    fetch_percentile_input)."""
    if rows.empty:
        return []

    direction = metric_direction()
    keys_by_position = metrics_by_position()
    all_keys = list(direction)

    df = expand_metrics(rows, all_keys)
    df["season_year"] = df["season"].map(parse_season_year)

    results = []
    combos = df[["position_group", "tier", "season"]].drop_duplicates()
    for _, combo in combos.iterrows():
        position_group, tier, season = combo["position_group"], combo["tier"], combo["season"]
        year = parse_season_year(season)

        members = df[
            (df["position_group"] == position_group)
            & (df["tier"] == tier)
            & ((df["season_year"] - year).abs() <= season_span)
        ]
        if members.empty:
            continue
        members = dedupe_player_seasons(members)

        results.append(PeerGroupResult(
            peer_group_id=f"{position_group}|tier{tier}|{season}",
            label=f"{position_labels[position_group]} · Niveau {tier} · {season}",
            position_group=position_group,
            tier=int(tier),
            season=season,
            min_minutes=min_minutes,
            sample_size=len(members),
            percentiles=rank_members(members, keys_by_position[position_group], direction),
        ))

    return results
