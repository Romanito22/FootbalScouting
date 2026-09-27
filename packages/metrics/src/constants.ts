/** En dessous, les per-90 sont du bruit statistique et ne doivent pas être affichées. */
export const MIN_MINUTES = 600;

/** Écart maximal entre deux saisons appartenant au même groupe de pairs. */
export const PEER_GROUP_SEASON_SPAN = 2;

/**
 * Modèle de force des championnats (phase 7). Partagé avec le pipeline via
 * l'export JSON : le pipeline estime avec ces paramètres, l'UI les affiche.
 *
 * - minMinutes : seuil d'une ligne (3 matchs complets) pour servir de « liaison » entre deux
 *   compétitions. Plus bas que MIN_MINUTES (qui gouverne l'AFFICHAGE des
 *   per-90) : un tournoi international plafonne vite à 3-7 matchs, et le
 *   bruit d'une ligne courte est absorbé par la pondération du modèle.
 * - maxSeasonGap : deux lignes d'un même joueur ne sont comparées qu'à une
 *   saison d'écart au plus (au-delà, l'évolution du joueur domine).
 * - minLinkPlayers : sous ce nombre de joueurs de liaison, une compétition
 *   n'est pas estimée (NULL affiché comme tel) plutôt que mal estimée.
 * - ciLevel : niveau de l'intervalle de confiance (bootstrap par joueur).
 */
export const LEAGUE_STRENGTH = {
  minMinutes: 270,
  maxSeasonGap: 1,
  minLinkPlayers: 5,
  ciLevel: 0.9,
  bootstrapSamples: 500,
} as const;

/** Groupes de poste — 8, pas 4. Doit rester synchronisé avec l'enum `position_group` de packages/db. */
export const POSITION_GROUPS = ['GK', 'DC', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'] as const;

export type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Groupes de poste hors gardiens — les gardiens ont un jeu de métriques séparé, jamais mélangé. */
export const OUTFIELD_POSITION_GROUPS = POSITION_GROUPS.filter((g) => g !== 'GK');

/** Libellés affichés — utilisés par l'app et par le pipeline (label des groupes de pairs). */
export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  GK: 'Gardiens',
  DC: 'Défenseurs centraux',
  FB: 'Latéraux',
  DM: 'Milieux défensifs',
  CM: 'Milieux centraux',
  AM: 'Milieux offensifs',
  W: 'Ailiers',
  ST: 'Attaquants',
};
