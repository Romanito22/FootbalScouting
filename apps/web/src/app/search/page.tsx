import Link from 'next/link';
import { METRICS, MIN_MINUTES, OUTFIELD_POSITION_GROUPS, POSITION_GROUP_LABELS } from '@vivier/metrics';
import { PercentileRadar } from '@/components/PercentileRadar';
import { parseSearchFilters } from '@/lib/searchFilters';
import { statRowKey } from '@/lib/percentiles';
import { runSearch } from '@/lib/searchQuery';
import { SaveSearchForm } from './SaveSearchForm';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseSearchFilters(rawParams);
  const { rows, radarByRow } = await runSearch(filters);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-paper">Recherche</h1>
        <Link href="/search/saved" className="font-mono text-xs text-paper/50 underline hover:text-spotlight">
          recherches sauvegardées →
        </Link>
      </div>

      <form method="get" className="mb-8 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-paper/15 pb-6 sm:grid-cols-4">
        <fieldset className="col-span-2 sm:col-span-4">
          <legend className="mb-1 text-xs text-paper/50">Poste</legend>
          <div className="flex flex-wrap gap-3">
            {OUTFIELD_POSITION_GROUPS.map((pg) => (
              <label key={pg} className="flex items-center gap-1 text-sm text-paper">
                <input
                  type="checkbox"
                  name="positions"
                  value={pg}
                  defaultChecked={filters.positions.includes(pg)}
                />
                {POSITION_GROUP_LABELS[pg]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-xs text-paper/50">
          Pied
          <select name="foot" defaultValue={filters.foot ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper">
            <option value="">Indifférent</option>
            <option value="left">Gauche</option>
            <option value="right">Droit</option>
            <option value="both">Ambidextre</option>
          </select>
        </label>

        <label className="text-xs text-paper/50">
          Âge min
          <input type="number" name="ageMin" defaultValue={filters.ageMin ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Âge max
          <input type="number" name="ageMax" defaultValue={filters.ageMax ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Minutes min
          <input type="number" name="minutesMin" defaultValue={filters.minutesMin ?? ''} placeholder={String(MIN_MINUTES)} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>

        <label className="text-xs text-paper/50">
          Fin de contrat avant
          <input type="date" name="contractBefore" defaultValue={filters.contractBefore ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Valeur marchande max (€)
          <input type="number" name="marketValueMax" defaultValue={filters.marketValueMax ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Niveau de championnat
          <input type="number" name="tier" defaultValue={filters.tier ?? ''} placeholder="1" className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>

        <label className="text-xs text-paper/50">
          Métrique
          <select name="metric" defaultValue={filters.metric ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper">
            <option value="">—</option>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}{m.leagueAdjusted ? ' *' : ''}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-paper/50">
          Percentile mesuré contre
          <select name="percentileScope" defaultValue={filters.percentileScope} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper">
            <option value="tier">son palier (même niveau)</option>
            <option value="adjusted">toutes compétitions, ajusté *</option>
          </select>
        </label>
        <label className="text-xs text-paper/50">
          Percentile min
          <input type="number" name="percentileMin" min={0} max={100} defaultValue={filters.percentileMin ?? ''} className="mt-1 w-full border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>

        <div className="col-span-2 flex items-end justify-between gap-4 sm:col-span-4">
          <button type="submit" className="border border-spotlight px-4 py-1.5 text-sm text-spotlight hover:bg-spotlight/10">
            Filtrer
          </button>
          <p className="text-right text-xs text-paper/40">
            * « toutes compétitions, ajusté » : métriques de volume offensif uniquement, valeurs
            corrigées de la force du championnat (seuil appliqué à l'estimation ponctuelle —
            l'intervalle est sur la fiche joueur).
          </p>
        </div>
      </form>

      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs text-paper/50">{rows.length} résultat(s)</p>
        <SaveSearchForm filters={filters} />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-paper/20 text-left text-paper/50">
            <th className="py-1.5 font-normal">Nom</th>
            <th className="py-1.5 font-normal">Poste</th>
            <th className="py-1.5 font-normal">Équipe</th>
            <th className="py-1.5 font-normal">Saison</th>
            <th className="py-1.5 text-right font-normal">Minutes</th>
            <th className="py-1.5 font-normal"></th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr key={statRowKey(row)} className="border-b border-paper/10 hover:bg-surface">
              <td className="py-1.5 font-sans">
                <Link href={`/players/${row.playerId}`} className="hover:text-spotlight">
                  {row.fullName}
                </Link>
              </td>
              <td className="py-1.5">{POSITION_GROUP_LABELS[row.positionGroup as keyof typeof POSITION_GROUP_LABELS]}</td>
              <td className="py-1.5 font-sans">{row.clubName}</td>
              <td className="py-1.5">{row.season}</td>
              <td className="py-1.5 text-right">{row.minutes}</td>
              <td className="py-1">
                {(() => {
                  const radar = radarByRow.get(statRowKey(row));
                  if (!radar || radar.metrics.length < 3) return null;
                  return (
                    <div className="flex items-center gap-2" title={`Percentiles vs ${radar.peerGroupLabel} (${radar.peerGroupSampleSize} joueurs)`}>
                      <PercentileRadar metrics={radar.metrics} compact />
                      <span className="max-w-40 font-sans text-[10px] leading-tight text-paper/40">
                        vs {radar.peerGroupLabel} · n={radar.peerGroupSampleSize}
                      </span>
                    </div>
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
