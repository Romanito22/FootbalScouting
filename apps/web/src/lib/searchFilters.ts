import { OUTFIELD_POSITION_GROUPS, type PositionGroup } from '@vivier/metrics';

export interface SearchFilters {
  positions: PositionGroup[];
  foot: 'left' | 'right' | 'both' | null;
  ageMin: number | null;
  ageMax: number | null;
  minutesMin: number | null;
  contractBefore: string | null; // ISO date
  marketValueMax: number | null;
  tier: number | null;
  metric: string | null;
  percentileMin: number | null;
  /** Référentiel du seuil de percentile : groupe de palier, ou toutes
   * compétitions ajusté de la force du championnat (phase 7). */
  percentileScope: 'tier' | 'adjusted';
}

export const EMPTY_FILTERS: SearchFilters = {
  positions: [],
  foot: null,
  ageMin: null,
  ageMax: null,
  minutesMin: null,
  contractBefore: null,
  marketValueMax: null,
  tier: null,
  metric: null,
  percentileMin: null,
  percentileScope: 'tier',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseSearchFilters(searchParams: RawSearchParams): SearchFilters {
  const positionsValue = searchParams.positions;
  const positionsRaw = Array.isArray(positionsValue)
    ? positionsValue
    : (positionsValue?.split(',') ?? []);
  const positions = positionsRaw.filter(
    (p): p is PositionGroup => (OUTFIELD_POSITION_GROUPS as readonly string[]).includes(p),
  );
  const foot = first(searchParams.foot);
  const scope = first(searchParams.percentileScope);

  return {
    positions,
    foot: foot === 'left' || foot === 'right' || foot === 'both' ? foot : null,
    ageMin: toInt(first(searchParams.ageMin)),
    ageMax: toInt(first(searchParams.ageMax)),
    minutesMin: toInt(first(searchParams.minutesMin)),
    contractBefore: first(searchParams.contractBefore) || null,
    marketValueMax: toInt(first(searchParams.marketValueMax)),
    tier: toInt(first(searchParams.tier)),
    metric: first(searchParams.metric) || null,
    percentileMin: toInt(first(searchParams.percentileMin)),
    percentileScope: scope === 'adjusted' ? 'adjusted' : 'tier',
  };
}

export function filtersToSearchParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.positions.length) params.set('positions', filters.positions.join(','));
  if (filters.foot) params.set('foot', filters.foot);
  if (filters.ageMin !== null) params.set('ageMin', String(filters.ageMin));
  if (filters.ageMax !== null) params.set('ageMax', String(filters.ageMax));
  if (filters.minutesMin !== null) params.set('minutesMin', String(filters.minutesMin));
  if (filters.contractBefore) params.set('contractBefore', filters.contractBefore);
  if (filters.marketValueMax !== null) params.set('marketValueMax', String(filters.marketValueMax));
  if (filters.tier !== null) params.set('tier', String(filters.tier));
  if (filters.metric) params.set('metric', filters.metric);
  if (filters.percentileMin !== null) params.set('percentileMin', String(filters.percentileMin));
  if (filters.percentileScope !== 'tier') params.set('percentileScope', filters.percentileScope);
  return params;
}
