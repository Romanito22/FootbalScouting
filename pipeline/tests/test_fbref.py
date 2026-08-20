"""Fixtures figées pour la normalisation FBref.

Écrites à la main : le vrai schéma de colonnes 'standard' vient d'un
notebook d'exemple du dépôt soccerdata (haute confiance), celui de
'shooting' est une hypothèse non vérifiée (fbref.com hors de portée réseau
dans cet environnement — cf. docstring du provider). Ces tests verrouillent
le contrat de normalize_row lui-même (calcul per-90, gestion des valeurs
manquantes), indépendamment de la question distincte "soccerdata renvoie-t-
il vraiment ces noms de colonnes" — à confirmer par un run réel."""

import pandas as pd
import pytest

from vivier_pipeline.providers.fbref import normalize_row

INDEX = ("FRA-Ligue 1", "2022-2023", "Paris SG", "Kylian Mbappé")


def _row(overrides: dict | None = None) -> pd.Series:
    base: dict = {
        ("Playing Time", "Min"): 2700.0,
        ("Playing Time", "90s"): 30.0,
        ("Playing Time", "MP"): 30.0,
        ("Performance", "Gls"): 27.0,
        ("Performance", "Ast"): 7.0,
        ("Performance", "CrdY"): 3.0,
        ("Performance", "CrdR"): 0.0,
        ("Standard", "Sh"): 120.0,
        ("Standard", "SoT"): 60.0,
        ("Expected", "xG"): 22.5,
        ("Expected", "npxG"): 19.5,
    }
    base.update(overrides or {})
    return pd.Series(base)


def test_normalize_row_happy_path() -> None:
    record = normalize_row(INDEX, _row())
    assert record is not None
    assert record["source_id"] == "FRA-Ligue 1|2022-2023|Paris SG|kylian mbappe"
    assert record["raw_name"] == "Kylian Mbappé"
    assert record["team_name"] == "Paris SG"
    assert record["season"] == "2022-2023"
    assert record["minutes"] == 2700
    assert record["matches_played"] == 30
    assert record["source"] == "fbref"
    assert record["metrics"]["goals"] == pytest.approx(27 / 30)
    assert record["metrics"]["assists"] == pytest.approx(7 / 30)
    assert record["metrics"]["xg"] == pytest.approx(22.5 / 30)
    assert record["metrics"]["npxg"] == pytest.approx(19.5 / 30)
    assert record["metrics"]["shots"] == pytest.approx(120 / 30)
    assert record["metrics"]["xg_per_shot"] == pytest.approx(22.5 / 120)


def test_normalize_row_zero_minutes_returns_none() -> None:
    assert normalize_row(INDEX, _row({("Playing Time", "Min"): 0.0})) is None


def test_normalize_row_missing_minutes_returns_none() -> None:
    assert normalize_row(INDEX, _row({("Playing Time", "Min"): float("nan")})) is None


def test_normalize_row_handles_missing_matches_played() -> None:
    record = normalize_row(INDEX, _row({("Playing Time", "MP"): float("nan")}))
    assert record is not None
    assert record["matches_played"] is None


def test_normalize_row_zero_shots_gives_zero_xg_per_shot_not_a_crash() -> None:
    record = normalize_row(INDEX, _row({("Standard", "Sh"): 0.0}))
    assert record is not None
    assert record["metrics"]["xg_per_shot"] == 0.0


def test_normalize_row_missing_cards_default_to_zero_per90() -> None:
    record = normalize_row(INDEX, _row({("Performance", "CrdR"): float("nan")}))
    assert record is not None
    assert record["metrics"]["red_cards"] == 0.0
