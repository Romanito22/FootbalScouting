"""Lit le registre canonique packages/metrics/src/registry.ts, exporté en
JSON par `pnpm metrics:export`. Aucune définition de métrique, seuil ou
libellé ne doit être dupliquée ici — uniquement lue depuis ce fichier."""

import json
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

METRICS_REGISTRY_PATH = Path(__file__).resolve().parents[3] / "metrics.json"


class MetricDef(TypedDict):
    key: str
    label: str
    family: str
    per90: bool
    higherIsBetter: bool
    format: str
    appliesTo: list[str]


class MetricsRegistry(TypedDict):
    minMinutes: int
    peerGroupSeasonSpan: int
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
