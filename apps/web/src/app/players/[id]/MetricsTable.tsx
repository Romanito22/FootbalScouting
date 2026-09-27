import {
  METRIC_FAMILIES, METRIC_FAMILY_LABELS, type MetricDef,
} from '@vivier/metrics';
import { PercentileBars, PercentileScale } from '@/components/charts/PercentileBars';
import { SectionTitle } from '@/components/ui';
import { formatMetricValue } from '@/lib/format';
import type { MetricPercentile } from '@/lib/percentiles';

/**
 * Toutes les métriques per-90 d'une ligne de stats, par famille, en barres
 * de percentile dans le groupe de pairs de la ligne. L'effectif réel du
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
    <div className="grid gap-x-10 gap-y-6 xl:grid-cols-2">
      {METRIC_FAMILIES.map((family) => {
        const defs = definitions.filter((d) => d.family === family && metrics[d.key] !== undefined);
        if (defs.length === 0) return null;
        return (
          <div key={family}>
            <SectionTitle>{METRIC_FAMILY_LABELS[family]}</SectionTitle>
            <PercentileBars
              dense
              rows={defs.flatMap((def) => {
                const pct = percentiles.get(def.key);
                if (!pct) return [];
                return [{
                  key: def.key,
                  label: def.label,
                  value: formatMetricValue(metrics[def.key] ?? 0, def.format),
                  percentile: pct.percentile,
                  sampleSize: groupSampleSize !== null && pct.sampleSize !== groupSampleSize ? pct.sampleSize : null,
                  note: [def.higherIsBetter ? null : 'Moins = mieux (déjà intégré au percentile).', def.note]
                    .filter(Boolean).join(' '),
                }];
              })}
            />
          </div>
        );
      })}
      <div className="xl:col-span-2"><PercentileScale /></div>
    </div>
  );
}
