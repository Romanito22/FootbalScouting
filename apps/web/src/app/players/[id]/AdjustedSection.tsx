import Link from 'next/link';
import { type MetricDef, METRICS, PEER_GROUP_SEASON_SPAN } from '@vivier/metrics';
import { IntervalBar } from '@/components/IntervalBar';
import { formatMetricValue } from '@/lib/format';
import { describePeerGroup, type RowPercentiles } from '@/lib/percentiles';
import {
  CI_LABEL, type CompetitionStrength, describeStrengthStatus, formatCoefWithInterval,
} from '@/lib/strength';

const ADJUSTED_METRICS: MetricDef[] = METRICS.filter((m) => m.leagueAdjusted);
const PERCENTILE_SCALE = { kind: 'linear' as const, min: 0, max: 100 };

/** Ligne « Force du championnat » d'une saison — estimation toujours avec son intervalle. */
export function LeagueStrengthLine({
  competition, referenceName,
}: {
  competition: Pick<CompetitionStrength, 'name' | 'coef' | 'low' | 'high' | 'status' | 'links'>;
  referenceName: string | null;
}) {
  const withInterval = formatCoefWithInterval(competition);
  return (
    <p className="mb-2 font-mono text-xs text-paper/60">
      Force du championnat :{' '}
      {competition.status === 'reference' ? (
        <span className="text-paper">1.00 (référence)</span>
      ) : withInterval ? (
        <>
          <span className="text-spotlight">{withInterval}</span> {CI_LABEL} · réf. {referenceName ?? '?'} = 1.00
        </>
      ) : (
        <span>{describeStrengthStatus(competition)}</span>
      )}{' '}
      <Link href="/competitions" className="underline hover:text-spotlight">détail</Link>
    </p>
  );
}

/**
 * Niveau « toutes compétitions » : valeur × coefficient de force de la
 * compétition, classée contre tous les joueurs du poste quel que soit leur
 * championnat. Chaque valeur et chaque percentile porte son intervalle de
 * confiance (incertitude sur la force des championnats, propagée par
 * bootstrap).
 */
export function AdjustedSection({
  group, competition, referenceName,
}: {
  group: RowPercentiles | undefined;
  competition: Pick<CompetitionStrength, 'name' | 'coef' | 'status' | 'links'>;
  referenceName: string | null;
}) {
  if (competition.coef === null) {
    return (
      <p className="mt-6 font-mono text-xs text-paper/50">
        Niveau toutes compétitions indisponible : force de {competition.name} {describeStrengthStatus(competition)}.
      </p>
    );
  }
  if (!group) {
    return (
      <p className="mt-6 font-mono text-xs text-paper/50">
        Niveau toutes compétitions pas encore calculé pour cette ligne (lancer compute_percentiles).
      </p>
    );
  }

  const rows = ADJUSTED_METRICS.flatMap((def) => {
    const pct = group.byMetric.get(def.key);
    return pct ? [{ def, pct }] : [];
  });

  return (
    <div className="mt-6">
      <h3 className="font-display text-base font-bold text-paper">Niveau ajusté — toutes compétitions</h3>
      <p className="mb-3 font-mono text-xs text-paper/60">
        vs {describePeerGroup(group, PEER_GROUP_SEASON_SPAN)} · valeurs exprimées en équivalent{' '}
        {referenceName ?? 'référence'} · {CI_LABEL}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-paper/20 text-left text-paper/50">
            <th className="py-1.5 font-normal">Métrique</th>
            <th className="py-1.5 text-right font-normal">Brut</th>
            <th className="py-1.5 text-right font-normal">Équiv. réf. [IC]</th>
            <th className="py-1.5 text-right font-normal">Percentile [IC]</th>
            <th className="py-1.5 pl-4 font-normal"><span className="sr-only">Intervalle du percentile</span></th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map(({ def, pct }) => {
            const low = pct.percentileLow ?? pct.percentile;
            const high = pct.percentileHigh ?? pct.percentile;
            return (
              <tr key={def.key} className="border-b border-paper/10">
                <td className="py-1 font-sans text-paper/80">{def.label}</td>
                <td className="py-1 text-right text-paper/60">
                  {pct.rawValue !== null ? formatMetricValue(pct.rawValue, def.format) : '—'}
                </td>
                <td className="py-1 text-right">
                  {pct.adjustedValue !== null ? formatMetricValue(pct.adjustedValue, def.format) : '—'}
                  {pct.adjustedLow !== null && pct.adjustedHigh !== null
                    && pct.adjustedLow !== pct.adjustedHigh && (
                    <span className="ml-1 text-paper/40">
                      [{formatMetricValue(pct.adjustedLow, def.format)} – {formatMetricValue(pct.adjustedHigh, def.format)}]
                    </span>
                  )}
                </td>
                <td className="py-1 text-right">
                  <span className="text-spotlight">{pct.percentile}ᵉ</span>
                  <span className="ml-1 text-paper/40">[{low} – {high}]</span>
                </td>
                <td className="py-1 pl-4">
                  <IntervalBar
                    value={pct.percentile}
                    low={low}
                    high={high}
                    scale={PERCENTILE_SCALE}
                    reference={50}
                    width={120}
                    height={12}
                    title={`${def.label} : ${pct.percentile}ᵉ percentile [${low} – ${high}] ${CI_LABEL}, sur ${pct.sampleSize} joueurs`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
