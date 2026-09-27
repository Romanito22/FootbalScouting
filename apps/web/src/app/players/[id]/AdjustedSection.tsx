import Link from 'next/link';
import { type MetricDef, METRICS, PEER_GROUP_SEASON_SPAN } from '@vivier/metrics';
import { PercentileBars, PercentileScale } from '@/components/charts/PercentileBars';
import { Chip } from '@/components/ui';
import { formatMetricValue } from '@/lib/format';
import { describePeerGroup, type RowPercentiles } from '@/lib/percentiles';
import {
  CI_LABEL, type CompetitionStrength, describeStrengthStatus, formatCoefWithInterval,
} from '@/lib/strength';

const ADJUSTED_METRICS: MetricDef[] = METRICS.filter((m) => m.leagueAdjusted);

/** Force du championnat d'une saison — estimation toujours avec son intervalle. */
export function LeagueStrengthLine({
  competition, referenceName,
}: {
  competition: Pick<CompetitionStrength, 'name' | 'coef' | 'low' | 'high' | 'status' | 'links'>;
  referenceName: string | null;
}) {
  const withInterval = formatCoefWithInterval(competition);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-paper/60">
      <span>Force du championnat</span>
      {competition.status === 'reference' ? (
        <Chip tone="neutral">1.00 · référence</Chip>
      ) : withInterval ? (
        <>
          <Chip tone="accent">{withInterval}</Chip>
          <span className="text-paper/40">{CI_LABEL} · réf. {referenceName ?? '?'} = 1.00</span>
        </>
      ) : (
        <Chip tone="muted">{describeStrengthStatus(competition)}</Chip>
      )}
      <Link href="/competitions" className="text-paper/40 underline hover:text-spotlight">détail</Link>
    </div>
  );
}

/**
 * Niveau « toutes compétitions » : valeur × coefficient de force de la
 * compétition, classée contre tous les joueurs du poste quel que soit leur
 * championnat. Chaque valeur et chaque percentile porte son intervalle de
 * confiance (incertitude sur la force des championnats, propagée par
 * bootstrap) — tracé en filet sur la barre, écrit en clair à côté.
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
      <p className="text-sm text-paper/55">
        Indisponible : la force de {competition.name} n'est pas estimée ({describeStrengthStatus(competition)}).
        Le joueur reste comparé à son seul palier.
      </p>
    );
  }
  if (!group) {
    return <p className="text-sm text-paper/55">Pas encore calculé pour cette ligne (lancer pnpm pipeline:refresh).</p>;
  }

  const rows = ADJUSTED_METRICS.flatMap((def) => {
    const pct = group.byMetric.get(def.key);
    if (!pct) return [];
    const low = pct.percentileLow ?? pct.percentile;
    const high = pct.percentileHigh ?? pct.percentile;
    const value = pct.adjustedValue !== null ? formatMetricValue(pct.adjustedValue, def.format) : '—';
    const interval = pct.adjustedLow !== null && pct.adjustedHigh !== null && pct.adjustedLow !== pct.adjustedHigh
      ? ` [${formatMetricValue(pct.adjustedLow, def.format)} – ${formatMetricValue(pct.adjustedHigh, def.format)}]`
      : '';
    return [{
      key: def.key,
      label: def.label,
      value,
      percentile: pct.percentile,
      low,
      high,
      note: `Brut ${pct.rawValue !== null ? formatMetricValue(pct.rawValue, def.format) : '—'} → équivalent ${referenceName ?? 'référence'} ${value}${interval} · percentile ${pct.percentile}ᵉ [${low} – ${high}] ${CI_LABEL}, sur ${pct.sampleSize} joueurs`,
    }];
  });

  return (
    <div>
      <p className="mb-4 text-xs text-paper/55">
        vs {describePeerGroup(group, PEER_GROUP_SEASON_SPAN)} · valeurs en équivalent {referenceName ?? 'référence'} ·
        barre d'erreur = {CI_LABEL} du percentile (détail chiffré ci-dessous)
      </p>
      <PercentileBars rows={rows} />
      <div className="mt-1"><PercentileScale /></div>
      <table className="mt-5 w-full text-xs">
        <caption className="mb-1 text-left text-paper/45">Détail chiffré</caption>
        <thead>
          <tr className="border-b border-line text-left text-paper/45">
            <th className="py-1 font-normal">Métrique</th>
            <th className="py-1 text-right font-normal">Brut</th>
            <th className="py-1 text-right font-normal">Équiv. réf. [IC]</th>
            <th className="py-1 text-right font-normal">Percentile [IC]</th>
          </tr>
        </thead>
        <tbody className="num font-mono">
          {ADJUSTED_METRICS.map((def) => {
            const pct = group.byMetric.get(def.key);
            if (!pct) return null;
            return (
              <tr key={def.key} className="border-b border-line/60">
                <td className="py-1 font-sans text-paper/75">{def.label}</td>
                <td className="py-1 text-right text-paper/55">{pct.rawValue !== null ? formatMetricValue(pct.rawValue, def.format) : '—'}</td>
                <td className="py-1 text-right text-paper">
                  {pct.adjustedValue !== null ? formatMetricValue(pct.adjustedValue, def.format) : '—'}
                  {pct.adjustedLow !== null && pct.adjustedHigh !== null && pct.adjustedLow !== pct.adjustedHigh && (
                    <span className="ml-1 text-paper/40">[{formatMetricValue(pct.adjustedLow, def.format)} – {formatMetricValue(pct.adjustedHigh, def.format)}]</span>
                  )}
                </td>
                <td className="py-1 text-right text-paper">
                  {pct.percentile}ᵉ <span className="text-paper/40">[{pct.percentileLow ?? pct.percentile} – {pct.percentileHigh ?? pct.percentile}]</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
