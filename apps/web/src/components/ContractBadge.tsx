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

/** Fin de contrat, avec alerte textuelle (jamais la couleur seule).
 * `compact` : dans une table, un contrat inconnu s'écrit « — ». */
export function ContractBadge({
  contractUntil, compact = false,
}: {
  contractUntil: string | null;
  compact?: boolean;
}) {
  const alert = contractAlert(contractUntil);
  if (compact && alert === 'unknown') {
    return <span className="text-xs text-paper/30" title="Date de fin de contrat inconnue (import Transfermarkt)">—</span>;
  }
  return (
    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-xs ${STYLES[alert]}`}>
      {PREFIX[alert]}{formatContract(contractUntil)}
    </span>
  );
}
