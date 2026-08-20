'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db, players, playerAliases, resolutionQueue } from '@vivier/db';
import type { PositionGroup } from '@vivier/metrics';

/**
 * L'admin ne fait que trancher l'identité (créer un alias, ou un nouveau
 * joueur). Il n'écrit jamais player_season_stats : une fois l'alias créé,
 * le prochain run du pipeline retrouve l'enregistrement via
 * player_aliases (cf. resolve_or_queue, outcome "already_known") et
 * termine l'écriture des stats normalement.
 */

async function markResolved(entryId: number) {
  await db.update(resolutionQueue).set({ resolvedAt: new Date() }).where(eq(resolutionQueue.id, entryId));
  revalidatePath('/admin/resolution-queue');
}

export async function attachToExistingPlayer(formData: FormData) {
  const entryId = Number(formData.get('entryId'));
  const playerId = Number(formData.get('playerId'));

  const [entry] = await db.select().from(resolutionQueue).where(eq(resolutionQueue.id, entryId));
  if (!entry) throw new Error('Entrée de file d\'attente introuvable.');

  await db.insert(playerAliases).values({
    playerId,
    source: entry.source,
    sourceId: entry.sourceId,
    rawName: entry.rawName,
    confidence: null,
    resolvedManually: true,
  });

  await markResolved(entryId);
}

export async function createNewPlayer(formData: FormData) {
  const entryId = Number(formData.get('entryId'));
  const positionGroup = formData.get('positionGroup') as PositionGroup;

  const [entry] = await db.select().from(resolutionQueue).where(eq(resolutionQueue.id, entryId));
  if (!entry) throw new Error('Entrée de file d\'attente introuvable.');

  const payload = entry.rawPayload as Record<string, unknown>;
  const birthDate = typeof payload.birth_date === 'string' ? payload.birth_date : null;
  const nationality = Array.isArray(payload.nationality) ? (payload.nationality as string[]) : [];

  const [player] = await db
    .insert(players)
    .values({
      fullName: entry.rawName,
      normalizedName: sql<string>`lower(unaccent(${entry.rawName}))`,
      birthDate,
      nationality,
      positionGroup,
      sourceIds: { [entry.source]: entry.sourceId },
    })
    .returning({ id: players.id });
  if (!player) throw new Error('La création du joueur a échoué.');

  await db.insert(playerAliases).values({
    playerId: player.id,
    source: entry.source,
    sourceId: entry.sourceId,
    rawName: entry.rawName,
    confidence: null,
    resolvedManually: true,
  });

  await markResolved(entryId);
}
