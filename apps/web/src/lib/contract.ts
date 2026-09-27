/**
 * Situation contractuelle — le levier de prix d'un recrutement : un joueur
 * en fin de contrat coûte moins cher (ou rien) et son club est pressé de
 * vendre. `spotlight` (cf. globals.css) est réservé à ces alertes.
 */

/** Fin de contrat sous ce délai : alerte (fenêtre de négociation / Bosman). */
export const CONTRACT_ALERT_MONTHS = 12;
/** Fin de contrat sous ce délai : alerte forte (libre au prochain mercato). */
export const CONTRACT_URGENT_MONTHS = 6;

export type ContractAlert = 'expired' | 'urgent' | 'soon' | 'none' | 'unknown';

export function monthsUntil(isoDate: string, today: Date = new Date()): number {
  const end = new Date(`${isoDate}T00:00:00Z`);
  return (end.getUTCFullYear() - today.getUTCFullYear()) * 12
    + (end.getUTCMonth() - today.getUTCMonth())
    + (end.getUTCDate() - today.getUTCDate()) / 31;
}

export function contractAlert(contractUntil: string | null, today: Date = new Date()): ContractAlert {
  if (!contractUntil) return 'unknown';
  const months = monthsUntil(contractUntil, today);
  if (months < 0) return 'expired';
  if (months <= CONTRACT_URGENT_MONTHS) return 'urgent';
  if (months <= CONTRACT_ALERT_MONTHS) return 'soon';
  return 'none';
}

export function formatContract(contractUntil: string | null): string {
  if (!contractUntil) return 'contrat inconnu';
  return new Date(`${contractUntil}T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function ageOn(birthDate: string | null, today: Date = new Date()): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth()
    || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function formatMarketValue(eur: number | null): string {
  if (eur === null) return '—';
  if (eur >= 1_000_000) return `${(eur / 1_000_000).toFixed(1)} M€`;
  if (eur >= 1_000) return `${Math.round(eur / 1_000)} k€`;
  return `${eur} €`;
}
