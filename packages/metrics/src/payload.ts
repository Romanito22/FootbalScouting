import {
  LEAGUE_STRENGTH, MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS, POSITION_GROUPS,
} from './constants';
import { METRICS, RADAR_METRICS } from './registry';

/** Ce que le pipeline Python lit (pipeline/metrics.json) : jamais édité à la main. */
export function buildRegistryPayload() {
  return {
    minMinutes: MIN_MINUTES,
    peerGroupSeasonSpan: PEER_GROUP_SEASON_SPAN,
    leagueStrength: LEAGUE_STRENGTH,
    positionGroups: POSITION_GROUPS,
    positionGroupLabels: POSITION_GROUP_LABELS,
    metrics: METRICS,
    radarMetrics: RADAR_METRICS,
  };
}

export function serializeRegistryPayload(): string {
  return `${JSON.stringify(buildRegistryPayload(), null, 2)}\n`;
}
