"""Force des championnats (phase 7) — « ce 0,45 npxG/90 en Eredivisie,
combien vaut-il en Premier League ? ».

Principe : un même joueur, observé dans deux compétitions à une saison
d'écart au plus (transfert, ou club + tournoi international la même
saison), produit moins face à une opposition plus forte. Pour chaque paire
de lignes (A, B) d'un même joueur :

    log V_B − log V_A = θ_A − θ_B + ε

où V est un indice de volume offensif (moyenne, sur les métriques
`leagueAdjusted` que les deux lignes possèdent, de la métrique rapportée à
sa moyenne de population) et θ_L = log(coefficient de force de L). Les θ
sont estimés par moindres carrés pondérés, la compétition de référence
fixée à θ = 0 (coefficient 1). Un coefficient de 1,25 signifie qu'une
production y vaut 25 % de plus que la même production dans la référence :
`équivalent référence = valeur brute × coefficient`.

Pondération : la variance d'un taux per-90 suit à peu près une loi de
Poisson, var(log taux) ≈ 1 / (taux × minutes). Une paire pèse donc
1 / (1/(V_A·m_A) + 1/(V_B·m_B)) : beaucoup de minutes et beaucoup de volume
= signal fiable ; un défenseur à 450 minutes pèse peu.

Garde-fous (chacun verrouillé par un test) :
- une compétition n'est estimée qu'avec au moins `min_link_players`
  joueurs de liaison (élagage itératif : retirer une compétition peut en
  faire passer une autre sous le seuil) ;
- seules les compétitions reliées à la référence par une chaîne de
  liaisons sont estimées : sans chemin, aucune comparaison n'est possible,
  et le coefficient reste NULL — affiché comme tel, jamais deviné ;
- intervalle de confiance par bootstrap PAR JOUEUR (un joueur contribue
  plusieurs paires corrélées : on rééchantillonne des joueurs, pas des
  paires), procédure complète rejouée à chaque tirage (élagage compris).
  Une compétition estimable dans moins de la moitié des tirages est
  déclarée instable plutôt que publiée avec un intervalle trompeur.

Limites connues, assumées et documentées dans l'UI : biais de sélection
(un joueur qui monte d'un cran sort souvent d'une saison exceptionnelle,
la régression vers la moyenne gonfle un peu l'écart estimé) ; évolution du
joueur entre deux saisons ignorée ; indice purement offensif.
"""

from dataclasses import dataclass, field
from typing import Literal

import numpy as np
import pandas as pd

from vivier_pipeline.core.metrics_registry import LeagueStrengthParams
from vivier_pipeline.core.percentiles import expand_metrics, parse_season_year

MODEL_VERSION = "strength-v1"

# Indice de volume d'une ligne (1 = moyenne de la population) sous lequel un
# log-ratio n'a plus de sens : quasi-zéro offensif, le bruit domine.
MIN_RELATIVE_VOLUME = 0.1

# Part minimale des tirages bootstrap où la compétition reste estimable.
MIN_BOOTSTRAP_SUCCESS = 0.5

Status = Literal["reference", "estimated", "insufficient_links", "disconnected", "unstable"]

PAIR_COLUMNS = ["player_id", "comp_a", "comp_b", "y", "weight"]


@dataclass(frozen=True)
class StrengthParams:
    min_minutes: int
    max_season_gap: int
    min_link_players: int
    ci_level: float
    bootstrap_samples: int
    seed: int = 0

    @classmethod
    def from_registry(cls, params: LeagueStrengthParams) -> "StrengthParams":
        return cls(
            min_minutes=params["minMinutes"],
            max_season_gap=params["maxSeasonGap"],
            min_link_players=params["minLinkPlayers"],
            ci_level=params["ciLevel"],
            bootstrap_samples=params["bootstrapSamples"],
        )


@dataclass
class CompetitionStrength:
    competition_id: int
    status: Status
    # joueurs distincts reliant cette compétition à une autre (avant élagage)
    n_links: int
    coef: float | None = None
    low: float | None = None
    high: float | None = None
    # Tirages bootstrap du coefficient, indexés de façon CONJOINTE entre
    # compétitions (le tirage b est le même rééchantillonnage de joueurs
    # pour toutes) : sert à propager l'incertitude aux percentiles ajustés.
    samples: list[float | None] = field(default_factory=list)


def _empty_pairs() -> pd.DataFrame:
    return pd.DataFrame(columns=PAIR_COLUMNS)


def build_link_pairs(
    rows: pd.DataFrame, adjusted_keys: list[str], params: StrengthParams,
) -> pd.DataFrame:
    """`rows` : une ligne par ligne player_season_stats, colonnes
    player_id, season, competition_id, minutes, metrics (dict per-90).
    Renvoie une paire par couple de lignes d'un même joueur dans deux
    compétitions différentes à au plus `max_season_gap` saisons d'écart."""
    if rows.empty:
        return _empty_pairs()
    df = rows[rows["minutes"] >= params.min_minutes]
    if df.empty:
        return _empty_pairs()

    df = expand_metrics(df.reset_index(drop=True), adjusted_keys)
    means = df[adjusted_keys].mean(skipna=True)
    usable = [k for k in adjusted_keys if pd.notna(means[k]) and means[k] > 0]
    if not usable:
        return _empty_pairs()
    normalized = (df[usable] / means[usable]).to_numpy(dtype=float)
    years = df["season"].map(parse_season_year).to_numpy()
    competitions = df["competition_id"].to_numpy()
    minutes = df["minutes"].to_numpy(dtype=float)

    records = []
    for player_id, index in df.groupby("player_id").indices.items():
        if len(index) < 2:
            continue
        for pos, i in enumerate(index):
            for j in index[pos + 1:]:
                if competitions[i] == competitions[j]:
                    continue
                if abs(int(years[i]) - int(years[j])) > params.max_season_gap:
                    continue
                shared = ~np.isnan(normalized[i]) & ~np.isnan(normalized[j])
                n_shared = int(shared.sum())
                if n_shared == 0:
                    continue
                volume_i = float(normalized[i, shared].sum()) / n_shared
                volume_j = float(normalized[j, shared].sum()) / n_shared
                if volume_i < MIN_RELATIVE_VOLUME or volume_j < MIN_RELATIVE_VOLUME:
                    continue
                weight = 1.0 / (1.0 / (volume_i * minutes[i]) + 1.0 / (volume_j * minutes[j]))
                records.append((
                    int(player_id), int(competitions[i]), int(competitions[j]),
                    float(np.log(volume_j) - np.log(volume_i)), weight,
                ))
    if not records:
        return _empty_pairs()
    return pd.DataFrame.from_records(records, columns=PAIR_COLUMNS)


def link_counts(pairs: pd.DataFrame) -> dict[int, int]:
    """Compétition -> nombre de joueurs distincts qui la relient à une autre."""
    if pairs.empty:
        return {}
    long = pd.concat([
        pairs[["player_id", "comp_a"]].rename(columns={"comp_a": "comp"}),
        pairs[["player_id", "comp_b"]].rename(columns={"comp_b": "comp"}),
    ])
    counts = long.drop_duplicates().groupby("comp")["player_id"].size()
    return {int(c): int(n) for c, n in counts.items()}


def prune_weak_links(pairs: pd.DataFrame, min_link_players: int) -> pd.DataFrame:
    """Retire itérativement les compétitions sous le seuil de joueurs de
    liaison : en retirer une peut faire passer une voisine sous le seuil."""
    current = pairs
    while not current.empty:
        weak = {c for c, n in link_counts(current).items() if n < min_link_players}
        if not weak:
            break
        current = current[~current["comp_a"].isin(weak) & ~current["comp_b"].isin(weak)]
    return current


def connected_component(pairs: pd.DataFrame, start: int) -> set[int]:
    neighbours: dict[int, set[int]] = {}
    for a, b in zip(pairs["comp_a"], pairs["comp_b"], strict=True):
        neighbours.setdefault(int(a), set()).add(int(b))
        neighbours.setdefault(int(b), set()).add(int(a))
    if start not in neighbours:
        return {start}
    seen, stack = {start}, [start]
    while stack:
        for nxt in neighbours[stack.pop()]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen


def fit_log_strength(pairs: pd.DataFrame, reference: int) -> dict[int, float]:
    """Moindres carrés pondérés, θ_référence = 0. `pairs` doit former un
    graphe connexe contenant la référence (sinon le système est singulier)."""
    comps = sorted(
        (set(pairs["comp_a"].astype(int)) | set(pairs["comp_b"].astype(int))) - {reference}
    )
    if not comps:
        return {reference: 0.0}
    column = {c: i for i, c in enumerate(comps)}
    design = np.zeros((len(pairs), len(comps)))
    rows = np.arange(len(pairs))
    comp_a = pairs["comp_a"].astype(int).to_numpy()
    comp_b = pairs["comp_b"].astype(int).to_numpy()
    mask_a = comp_a != reference
    mask_b = comp_b != reference
    design[rows[mask_a], [column[c] for c in comp_a[mask_a]]] += 1.0
    design[rows[mask_b], [column[c] for c in comp_b[mask_b]]] -= 1.0
    sqrt_w = np.sqrt(pairs["weight"].to_numpy(dtype=float))
    theta, *_ = np.linalg.lstsq(
        design * sqrt_w[:, None], pairs["y"].to_numpy(dtype=float) * sqrt_w, rcond=None,
    )
    return {reference: 0.0, **{c: float(theta[column[c]]) for c in comps}}


def _estimable(pairs: pd.DataFrame, reference: int, min_link_players: int) -> pd.DataFrame:
    """Paires utilisables pour estimer la composante de la référence."""
    pruned = prune_weak_links(pairs, min_link_players)
    if pruned.empty:
        return pruned
    component = connected_component(pruned, reference)
    return pruned[pruned["comp_a"].isin(component) & pruned["comp_b"].isin(component)]


def estimate_strength(
    rows: pd.DataFrame,
    adjusted_keys: list[str],
    params: StrengthParams,
    competition_ids: list[int],
    reference_id: int | None = None,
) -> list[CompetitionStrength]:
    """Un résultat par compétition de `competition_ids` (y compris celles
    sans aucune donnée, pour que leur absence d'estimation soit explicite).
    `reference_id` : compétition fixée à 1 ; par défaut la plus reliée."""
    pairs = build_link_pairs(rows, adjusted_keys, params)
    initial_links = link_counts(pairs)
    pruned = prune_weak_links(pairs, params.min_link_players)

    def unestimated(comp: int, status: Status) -> CompetitionStrength:
        return CompetitionStrength(comp, status, initial_links.get(comp, 0))

    if pruned.empty:
        return [unestimated(c, "insufficient_links") for c in competition_ids]

    pruned_links = link_counts(pruned)
    if reference_id is None:
        reference = min(pruned_links, key=lambda c: (-pruned_links[c], c))
    elif reference_id not in pruned_links:
        raise ValueError(
            f"La compétition de référence {reference_id} n'a pas assez de joueurs de "
            f"liaison ({initial_links.get(reference_id, 0)} < {params.min_link_players})."
        )
    else:
        reference = reference_id

    component = connected_component(pruned, reference)
    fit_pairs = pruned[pruned["comp_a"].isin(component) & pruned["comp_b"].isin(component)]
    theta = fit_log_strength(fit_pairs, reference)

    # Bootstrap par joueur, procédure complète rejouée à chaque tirage.
    ordered = sorted(component)
    row_of = {c: i for i, c in enumerate(ordered)}
    draws = np.full((len(ordered), params.bootstrap_samples), np.nan)
    player_index = fit_pairs.groupby("player_id").indices
    players = np.array(sorted(player_index))
    rng = np.random.default_rng(params.seed)
    for b in range(params.bootstrap_samples):
        sampled = rng.choice(players, size=len(players), replace=True)
        boot = fit_pairs.iloc[np.concatenate([player_index[p] for p in sampled])]
        boot = _estimable(boot, reference, params.min_link_players)
        if boot.empty:
            continue
        for comp, value in fit_log_strength(boot, reference).items():
            draws[row_of[comp], b] = value

    alpha = (1.0 - params.ci_level) / 2.0
    results = []
    for comp in competition_ids:
        if comp == reference:
            results.append(CompetitionStrength(
                comp, "reference", initial_links.get(comp, 0), 1.0, 1.0, 1.0,
                [1.0] * params.bootstrap_samples,
            ))
            continue
        if comp not in pruned_links:
            results.append(unestimated(comp, "insufficient_links"))
            continue
        if comp not in component:
            results.append(unestimated(comp, "disconnected"))
            continue
        comp_draws = np.exp(draws[row_of[comp]])
        success = float(np.mean(~np.isnan(comp_draws)))
        if success < MIN_BOOTSTRAP_SUCCESS:
            results.append(unestimated(comp, "unstable"))
            continue
        low, high = np.nanquantile(comp_draws, [alpha, 1.0 - alpha])
        results.append(CompetitionStrength(
            comp, "estimated", initial_links.get(comp, 0),
            float(np.exp(theta[comp])), float(low), float(high),
            [None if np.isnan(v) else float(v) for v in comp_draws],
        ))
    return results
