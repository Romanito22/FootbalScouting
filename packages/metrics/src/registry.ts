import type { PositionGroup } from './constants';

export type MetricFamily =
  | 'production' | 'creation' | 'progression'
  | 'possession' | 'defense' | 'discipline' | 'gk';

export interface MetricDef {
  key: string;
  label: string;              // libellé français affiché
  family: MetricFamily;
  per90: boolean;
  higherIsBetter: boolean;
  format: 'int' | 'dec1' | 'dec2' | 'pct';
  appliesTo: PositionGroup[];
  /** Renseigné si la métrique n'est pas fournie telle quelle par la source. */
  derivedFrom?: string[];
  note?: string;
}

export const METRICS: readonly MetricDef[] = [
  // Phase 0 : uniquement le squelette + le typage.
  // Le catalogue complet arrive en phase 1, en même temps que les données.
];
