import { asc } from 'drizzle-orm';
import { competitions, db } from '@vivier/db';
import { LEAGUE_STRENGTH } from '@vivier/metrics';

export type StrengthStatus =
  | 'reference' | 'estimated' | 'insufficient_links' | 'disconnected' | 'unstable';

export interface CompetitionStrength {
  id: number;
  name: string;
  country: string;
  tier: number;
  coef: number | null;
  low: number | null;
  high: number | null;
  status: StrengthStatus | null;
  links: number | null;
  modelVersion: string | null;
  computedAt: Date | null;
}

const CI_PERCENT = Math.round(LEAGUE_STRENGTH.ciLevel * 100);
export const CI_LABEL = `IC ${CI_PERCENT} %`;

/** Pourquoi une compétition a (ou n'a pas) de coefficient — toujours dit à l'utilisateur. */
export function describeStrengthStatus(c: Pick<CompetitionStrength, 'status' | 'links'>): string {
  const links = c.links ?? 0;
  switch (c.status) {
    case 'reference':
      return 'référence (1 par définition)';
    case 'estimated':
      return `estimé sur ${links} joueur${links === 1 ? '' : 's'} de liaison`;
    case 'insufficient_links':
      return `non estimé : ${links} joueur${links === 1 ? '' : 's'} de liaison (minimum ${LEAGUE_STRENGTH.minLinkPlayers})`;
    case 'disconnected':
      return 'non estimé : aucune chaîne de transferts vers la référence';
    case 'unstable':
      return `non estimé : instable (${links} liaisons, estimable dans moins de la moitié des tirages bootstrap)`;
    case null:
      return 'jamais calculé (lancer compute_strength)';
  }
}

export function formatCoef(value: number): string {
  return value.toFixed(2);
}

/** « 0.98 [0.84 – 1.13] » */
export function formatCoefWithInterval(c: Pick<CompetitionStrength, 'coef' | 'low' | 'high'>): string | null {
  if (c.coef === null || c.low === null || c.high === null) return null;
  return `${formatCoef(c.coef)} [${formatCoef(c.low)} – ${formatCoef(c.high)}]`;
}

function num(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export async function fetchCompetitionStrengths(): Promise<CompetitionStrength[]> {
  const rows = await db.select().from(competitions).orderBy(asc(competitions.name));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    country: c.country,
    tier: c.tier,
    coef: num(c.strengthCoef),
    low: num(c.strengthCoefLow),
    high: num(c.strengthCoefHigh),
    status: c.strengthStatus,
    links: c.strengthLinks,
    modelVersion: c.strengthModelVersion,
    computedAt: c.strengthComputedAt,
  }));
}

export function referenceOf(all: CompetitionStrength[]): CompetitionStrength | undefined {
  return all.find((c) => c.status === 'reference');
}
