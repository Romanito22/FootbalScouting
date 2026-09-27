import { desc, eq, inArray } from 'drizzle-orm';
import {
  clubs, competitions, db, players, playerSeasonStats, scoutNotes, shortlistEntries, shortlists,
} from '@vivier/db';
import { MIN_MINUTES, type PositionGroup } from '@vivier/metrics';
import { fetchRowPercentiles, type RowPercentiles, statRowKey } from './percentiles';
import { type CompetitionStrength, fetchCompetitionStrengths } from './strength';

export { MAX_COMPARED, parseIds } from './compareIds';

export interface ComparedPlayer {
  id: number;
  fullName: string;
  positionGroup: PositionGroup;
  birthDate: string | null;
  nationality: string[] | null;
  foot: string | null;
  heightCm: number | null;
  contractUntil: string | null;
  marketValueEur: number | null;
  row: {
    season: string;
    minutes: number;
    matchesPlayed: number | null;
    metrics: Record<string, number>;
    competitionName: string;
    clubName: string;
  } | null;
  /** Ligne plus récente que celle comparée (sous le seuil, ou écartée par le
   * choix d'une saison commune) : signalée, jamais masquée. */
  newerRow: { season: string; minutes: number; competitionName: string } | null;
  tier: RowPercentiles | undefined;
  adjusted: RowPercentiles | undefined;
  competition: CompetitionStrength | undefined;
  notes: { count: number; latestRating: number | null; averageRating: number | null };
  shortlistStatuses: { shortlistName: string; status: string }[];
}

/**
 * `season` : aligne tout le monde sur la même saison quand c'est possible
 * (comparer une saison de PL à un Euro de 5 matchs biaise la lecture) ; à
 * défaut, saison exploitable la plus récente de chacun.
 */
export async function loadComparison(
  ids: number[], season: string | null = null,
): Promise<{ players: ComparedPlayer[]; commonSeasons: string[] }> {
  if (ids.length === 0) return { players: [], commonSeasons: [] };

  const playerRows = await db.select().from(players).where(inArray(players.id, ids));
  const statRows = await db
    .select({
      playerId: playerSeasonStats.playerId,
      season: playerSeasonStats.season,
      competitionId: playerSeasonStats.competitionId,
      clubId: playerSeasonStats.clubId,
      minutes: playerSeasonStats.minutes,
      matchesPlayed: playerSeasonStats.matchesPlayed,
      metrics: playerSeasonStats.metrics,
      competitionName: competitions.name,
      clubName: clubs.name,
    })
    .from(playerSeasonStats)
    .innerJoin(competitions, eq(competitions.id, playerSeasonStats.competitionId))
    .innerJoin(clubs, eq(clubs.id, playerSeasonStats.clubId))
    .where(inArray(playerSeasonStats.playerId, ids))
    .orderBy(desc(playerSeasonStats.season), desc(playerSeasonStats.minutes));

  const [tierByRow, adjustedByRow, strengths] = await Promise.all([
    fetchRowPercentiles(ids),
    fetchRowPercentiles(ids, undefined, 'adjusted'),
    fetchCompetitionStrengths(),
  ]);
  const strengthById = new Map(strengths.map((c) => [c.id, c]));

  const notes = await db
    .select({ playerId: scoutNotes.playerId, rating: scoutNotes.rating, createdAt: scoutNotes.createdAt })
    .from(scoutNotes)
    .where(inArray(scoutNotes.playerId, ids))
    .orderBy(desc(scoutNotes.createdAt));

  const statuses = await db
    .select({
      playerId: shortlistEntries.playerId,
      status: shortlistEntries.status,
      shortlistName: shortlists.name,
    })
    .from(shortlistEntries)
    .innerJoin(shortlists, eq(shortlists.id, shortlistEntries.shortlistId))
    .where(inArray(shortlistEntries.playerId, ids));

  // Saisons où TOUS les joueurs ont une ligne exploitable (≥ seuil).
  const eligibleSeasons = ids.map((id) => new Set(
    statRows.filter((r) => r.playerId === id && r.minutes >= MIN_MINUTES).map((r) => r.season),
  ));
  const commonSeasons = [...(eligibleSeasons[0] ?? [])]
    .filter((s) => eligibleSeasons.every((set) => set.has(s)))
    .sort()
    .reverse();

  // L'ordre de l'URL est l'ordre d'affichage (et donc des couleurs).
  const compared = ids.flatMap((id) => {
    const player = playerRows.find((p) => p.id === id);
    if (!player) return [];
    const rows = statRows.filter((r) => r.playerId === id);
    const eligible = rows.find((r) => r.minutes >= MIN_MINUTES);
    const inSeason = season
      ? rows.find((r) => r.season === season && r.minutes >= MIN_MINUTES)
      : undefined;
    const chosen = inSeason ?? eligible ?? rows[0];
    const newer = chosen && rows[0] && rows[0] !== chosen ? rows[0] : null;
    const ratings = notes.filter((n) => n.playerId === id && n.rating !== null).map((n) => n.rating as number);

    return [{
      id: player.id,
      fullName: player.fullName,
      positionGroup: player.positionGroup,
      birthDate: player.birthDate,
      nationality: player.nationality,
      foot: player.foot,
      heightCm: player.heightCm,
      contractUntil: player.contractUntil,
      marketValueEur: player.marketValueEur,
      row: chosen ? {
        season: chosen.season,
        minutes: chosen.minutes,
        matchesPlayed: chosen.matchesPlayed,
        metrics: chosen.metrics,
        competitionName: chosen.competitionName,
        clubName: chosen.clubName,
      } : null,
      newerRow: newer
        ? { season: newer.season, minutes: newer.minutes, competitionName: newer.competitionName }
        : null,
      tier: chosen ? tierByRow.get(statRowKey(chosen)) : undefined,
      adjusted: chosen ? adjustedByRow.get(statRowKey(chosen)) : undefined,
      competition: chosen ? strengthById.get(chosen.competitionId) : undefined,
      notes: {
        count: notes.filter((n) => n.playerId === id).length,
        latestRating: ratings[0] ?? null,
        averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      },
      shortlistStatuses: statuses.filter((s) => s.playerId === id),
    }];
  });
  return { players: compared, commonSeasons };
}
