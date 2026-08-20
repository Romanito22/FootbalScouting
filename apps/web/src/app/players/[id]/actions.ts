'use server';

import { revalidatePath } from 'next/cache';
import { db, scoutNotes } from '@vivier/db';

export async function addNote(formData: FormData) {
  const playerId = Number(formData.get('playerId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) throw new Error('Le corps de la note est requis.');

  const context = String(formData.get('context') ?? '').trim() || null;
  const observedAtRaw = String(formData.get('observedAt') ?? '').trim();
  const observedAt = observedAtRaw || null;
  const ratingRaw = String(formData.get('rating') ?? '').trim();
  const rating = ratingRaw ? Number(ratingRaw) : null;

  await db.insert(scoutNotes).values({ playerId, body, context, observedAt, rating });

  revalidatePath(`/players/${playerId}`);
}
