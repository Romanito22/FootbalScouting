"""Vecteurs de style et de niveau — le vrai différenciateur du produit
(spec §3.2). Sépare « comment il joue » (style) de « à quel niveau »
(qualité) :

- **Vecteur style** : métriques per-90 (sens harmonisé, higherIsBetter
  inversé en amont) mises à l'échelle par l'écart-type intra-groupe de
  poste — SANS soustraire la moyenne — puis normalisées en norme L2 par
  joueur. Piège évité ici : un z-score classique (qui soustrait la
  moyenne) est une transformation affine, pas linéaire, et ne préserve pas
  le rapport entre deux joueurs de même profil à des niveaux différents
  (P2 = 3×P1 en brut n'a aucune raison de donner un z-score 3× plus
  grand). La mise à l'échelle seule (diviser, ne pas soustraire) préserve
  ce rapport, donc la direction du vecteur une fois normalisé en norme
  L2 — exactement ce qu'il faut pour ne garder que la *proportion*
  relative entre métriques (40 % de son jeu est de la percussion, 30 % de
  la passe...), indépendamment du volume produit. Répond à « joue-t-il
  comme lui ? »

- **Vecteur qualité** : les percentiles déjà calculés (core/percentiles.py),
  PAS des z-scores bruts. Piège évité ici : la similarité cosinus est
  invariante à l'échelle — deux joueurs au même profil mais à des niveaux
  très différents (ex. z-scores [1, 0.5] contre [2, 1], simple multiple
  scalaire) auraient une similarité cosinus de 1.0 sur des z-scores bruts,
  strictement l'inverse de ce que veut la spec (« 0,94 en style mais 0,40
  en niveau »). Le percentile, lui, dépend non-linéairement de toute la
  distribution du groupe de pairs : un même profil relatif à deux niveaux
  différents y donne des vecteurs qui ne sont PAS de simples multiples
  l'un de l'autre, donc une similarité cosinus qui baisse réellement avec
  l'écart de niveau. Répond à « est-il aussi bon ? »

Puis réduction vers 32 dimensions (fixées par le schéma `vector(32)`) via
`TruncatedSVD`, pas `PCA` : PCA centre les données sur leur moyenne avant
projection, ce qui déforme les angles — donc la similarité cosinus — que
ce module cherche justement à préserver. TruncatedSVD ne centre pas.

Piège d'échelle : la réduction ne peut pas extraire plus de composantes
que min(n_échantillons, n_métriques). Avec un groupe de pairs restreint
(ou une base encore modeste), le nombre réel de composantes utiles est
donc plafonné et le vecteur complété à 32 par des zéros. Ce padding ne
fausse pas le classement par similarité cosinus (identique pour tout le
monde), mais les résultats ne deviennent vraiment fiables qu'avec un
échantillon substantiel.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD

MODEL_VERSION = "v1"
VECTOR_DIM = 32


@dataclass
class VectorResult:
    player_id: int
    season: str
    style_vec: list[float]
    quality_vec: list[float]
    model_version: str


def _harmonized_metrics(
    df: pd.DataFrame, metric_keys: list[str], direction: dict[str, bool],
) -> pd.DataFrame:
    """Inverse le signe des métriques où higherIsBetter=False, pour qu'un
    z-score plus élevé signifie toujours « mieux », sur toutes les métriques."""
    out = df[metric_keys].copy()
    for key in metric_keys:
        if not direction.get(key, True):
            out[key] = -out[key]
    return out


def _scale_within_group(values: pd.DataFrame, group: pd.Series) -> pd.DataFrame:
    """Ramène chaque métrique à une échelle comparable en divisant par son
    écart-type intra-groupe — SANS soustraire la moyenne. Un z-score
    (soustraction incluse) est une transformation affine, pas linéaire : il
    ne préserve pas le rapport entre deux joueurs de même profil à des
    niveaux différents (P2 = 3×P1 en brut ne donne PAS un z-score 3× plus
    grand, parce que la moyenne du groupe n'est pas nulle). La mise à
    l'échelle seule préserve ce rapport, donc la direction du vecteur une
    fois normalisé en norme L2 — exactement ce qu'il faut pour le style."""
    grouped = values.groupby(group)
    stds = grouped.transform(lambda s: s.std(ddof=0)).replace(0, 1.0)
    return values / stds


def _l2_normalize_rows(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return np.divide(matrix, norms, out=np.zeros_like(matrix), where=norms > 0)


def _svd_pad(matrix: np.ndarray, dim: int = VECTOR_DIM) -> np.ndarray:
    """Réduction vers min(dim, n_échantillons, n_features), complétée à
    `dim` par des zéros. Aucune composante extractible -> vecteurs nuls."""
    n_samples, n_features = matrix.shape
    n_components = min(dim, n_samples, n_features)
    if n_components < 1:
        return np.zeros((n_samples, dim))
    if n_features < 2:
        # TruncatedSVD exige au moins 2 features ; avec une seule métrique,
        # il n'y a rien à réduire, on recopie la colonne telle quelle.
        projected = matrix
    else:
        projected = TruncatedSVD(n_components=n_components, random_state=0).fit_transform(matrix)
    if n_components < dim:
        projected = np.pad(projected, ((0, 0), (0, dim - projected.shape[1])))
    return projected


def compute_vectors(
    rows: pd.DataFrame, metric_keys: list[str], metric_direction: dict[str, bool],
) -> list[VectorResult]:
    """`rows` : une ligne par (player_id, season), colonnes player_id,
    season, position_group, metrics (dict, per-90 brutes) et percentiles
    (dict, 0-100) — déjà filtrées sur le seuil de minutes en amont (même
    contrat que core/percentiles.fetch_percentile_input)."""
    if rows.empty:
        return []

    df = rows.reset_index(drop=True)
    metrics_df = pd.json_normalize(df["metrics"])[metric_keys]
    percentiles_df = pd.json_normalize(df["percentiles"])[metric_keys]

    harmonized = _harmonized_metrics(
        pd.concat([df[["position_group"]], metrics_df], axis=1), metric_keys, metric_direction,
    )
    scaled = _scale_within_group(harmonized, df["position_group"])
    style_input = _l2_normalize_rows(scaled.to_numpy())
    style_vecs = _svd_pad(style_input)

    quality_input = (percentiles_df.to_numpy(dtype=float)) / 100.0
    quality_vecs = _svd_pad(quality_input)

    return [
        VectorResult(
            player_id=int(df.loc[i, "player_id"]),
            season=str(df.loc[i, "season"]),
            style_vec=style_vecs[i].tolist(),
            quality_vec=quality_vecs[i].tolist(),
            model_version=MODEL_VERSION,
        )
        for i in range(len(df))
    ]
