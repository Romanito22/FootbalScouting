import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  clubs, competitions, db, peerGroups, playerPercentiles, players, playerSeasonStats,
} from '@vivier/db';
import {
  COMPACT_RADAR_SIZE, getMetric, type PositionGroup, POSITION_GROUPS, RADAR_METRICS,
} from '@vivier/metrics';
import { fetchRowPercentiles, statRowKey } from './percentiles';
import type { SearchFilters } from './searchFilters';

/** Mini-radar d'une ligne : les premiers axes du radar de son poste. */
function compactRadarKeys(position: PositionGroup): readonly string[] {
  return RADAR_METRICS[position].slice(0, COMPACT_RADAR_SIZE);
}
const ALL_COMPACT_KEYS = [...new Set(POSITION_GROUPS.flatMap((p) => compactRadarKeys(p)))];

export interface SearchResultRow {
  playerId: number;
  fullName: string;
  positionGroup: PositionGroup;
  season: string;
  competitionId: number;
  clubId: number;
  minutes: number;
  clubName: string;
  competitionName: string;
  contractUntil: string | null;
  marketValueEur: number | null;
}

const RESULT_LIMIT = 200;

export interface RowRadar {
  metrics: { key: string; label: string; percentile: number }[];
  peerGroupLabel: string;
  peerGroupSampleSize: number;
}

export async function runSearch(filters: SearchFilters): Promise<{
  rows: SearchResultRow[];
  /** Clé : statRowKey — le radar d'une ligne vient de SON groupe de pairs. */
  radarByRow: Map<string, RowRadar>;
}> {
  const conditions = [];
  if (filters.positions.length) conditions.push(inArray(players.positionGroup, filters.positions));
  if (filters.foot) conditions.push(eq(players.foot, filters.foot));
  if (filters.ageMin !== null) {
    conditions.push(sql`date_part('year', age(current_date, ${players.birthDate})) >= ${filters.ageMin}`);
  }
  if (filters.ageMax !== null) {
    conditions.push(sql`date_part('year', age(current_date, ${players.birthDate})) <= ${filters.ageMax}`);
  }
  if (filters.minutesMin !== null) conditions.push(gte(playerSeasonStats.minutes, filters.minutesMin));
  if (filters.contractBefore) conditions.push(lte(players.contractUntil, filters.contractBefore));
  if (filters.marketValueMax !== null) {
    conditions.push(lte(players.marketValueEur, filters.marketValueMax));
  }
  if (filters.tier !== null) conditions.push(eq(competitions.tier, filters.tier));
  // Seuil de percentile : dans le groupe de pairs propre à la ligne (saison-
  // centre = sa saison, même compétition/club), et AVANT la limite de
  // résultats — filtrer après coup ferait disparaître des joueurs en silence.
  if (filters.metric && filters.percentileMin !== null) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${playerPercentiles}
      INNER JOIN ${peerGroups} ON ${peerGroups.id} = ${playerPercentiles.peerGroupId}
      WHERE ${playerPercentiles.playerId} = ${playerSeasonStats.playerId}
        AND ${playerPercentiles.season} = ${playerSeasonStats.season}
        AND ${peerGroups.season} = ${playerSeasonStats.season}
        AND ${peerGroups.kind} = ${filters.percentileScope}
        AND ${playerPercentiles.competitionId} = ${playerSeasonStats.competitionId}
        AND ${playerPercentiles.clubId} = ${playerSeasonStats.clubId}
        AND ${playerPercentiles.metric} = ${filters.metric}
        AND ${playerPercentiles.percentile} >= ${filters.percentileMin}
    )`);
  }

  const rows = await db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      season: playerSeasonStats.season,
      competitionId: playerSeasonStats.competitionId,
      clubId: playerSeasonStats.clubId,
      minutes: playerSeasonStats.minutes,
      clubName: clubs.name,
      competitionName: competitions.name,
      contractUntil: players.contractUntil,
      marketValueEur: players.marketValueEur,
    })
    .from(playerSeasonStats)
    .innerJoin(players, eq(players.id, playerSeasonStats.playerId))
    .innerJoin(competitions, eq(competitions.id, playerSeasonStats.competitionId))
    .innerJoin(clubs, eq(clubs.id, playerSeasonStats.clubId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(playerSeasonStats.minutes))
    .limit(RESULT_LIMIT);

  const percentilesByRow = await fetchRowPercentiles(
    [...new Set(rows.map((r) => r.playerId))], ALL_COMPACT_KEYS,
  );
  const radarByRow = new Map<string, RowRadar>();
  for (const row of rows) {
    const key = statRowKey(row);
    const group = percentilesByRow.get(key);
    if (!group) continue;
    radarByRow.set(key, {
      metrics: compactRadarKeys(row.positionGroup).flatMap((metric) => {
        const pct = group.byMetric.get(metric);
        return pct
          ? [{ key: metric, label: getMetric(metric)?.label ?? metric, percentile: pct.percentile }]
          : [];
      }),
      peerGroupLabel: group.peerGroupLabel,
      peerGroupSampleSize: group.peerGroupSampleSize,
    });
  }

  return { rows, radarByRow };
}
