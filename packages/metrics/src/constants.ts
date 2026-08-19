/** En dessous, les per-90 sont du bruit statistique et ne doivent pas être affichées. */
export const MIN_MINUTES = 600;

/** Écart maximal entre deux saisons appartenant au même groupe de pairs. */
export const PEER_GROUP_SEASON_SPAN = 2;

/** Groupes de poste — 8, pas 4. Doit rester synchronisé avec l'enum `position_group` de packages/db. */
export const POSITION_GROUPS = ['GK', 'DC', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'] as const;

export type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Groupes de poste hors gardiens — les gardiens ont un jeu de métriques séparé, jamais mélangé. */
export const OUTFIELD_POSITION_GROUPS = POSITION_GROUPS.filter((g) => g !== 'GK');
