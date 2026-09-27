import { OUTFIELD_POSITION_GROUPS, type PositionGroup } from './constants';

export type MetricFamily =
  | 'production' | 'creation' | 'progression'
  | 'possession' | 'defense' | 'discipline' | 'gk';

export const METRIC_FAMILY_LABELS: Record<MetricFamily, string> = {
  production: 'Production',
  creation: 'Création',
  progression: 'Progression',
  possession: 'Possession',
  defense: 'Défense',
  discipline: 'Discipline',
  gk: 'Gardien',
};

/** Ordre d'affichage des familles. */
export const METRIC_FAMILIES: readonly MetricFamily[] = [
  'production', 'creation', 'progression', 'possession', 'defense', 'discipline', 'gk',
];

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
  /**
   * Volume de production qui baisse mécaniquement face à une opposition plus
   * forte : sert d'indice pour estimer la force des championnats, et reçoit
   * un percentile « toutes compétitions » ajusté de cette force. Jamais sur
   * un ratio (xG/tir, taux de réussite), une différence ou une action
   * défensive (qui dépend surtout de la possession adverse).
   */
  leagueAdjusted?: boolean;
}

const OUTFIELD = [...OUTFIELD_POSITION_GROUPS];
const GK: PositionGroup[] = ['GK'];

/**
 * Catalogue. Phase 1 : production, création, possession, défense,
 * discipline. Phase 8 : progression, passe, jeu aérien, pressing, et le jeu
 * de métriques gardien (jamais mélangé à celui des joueurs de champ).
 *
 * Géométrie (StatsBomb, vérifiée sur données réelles) : terrain 120 × 80
 * yards, chaque équipe attaque vers x = 120 (coordonnées déjà normalisées
 * par la source — tous les tirs d'un match ont x ≥ 80). But adverse en
 * (120, 40) ; surface : x ≥ 102 et 18 ≤ y ≤ 62 ; dernier tiers : x ≥ 80.
 * « Jeu ouvert » = hors touche, coup franc, corner, six mètres, engagement.
 */
export const METRICS: readonly MetricDef[] = [
  // ---- production ----
  {
    key: 'goals', label: 'Buts', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
  },
  {
    key: 'np_goals', label: 'Buts hors pénalty', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['shot_outcome', 'shot_type'],
  },
  {
    key: 'shots', label: 'Tirs', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
  },
  {
    key: 'xg', label: 'xG', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['shot_statsbomb_xg'],
  },
  {
    key: 'npxg', label: 'npxG', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['shot_statsbomb_xg', 'shot_type'],
    note: 'xG hors penalties.',
  },
  {
    key: 'xg_per_shot', label: 'xG / tir', family: 'production', per90: false,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['xg', 'shots'],
  },
  {
    key: 'np_goals_minus_npxg', label: 'Buts (hors pen.) − npxG', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['np_goals', 'npxg'],
    note: 'Sur/sous-performance de la finition. Toujours afficher npxG à côté, jamais à la place.',
  },

  // ---- création ----
  {
    key: 'key_passes', label: 'Passes clés', family: 'creation', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['pass_shot_assist'],
  },
  {
    key: 'assists', label: 'Passes décisives', family: 'creation', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['pass_goal_assist'],
  },
  {
    key: 'xa', label: 'xA', family: 'creation', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['pass_assisted_shot_id', 'shot_statsbomb_xg'],
    note: 'Proxy : somme du xG des tirs consécutifs à une passe du joueur.',
  },

  // ---- progression ----
  {
    key: 'progressive_passes', label: 'Passes progressives', family: 'progression', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['location', 'pass_end_location', 'pass_outcome', 'pass_type'],
    note: 'Passe réussie en jeu ouvert qui rapproche le ballon du but adverse d\'au moins 25 % de sa distance initiale, et d\'au moins 10 yards.',
  },
  {
    key: 'progressive_carries', label: 'Conduites progressives', family: 'progression', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['location', 'carry_end_location'],
    note: 'Même règle que les passes progressives, appliquée aux conduites de balle.',
  },
  {
    key: 'passes_into_final_third', label: 'Passes vers le dernier tiers', family: 'progression', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['location', 'pass_end_location', 'pass_outcome', 'pass_type'],
    note: 'Passe réussie en jeu ouvert partant d\'avant x = 80 et arrivant au-delà.',
  },
  {
    key: 'passes_into_box', label: 'Passes dans la surface', family: 'progression', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['location', 'pass_end_location', 'pass_outcome', 'pass_type'],
    note: 'Passe réussie en jeu ouvert partant de hors de la surface adverse et y arrivant.',
  },

  // ---- possession ----
  {
    key: 'passes_completed', label: 'Passes réussies', family: 'possession', per90: true,
    higherIsBetter: true, format: 'dec1', appliesTo: OUTFIELD,
    derivedFrom: ['pass_outcome', 'pass_type'],
    note: 'Hors touches (qui gonfleraient mécaniquement les latéraux).',
  },
  {
    key: 'pass_completion_rate', label: 'Taux de passes réussies', family: 'possession', per90: false,
    higherIsBetter: true, format: 'pct', appliesTo: OUTFIELD,
    derivedFrom: ['pass_outcome', 'pass_type'],
    note: 'Hors touches. À lire avec le volume et la progression : un taux élevé de passes latérales ne vaut pas un taux moyen de passes qui cassent des lignes.',
  },
  {
    key: 'box_receptions', label: 'Réceptions dans la surface', family: 'possession', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
    derivedFrom: ['ball_receipt_outcome', 'location'],
  },
  {
    key: 'turnovers', label: 'Pertes de balle', family: 'possession', per90: true,
    higherIsBetter: false, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['Dispossessed', 'Miscontrol'],
    note: 'Dépossessions + contrôles manqués. À lire avec le volume de dribbles et de conduites : qui tente perd.',
  },
  {
    key: 'dribbles_attempted', label: 'Dribbles tentés', family: 'possession', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'dribbles_completed', label: 'Dribbles réussis', family: 'possession', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    leagueAdjusted: true,
  },
  {
    key: 'dribble_success_rate', label: 'Taux de réussite dribbles', family: 'possession', per90: false,
    higherIsBetter: true, format: 'pct', appliesTo: OUTFIELD,
    derivedFrom: ['dribbles_completed', 'dribbles_attempted'],
  },

  // ---- défense ----
  {
    key: 'tackles_attempted', label: 'Tacles tentés', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'tackles_won', label: 'Tacles réussis', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'interceptions', label: 'Interceptions', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'clearances', label: 'Dégagements', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'blocks', label: 'Contres', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'ball_recoveries', label: 'Ballons récupérés', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'pressures', label: 'Pressions', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec1', appliesTo: OUTFIELD,
    note: 'Dépend fortement du plan de jeu de l\'équipe (bloc haut ou bas) : un indicateur d\'activité, pas de qualité.',
  },
  {
    key: 'aerials_won', label: 'Duels aériens gagnés', family: 'defense', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['pass_aerial_won', 'shot_aerial_won', 'clearance_aerial_won', 'miscontrol_aerial_won'],
  },
  {
    key: 'aerial_win_rate', label: 'Taux de duels aériens gagnés', family: 'defense', per90: false,
    higherIsBetter: true, format: 'pct', appliesTo: OUTFIELD,
    derivedFrom: ['aerials_won', 'duel_type'],
  },

  // ---- discipline & fiabilité ----
  {
    key: 'fouls_committed', label: 'Fautes commises', family: 'discipline', per90: true,
    higherIsBetter: false, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'fouls_won', label: 'Fautes obtenues', family: 'discipline', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'yellow_cards', label: 'Cartons jaunes', family: 'discipline', per90: true,
    higherIsBetter: false, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'red_cards', label: 'Cartons rouges', family: 'discipline', per90: true,
    higherIsBetter: false, format: 'dec2', appliesTo: OUTFIELD,
  },

  // ---- gardiens (jeu séparé, jamais classé contre des joueurs de champ) ----
  {
    key: 'gk_goals_conceded', label: 'Buts encaissés', family: 'gk', per90: true,
    higherIsBetter: false, format: 'dec2', appliesTo: GK,
    derivedFrom: ['goalkeeper_type'],
    note: 'Penalties compris, buts contre son camp exclus (pas de son fait).',
  },
  {
    key: 'gk_saves', label: 'Arrêts', family: 'gk', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: GK,
    derivedFrom: ['goalkeeper_type'],
  },
  {
    key: 'gk_save_rate', label: 'Pourcentage d\'arrêts', family: 'gk', per90: false,
    higherIsBetter: true, format: 'pct', appliesTo: GK,
    derivedFrom: ['gk_saves', 'gk_goals_conceded'],
    note: 'Arrêts / tirs cadrés subis.',
  },
  {
    key: 'gk_goals_prevented', label: 'Buts évités (xG pré-tir)', family: 'gk', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: GK,
    derivedFrom: ['related_events', 'shot_statsbomb_xg', 'goalkeeper_type'],
    note: 'xG des tirs cadrés subis − buts encaissés. xG PRÉ-tir (StatsBomb Open Data n\'a pas de post-tir) : un tir cadré marque plus souvent que son xG, donc biais négatif commun à tous les gardiens — à lire en relatif (percentile), jamais en absolu.',
  },
  {
    key: 'gk_high_claims', label: 'Sorties aériennes', family: 'gk', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: GK,
    derivedFrom: ['goalkeeper_type', 'goalkeeper_outcome'],
    note: 'Ballons captés ou boxés (hors échecs).',
  },
  {
    key: 'gk_sweeper_actions', label: 'Sorties hors de la surface / libéro', family: 'gk', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: GK,
    derivedFrom: ['goalkeeper_type'],
  },
  {
    key: 'gk_pass_completion_rate', label: 'Taux de passes réussies (gardien)', family: 'gk', per90: false,
    higherIsBetter: true, format: 'pct', appliesTo: GK,
    derivedFrom: ['pass_outcome'],
  },
];

/**
 * Axes du radar par poste — le profil qui compte pour recruter À CE POSTE.
 * Défini ici, une seule fois, pour la fiche, le rapport, la recherche et la
 * comparaison. Chaque clé doit exister dans METRICS et s'appliquer au poste
 * (vérifié par les tests du paquet).
 */
export const RADAR_METRICS: Record<PositionGroup, readonly string[]> = {
  GK: [
    'gk_save_rate', 'gk_goals_prevented', 'gk_goals_conceded', 'gk_saves',
    'gk_high_claims', 'gk_sweeper_actions', 'gk_pass_completion_rate',
  ],
  DC: [
    'passes_completed', 'pass_completion_rate', 'progressive_passes', 'interceptions',
    'tackles_won', 'aerials_won', 'aerial_win_rate', 'clearances', 'blocks',
  ],
  FB: [
    'progressive_passes', 'progressive_carries', 'passes_into_box', 'key_passes', 'xa',
    'dribbles_completed', 'tackles_won', 'interceptions', 'pressures',
  ],
  DM: [
    'passes_completed', 'pass_completion_rate', 'progressive_passes', 'passes_into_final_third',
    'interceptions', 'tackles_won', 'ball_recoveries', 'pressures', 'aerials_won',
  ],
  CM: [
    'progressive_passes', 'progressive_carries', 'passes_into_final_third', 'key_passes', 'xa',
    'npxg', 'tackles_won', 'ball_recoveries', 'pressures',
  ],
  AM: [
    'npxg', 'shots', 'xa', 'key_passes', 'passes_into_box', 'progressive_carries',
    'dribbles_completed', 'box_receptions', 'pressures',
  ],
  W: [
    'npxg', 'shots', 'xa', 'key_passes', 'passes_into_box', 'progressive_carries',
    'dribbles_completed', 'box_receptions', 'turnovers',
  ],
  ST: [
    'np_goals', 'npxg', 'shots', 'xg_per_shot', 'box_receptions', 'xa',
    'aerials_won', 'pressures', 'turnovers',
  ],
};

/** Sous-ensemble compact (6 axes) pour les mini-radars des tables. */
export const COMPACT_RADAR_SIZE = 6;

const METRIC_INDEX = new Map(METRICS.map((m) => [m.key, m]));

export function getMetric(key: string): MetricDef | undefined {
  return METRIC_INDEX.get(key);
}

/** Métriques qui s'appliquent à un poste, dans l'ordre du catalogue. */
export function metricsForPosition(position: PositionGroup): MetricDef[] {
  return METRICS.filter((m) => m.appliesTo.includes(position));
}
