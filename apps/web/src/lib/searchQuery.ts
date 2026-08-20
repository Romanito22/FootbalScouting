import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  clubs, competitions, db, playerPercentiles, players, playerSeasonStats,
} from '@vivier/db';
import type { SearchFilters } from './searchFilters';

export const ROW_RADAR_KEYS = [
  'goals', 'xg', 'key_passes', 'dribbles_completed', 'tackles_won', 'interceptions',
];

export interface SearchResultRow {
  playerId: number;
  fullName: string;
  positionGroup: string;
  season: string;
  minutes: number;
  clubName: string;
  competitionName: string;
  contractUntil: string | null;
  marketValueEur: number | null;
}

const RESULT_LIMIT = 200;

export async function runSearch(filters: SearchFilters): Promise<{
  rows: SearchResultRow[];
  radarByPlayer: Map<string, { key: string; label: string; percentile: number }[]>;
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

  let rows = await db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      season: playerSeasonStats.season,
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

  // Seuil de percentile sur une métrique : filtré à part (intersection en
  // mémoire) plutôt qu'un join conditionnel, pour rester simple et lisible.
  if (filters.metric && filters.percentileMin !== null) {
    const eligible = await db
      .select({ playerId: playerPercentiles.playerId, season: playerPercentiles.season })
      .from(playerPercentiles)
      .where(and(
        eq(playerPercentiles.metric, filters.metric),
        gte(playerPercentiles.percentile, filters.percentileMin),
      ));
    const eligibleKeys = new Set(eligible.map((e) => `${e.playerId}|${e.season}`));
    rows = rows.filter((r) => eligibleKeys.has(`${r.playerId}|${r.season}`));
  }

  const playerIds = [...new Set(rows.map((r) => r.playerId))];
  const radarByPlayer = new Map<string, { key: string; label: string; percentile: number }[]>();

  if (playerIds.length) {
    const percentileRows = await db
      .select({
        playerId: playerPercentiles.playerId,
        season: playerPercentiles.season,
        metric: playerPercentiles.metric,
        percentile: playerPercentiles.percentile,
      })
      .from(playerPercentiles)
      .where(and(
        inArray(playerPercentiles.playerId, playerIds),
        inArray(playerPercentiles.metric, ROW_RADAR_KEYS),
      ));

    for (const p of percentileRows) {
      const key = `${p.playerId}|${p.season}`;
      const list = radarByPlayer.get(key) ?? [];
      list.push({ key: p.metric, label: p.metric, percentile: p.percentile });
      radarByPlayer.set(key, list);
    }
  }

  return { rows, radarByPlayer };
}
