/**
 * Barres de percentile — la lecture « rapport de scouting » : une barre par
 * métrique, longueur = percentile dans le groupe de pairs. Une seule couleur
 * (la longueur porte déjà la valeur ; la recolorer par niveau doublerait
 * l'encodage), repères 25/50/75 en filets, valeur brute ET percentile écrits
 * en texte : rien n'est réservé au survol.
 */

export interface PercentileBarRow {
  key: string;
  label: string;
  /** valeur brute déjà formatée (per-90, %, …) */
  value: string;
  percentile: number;
  /** effectif du classement si différent de celui du groupe */
  sampleSize?: number | null;
  note?: string;
  /** intervalle du percentile (groupes ajustés) */
  low?: number | null;
  high?: number | null;
}

export function PercentileBars({ rows, dense = false }: { rows: PercentileBarRow[]; dense?: boolean }) {
  return (
    <div role="table" aria-label="Percentiles par métrique" className="text-sm">
      {rows.map((row) => {
        const pct = Math.max(0, Math.min(100, row.percentile));
        const hasInterval = row.low != null && row.high != null && row.low !== row.high;
        return (
          <div
            key={row.key}
            role="row"
            className={`grid grid-cols-[minmax(0,11rem)_4.5rem_minmax(0,1fr)_3rem] items-center gap-3 ${dense ? 'py-1' : 'py-1.5'}`}
            title={row.note}
          >
            <div role="cell" className="truncate text-paper/80">{row.label}</div>
            <div role="cell" className="num text-right font-mono text-xs text-paper/60">{row.value}</div>
            <div role="cell" className="relative h-2.5 rounded-sm bg-raised" aria-hidden="true">
              {[25, 50, 75].map((t) => (
                <span
                  key={t}
                  className={`absolute inset-y-0 w-px ${t === 50 ? 'bg-paper/35' : 'bg-paper/12'}`}
                  style={{ left: `${t}%` }}
                />
              ))}
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-spotlight"
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
              {hasInterval && (
                // barre d'erreur par-dessus : lisible sur la barre comme sur le rail
                <span
                  className="absolute -inset-y-1 border-x-2 border-paper"
                  style={{ left: `${row.low}%`, width: `${(row.high ?? 0) - (row.low ?? 0)}%` }}
                >
                  <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-paper" />
                </span>
              )}
            </div>
            <div role="cell" className="num text-right text-xs font-semibold text-paper">
              {row.percentile}
              <span className="font-normal text-paper/45">ᵉ</span>
              {row.sampleSize != null && (
                <span className="block text-[10px] font-normal text-paper/35">n={row.sampleSize}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Légende d'échelle commune (une fois par bloc de barres). */
export function PercentileScale() {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_4.5rem_minmax(0,1fr)_3rem] gap-3 text-[10px] text-paper/35" aria-hidden="true">
      <span />
      <span />
      <div className="relative h-3">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: '50%' }}>médiane</span>
        <span className="absolute right-0">100</span>
      </div>
      <span />
    </div>
  );
}
