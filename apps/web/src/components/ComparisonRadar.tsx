/**
 * Radar superposé de la comparaison. Même signature que PercentileRadar
 * (bande interquartile, médiane fantôme) ; chaque joueur a sa couleur ET
 * son motif de trait (encodage secondaire : l'identité ne repose jamais sur
 * la couleur seule, cf. légende et table de valeurs sous le radar).
 */

export const SERIES_COLORS = [
  'var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)',
] as const;
export const SERIES_DASHES = [undefined, '7 4', '2 3'] as const;

export interface RadarSeries {
  name: string;
  /** percentile par clé d'axe — l'appelant ne passe que des axes mesurés pour TOUS les joueurs (jamais un 0 inventé) */
  percentiles: Map<string, number>;
}

function point(index: number, count: number, percentile: number, center: number, radius: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  const r = (Math.max(0, Math.min(100, percentile)) / 100) * radius;
  return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
}

function ring(count: number, percentile: number, center: number, radius: number): string {
  return Array.from({ length: count }, (_, i) => {
    const { x, y } = point(i, count, percentile, center, radius);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function ComparisonRadar({
  axes, series,
}: {
  axes: { key: string; label: string }[];
  series: RadarSeries[];
}) {
  const n = axes.length;
  if (n < 3 || series.length === 0) return null;
  const size = 520;
  const center = size / 2;
  const radius = 175;
  const labelRadius = radius + 18;

  return (
    // marge latérale : les libellés longs ne doivent jamais sortir du cadre
    <svg viewBox={`-120 0 ${size + 240} ${size}`} className="w-full max-w-3xl" role="img" aria-label="Radar de comparaison des percentiles">
      {[25, 50, 75, 100].map((p) => (
        <polygon key={p} points={ring(n, p, center, radius)} fill="none" stroke="var(--color-paper)" strokeOpacity={0.12} strokeWidth={1} />
      ))}
      <polygon points={ring(n, 75, center, radius)} fill="var(--color-pitch)" fillOpacity={0.12} />
      <polygon points={ring(n, 25, center, radius)} fill="var(--color-surface)" />
      {axes.map((a, i) => {
        const { x, y } = point(i, n, 100, center, radius);
        return <line key={a.key} x1={center} y1={center} x2={x} y2={y} stroke="var(--color-paper)" strokeOpacity={0.15} strokeWidth={1} />;
      })}
      <polygon points={ring(n, 50, center, radius)} fill="none" stroke="var(--color-paper)" strokeOpacity={0.4} strokeWidth={1.25} strokeDasharray="4 3" />

      {series.map((s, si) => {
        const pts = axes.map((a, i) => point(i, n, s.percentiles.get(a.key) ?? 0, center, radius));
        const color = SERIES_COLORS[si] ?? SERIES_COLORS[0];
        return (
          <g key={s.name}>
            <title>{s.name}</title>
            <polygon
              points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill={color}
              fillOpacity={0.07}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={SERIES_DASHES[si]}
              strokeLinejoin="round"
            />
            {pts.map((p, i) => (
              <circle key={axes[i]?.key} cx={p.x} cy={p.y} r={3.5} fill={color} stroke="var(--color-ink)" strokeWidth={1.5}>
                <title>{`${s.name} — ${axes[i]?.label} : ${s.percentiles.has(axes[i]?.key ?? '') ? `${s.percentiles.get(axes[i]?.key ?? '')}ᵉ` : 'non mesuré'}`}</title>
              </circle>
            ))}
          </g>
        );
      })}

      {axes.map((a, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const lx = center + labelRadius * Math.cos(angle);
        const ly = center + labelRadius * Math.sin(angle);
        const anchor = Math.cos(angle) > 0.15 ? 'start' : Math.cos(angle) < -0.15 ? 'end' : 'middle';
        return (
          <text key={a.key} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fill="var(--color-paper)" fillOpacity={0.8} fontSize={14} fontFamily="var(--font-sans)">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Échantillon de trait pour la légende : même couleur, même motif. */
export function SeriesSwatch({ index }: { index: number }) {
  return (
    <svg width={28} height={10} aria-hidden="true" className="inline-block align-middle">
      <line
        x1={1} x2={27} y1={5} y2={5}
        stroke={SERIES_COLORS[index] ?? SERIES_COLORS[0]}
        strokeWidth={2.5}
        strokeDasharray={SERIES_DASHES[index]}
      />
    </svg>
  );
}
