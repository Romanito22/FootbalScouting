'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, shortlistEntries, shortlists } from '@vivier/db';

export async function createShortlist(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Nom de shortlist requis.');
  const brief = String(formData.get('brief') ?? '').trim() || null;

  const [shortlist] = await db.insert(shortlists).values({ name, brief }).returning({ id: shortlists.id });
  if (!shortlist) throw new Error('La création de la shortlist a échoué.');

  redirect(`/shortlists/${shortlist.id}`);
}

export async function deleteShortlist(formData: FormData) {
  const id = Number(formData.get('id'));
  await db.delete(shortlists).where(eq(shortlists.id, id));
  redirect('/shortlists');
}

export async function addPlayerToShortlist(formData: FormData) {
  const shortlistId = Number(formData.get('shortlistId'));
  const playerId = Number(formData.get('playerId'));

  await db
    .insert(shortlistEntries)
    .values({ shortlistId, playerId, status: 'a_observer' })
    .onConflictDoNothing();

  revalidatePath(`/shortlists/${shortlistId}`);
  revalidatePath(`/players/${playerId}`);
}

export async function removeEntry(formData: FormData) {
  const shortlistId = Number(formData.get('shortlistId'));
  const playerId = Number(formData.get('playerId'));

  await db
    .delete(shortlistEntries)
    .where(and(eq(shortlistEntries.shortlistId, shortlistId), eq(shortlistEntries.playerId, playerId)));

  revalidatePath(`/shortlists/${shortlistId}`);
}

export async function updateEntryStatus(formData: FormData) {
  const shortlistId = Number(formData.get('shortlistId'));
  const playerId = Number(formData.get('playerId'));
  const status = formData.get('status') as 'a_observer' | 'observe' | 'prioritaire' | 'ecarte';

  await db
    .update(shortlistEntries)
    .set({ status })
    .where(and(eq(shortlistEntries.shortlistId, shortlistId), eq(shortlistEntries.playerId, playerId)));

  revalidatePath(`/shortlists/${shortlistId}`);
}

export async function moveEntry(formData: FormData) {
  const shortlistId = Number(formData.get('shortlistId'));
  const playerId = Number(formData.get('playerId'));
  const direction = formData.get('direction') as 'up' | 'down';

  const entries = await db
    .select()
    .from(shortlistEntries)
    .where(eq(shortlistEntries.shortlistId, shortlistId))
    .orderBy(sql`${shortlistEntries.rank} NULLS LAST, ${shortlistEntries.addedAt}`);

  // Matérialise un rang explicite pour tout le monde dès le premier
  // déplacement : sans ça, un swap partiel (seulement les deux entrées
  // échangées) laisserait les autres à NULL et casserait l'ordre au
  // prochain tri (NULLS LAST les renverrait en fin de liste).
  const ordered = entries.map((e, i) => ({ ...e, rank: e.rank ?? i }));
  const index = ordered.findIndex((e) => e.playerId === playerId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;

  const rankSelf = ordered[index]!.rank;
  const rankOther = ordered[swapWith]!.rank;

  await Promise.all(ordered.map((e, i) => {
    const newRank = i === index ? rankOther : i === swapWith ? rankSelf : e.rank;
    return db.update(shortlistEntries).set({ rank: newRank })
      .where(and(eq(shortlistEntries.shortlistId, shortlistId), eq(shortlistEntries.playerId, e.playerId)));
  }));

  revalidatePath(`/shortlists/${shortlistId}`);
}
