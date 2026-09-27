import { Bookmark } from 'lucide-react';
import { btnSecondary, field } from '@/components/ui';
import type { SearchFilters } from '@/lib/searchFilters';
import { saveSearch } from './actions';

export function SaveSearchForm({ filters }: { filters: SearchFilters }) {
  return (
    <form action={saveSearch} className="flex items-center gap-2">
      <input type="hidden" name="filters" value={JSON.stringify(filters)} />
      <input type="text" name="name" required placeholder="Nom de la recherche" aria-label="Nom de la recherche" className={`${field} w-52`} />
      <button type="submit" className={btnSecondary}><Bookmark size={15} /> Sauvegarder</button>
    </form>
  );
}
