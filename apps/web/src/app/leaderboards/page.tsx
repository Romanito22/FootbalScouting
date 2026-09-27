import Link from 'next/link';
import { Trophy } from 'lucide-react';
import {
  getMetric, metricsForPosition, type PositionGroup, POSITION_GROUP_LABELS, POSITION_GROUPS,
  RADAR_METRICS,
} from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { btnPrimary, Card, Chip, EmptyState, field, label, PageHeader } from '@/components/ui';
import { MAX_COMPARED } from '@/lib/compareIds';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { formatMetricValue } from '@/lib/format';
import { fetchLeaderboard, leaderboardSeasons } from '@/lib/leaderboards';
import { CI_LABEL } from '@/lib/strength';

export const metadata = { title: 'Classements' };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const rawPosition = first(params.position);
  const position: PositionGroup = (POSITION_GROUPS as readonly string[]).includes(rawPosition ?? '')
    ? (rawPosition as PositionGroup)
    : 'W';
  const scope = first(params.scope) === 'adjusted' ? 'adjusted' : 'tier';
  const available = metricsForPosition(position).filter((m) => scope === 'tier' || m.leagueAdjusted);
  const requestedMetric = first(params.metric);
  const metric = available.find((m) => m.key === requestedMetric)?.key
    ?? RADAR_METRICS[position].find((k) => available.some((m) => m.key === k))
    ?? available[0]?.key
    ?? 'npxg';
  const def = getMetric(metric);
  const seasons = await leaderboardSeasons(position);
  const season = seasons.find((s) => s.season === first(params.season))?.season ?? seasons[0]?.season ?? null;
  const rows = season ? await fetchLeaderboard({ position, season, metric, scope }) : [];

  const href = (overrides: Record<string, string>) => {
    const next = new URLSearchParams({ position, metric, scope, ...(season ? { season } : {}), ...overrides });
    return `/leaderboards?${next.toString()}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow="Explorer"
        title="Classements"
        description="Les meilleurs d'un poste sur une métrique, saison par saison. Chaque percentile est relatif au groupe de pairs indiqué sur sa ligne ; en « toutes compétitions », la valeur est corrigée de la force du championnat et le percentile porte son intervalle."
      />

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Poste">
        {POSITION_GROUPS.map((pg) => (
          <Link
            key={pg}
            role="tab"
            aria-selected={pg === position}
            href={`/leaderboards?${new URLSearchParams({ position: pg, scope }).toString()}`}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              pg === position ? 'border-spotlight/60 bg-spotlight/10 text-paper' : 'border-line text-paper/60 hover:text-paper'
            }`}
          >
            {POSITION_GROUP_LABELS[pg]}
          </Link>
        ))}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="position" value={position} />
        <label className={`${label} w-64`}>
          Métrique
          <select name="metric" defaultValue={metric} className={`${field} mt-1`}>
            {available.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <label className={`${label} w-56`}>
          Saison (groupe centré sur)
          <select name="season" defaultValue={season ?? ''} className={`${field} mt-1`}>
            {seasons.map((s) => <option key={s.season} value={s.season}>{s.season}</option>)}
          </select>
        </label>
        <label className={`${label} w-72`}>
          Comparé à
          <select name="scope" defaultValue={scope} className={`${field} mt-1`}>
            <option value="tier">son palier (même niveau)</option>
            <option value="adjusted">toutes compétitions, ajusté de la force</option>
          </select>
        </label>
        <button type="submit" className={btnPrimary}>Afficher</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<Trophy size={28} />} title="Rien à classer">
          {scope === 'adjusted'
            ? 'Aucun groupe « toutes compétitions » pour ce poste et cette saison : il faut des championnats dont la force est estimée.'
            : 'Aucun joueur de ce poste au-dessus de 600 minutes pour cette saison.'}
        </EmptyState>
      ) : (
        <Card
          padded={false}
          title={`${def?.label ?? metric} — ${POSITION_GROUP_LABELS[position]} · ${season}`}
          subtitle={`${def?.per90 ? 'per-90' : 'taux'}${def?.higherIsBetter === false ? ' · moins = mieux' : ''}${scope === 'adjusted' ? ` · valeurs en équivalent référence · ${CI_LABEL}` : ''}${def?.note ? ` · ${def.note}` : ''}`}
          action={
            <form id="compare-form" action="/compare" method="get">
              <button type="submit" className={btnPrimary}>Comparer la sélection (≤ {MAX_COMPARED})</button>
            </form>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-paper/50">
                  <th className="w-8 px-4 py-2"><span className="sr-only">Comparer</span></th>
                  <th className="w-10 py-2 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Joueur</th>
                  <th className="py-2 pr-3 font-medium">Compétition · club</th>
                  <th className="py-2 pr-3 text-right font-medium">Âge</th>
                  <th className="py-2 pr-3 text-right font-medium">Min.</th>
                  <th className="py-2 pr-3 text-right font-medium">Valeur</th>
                  <th className="w-64 py-2 pr-3 font-medium">Percentile</th>
                  <th className="py-2 pr-4 font-medium">Contrat</th>
                </tr>
              </thead>
              <tbody className="num">
                {rows.map((row, i) => {
                  const value = scope === 'adjusted' && row.adjustedValue !== null ? row.adjustedValue : row.rawValue;
                  const age = ageOn(row.birthDate);
                  return (
                    <tr key={`${row.playerId}|${row.season}`} className="border-b border-line/60 hover:bg-raised/50">
                      <td className="px-4 py-2">
                        <input type="checkbox" name="ids" value={row.playerId} form="compare-form" aria-label={`Comparer ${row.fullName}`} />
                      </td>
                      <td className="py-2 font-mono text-paper/40">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <Link href={`/players/${row.playerId}`} className="font-medium text-paper hover:text-spotlight">{row.fullName}</Link>
                      </td>
                      <td className="py-2 pr-3 text-paper/60">
                        {row.competitionName}
                        <span className="text-paper/40"> · {row.clubName}</span>
                        <div className="text-[11px] text-paper/35" title="Groupe de pairs de la ligne">vs {row.peerGroupLabel} (n={row.peerGroupSampleSize})</div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-paper/70">{age ?? '—'}</td>
                      <td className="py-2 pr-3 text-right font-mono text-paper/70">{row.minutes}</td>
                      <td className="py-2 pr-3 text-right font-mono font-semibold text-paper" title={`Valeur marchande : ${formatMarketValue(row.marketValueEur)}`}>
                        {def ? formatMetricValue(value, def.format) : value.toFixed(2)}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="relative h-2 flex-1 rounded-sm bg-raised" aria-hidden="true">
                            <span className="absolute inset-y-0 w-px bg-paper/30" style={{ left: '50%' }} />
                            {row.percentileLow !== null && row.percentileHigh !== null && row.percentileLow !== row.percentileHigh && (
                              <span className="absolute top-1/2 h-px -translate-y-1/2 bg-paper/60" style={{ left: `${row.percentileLow}%`, width: `${row.percentileHigh - row.percentileLow}%` }} />
                            )}
                            <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-spotlight" style={{ width: `${Math.max(row.percentile, 1.5)}%` }} />
                          </div>
                          <span className="w-20 text-right text-xs text-paper">
                            {row.percentile}ᵉ
                            {row.percentileLow !== null && row.percentileHigh !== null && (
                              <span className="text-paper/40"> [{row.percentileLow}–{row.percentileHigh}]</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4"><ContractBadge contractUntil={row.contractUntil} compact /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-2.5 text-xs text-paper/45">
            {rows.length} joueur(s) · ≥ 600 min · <Chip tone="muted">tri : percentile puis valeur</Chip>
            {' '}<Link href={href({ scope: scope === 'tier' ? 'adjusted' : 'tier' })} className="underline hover:text-spotlight">
              {scope === 'tier' ? 'voir toutes compétitions (ajusté)' : 'voir par palier'}
            </Link>
          </div>
        </Card>
      )}
    </main>
  );
}
