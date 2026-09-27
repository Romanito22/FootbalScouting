import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { Bookmark, Play, Trash2 } from 'lucide-react';
import { db, savedSearches } from '@vivier/db';
import { btnDanger, btnPrimary, Card, Chip, EmptyState, link, PageHeader } from '@/components/ui';
import { filtersToSearchParams, parseSearchFilters } from '@/lib/searchFilters';
import { deleteSearch, touchSearch } from '../actions';

export const metadata = { title: 'Recherches sauvegardées' };

async function runSavedSearch(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const filtersJson = String(formData.get('filters'));
  await touchSearch(id);
  const filters = parseSearchFilters(JSON.parse(filtersJson));
  redirect(`/search?${filtersToSearchParams(filters).toString()}`);
}

/** Résumé lisible des critères (« CM, DM · ≤ 24 ans · passes progressives ≥ 80ᵉ »). */
function describe(filters: ReturnType<typeof parseSearchFilters>): string[] {
  const parts: string[] = [];
  if (filters.positions.length) parts.push(filters.positions.join(', '));
  if (filters.ageMin !== null || filters.ageMax !== null) parts.push(`${filters.ageMin ?? '…'}–${filters.ageMax ?? '…'} ans`);
  if (filters.minutesMin !== null) parts.push(`≥ ${filters.minutesMin} min`);
  if (filters.marketValueMax !== null) parts.push(`≤ ${(filters.marketValueMax / 1_000_000).toFixed(1)} M€`);
  if (filters.contractBefore) parts.push(`contrat < ${filters.contractBefore}`);
  if (filters.tier !== null) parts.push(`niveau ${filters.tier}`);
  if (filters.metric && filters.percentileMin !== null) parts.push(`${filters.metric} ≥ ${filters.percentileMin}ᵉ${filters.percentileScope === 'adjusted' ? ' (ajusté)' : ''}`);
  return parts;
}

export default async function SavedSearchesPage() {
  const searches = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader eyebrow="Décider" title="Recherches sauvegardées" description="Relance un besoin récurrent en un clic ; le tableau de bord signale les nouveaux profils depuis la dernière consultation." />
      {searches.length === 0 ? (
        <EmptyState icon={<Bookmark size={28} />} title="Aucune recherche sauvegardée">
          Compose une <Link href="/search" className={link}>recherche</Link> puis sauvegarde-la.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {searches.map((search) => {
            const filters = parseSearchFilters(search.filters as Record<string, string | string[] | undefined>);
            return (
              <Card key={search.id} title={search.name} subtitle={search.lastCheckedAt ? `dernière consultation le ${new Date(search.lastCheckedAt).toLocaleDateString('fr-FR')}` : 'jamais relancée'}>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {describe(filters).map((part) => <Chip key={part}>{part}</Chip>)}
                  {describe(filters).length === 0 && <Chip tone="muted">aucun filtre</Chip>}
                </div>
                <div className="flex gap-2">
                  <form action={runSavedSearch}>
                    <input type="hidden" name="id" value={search.id} />
                    <input type="hidden" name="filters" value={JSON.stringify(search.filters)} />
                    <button type="submit" className={btnPrimary}><Play size={14} /> Relancer</button>
                  </form>
                  <form action={deleteSearch}>
                    <input type="hidden" name="id" value={search.id} />
                    <button type="submit" className={btnDanger}><Trash2 size={14} /> Supprimer</button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
