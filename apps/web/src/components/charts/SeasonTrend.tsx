/**
 * Évolution d'un percentile au fil des saisons (petits multiples, une
 * métrique par vignette, même échelle 0-100). Chaque point est relatif au
 * groupe de pairs de SA saison — la légende le rappelle.
 */

export interface TrendPoint {
  label: string; // « PL 2015-2016 »
  percentile: number;
}

export function SeasonTrend({
  title, points, width = 180, height = 64,
}: {
  title: string;
  points: TrendPoint[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const padX = 8;
  const padY = 6;
  const x = (i: number) => padX + (i / (points.length - 1)) * (width - 2 * padX);
  const y = (p: number) => padY + (1 - p / 100) * (height - 2 * padY);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.percentile).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.percentile - first.percentile : 0;

  return (
    <figure className="min-w-0 rounded-lg border border-line bg-ink/40 p-3">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-paper/75">{title}</span>
        <span className="num shrink-0 font-semibold text-paper">
          {last?.percentile}ᵉ
          <span className={`ml-1 font-normal ${delta >= 0 ? 'text-paper/50' : 'text-paper/50'}`}>
            ({delta >= 0 ? '+' : ''}{delta})
          </span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img"
        aria-label={`${title} : ${points.map((p) => `${p.label} ${p.percentile}ᵉ`).join(', ')}`}>
        <line x1={padX} x2={width - padX} y1={y(50)} y2={y(50)} stroke="var(--color-line)" strokeWidth={1} />
        <path d={path} fill="none" stroke="var(--color-spotlight)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.percentile)} r={4} fill="var(--color-spotlight)" stroke="var(--color-ink)" strokeWidth={2} />
            <circle cx={x(i)} cy={y(p.percentile)} r={12} fill="transparent">
              <title>{`${p.label} : ${p.percentile}ᵉ percentile`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] text-paper/35">
        <span>{first?.label}</span>
        <span>{last?.label}</span>
      </div>
    </figure>
  );
}
