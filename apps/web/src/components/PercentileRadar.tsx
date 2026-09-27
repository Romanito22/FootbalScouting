/**
 * Le cadran de percentiles — signature visuelle de VIVIER (cf. CLAUDE.md /
 * spec §9) : bandes de fond marquant l'écart interquartile (25e-75e) du
 * groupe de pairs, silhouette fantôme de la médiane en pointillés, joueur en
 * trait plein. SVG custom : Recharts est trop rigide pour des bandes de
 * percentile par axe.
 *
 * `compact` : mini-radar sans grille ni libellés, pour une ligne de table
 * (écran Recherche, spec §8.1) — la même signature visuelle, réduite à sa
 * silhouette.
 */

interface RadarMetric {
  key: string;
  label: string;
  percentile: number;
}

function pointAt(
  index: number, count: number, percentile: number, center: number, maxRadius: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  const radius = (Math.max(0, Math.min(100, percentile)) / 100) * maxRadius;
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

function polygonPoints(count: number, percentile: number, center: number, maxRadius: number): string {
  return Array.from({ length: count }, (_, i) => {
    const { x, y } = pointAt(i, count, percentile, center, maxRadius);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function PercentileRadar({
  metrics, compact = false,
}: { metrics: RadarMetric[]; compact?: boolean }) {
  const n = metrics.length;
  if (n < 3) return null;

  const size = compact ? 64 : 440;
  const center = size / 2;
  const maxRadius = compact ? size / 2 - 2 : 165;
  const labelRadius = maxRadius + 18;

  const playerPoints = metrics
    .map((m, i) => pointAt(i, n, m.percentile, center, maxRadius))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  // Marge latérale pour les libellés longs (« Taux de passes réussies
  // (gardien) ») : sans elle, ils sortent du cadre à gauche et à droite.
  const sidePad = compact ? 0 : 120;

  return (
    <svg
      viewBox={`${-sidePad} 0 ${size + 2 * sidePad} ${size}`}
      className={compact ? 'h-16 w-16 shrink-0' : 'w-full max-w-2xl'}
      role="img"
      aria-label="Radar de percentiles"
    >
      {!compact && [25, 50, 75, 100].map((p) => (
        <polygon
          key={p}
          points={polygonPoints(n, p, center, maxRadius)}
          fill="none"
          stroke="var(--color-paper)"
          strokeOpacity={0.12}
          strokeWidth={1}
        />
      ))}

      {/* bande interquartile 25-75 du groupe de pairs */}
      <polygon points={polygonPoints(n, 75, center, maxRadius)} fill="var(--color-pitch)" fillOpacity={0.18} />
      <polygon points={polygonPoints(n, 25, center, maxRadius)} fill="var(--color-surface)" />

      {!compact && metrics.map((m, i) => {
        const { x, y } = pointAt(i, n, 100, center, maxRadius);
        return (
          <line
            key={m.key}
            x1={center} y1={center} x2={x} y2={y}
            stroke="var(--color-paper)" strokeOpacity={0.15} strokeWidth={1}
          />
        );
      })}

      {/* silhouette fantôme de la médiane */}
      <polygon
        points={polygonPoints(n, 50, center, maxRadius)}
        fill="none"
        stroke="var(--color-paper)"
        strokeOpacity={0.45}
        strokeWidth={compact ? 1 : 1.5}
        strokeDasharray={compact ? '2 2' : '4 3'}
      />

      {/* joueur, en trait plein */}
      <polygon
        points={playerPoints}
        fill="var(--color-spotlight)"
        fillOpacity={0.22}
        stroke="var(--color-spotlight)"
        strokeWidth={compact ? 1.25 : 2}
      />

      {!compact && metrics.map((m, i) => {
        const labelAngle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const lx = center + labelRadius * Math.cos(labelAngle);
        const ly = center + labelRadius * Math.sin(labelAngle);
        const anchor =
          Math.cos(labelAngle) > 0.15 ? 'start' : Math.cos(labelAngle) < -0.15 ? 'end' : 'middle';
        return (
          <text
            key={m.key}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="middle"
            fill="var(--color-paper)"
            fillOpacity={0.8}
            fontSize={14}
            fontFamily="var(--font-sans)"
          >
            {m.label}
          </text>
        );
      })}
    </svg>
  );
}
