"""Lit le registre canonique packages/metrics/src/registry.ts, exporté en
JSON par `pnpm metrics:export`. Aucune définition de métrique, seuil ou
libellé ne doit être dupliquée ici — uniquement lue depuis ce fichier."""

import json
from functools import lru_cache
from pathlib import Path
from typing import NotRequired, TypedDict

METRICS_REGISTRY_PATH = Path(__file__).resolve().parents[3] / "metrics.json"


class MetricDef(TypedDict):
    key: str
    label: str
    family: str
    per90: bool
    higherIsBetter: bool
    format: str
    appliesTo: list[str]
    leagueAdjusted: NotRequired[bool]


class LeagueStrengthParams(TypedDict):
    minMinutes: int
    maxSeasonGap: int
    minLinkPlayers: int
    ciLevel: float
    bootstrapSamples: int


class MetricsRegistry(TypedDict):
    minMinutes: int
    peerGroupSeasonSpan: int
    leagueStrength: LeagueStrengthParams
    positionGroups: list[str]
    positionGroupLabels: dict[str, str]
    metrics: list[MetricDef]


@lru_cache(maxsize=1)
def load_registry() -> MetricsRegistry:
    return json.loads(METRICS_REGISTRY_PATH.read_text())


def outfield_metric_keys() -> set[str]:
    return {m["key"] for m in load_registry()["metrics"] if "GK" not in m["appliesTo"]}


def metric_direction() -> dict[str, bool]:
    """key -> higherIsBetter, pour orienter le sens du classement en percentile."""
    return {m["key"]: m["higherIsBetter"] for m in load_registry()["metrics"]}


def metrics_by_position() -> dict[str, list[str]]:
    """poste -> clés des métriques qui s'y appliquent (`appliesTo`), dans
    l'ordre du registre. Un gardien n'est jamais classé sur des métriques de
    joueur de champ, et inversement."""
    registry = load_registry()
    return {
        position: [m["key"] for m in registry["metrics"] if position in m["appliesTo"]]
        for position in registry["positionGroups"]
    }


def league_adjusted_keys() -> list[str]:
    """Métriques de volume ajustées de la force du championnat, dans l'ordre
    du registre (cf. `leagueAdjusted` dans packages/metrics)."""
    return [m["key"] for m in load_registry()["metrics"] if m.get("leagueAdjusted", False)]
