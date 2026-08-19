import { OUTFIELD_POSITION_GROUPS, type PositionGroup } from './constants';

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

const OUTFIELD = [...OUTFIELD_POSITION_GROUPS];

/**
 * Catalogue phase 1 : uniquement ce qui est calculable proprement depuis les
 * événements StatsBomb Open Data, sans heuristique de normalisation de
 * direction d'attaque (progression, touches par tiers). Ces familles-là
 * arrivent en phase 3 avec les stats FBref (déjà calculées par la source).
 * Gardiens exclus : jeu de métriques séparé, pas encore construit.
 */
export const METRICS: readonly MetricDef[] = [
  // ---- production ----
  {
    key: 'goals', label: 'Buts', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'np_goals', label: 'Buts hors pénalty', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['shot_outcome', 'shot_type'],
  },
  {
    key: 'shots', label: 'Tirs', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'xg', label: 'xG', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['shot_statsbomb_xg'],
  },
  {
    key: 'npxg', label: 'npxG', family: 'production', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
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
    derivedFrom: ['pass_shot_assist'],
  },
  {
    key: 'assists', label: 'Passes décisives', family: 'creation', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['pass_goal_assist'],
  },
  {
    key: 'xa', label: 'xA', family: 'creation', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
    derivedFrom: ['pass_assisted_shot_id', 'shot_statsbomb_xg'],
    note: 'Proxy : somme du xG des tirs consécutifs à une passe du joueur.',
  },

  // ---- possession ----
  {
    key: 'dribbles_attempted', label: 'Dribbles tentés', family: 'possession', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
  },
  {
    key: 'dribbles_completed', label: 'Dribbles réussis', family: 'possession', per90: true,
    higherIsBetter: true, format: 'dec2', appliesTo: OUTFIELD,
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
];
