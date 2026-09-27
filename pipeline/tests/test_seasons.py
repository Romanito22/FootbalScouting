"""Format canonique des saisons : un libellé différent pour la même saison
casse en silence les groupes de pairs."""

import pytest

from vivier_pipeline.core.percentiles import parse_season_year
from vivier_pipeline.core.seasons import canonical_season, multi_year_code_to_canonical


def test_statsbomb_split_season_becomes_dashed() -> None:
    assert canonical_season("2015/2016") == "2015-2016"


def test_single_year_season_is_kept() -> None:
    assert canonical_season("2022") == "2022"


def test_canonical_season_is_idempotent() -> None:
    assert canonical_season("2015-2016") == "2015-2016"


def test_canonical_season_rejects_inconsistent_span() -> None:
    with pytest.raises(ValueError):
        canonical_season("2015/2017")


def test_canonical_season_rejects_unknown_format() -> None:
    with pytest.raises(ValueError):
        canonical_season("saison 15")


def test_soccerdata_multi_year_codes() -> None:
    assert multi_year_code_to_canonical("2223") == "2022-2023"
    assert multi_year_code_to_canonical("9900") == "1999-2000"
    assert multi_year_code_to_canonical("0001") == "2000-2001"


def test_soccerdata_code_conversion_is_idempotent() -> None:
    assert multi_year_code_to_canonical("2022-2023") == "2022-2023"


def test_soccerdata_rejects_non_consecutive_code() -> None:
    with pytest.raises(ValueError):
        multi_year_code_to_canonical("2022")


def test_canonical_seasons_parse_to_their_starting_year() -> None:
    assert parse_season_year(multi_year_code_to_canonical("2223")) == 2022
    assert parse_season_year(canonical_season("2015/2016")) == 2015
