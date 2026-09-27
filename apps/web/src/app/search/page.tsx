import Link from 'next/link';
import { SearchX } from 'lucide-react';
import {
  getMetric, METRICS, MIN_MINUTES, POSITION_GROUP_LABELS, POSITION_GROUPS,
} from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { PercentileRadar } from '@/components/PercentileRadar';
import { btnGhost, btnPrimary, Card, EmptyState, field, label, PageHeader } from '@/components/ui';
import { MAX_COMPARED } from '@/lib/compareIds';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { statRowKey } from '@/lib/percentiles';
import { parseSearchFilters, SEARCH_SORTS } from '@/lib/searchFilters';
import { runSearch } from '@/lib/searchQuery';
import { SaveSearchForm } from './SaveSearchForm';

export const metadata = { title: 'Recherche' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseSearchFilters(rawParams);
  const { rows, radarByRow } = await runSearch(filters);
  const metricDef = filters.metric ? getMetric(filters.metric) : undefined;

  return (
    <main className="mx-auto max-w-[96rem] px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow="Décider"
        title="Recherche"
        description="Des contraintes de recrutement aux profils : poste, âge, contrat, budget, niveau, et un seuil de percentile sur la métrique qui compte pour le besoin."
        actions={<Link href="/search/saved" className={btnGhost}>Recherches sauvegardées →</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <form method="get" className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-6">
          <fieldset>
            <legend className={label}>Poste</legend>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {POSITION_GROUPS.map((pg) => (
                <label key={pg} className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-2 py-1 text-xs text-paper/80 has-[:checked]:border-spotlight/60 has-[:checked]:bg-spotlight/10 has-[:checked]:text-paper">
                  <input type="checkbox" name="positions" value={pg} defaultChecked={filters.positions.includes(pg)} className="accent-[var(--color-spotlight)]" />
                  {POSITION_GROUP_LABELS[pg]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Âge min<input type="number" name="ageMin" defaultValue={filters.ageMin ?? ''} className={`${field} mt-1`} /></label>
            <label className={label}>Âge max<input type="number" name="ageMax" defaultValue={filters.ageMax ?? ''} className={`${field} mt-1`} /></label>
          </div>
          <label className={label}>
            Pied
            <select name="foot" defaultValue={filters.foot ?? ''} className={`${field} mt-1`}>
              <option value="">Indifférent</option>
              <option value="left">Gauche</option>
              <option value="right">Droit</option>
              <option value="both">Ambidextre</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Minutes min<input type="number" name="minutesMin" defaultValue={filters.minutesMin ?? ''} placeholder={String(MIN_MINUTES)} className={`${field} mt-1`} /></label>
            <label className={label}>Niveau<input type="number" name="tier" defaultValue={filters.tier ?? ''} placeholder="1" className={`${field} mt-1`} /></label>
          </div>
          <label className={label}>Fin de contrat avant<input type="date" name="contractBefore" defaultValue={filters.contractBefore ?? ''} className={`${field} mt-1`} /></label>
          <label className={label}>Valeur marchande max (€)<input type="number" name="marketValueMax" defaultValue={filters.marketValueMax ?? ''} placeholder="6000000" className={`${field} mt-1`} /></label>

          <div className="space-y-3 border-t border-line pt-4">
            <label className={label}>
              Métrique
              <select name="metric" defaultValue={filters.metric ?? ''} className={`${field} mt-1`}>
                <option value="">—</option>
                {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}{m.leagueAdjusted ? ' *' : ''}</option>)}
              </select>
            </label>
            <label className={label}>Percentile min<input type="number" name="percentileMin" min={0} max={100} defaultValue={filters.percentileMin ?? ''} placeholder="80" className={`${field} mt-1`} /></label>
            <label className={label}>
              Mesuré contre
              <select name="percentileScope" defaultValue={filters.percentileScope} className={`${field} mt-1`}>
                <option value="tier">son palier (même niveau)</option>
                <option value="adjusted">toutes compétitions, ajusté *</option>
              </select>
            </label>
            <p className="text-[11px] leading-snug text-paper/40">
              * volume offensif corrigé de la force du championnat ; seuil appliqué à l'estimation
              ponctuelle, l'intervalle est sur la fiche.
            </p>
          </div>

          <label className={label}>
            Trier par
            <select name="sort" defaultValue={filters.sort} className={`${field} mt-1`}>
              {Object.entries(SEARCH_SORTS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} flex-1 justify-center`}>Filtrer</button>
            <Link href="/search" className={btnGhost}>Réinitialiser</Link>
          </div>
        </form>

        <Card
          padded={false}
          title={`${rows.length} résultat${rows.length === 1 ? '' : 's'}${rows.length === 200 ? ' (limite atteinte — affine les filtres)' : ''}`}
          subtitle={metricDef ? `percentile : ${metricDef.label}, contre ${filters.percentileScope === 'adjusted' ? 'toutes compétitions (ajusté)' : 'le palier'}` : 'une ligne par saison-compétition'}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <form id="compare-form" action="/compare" method="get">
                <button type="submit" className={btnPrimary}>Comparer (≤ {MAX_COMPARED})</button>
              </form>
              <SaveSearchForm filters={filters} />
            </div>
          }
        >
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<SearchX size={28} />} title="Aucun profil ne passe ces filtres">
                Élargis l'âge ou le budget, baisse le seuil de percentile, ou retire le niveau de championnat.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-paper/50">
                    <th className="w-8 px-4 py-2"><span className="sr-only">Comparer</span></th>
                    <th className="py-2 pr-3 font-medium">Joueur</th>
                    <th className="py-2 pr-3 text-right font-medium">Âge</th>
                    <th className="py-2 pr-3 font-medium">Saison</th>
                    <th className="py-2 pr-3 text-right font-medium">Min.</th>
                    {metricDef && <th className="w-40 py-2 pr-3 font-medium">{metricDef.label}</th>}
                    <th className="py-2 pr-3 font-medium">Contrat</th>
                    <th className="py-2 pr-3 text-right font-medium">Valeur</th>
                    <th className="py-2 pr-4 font-medium">Profil</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {rows.map((row) => {
                    const radar = radarByRow.get(statRowKey(row));
                    return (
                      <tr key={statRowKey(row)} className="border-b border-line/60 hover:bg-raised/50">
                        <td className="px-4 py-2">
                          <input type="checkbox" name="ids" value={row.playerId} form="compare-form" aria-label={`Comparer ${row.fullName}`} />
                        </td>
                        <td className="min-w-52 py-2 pr-3">
                          <Link href={`/players/${row.playerId}`} className="font-medium text-paper hover:text-spotlight">{row.fullName}</Link>
                          <div className="text-xs text-paper/45">
                            {POSITION_GROUP_LABELS[row.positionGroup]}
                            {row.nationality && row.nationality.length > 0 && ` · ${row.nationality.join(', ')}`}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-paper/70">{ageOn(row.birthDate) ?? '—'}</td>
                        <td className="py-2 pr-3">
                          <div className="whitespace-nowrap text-paper/80">{row.competitionName} · {row.season}</div>
                          <div className="text-xs text-paper/40">{row.clubName} · niveau {row.tier}</div>
                          {radar && (
                            <div className="text-[11px] text-paper/35" title="Groupe de pairs de la ligne : tous ses percentiles y sont relatifs">
                              vs {radar.peerGroupLabel} · n={radar.peerGroupSampleSize}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-paper/70">{row.minutes}</td>
                        {metricDef && (
                          <td className="py-2 pr-3">
                            {row.metricPercentile !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="relative h-2 flex-1 rounded-sm bg-raised" aria-hidden="true">
                                  <span className="absolute inset-y-0 w-px bg-paper/30" style={{ left: '50%' }} />
                                  <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-spotlight" style={{ width: `${Math.max(row.metricPercentile, 1.5)}%` }} />
                                </div>
                                <span className="w-9 text-right text-xs text-paper">{row.metricPercentile}ᵉ</span>
                              </div>
                            ) : <span className="text-xs text-paper/30">—</span>}
                          </td>
                        )}
                        <td className="py-2 pr-3"><ContractBadge contractUntil={row.contractUntil} compact /></td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right font-mono text-paper/80">{formatMarketValue(row.marketValueEur)}</td>
                        <td className="py-1.5 pr-4">
                          {radar && radar.metrics.length >= 3 ? (
                            <div title={`Percentiles vs ${radar.peerGroupLabel} (${radar.peerGroupSampleSize} joueurs) : ${radar.metrics.map((m) => `${m.label} ${m.percentile}ᵉ`).join(', ')}`}>
                              <PercentileRadar metrics={radar.metrics} compact />
                            </div>
                          ) : (
                            <span className="text-[10px] text-paper/30">{row.minutes < MIN_MINUTES ? `< ${MIN_MINUTES} min` : 'non calculé'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
