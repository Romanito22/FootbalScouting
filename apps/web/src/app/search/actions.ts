'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, savedSearches } from '@vivier/db';
import { parseSearchFilters } from '@/lib/searchFilters';

export async function saveSearch(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Nom de recherche requis.');

  const filtersJson = String(formData.get('filters') ?? '{}');
  const raw = JSON.parse(filtersJson) as Record<string, string | string[] | undefined>;
  const filters = parseSearchFilters(raw);

  await db.insert(savedSearches).values({ name, filters });

  redirect('/search/saved');
}

export async function deleteSearch(formData: FormData) {
  const id = Number(formData.get('id'));
  await db.delete(savedSearches).where(eq(savedSearches.id, id));
  revalidatePath('/search/saved');
}

export async function touchSearch(id: number) {
  await db.update(savedSearches).set({ lastCheckedAt: new Date() }).where(eq(savedSearches.id, id));
}
