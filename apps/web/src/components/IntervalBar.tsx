/**
 * Estimation + intervalle de confiance sur un axe — la forme imposée par
 * CLAUDE.md pour toute sortie de modèle (« toujours accompagnée de son
 * intervalle »). Point plein pour l'estimation, trait fin pour l'intervalle,
 * repère pointillé pour la valeur de référence. SVG serveur, tooltip natif
 * (<title>) : la valeur exacte reste lisible sans JavaScript.
 */

export interface IntervalScale {
  min: number;
  max: number;
  kind: 'linear' | 'log';
}

export function scalePosition(value: number, scale: IntervalScale, width: number): number {
  const clamped = Math.min(scale.max, Math.max(scale.min, value));
  const t = scale.kind === 'log'
    ? (Math.log(clamped) - Math.log(scale.min)) / (Math.log(scale.max) - Math.log(scale.min))
    : (clamped - scale.min) / (scale.max - scale.min);
  return t * width;
}

const PAD = 6;

export function IntervalBar({
  value, low, high, scale, reference, width = 200, height = 16, title,
}: {
  value: number;
  low: number;
  high: number;
  scale: IntervalScale;
  reference?: number;
  width?: number;
  height?: number;
  title: string;
}) {
  const inner = width - 2 * PAD;
  const x = (v: number) => PAD + scalePosition(v, scale, inner);
  const mid = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={title}
      className="block overflow-visible"
    >
      <title>{title}</title>
      {/* rail recessif : l'étendue de l'axe */}
      <line x1={PAD} x2={width - PAD} y1={mid} y2={mid} stroke="var(--color-paper)" strokeOpacity={0.12} strokeWidth={1} />
      {reference !== undefined && (
        <line
          x1={x(reference)} x2={x(reference)} y1={1} y2={height - 1}
          stroke="var(--color-paper)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 2"
        />
      )}
      <line
        x1={x(low)} x2={x(high)} y1={mid} y2={mid}
        stroke="var(--color-paper)" strokeOpacity={0.7} strokeWidth={2} strokeLinecap="round"
      />
      <circle cx={x(value)} cy={mid} r={4.5} fill="var(--color-spotlight)" stroke="var(--color-surface)" strokeWidth={2} />
    </svg>
  );
}

/** Graduations d'un axe partagé par plusieurs IntervalBar (même échelle, même largeur). */
export function IntervalAxis({
  scale, ticks, width = 200, format,
}: {
  scale: IntervalScale;
  ticks: number[];
  width?: number;
  format: (v: number) => string;
}) {
  const inner = width - 2 * PAD;
  return (
    <svg viewBox={`0 0 ${width} 14`} width={width} height={14} aria-hidden="true" className="block overflow-visible">
      {ticks.map((t) => (
        <text
          key={t}
          x={PAD + scalePosition(t, scale, inner)}
          y={10}
          textAnchor="middle"
          fontSize={9}
          fontFamily="var(--font-mono)"
          fill="var(--color-paper)"
          fillOpacity={0.5}
        >
          {format(t)}
        </text>
      ))}
    </svg>
  );
}
