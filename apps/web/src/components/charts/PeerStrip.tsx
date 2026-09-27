/**
 * Distribution du groupe de pairs sur une métrique : un point par pair
 * (discret), le joueur en accent avec anneau, la médiane en filet. Montre
 * ce qu'un percentile cache : un 90ᵉ percentile peut être à un cheveu du
 * peloton ou loin devant.
 */

export interface StripPoint {
  id: string;
  value: number;
}

// Décalage vertical déterministe (pas d'aléa au rendu serveur).
function jitter(index: number): number {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function PeerStrip({
  peers, playerValue, label, format, higherIsBetter, width = 320, height = 34,
}: {
  peers: StripPoint[];
  playerValue: number;
  label: string;
  format: (v: number) => string;
  higherIsBetter: boolean;
  width?: number;
  height?: number;
}) {
  if (peers.length === 0) return null;
  const values = peers.map((p) => p.value);
  const min = Math.min(...values, playerValue);
  const max = Math.max(...values, playerValue);
  const pad = 8;
  const span = max - min || 1;
  const x = (v: number) => pad + ((v - min) / span) * (width - 2 * pad);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mid = height / 2 - 2;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-paper/75">{label}</span>
        <span className="num shrink-0 font-mono text-paper">{format(playerValue)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height + 12}`} className="w-full" role="img"
        aria-label={`${label} : ${format(playerValue)} ; groupe de ${peers.length} joueurs, de ${format(min)} à ${format(max)}, médiane ${format(median)}${higherIsBetter ? '' : ' (moins = mieux)'}`}>
        <line x1={pad} x2={width - pad} y1={mid} y2={mid} stroke="var(--color-line)" strokeWidth={1} />
        <line x1={x(median)} x2={x(median)} y1={2} y2={height - 6} stroke="var(--color-paper)" strokeOpacity={0.45} strokeWidth={1} />
        {peers.map((p, i) => (
          <circle key={p.id} cx={x(p.value)} cy={mid + jitter(i) * 7} r={2.5} fill="var(--color-paper)" fillOpacity={0.28} />
        ))}
        <circle cx={x(playerValue)} cy={mid} r={5} fill="var(--color-spotlight)" stroke="var(--color-surface)" strokeWidth={2}>
          <title>{`${label} : ${format(playerValue)}`}</title>
        </circle>
        <text x={pad} y={height + 10} fontSize={9} fill="var(--color-paper)" fillOpacity={0.4} fontFamily="var(--font-mono)">
          {format(min)}
        </text>
        <text x={width - pad} y={height + 10} textAnchor="end" fontSize={9} fill="var(--color-paper)" fillOpacity={0.4} fontFamily="var(--font-mono)">
          {format(max)}{higherIsBetter ? '' : ' · moins = mieux'}
        </text>
      </svg>
    </figure>
  );
}
