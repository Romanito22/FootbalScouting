import { contractAlert, formatContract } from '@/lib/contract';

const STYLES = {
  expired: 'border-spotlight bg-spotlight/20 text-spotlight',
  urgent: 'border-spotlight bg-spotlight/15 text-spotlight',
  soon: 'border-spotlight/50 text-spotlight',
  none: 'border-transparent text-paper/60',
  unknown: 'border-transparent text-paper/30',
} as const;

const PREFIX = {
  expired: 'libre · ',
  urgent: '≤ 6 mois · ',
  soon: '≤ 12 mois · ',
  none: '',
  unknown: '',
} as const;

/** Fin de contrat, avec alerte textuelle (jamais la couleur seule). */
export function ContractBadge({ contractUntil }: { contractUntil: string | null }) {
  const alert = contractAlert(contractUntil);
  return (
    <span className={`whitespace-nowrap border px-1 font-mono text-xs ${STYLES[alert]}`}>
      {PREFIX[alert]}{formatContract(contractUntil)}
    </span>
  );
}
