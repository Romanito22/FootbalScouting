import { and, eq, inArray } from 'drizzle-orm';
import { db, peerGroups, playerPercentiles } from '@vivier/db';

/**
 * Identifie une ligne player_season_stats. Un joueur figure dans les groupes
 * de pairs de plusieurs saisons (fenêtre ± PEER_GROUP_SEASON_SPAN) et peut
 * avoir plusieurs lignes la même saison (transfert) : un percentile n'a de
 * sens qu'associé à UNE ligne et à UN groupe de pairs, jamais « à la saison ».
 */
export interface StatRowRef {
  playerId: number;
  season: string;
  competitionId: number;
  clubId: number;
}

export function statRowKey(row: StatRowRef): string {
  return `${row.playerId}|${row.season}|${row.competitionId}|${row.clubId}`;
}

export interface MetricPercentile {
  percentile: number;
  rawValue: number | null;
  /** Effectif réel du classement sur cette métrique (≤ effectif du groupe). */
  sampleSize: number;
}

export interface RowPercentiles {
  peerGroupId: string;
  peerGroupLabel: string;
  peerGroupSampleSize: number;
  minMinutes: number;
  byMetric: Map<string, MetricPercentile>;
}

/**
 * Percentiles de chaque ligne de stats, dans le groupe de pairs centré sur
 * sa propre saison (celui qui porte le même palier que sa compétition).
 * Clé : statRowKey.
 */
export async function fetchRowPercentiles(
  playerIds: number[], metrics?: string[],
): Promise<Map<string, RowPercentiles>> {
  const result = new Map<string, RowPercentiles>();
  if (playerIds.length === 0) return result;

  const conditions = [
    inArray(playerPercentiles.playerId, playerIds),
    eq(peerGroups.season, playerPercentiles.season),
  ];
  if (metrics) conditions.push(inArray(playerPercentiles.metric, metrics));

  const rows = await db
    .select({
      playerId: playerPercentiles.playerId,
      season: playerPercentiles.season,
      competitionId: playerPercentiles.competitionId,
      clubId: playerPercentiles.clubId,
      metric: playerPercentiles.metric,
      rawValue: playerPercentiles.rawValue,
      percentile: playerPercentiles.percentile,
      sampleSize: playerPercentiles.sampleSize,
      peerGroupId: peerGroups.id,
      peerGroupLabel: peerGroups.label,
      peerGroupSampleSize: peerGroups.sampleSize,
      minMinutes: peerGroups.minMinutes,
    })
    .from(playerPercentiles)
    .innerJoin(peerGroups, eq(peerGroups.id, playerPercentiles.peerGroupId))
    .where(and(...conditions));

  for (const row of rows) {
    // Lignes antérieures à la migration 0002 (pas de rattachement) : ignorées
    // plutôt que devinées — le prochain run de compute_percentiles les remplace.
    if (row.competitionId === null || row.clubId === null) continue;
    const key = statRowKey({
      playerId: row.playerId, season: row.season,
      competitionId: row.competitionId, clubId: row.clubId,
    });
    let entry = result.get(key);
    if (!entry) {
      entry = {
        peerGroupId: row.peerGroupId,
        peerGroupLabel: row.peerGroupLabel,
        peerGroupSampleSize: row.peerGroupSampleSize,
        minMinutes: row.minMinutes,
        byMetric: new Map(),
      };
      result.set(key, entry);
    }
    entry.byMetric.set(row.metric, {
      percentile: row.percentile,
      rawValue: row.rawValue === null ? null : Number(row.rawValue),
      sampleSize: row.sampleSize ?? row.peerGroupSampleSize,
    });
  }
  return result;
}

/** « Ailiers · Niveau 1 · 2022 — 34 joueurs, ≥ 600 min, saisons ± 2 ». */
export function describePeerGroup(group: RowPercentiles, seasonSpan: number): string {
  const n = group.peerGroupSampleSize;
  return `${group.peerGroupLabel} — ${n} joueur${n === 1 ? '' : 's'}, ≥ ${group.minMinutes} min, saisons ± ${seasonSpan}`;
}
