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

import numpy as np
import pandas as pd
from scipy.stats import rankdata

from vivier_pipeline.core.metrics_registry import (
    league_adjusted_keys,
    metric_direction,
    metrics_by_position,
)

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
    tier: int | None  # None pour un groupe « toutes compétitions »
    season: str
    min_minutes: int
    sample_size: int
    # player_id, season, competition_id, club_id, metric, raw_value,
    # percentile, sample_size (+ pour kind="adjusted" : adjusted_value,
    # adjusted_low, adjusted_high, percentile_low, percentile_high)
    percentiles: list[dict]
    kind: str = "tier"


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


# ---------------------------------------------------------------------------
# Percentiles ajustés de la force du championnat (phase 7)
# ---------------------------------------------------------------------------

# Tirages bootstrap utilisés pour l'intervalle des percentiles ajustés :
# au-delà, le gain de précision sur un 5ᵉ/95ᵉ centile ne vaut pas le coût.
MAX_PERCENTILE_DRAWS = 200


@dataclass
class LeagueStrength:
    """Coefficient de force d'une compétition et ses tirages bootstrap,
    indexés de façon conjointe entre compétitions (cf. core/strength.py)."""

    coef: float
    samples: list[float | None]


def _draw_matrix(
    competition_ids: np.ndarray, strengths: dict[int, LeagueStrength], n_draws: int,
) -> np.ndarray:
    """(n_membres, n_tirages). Un tirage où la compétition n'était pas
    estimable retombe sur l'estimation ponctuelle (neutre)."""
    by_comp = {}
    for comp, strength in strengths.items():
        draws = np.array(
            [strength.coef if v is None else v for v in strength.samples[:n_draws]],
            dtype=float,
        )
        if len(draws) < n_draws:
            draws = np.concatenate([draws, np.full(n_draws - len(draws), strength.coef)])
        by_comp[comp] = draws
    return np.stack([by_comp[int(c)] for c in competition_ids])


def compute_adjusted_groups(
    rows: pd.DataFrame,
    strengths: dict[int, LeagueStrength],
    min_minutes: int,
    season_span: int,
    position_labels: dict[str, str],
    ci_level: float,
) -> list[PeerGroupResult]:
    """Groupes « toutes compétitions » : même poste, fenêtre de saisons,
    TOUS paliers confondus, sur les seules métriques `leagueAdjusted`, avec
    la valeur ajustée = brute × coefficient de force de sa compétition.
    Répond à « est-il meilleur que lui, une fois la différence de
    championnat prise en compte ? ».

    Seules les lignes dont la compétition a un coefficient estimé entrent
    dans ces groupes : sans coefficient, pas d'ajustement possible, et le
    joueur reste classé dans son groupe de palier uniquement.

    Intervalle : chaque tirage bootstrap des coefficients (conjoint entre
    compétitions) donne un classement complet ; le percentile bas/haut est
    le quantile (1-ci)/2 / (1+ci)/2 de ces classements. L'incertitude sur la
    force de SA compétition comme sur celle de TOUS les autres membres est
    ainsi propagée — un joueur de la ligue de référence (coefficient
    exactement 1) a donc bien un intervalle, puisque ses concurrents
    bougent."""
    if rows.empty or not strengths:
        return []

    direction = metric_direction()
    keys_by_position = metrics_by_position()
    adjusted = set(league_adjusted_keys())
    alpha = (1.0 - ci_level) / 2.0
    n_draws = min(MAX_PERCENTILE_DRAWS, max(len(s.samples) for s in strengths.values()))

    df = rows[rows["competition_id"].isin(list(strengths))]
    if df.empty:
        return []
    df = expand_metrics(df, list(direction))
    df["season_year"] = df["season"].map(parse_season_year)

    results = []
    for _, combo in df[["position_group", "season"]].drop_duplicates().iterrows():
        position_group, season = combo["position_group"], combo["season"]
        keys = [k for k in keys_by_position[position_group] if k in adjusted]
        if not keys:
            continue
        year = parse_season_year(season)
        members = df[
            (df["position_group"] == position_group)
            & ((df["season_year"] - year).abs() <= season_span)
        ]
        members = dedupe_player_seasons(members)
        comp_ids = members["competition_id"].to_numpy()
        coefs = np.array([strengths[int(c)].coef for c in comp_ids])
        draws = _draw_matrix(comp_ids, strengths, n_draws)

        percentiles = []
        for key in keys:
            present = members[key].notna().to_numpy()
            if not present.any():
                continue
            raw = members[key].to_numpy(dtype=float)[present]
            point = raw * coefs[present]
            drawn = raw[:, None] * draws[present]
            sign = 1.0 if direction[key] else -1.0
            n = len(raw)
            point_pct = _percentile_rank(pd.Series(point), direction[key]).to_numpy()
            drawn_pct = np.clip(
                np.round(rankdata(sign * drawn, axis=0, method="average") / n * 100), 0, 100,
            )
            pct_low, pct_high = np.quantile(drawn_pct, [alpha, 1.0 - alpha], axis=1)
            coef_low, coef_high = np.quantile(draws[present], [alpha, 1.0 - alpha], axis=1)
            present_members = members[present]
            for i, member in enumerate(present_members.itertuples(index=False)):
                percentiles.append({
                    "player_id": int(member.player_id),
                    "season": str(member.season),
                    "competition_id": int(member.competition_id),
                    "club_id": int(member.club_id),
                    "metric": key,
                    "raw_value": float(raw[i]),
                    "percentile": int(point_pct[i]),
                    "sample_size": n,
                    "adjusted_value": float(point[i]),
                    "adjusted_low": float(raw[i] * coef_low[i]),
                    "adjusted_high": float(raw[i] * coef_high[i]),
                    # l'estimation ponctuelle reste toujours dans son intervalle
                    "percentile_low": int(min(np.floor(pct_low[i]), point_pct[i])),
                    "percentile_high": int(max(np.ceil(pct_high[i]), point_pct[i])),
                })

        results.append(PeerGroupResult(
            peer_group_id=f"{position_group}|adj|{season}",
            label=(
                f"{position_labels[position_group]} · toutes compétitions, "
                f"ajusté de la force · {season}"
            ),
            position_group=position_group,
            tier=None,
            season=season,
            min_minutes=min_minutes,
            sample_size=len(members),
            percentiles=percentiles,
            kind="adjusted",
        ))
    return results
