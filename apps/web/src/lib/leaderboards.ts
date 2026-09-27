import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  clubs, competitions, db, peerGroups, playerPercentiles, players, playerSeasonStats,
} from '@vivier/db';
import { getMetric, type PositionGroup } from '@vivier/metrics';

export interface LeaderboardRow {
  playerId: number;
  fullName: string;
  season: string;
  competitionName: string;
  clubName: string;
  minutes: number;
  birthDate: string | null;
  contractUntil: string | null;
  marketValueEur: number | null;
  rawValue: number;
  adjustedValue: number | null;
  percentile: number;
  percentileLow: number | null;
  percentileHigh: number | null;
  peerGroupLabel: string;
  peerGroupSampleSize: number;
}

/** Saisons disponibles pour un poste (groupes centrés sur cette saison), les plus récentes d'abord. */
export async function leaderboardSeasons(position: PositionGroup): Promise<{ season: string; sampleSize: number }[]> {
  const rows = await db
    .select({ season: peerGroups.season, sampleSize: sql<number>`max(${peerGroups.sampleSize})` })
    .from(peerGroups)
    .where(and(eq(peerGroups.positionGroup, position), eq(peerGroups.kind, 'tier')))
    .groupBy(peerGroups.season)
    .orderBy(desc(peerGroups.season));
  return rows.map((r) => ({ season: r.season, sampleSize: Number(r.sampleSize) }));
}

/**
 * Meilleurs joueurs d'un poste sur une métrique, pour une saison, dans leur
 * groupe de pairs (chaque ligne porte le libellé de SON groupe : à palier
 * différent, groupe différent) ou dans le groupe « toutes compétitions »
 * ajusté de la force du championnat.
 */
export async function fetchLeaderboard({
  position, season, metric, scope, limit = 50,
}: {
  position: PositionGroup;
  season: string;
  metric: string;
  scope: 'tier' | 'adjusted';
  limit?: number;
}): Promise<LeaderboardRow[]> {
  const def = getMetric(metric);
  const valueOrder = def?.higherIsBetter === false ? asc : desc;
  const valueColumn = scope === 'adjusted' ? playerPercentiles.adjustedValue : playerPercentiles.rawValue;

  const rows = await db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      season: playerPercentiles.season,
      competitionName: competitions.name,
      clubName: clubs.name,
      minutes: playerSeasonStats.minutes,
      birthDate: players.birthDate,
      contractUntil: players.contractUntil,
      marketValueEur: players.marketValueEur,
      rawValue: playerPercentiles.rawValue,
      adjustedValue: playerPercentiles.adjustedValue,
      percentile: playerPercentiles.percentile,
      percentileLow: playerPercentiles.percentileLow,
      percentileHigh: playerPercentiles.percentileHigh,
      peerGroupLabel: peerGroups.label,
      peerGroupSampleSize: peerGroups.sampleSize,
    })
    .from(playerPercentiles)
    .innerJoin(peerGroups, eq(peerGroups.id, playerPercentiles.peerGroupId))
    .innerJoin(players, eq(players.id, playerPercentiles.playerId))
    .innerJoin(competitions, eq(competitions.id, playerPercentiles.competitionId))
    .innerJoin(clubs, eq(clubs.id, playerPercentiles.clubId))
    .innerJoin(playerSeasonStats, and(
      eq(playerSeasonStats.playerId, playerPercentiles.playerId),
      eq(playerSeasonStats.season, playerPercentiles.season),
      eq(playerSeasonStats.competitionId, playerPercentiles.competitionId),
      eq(playerSeasonStats.clubId, playerPercentiles.clubId),
    ))
    .where(and(
      eq(peerGroups.positionGroup, position),
      eq(peerGroups.kind, scope),
      eq(peerGroups.season, season),
      eq(playerPercentiles.season, season),
      eq(playerPercentiles.metric, metric),
    ))
    .orderBy(desc(playerPercentiles.percentile), valueOrder(valueColumn))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    rawValue: Number(r.rawValue ?? 0),
    adjustedValue: r.adjustedValue === null ? null : Number(r.adjustedValue),
  }));
}
