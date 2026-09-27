import { describe, expect, it } from 'vitest';
import { parseIds } from './compareIds';
import { EMPTY_FILTERS, filtersToSearchParams, parseSearchFilters } from './searchFilters';

describe('filtres de recherche', () => {
  it('survivent à un aller-retour URL (recherches sauvegardées relancées)', () => {
    const filters = parseSearchFilters({
      positions: 'CM,DM', foot: 'left', ageMin: '19', ageMax: '24', minutesMin: '900',
      contractBefore: '2027-06-30', marketValueMax: '6000000', tier: '2',
      metric: 'progressive_passes', percentileMin: '80', percentileScope: 'adjusted',
      sort: 'percentile',
    });
    const back = parseSearchFilters(Object.fromEntries(filtersToSearchParams(filters)));
    expect(back).toEqual(filters);
  });

  it('ignore les valeurs invalides plutôt que de les deviner', () => {
    const filters = parseSearchFilters({
      positions: 'CM,XX', foot: 'gauche', percentileScope: 'autre', sort: 'hasard', ageMax: 'abc',
    });
    expect(filters.positions).toEqual(['CM']);
    expect(filters.foot).toBeNull();
    expect(filters.percentileScope).toBe('tier');
    expect(filters.sort).toBe('minutes');
    expect(filters.ageMax).toBeNull();
  });

  it('ne sérialise pas les valeurs par défaut', () => {
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe('');
  });

  it('accepte les gardiens dans le filtre de poste', () => {
    expect(parseSearchFilters({ positions: 'GK' }).positions).toEqual(['GK']);
  });
});

describe('sélection de comparaison', () => {
  it('accepte liste séparée par virgules ou paramètres répétés', () => {
    expect(parseIds('3,1,2')).toEqual([3, 1, 2]);
    expect(parseIds(['3', '1'])).toEqual([3, 1]);
  });
  it('dédoublonne, ignore l’invalide, plafonne à 3 en gardant l’ordre', () => {
    expect(parseIds('5,5,x,-2,7,8,9')).toEqual([5, 7, 8]);
    expect(parseIds(undefined)).toEqual([]);
  });
});
