import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { db, savedSearches } from '@vivier/db';
import { parseSearchFilters, filtersToSearchParams } from '@/lib/searchFilters';
import { deleteSearch, touchSearch } from '../actions';

async function runSavedSearch(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const filtersJson = String(formData.get('filters'));
  await touchSearch(id);
  const filters = parseSearchFilters(JSON.parse(filtersJson));
  redirect(`/search?${filtersToSearchParams(filters).toString()}`);
}

export default async function SavedSearchesPage() {
  const searches = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-paper">
        Recherches sauvegardées
      </h1>

      {searches.length === 0 && (
        <p className="text-paper/60">
          Aucune recherche sauvegardée pour l'instant — sauvegarde-en une depuis /search.
        </p>
      )}

      {searches.map((search) => (
        <div key={search.id} className="mb-3 flex items-center justify-between border-b border-paper/10 pb-3">
          <div>
            <p className="text-paper">{search.name}</p>
            <p className="font-mono text-xs text-paper/50">
              {search.lastCheckedAt
                ? `dernière consultation ${new Date(search.lastCheckedAt).toLocaleDateString('fr-FR')}`
                : 'jamais relancée'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action={runSavedSearch}>
              <input type="hidden" name="id" value={search.id} />
              <input type="hidden" name="filters" value={JSON.stringify(search.filters)} />
              <button type="submit" className="border border-spotlight px-3 py-1 text-sm text-spotlight hover:bg-spotlight/10">
                Relancer
              </button>
            </form>
            <form action={deleteSearch}>
              <input type="hidden" name="id" value={search.id} />
              <button type="submit" className="border border-signal/50 px-3 py-1 text-sm text-signal hover:border-signal hover:bg-signal/10">
                Supprimer
              </button>
            </form>
          </div>
        </div>
      ))}
    </main>
  );
}
