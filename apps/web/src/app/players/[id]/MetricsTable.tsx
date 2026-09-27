import {
  METRIC_FAMILIES, METRIC_FAMILY_LABELS, type MetricDef,
} from '@vivier/metrics';
import { formatMetricValue } from '@/lib/format';
import type { MetricPercentile } from '@/lib/percentiles';

/**
 * Métriques per-90 d'une ligne de stats, groupées par famille, avec leur
 * percentile dans le groupe de pairs de la ligne. L'effectif réel du
 * classement est signalé quand une source ne fournit pas la métrique à tous.
 */
export function MetricsTable({
  metrics, definitions, percentiles, groupSampleSize,
}: {
  metrics: Record<string, number>;
  definitions: MetricDef[];
  percentiles: Map<string, MetricPercentile>;
  groupSampleSize: number | null;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-paper/20 text-left text-paper/50">
          <th className="py-1.5 font-normal">Métrique</th>
          <th className="py-1.5 text-right font-normal">Valeur</th>
          <th className="py-1.5 text-right font-normal">Percentile</th>
        </tr>
      </thead>
      {METRIC_FAMILIES.map((family) => {
        const defs = definitions.filter((d) => d.family === family && metrics[d.key] !== undefined);
        if (defs.length === 0) return null;
        return (
          <tbody key={family} className="font-mono">
            <tr>
              <td colSpan={3} className="pb-1 pt-4 font-sans text-xs uppercase tracking-wide text-paper/40">
                {METRIC_FAMILY_LABELS[family]}
              </td>
            </tr>
            {defs.map((def) => {
              const pct = percentiles.get(def.key);
              return (
                <tr key={def.key} className="border-b border-paper/10" title={def.note}>
                  <td className="py-1 font-sans text-paper/80">{def.label}</td>
                  <td className="py-1 text-right">{formatMetricValue(metrics[def.key] ?? 0, def.format)}</td>
                  <td className="py-1 text-right text-spotlight">
                    {pct ? `${pct.percentile}ᵉ` : '—'}
                    {pct && groupSampleSize !== null && pct.sampleSize !== groupSampleSize && (
                      <span className="ml-1 text-paper/40" title="Effectif réel du classement sur cette métrique (source partielle)">
                        n={pct.sampleSize}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </table>
  );
}
