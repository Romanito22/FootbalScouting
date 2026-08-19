"""Agrège les événements StatsBomb en lignes player_season_stats.

Toute la période 5 (tirs au but) est exclue : ce ne sont pas des actions de
jeu normales et elles ne comptent ni dans les minutes ni dans les stats.
Les gardiens sont exclus : jeu de métriques séparé, pas construit ici.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
from unidecode import unidecode

from vivier_pipeline.core.positions import normalize_position

METRICS_REGISTRY_PATH = Path(__file__).resolve().parents[3] / "metrics.json"

# Cartes émises hors "Foul Committed" (ex. dissidence) sont sur "Bad Behaviour".
YELLOW_CODES = {"Yellow Card", "Second Yellow"}
RED_CODES = {"Red Card", "Second Yellow"}
TACKLE_WON_OUTCOMES = {"Won", "Success In Play", "Success Out"}


def normalize_name(full_name: str) -> str:
    return unidecode(full_name).lower().strip()


def _parse_clock(value: str) -> float:
    minutes, seconds = value.split(":")[:2]
    return int(minutes) + int(seconds) / 60.0


def _period(entry: dict, key: str) -> int:
    value = entry.get(key)
    return value if value is not None else 1


def _period_clocks(events: pd.DataFrame, event_type: str) -> dict[int, float]:
    """Horloge de match (cumulative, ne repart pas à 0 à la mi-temps) au
    début/à la fin de chaque période, lue sur les événements Half Start/End.
    Sert à borner les temps de jeu des titulaires jamais remplacés (`to` nul).
    """
    rows = events[events["type"] == event_type]
    clocks: dict[int, float] = {}
    for _, row in rows.iterrows():
        clock = row["minute"] + row["second"] / 60.0
        period = int(row["period"])
        if event_type == "Half End":
            clocks[period] = max(clocks.get(period, 0.0), clock)
        else:
            clocks[period] = min(clocks.get(period, clock), clock)
    return clocks


def _load_outfield_metric_keys() -> set[str]:
    metrics = json.loads(METRICS_REGISTRY_PATH.read_text())
    return {m["key"] for m in metrics if "GK" not in m["appliesTo"]}


@dataclass
class CompetitionAggregation:
    competition: dict
    clubs: dict[int, dict] = field(default_factory=dict)
    players: dict[int, dict] = field(default_factory=dict)
    season_stats: list[dict] = field(default_factory=list)


def _player_minutes(
    positions: list[dict], period_start: dict[int, float], period_end: dict[int, float],
    match_last_period: int,
) -> float:
    """Somme les temps de jeu d'un joueur sur une période <= match_last_period
    (donc jamais la séance de tirs au but, période 5).

    Piège StatsBomb Open Data : sur les matchs allant aux tirs au but, la
    dernière entrée `positions` d'un joueur resté sur le terrain jusqu'au bout
    des prolongations décrit la séance de pénos avec une période qui régresse
    (ex. from_period=4 -> to_period=1) et une horloge qui repart en arrière.
    Dès qu'une entrée régresse ou dépasse match_last_period, on la traite
    comme la fin du temps réglementaire/prolongations et on arrête : tout ce
    qui suit n'est que du bruit de séance de tirs au but.
    """
    total = 0.0
    end_of_play = period_end.get(match_last_period, 0.0)
    for p in positions:
        from_period = _period(p, "from_period")
        if from_period > match_last_period:
            break

        start = (
            _parse_clock(p["from"]) if p["from"] is not None
            else period_start.get(from_period, 0.0)
        )

        raw_to_period = p.get("to_period")
        anomalous = (
            p["to"] is None
            or raw_to_period is None
            or raw_to_period < from_period
            or raw_to_period > match_last_period
        )
        end = end_of_play if anomalous else _parse_clock(p["to"])

        total += max(end - start, 0.0)
        if anomalous:
            break
    return total


def _lineup_rows(
    lineups: dict[str, pd.DataFrame], team_ids: dict[str, int], events: pd.DataFrame,
) -> pd.DataFrame:
    period_start = _period_clocks(events, "Half Start")
    period_end = _period_clocks(events, "Half End")
    match_last_period = min(int(events["period"].max()), 4)

    rows = []
    for team_name, df in lineups.items():
        for _, player in df.iterrows():
            minutes = _player_minutes(
                player["positions"], period_start, period_end, match_last_period,
            )
            if minutes <= 0 or not player["positions"]:
                continue
            rows.append({
                "player_id": player["player_id"],
                "player_name": player["player_name"],
                "country": player["country"],
                "team_id": team_ids[team_name],
                "team_name": team_name,
                "position": player["positions"][0]["position"],
                "minutes": minutes,
            })
    return pd.DataFrame(rows)


EVENT_COLUMNS = [
    "id", "player_id", "type", "shot_outcome", "shot_type", "shot_statsbomb_xg",
    "pass_shot_assist", "pass_goal_assist", "pass_assisted_shot_id", "dribble_outcome",
    "duel_type", "duel_outcome", "foul_committed_card", "bad_behaviour_card",
]


def _event_counts(events: pd.DataFrame) -> pd.DataFrame:
    ev = events[events["period"] <= 4].copy()
    # Une colonne n'existe que si au moins un événement du match la porte
    # (ex. pas de carton -> pas de colonne foul_committed_card).
    for col in EVENT_COLUMNS:
        if col not in ev.columns:
            ev[col] = pd.NA

    def count(mask: pd.Series) -> pd.Series:
        return ev.loc[mask].groupby("player_id").size()

    def sum_col(mask: pd.Series, col: str) -> pd.Series:
        return ev.loc[mask, [col, "player_id"]].groupby("player_id")[col].sum()

    is_shot = ev["type"] == "Shot"
    is_goal = is_shot & (ev["shot_outcome"] == "Goal")
    is_pen = ev["shot_type"] == "Penalty"
    is_pass = ev["type"] == "Pass"
    is_duel_tackle = (ev["type"] == "Duel") & (ev["duel_type"] == "Tackle")

    shot_xg_by_id = ev.loc[is_shot].set_index("id")["shot_statsbomb_xg"]
    assisting_passes = ev.loc[is_pass & ev["pass_shot_assist"].fillna(False)].copy()
    assisting_passes["assisted_xg"] = (
        assisting_passes["pass_assisted_shot_id"].map(shot_xg_by_id).fillna(0.0)
    )

    series = {
        "goals": count(is_goal),
        "np_goals": count(is_goal & ~is_pen),
        "shots": count(is_shot),
        "xg": sum_col(is_shot, "shot_statsbomb_xg"),
        "npxg": sum_col(is_shot & ~is_pen, "shot_statsbomb_xg"),
        "key_passes": count(is_pass & ev["pass_shot_assist"].fillna(False)),
        "assists": count(is_pass & ev["pass_goal_assist"].fillna(False)),
        "xa_raw": assisting_passes.groupby("player_id")["assisted_xg"].sum(),
        "dribbles_attempted": count(ev["type"] == "Dribble"),
        "dribbles_completed": count(
            (ev["type"] == "Dribble") & (ev["dribble_outcome"] == "Complete")
        ),
        "tackles_attempted": count(is_duel_tackle),
        "tackles_won": count(is_duel_tackle & ev["duel_outcome"].isin(TACKLE_WON_OUTCOMES)),
        "interceptions": count(ev["type"] == "Interception"),
        "clearances": count(ev["type"] == "Clearance"),
        "blocks": count(ev["type"] == "Block"),
        "ball_recoveries": count(ev["type"] == "Ball Recovery"),
        "fouls_committed": count(ev["type"] == "Foul Committed"),
        "fouls_won": count(ev["type"] == "Foul Won"),
        "yellow_cards": count(
            ((ev["type"] == "Foul Committed") & ev["foul_committed_card"].isin(YELLOW_CODES))
            | ((ev["type"] == "Bad Behaviour") & ev["bad_behaviour_card"].isin(YELLOW_CODES))
        ),
        "red_cards": count(
            ((ev["type"] == "Foul Committed") & ev["foul_committed_card"].isin(RED_CODES))
            | ((ev["type"] == "Bad Behaviour") & ev["bad_behaviour_card"].isin(RED_CODES))
        ),
    }
    return pd.concat(series, axis=1).fillna(0.0)


def _per90_metrics(totals: pd.Series, nineties: float) -> dict[str, float]:
    def rate(numerator: float, denominator: float) -> float:
        return numerator / denominator if denominator > 0 else 0.0

    return {
        "goals": totals["goals"] / nineties,
        "np_goals": totals["np_goals"] / nineties,
        "shots": totals["shots"] / nineties,
        "xg": totals["xg"] / nineties,
        "npxg": totals["npxg"] / nineties,
        "xg_per_shot": rate(totals["xg"], totals["shots"]),
        "np_goals_minus_npxg": (totals["np_goals"] - totals["npxg"]) / nineties,
        "key_passes": totals["key_passes"] / nineties,
        "assists": totals["assists"] / nineties,
        "xa": totals["xa_raw"] / nineties,
        "dribbles_attempted": totals["dribbles_attempted"] / nineties,
        "dribbles_completed": totals["dribbles_completed"] / nineties,
        "dribble_success_rate": rate(totals["dribbles_completed"], totals["dribbles_attempted"]),
        "tackles_attempted": totals["tackles_attempted"] / nineties,
        "tackles_won": totals["tackles_won"] / nineties,
        "interceptions": totals["interceptions"] / nineties,
        "clearances": totals["clearances"] / nineties,
        "blocks": totals["blocks"] / nineties,
        "ball_recoveries": totals["ball_recoveries"] / nineties,
        "fouls_committed": totals["fouls_committed"] / nineties,
        "fouls_won": totals["fouls_won"] / nineties,
        "yellow_cards": totals["yellow_cards"] / nineties,
        "red_cards": totals["red_cards"] / nineties,
    }


def aggregate_competition(
    matches: pd.DataFrame,
    events_by_match: dict[int, pd.DataFrame],
    lineups_by_match: dict[int, dict[str, pd.DataFrame]],
) -> CompetitionAggregation:
    expected_keys = _load_outfield_metric_keys()

    first = matches.iloc[0]
    result = CompetitionAggregation(competition={
        "name": first["competition_name"],
        "country": first["competition_country_name"],
        "tier": 1,
        "season": str(first["season"]),
        "source_ids": {"statsbomb": str(first["competition_id"])},
    })

    all_lineup_rows = []
    for _, match in matches.iterrows():
        match_id = int(match["match_id"])
        team_ids = {
            match["home_team"]: match["home_team_id"],
            match["away_team"]: match["away_team_id"],
        }
        match_events = events_by_match[match_id]
        lineup_rows = _lineup_rows(lineups_by_match[match_id], team_ids, match_events)
        if lineup_rows.empty:
            continue
        lineup_rows["match_id"] = match_id
        counts = _event_counts(match_events)
        merged = lineup_rows.join(counts, on="player_id")
        merged[counts.columns] = merged[counts.columns].fillna(0.0)
        all_lineup_rows.append(merged)

        for team_name, raw_team_id in team_ids.items():
            team_id = int(raw_team_id)
            if team_id not in result.clubs:
                result.clubs[team_id] = {
                    "name": team_name,
                    "normalized_name": normalize_name(team_name),
                    "country": team_name,
                    "is_national_team": True,
                    "source_ids": {"statsbomb_team": str(team_id)},
                }

    all_rows = pd.concat(all_lineup_rows, ignore_index=True)

    raw_numeric_cols = [c for c in all_rows.columns if c not in {
        "player_id", "player_name", "country", "team_id", "team_name", "position", "match_id",
    }]
    totals = all_rows.groupby("player_id")[raw_numeric_cols].sum()
    matches_played = all_rows.groupby("player_id")["match_id"].nunique()
    # équipe/poste majoritaires : le plus fréquent sur le tournoi
    identity = (
        all_rows.groupby("player_id")
        .agg(
            player_name=("player_name", "first"),
            country=("country", "first"),
            team_id=("team_id", lambda s: s.mode().iat[0]),
            position=("position", lambda s: s.mode().iat[0]),
        )
    )

    for raw_player_id, total_row in totals.iterrows():
        player_id = int(raw_player_id)
        nineties = total_row["minutes"] / 90.0
        if nineties <= 0:
            continue
        info = identity.loc[raw_player_id]
        position_group = normalize_position(info["position"])
        if position_group == "GK":
            continue

        metrics = _per90_metrics(total_row, nineties)
        if set(metrics) != expected_keys:
            raise ValueError(
                f"Dérive du catalogue de métriques : {set(metrics) ^ expected_keys}"
            )

        result.players[player_id] = {
            "full_name": info["player_name"],
            "normalized_name": normalize_name(info["player_name"]),
            "nationality": [info["country"]] if pd.notna(info["country"]) else [],
            "position_group": position_group,
            "source_ids": {"statsbomb": str(player_id)},
        }
        result.season_stats.append({
            "player_id": player_id,
            "team_id": int(info["team_id"]),
            "season": result.competition["season"],
            "minutes": int(round(total_row["minutes"])),
            "matches_played": int(matches_played.loc[raw_player_id]),
            "metrics": metrics,
            "source": "statsbomb",
        })

    return result
