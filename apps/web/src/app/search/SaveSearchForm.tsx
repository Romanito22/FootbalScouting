import type { SearchFilters } from '@/lib/searchFilters';
import { saveSearch } from './actions';

export function SaveSearchForm({ filters }: { filters: SearchFilters }) {
  return (
    <form action={saveSearch} className="flex items-center gap-2">
      <input type="hidden" name="filters" value={JSON.stringify(filters)} />
      <input
        type="text"
        name="name"
        required
        placeholder="Nom de la recherche"
        className="border border-paper/30 bg-ink px-2 py-1 text-sm text-paper"
      />
      <button type="submit" className="border border-pitch/50 px-3 py-1 text-sm text-pitch hover:border-pitch hover:bg-pitch/10">
        Sauvegarder
      </button>
    </form>
  );
}
