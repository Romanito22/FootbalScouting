"""Calcule les groupes de pairs et les percentiles.

Règle non négociable (CLAUDE.md) : un percentile est toujours relatif à un
groupe de pairs EXPLICITE — même poste, même palier de championnat, saison à
moins de `season_span` ans d'écart, et seulement les joueurs au-dessus du
seuil de minutes. Rien de tout ça n'est réinventé ici : les seuils viennent
de metrics_registry (donc, en amont, de packages/metrics).
"""

import re
from dataclasses import dataclass

import pandas as pd

from vivier_pipeline.core.metrics_registry import metric_direction

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
    season: str
    min_minutes: int
    sample_size: int
    percentiles: list[dict]  # player_id, season, metric, raw_value, percentile


def _percentile_rank(values: pd.Series, higher_is_better: bool) -> pd.Series:
    """0-100, moyenné sur les ex-aequo. `higher_is_better=False` inverse le
    sens (ex. moins de cartons = percentile plus élevé)."""
    ranks = values.rank(pct=True, method="average", ascending=higher_is_better)
    return (ranks * 100).round().astype(int).clip(0, 100)


def compute_peer_groups(
    rows: pd.DataFrame, min_minutes: int, season_span: int, position_labels: dict[str, str],
) -> list[PeerGroupResult]:
    """`rows` : une ligne par (player_id, season, competition), colonnes
    player_id, season, position_group, tier, metrics (dict), déjà filtrées
    sur minutes >= min_minutes en amont (cf. fetch_percentile_input)."""
    if rows.empty:
        return []

    direction = metric_direction()
    metric_keys = list(direction)

    df = rows.copy()
    df["season_year"] = df["season"].map(parse_season_year)
    metrics_df = pd.json_normalize(df["metrics"]).set_index(df.index)
    df = pd.concat([df.drop(columns=["metrics"]), metrics_df], axis=1)

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

        peer_group_id = f"{position_group}|tier{tier}|{season}"
        label = f"{position_labels[position_group]} · Niveau {tier} · {season}"

        percentiles = []
        for key in metric_keys:
            pct = _percentile_rank(members[key], direction[key])
            for player_id, member_season, raw_value, percentile in zip(
                members["player_id"], members["season"], members[key], pct, strict=True
            ):
                # season du membre (sa propre ligne player_season_stats),
                # pas la saison-centre du groupe de pairs.
                percentiles.append({
                    "player_id": player_id,
                    "season": member_season,
                    "metric": key,
                    "raw_value": float(raw_value),
                    "percentile": int(percentile),
                })

        results.append(PeerGroupResult(
            peer_group_id=peer_group_id,
            label=label,
            position_group=position_group,
            season=season,
            min_minutes=min_minutes,
            sample_size=len(members),
            percentiles=percentiles,
        ))

    return results
