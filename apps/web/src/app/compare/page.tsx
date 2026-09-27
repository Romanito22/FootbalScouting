import Link from 'next/link';
import {
  getMetric, METRIC_FAMILIES, METRIC_FAMILY_LABELS, type MetricDef, metricsForPosition,
  MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS, RADAR_METRICS,
} from '@vivier/metrics';
import { ComparisonRadar, SeriesSwatch } from '@/components/ComparisonRadar';
import { ContractBadge } from '@/components/ContractBadge';
import { type ComparedPlayer, loadComparison, MAX_COMPARED, parseIds } from '@/lib/compare';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { formatMetricValue } from '@/lib/format';
import { describePeerGroup } from '@/lib/percentiles';
import { listPlayers } from '@/lib/players';
import { CI_LABEL, describeStrengthStatus, formatCoefWithInterval } from '@/lib/strength';

type Params = Record<string, string | string[] | undefined>;

const STATUS_LABELS: Record<string, string> = {
  a_observer: 'À observer', observe: 'Observé', prioritaire: 'Prioritaire', ecarte: 'Écarté',
};

function compareHref(ids: number[], season: string | null = null): string {
  if (!ids.length) return '/compare';
  return `/compare?ids=${ids.join(',')}${season ? `&season=${encodeURIComponent(season)}` : ''}`;
}

/** Meilleur percentile d'une ligne (au moins deux valeurs, pas d'égalité parfaite). */
function bestIndex(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;
  const max = Math.max(...present);
  if (present.filter((v) => v === max).length > 1) return null;
  return values.indexOf(max);
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ids = parseIds(params.ids);
  const query = typeof params.q === 'string' ? params.q : null;
  const requestedSeason = typeof params.season === 'string' && params.season ? params.season : null;
  const { players: compared, commonSeasons } = await loadComparison(ids, requestedSeason);
  const season = requestedSeason && commonSeasons.includes(requestedSeason) ? requestedSeason : null;
  // Un « meilleur percentile » n'a de sens qu'entre joueurs classés dans le
  // MÊME groupe de pairs ; sinon les percentiles se lisent côte à côte.
  const sharedGroup = compared.length > 1
    && compared.every((p) => p.tier && p.tier.peerGroupId === compared[0]?.tier?.peerGroupId);
  const candidates = query && ids.length < MAX_COMPARED
    ? (await listPlayers({ query, position: null, page: 1 })).rows.slice(0, 8)
    : [];

  const positions = [...new Set(compared.map((p) => p.positionGroup))];
  const mixesGoalkeepers = positions.includes('GK') && positions.length > 1;
  const samePosition = positions.length === 1;
  const reference = compared[0];
  const axisKeys = reference && !mixesGoalkeepers ? RADAR_METRICS[reference.positionGroup] : [];
  // Axes mesurés pour TOUS les joueurs : jamais un 0 inventé sur le radar.
  const axes = axisKeys
    .filter((key) => compared.every((p) => p.tier?.byMetric.has(key)))
    .map((key) => ({ key, label: getMetric(key)?.label ?? key }));
  const series = compared.map((p) => ({
    name: p.fullName,
    percentiles: new Map(axes.map((a) => [a.key, p.tier?.byMetric.get(a.key)?.percentile ?? 0])),
  }));

  const tableMetrics: MetricDef[] = reference && !mixesGoalkeepers
    ? metricsForPosition(reference.positionGroup)
    : [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight text-paper">Comparer</h1>
      <p className="mt-1 text-sm text-paper/60">
        Jusqu'à {MAX_COMPARED} joueurs, sur leur saison exploitable la plus récente ou sur une
        saison commune. Chaque percentile reste relatif au groupe de pairs de son joueur, affiché
        sous son nom.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 border-b border-paper/15 pb-6">
        <input type="hidden" name="ids" value={ids.join(',')} />
        <label className="text-xs text-paper/50">
          Ajouter un joueur
          <input
            type="search" name="q" defaultValue={query ?? ''} placeholder="nom…"
            disabled={ids.length >= MAX_COMPARED}
            className="mt-1 block w-64 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper disabled:opacity-40"
          />
        </label>
        <button type="submit" disabled={ids.length >= MAX_COMPARED} className="border border-spotlight px-4 py-1.5 text-sm text-spotlight hover:bg-spotlight/10 disabled:opacity-40">
          Chercher
        </button>
        {ids.length >= MAX_COMPARED && (
          <p className="text-xs text-paper/50">Maximum atteint — retire un joueur pour en ajouter un autre.</p>
        )}
        {candidates.length > 0 && (
          <ul className="basis-full space-y-1 text-sm">
            {candidates.filter((c) => !ids.includes(c.id)).map((c) => (
              <li key={c.id}>
                <Link href={compareHref([...ids, c.id], season)} className="text-paper hover:text-spotlight">
                  + {c.fullName}
                </Link>
                <span className="ml-2 font-mono text-xs text-paper/40">
                  {POSITION_GROUP_LABELS[c.positionGroup]}{c.season ? ` · ${c.competitionName} ${c.season}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </form>

      {compared.length === 0 ? (
        <p className="mt-8 text-sm text-paper/60">
          Aucun joueur sélectionné. Ajoute-en ci-dessus, ou depuis une shortlist, une recherche ou
          une fiche joueur.
        </p>
      ) : (
        <>
          {compared.length > 1 && (
            <nav className="mt-6 flex flex-wrap items-center gap-3 font-mono text-xs text-paper/60" aria-label="Saison de comparaison">
              <span>Saison comparée :</span>
              <Link href={compareHref(ids)} className={season === null ? 'text-spotlight' : 'underline hover:text-spotlight'}>
                la plus récente exploitable de chacun
              </Link>
              {commonSeasons.map((s) => (
                <Link key={s} href={compareHref(ids, s)} className={season === s ? 'text-spotlight' : 'underline hover:text-spotlight'}>
                  {s}
                </Link>
              ))}
              {commonSeasons.length === 0 && (
                <span className="text-paper/40">aucune saison exploitable (≥ 600 min) commune à tous</span>
              )}
            </nav>
          )}

          <section className="mt-6 grid gap-6" style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))` }}>
            {compared.map((p, i) => (
              <PlayerCard key={p.id} player={p} index={i} ids={ids} season={season} />
            ))}
          </section>

          {!samePosition && (
            <p className="mt-6 rounded-sm border border-spotlight/40 bg-spotlight/10 px-3 py-2 text-sm text-spotlight">
              {mixesGoalkeepers
                ? 'Gardien et joueur(s) de champ : aucune métrique commune, pas de radar ni de table partagés.'
                : `Postes différents : chaque percentile est calculé contre les joueurs de SON poste — les radars se lisent côte à côte, pas comme un classement direct. Axes du radar : ${POSITION_GROUP_LABELS[reference?.positionGroup ?? 'CM']}.`}
            </p>
          )}

          {axes.length >= 3 && (
            <section className="mt-8 flex flex-col items-center">
              <ComparisonRadar axes={axes} series={series} />
              {axes.length < axisKeys.length && (
                <p className="font-mono text-xs text-paper/40">
                  {axisKeys.length - axes.length} axe(s) retiré(s) : non mesuré(s) pour au moins un joueur.
                </p>
              )}
            </section>
          )}

          {tableMetrics.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 font-display text-lg font-bold text-paper">Métriques per-90 et percentiles</h2>
              <p className="mb-3 text-xs text-paper/50">
                {sharedGroup
                  ? '▲ = meilleur percentile de la ligne (tous classés dans le même groupe de pairs).'
                  : 'Groupes de pairs différents : pas de « meilleur » désigné, chaque percentile se lit dans le groupe de son joueur (cf. cartes).'}
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-paper/20 text-left text-paper/50">
                    <th className="py-1.5 font-normal">Métrique</th>
                    {compared.map((p, i) => (
                      <th key={p.id} className="py-1.5 text-right font-normal">
                        <SeriesSwatch index={i} /> <span className="text-paper">{p.fullName}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {METRIC_FAMILIES.map((family) => {
                  const defs = tableMetrics.filter((d) => d.family === family);
                  if (defs.length === 0) return null;
                  return (
                    <tbody key={family} className="font-mono">
                      <tr>
                        <td colSpan={compared.length + 1} className="pb-1 pt-4 font-sans text-xs uppercase tracking-wide text-paper/40">
                          {METRIC_FAMILY_LABELS[family]}
                        </td>
                      </tr>
                      {defs.map((def) => {
                        const pcts = compared.map((p) => p.tier?.byMetric.get(def.key)?.percentile ?? null);
                        const best = sharedGroup ? bestIndex(pcts) : null;
                        return (
                          <tr key={def.key} className="border-b border-paper/10" title={def.note}>
                            <td className="py-1 font-sans text-paper/80">{def.label}</td>
                            {compared.map((p, i) => {
                              const raw = p.row?.metrics[def.key];
                              const pct = pcts[i];
                              return (
                                <td key={p.id} className="py-1 text-right">
                                  {raw === undefined ? <span className="text-paper/30">non mesuré</span> : formatMetricValue(raw, def.format)}
                                  {pct !== null && (
                                    <span className={`ml-2 inline-block w-12 ${best === i ? 'text-spotlight' : 'text-paper/50'}`}>
                                      {best === i ? '▲' : ''}{pct}ᵉ
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </section>
          )}

          {compared.some((p) => p.adjusted) && (
            <section className="mt-8">
              <h2 className="mb-2 font-display text-lg font-bold text-paper">Niveau ajusté — toutes compétitions</h2>
              <p className="mb-3 text-xs text-paper/50">
                Percentile des valeurs × coefficient de force du championnat, contre tout le poste quel que
                soit le championnat · [{CI_LABEL}]. Deux intervalles qui se chevauchent : pas de différence
                de niveau établie.
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-paper/20 text-left text-paper/50">
                    <th className="py-1.5 font-normal">Métrique</th>
                    {compared.map((p, i) => (
                      <th key={p.id} className="py-1.5 text-right font-normal">
                        <SeriesSwatch index={i} /> <span className="text-paper">{p.fullName}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {tableMetrics.filter((d) => d.leagueAdjusted).map((def) => (
                    <tr key={def.key} className="border-b border-paper/10">
                      <td className="py-1 font-sans text-paper/80">{def.label}</td>
                      {compared.map((p) => {
                        const pct = p.adjusted?.byMetric.get(def.key);
                        return (
                          <td key={p.id} className="py-1 text-right">
                            {pct ? (
                              <>
                                <span className="text-spotlight">{pct.percentile}ᵉ</span>
                                <span className="ml-1 text-paper/40">[{pct.percentileLow ?? pct.percentile} – {pct.percentileHigh ?? pct.percentile}]</span>
                              </>
                            ) : <span className="text-paper/30">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function PlayerCard({
  player: p, index, ids, season,
}: {
  player: ComparedPlayer;
  index: number;
  ids: number[];
  season: string | null;
}) {
  const age = ageOn(p.birthDate);
  const strength = p.competition ? formatCoefWithInterval(p.competition) : null;
  return (
    <article className="border-t-2 pt-3" style={{ borderColor: `var(--color-series-${index + 1})` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-paper">
          <SeriesSwatch index={index} />{' '}
          <Link href={`/players/${p.id}`} className="hover:text-spotlight">{p.fullName}</Link>
        </h2>
        <Link href={compareHref(ids.filter((id) => id !== p.id), season)} className="font-mono text-xs text-paper/40 hover:text-signal">
          retirer
        </Link>
      </div>
      <p className="font-mono text-xs text-paper/60">
        {POSITION_GROUP_LABELS[p.positionGroup]} · {age !== null ? `${age} ans` : 'âge inconnu'}
        {p.nationality?.length ? ` · ${p.nationality.join(', ')}` : ''}
        {p.foot ? ` · pied ${p.foot === 'left' ? 'gauche' : p.foot === 'right' ? 'droit' : 'ambidextre'}` : ''}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <ContractBadge contractUntil={p.contractUntil} />
        <span className="font-mono text-xs text-paper/60">{formatMarketValue(p.marketValueEur)}</span>
      </p>
      {p.row ? (
        <div className="mt-2 font-mono text-xs text-paper/60">
          <p className="text-paper/80">{p.row.competitionName} · {p.row.season} · {p.row.clubName}</p>
          <p>{p.row.minutes} min ({p.row.matchesPlayed ?? '?'} matchs)</p>
          {p.newerRow && (
            <p className="text-spotlight">
              {p.newerRow.minutes >= MIN_MINUTES ? 'saison plus récente disponible' : 'plus récent sous le seuil'} :{' '}
              {p.newerRow.competitionName} {p.newerRow.season} ({p.newerRow.minutes} min)
            </p>
          )}
          <p className="mt-1">
            {p.tier ? `vs ${describePeerGroup(p.tier, PEER_GROUP_SEASON_SPAN)}` : 'pas de percentiles (moins de 600 min ou non calculés)'}
          </p>
          <p className="mt-1">
            Force du championnat :{' '}
            {p.competition?.status === 'reference' ? 'référence (1.00)'
              : strength ? <span className="text-spotlight">{strength} {CI_LABEL}</span>
                : p.competition ? describeStrengthStatus(p.competition) : '—'}
          </p>
        </div>
      ) : (
        <p className="mt-2 font-mono text-xs text-paper/40">Aucune statistique.</p>
      )}
      <p className="mt-2 font-mono text-xs text-paper/60">
        Notes : {p.notes.count}
        {p.notes.averageRating !== null && ` · moyenne ${p.notes.averageRating.toFixed(1)}/10 · dernière ${p.notes.latestRating}/10`}
      </p>
      {p.shortlistStatuses.length > 0 && (
        <p className="font-mono text-xs text-paper/60">
          {p.shortlistStatuses.map((s) => `${s.shortlistName} : ${STATUS_LABELS[s.status] ?? s.status}`).join(' · ')}
        </p>
      )}
    </article>
  );
}
