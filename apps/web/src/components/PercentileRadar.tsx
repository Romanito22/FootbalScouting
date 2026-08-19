/**
 * Le cadran de percentiles — signature visuelle de VIVIER (cf. CLAUDE.md /
 * spec §9) : bandes de fond marquant l'écart interquartile (25e-75e) du
 * groupe de pairs, silhouette fantôme de la médiane en pointillés, joueur en
 * trait plein. SVG custom : Recharts est trop rigide pour des bandes de
 * percentile par axe.
 */

interface RadarMetric {
  key: string;
  label: string;
  percentile: number;
}

const SIZE = 480;
const CENTER = SIZE / 2;
const MAX_RADIUS = 110;
const LABEL_RADIUS = MAX_RADIUS + 35;

function pointAt(index: number, count: number, percentile: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  const radius = (Math.max(0, Math.min(100, percentile)) / 100) * MAX_RADIUS;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function polygonPoints(count: number, percentile: number): string {
  return Array.from({ length: count }, (_, i) => {
    const { x, y } = pointAt(i, count, percentile);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function PercentileRadar({ metrics }: { metrics: RadarMetric[] }) {
  const n = metrics.length;
  if (n < 3) return null;

  const playerPoints = metrics
    .map((m, i) => pointAt(i, n, m.percentile))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-md" role="img" aria-label="Radar de percentiles">
      {/* grille de référence : quartiles */}
      {[25, 50, 75, 100].map((p) => (
        <polygon
          key={p}
          points={polygonPoints(n, p)}
          fill="none"
          stroke="var(--color-paper)"
          strokeOpacity={0.12}
          strokeWidth={1}
        />
      ))}

      {/* bande interquartile 25-75 du groupe de pairs */}
      <polygon points={polygonPoints(n, 75)} fill="var(--color-pitch)" fillOpacity={0.18} />
      <polygon points={polygonPoints(n, 25)} fill="var(--color-ink)" />

      {/* axes */}
      {metrics.map((m, i) => {
        const { x, y } = pointAt(i, n, 100);
        return (
          <line
            key={m.key}
            x1={CENTER} y1={CENTER} x2={x} y2={y}
            stroke="var(--color-paper)" strokeOpacity={0.15} strokeWidth={1}
          />
        );
      })}

      {/* silhouette fantôme de la médiane */}
      <polygon
        points={polygonPoints(n, 50)}
        fill="none"
        stroke="var(--color-paper)"
        strokeOpacity={0.45}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />

      {/* joueur, en trait plein */}
      <polygon
        points={playerPoints}
        fill="var(--color-spotlight)"
        fillOpacity={0.22}
        stroke="var(--color-spotlight)"
        strokeWidth={2}
      />

      {/* labels d'axe */}
      {metrics.map((m, i) => {
        const labelAngle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const lx = CENTER + LABEL_RADIUS * Math.cos(labelAngle);
        const ly = CENTER + LABEL_RADIUS * Math.sin(labelAngle);
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
            fontSize={11}
            fontFamily="var(--font-sans)"
          >
            {m.label}
          </text>
        );
      })}
    </svg>
  );
}
