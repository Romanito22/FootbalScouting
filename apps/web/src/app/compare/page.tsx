import Link from 'next/link';
import { ArrowLeftRight, X } from 'lucide-react';
import {
  getMetric, METRIC_FAMILIES, METRIC_FAMILY_LABELS, type MetricDef, metricsForPosition,
  MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS, RADAR_METRICS,
} from '@vivier/metrics';
import { ComparisonRadar, SERIES_COLORS, SeriesSwatch } from '@/components/ComparisonRadar';
import { ContractBadge } from '@/components/ContractBadge';
import { btnPrimary, Card, Chip, EmptyState, field, Monogram, PageHeader } from '@/components/ui';
import { type ComparedPlayer, loadComparison, MAX_COMPARED, parseIds } from '@/lib/compare';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { formatMetricValue } from '@/lib/format';
import { describePeerGroup } from '@/lib/percentiles';
import { listPlayers } from '@/lib/players';
import { CI_LABEL, describeStrengthStatus, formatCoefWithInterval } from '@/lib/strength';

export const metadata = { title: 'Comparer' };

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
    ? (await listPlayers({ query, position: null, page: 1 })).rows.filter((c) => !ids.includes(c.id)).slice(0, 8)
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
  const tableMetrics: MetricDef[] = reference && !mixesGoalkeepers ? metricsForPosition(reference.positionGroup) : [];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow="Décider"
        title="Comparer"
        description={`Jusqu'à ${MAX_COMPARED} finalistes, sur leur saison exploitable la plus récente ou sur une saison commune. Chaque percentile reste relatif au groupe de pairs de son joueur, indiqué sur sa carte.`}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="ids" value={ids.join(',')} />
        {season && <input type="hidden" name="season" value={season} />}
        <div className="w-80"><input
          type="search" name="q" defaultValue={query ?? ''}
          placeholder={ids.length >= MAX_COMPARED ? 'Maximum atteint — retire un joueur' : 'Ajouter un joueur (nom)…'}
          disabled={ids.length >= MAX_COMPARED}
          aria-label="Ajouter un joueur"
          className={`${field} disabled:opacity-40`}
        /></div>
        <button type="submit" disabled={ids.length >= MAX_COMPARED} className={btnPrimary}>Chercher</button>
        {candidates.length > 0 && (
          <div className="flex basis-full flex-wrap gap-2">
            {candidates.map((c) => (
              <Link key={c.id} href={compareHref([...ids, c.id], season)} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-paper/80 hover:border-spotlight/60 hover:text-paper">
                + {c.fullName}
                <span className="ml-1.5 text-xs text-paper/40">{POSITION_GROUP_LABELS[c.positionGroup]}{c.season ? ` · ${c.season}` : ''}</span>
              </Link>
            ))}
          </div>
        )}
      </form>

      {compared.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight size={28} />} title="Aucun joueur sélectionné">
          Ajoute-en ci-dessus, ou coche des joueurs dans une shortlist, une recherche ou un classement.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {compared.length > 1 && (
            <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Saison de comparaison">
              <span className="text-paper/50">Saison comparée</span>
              <Link href={compareHref(ids)} className={`rounded-full border px-3 py-1 ${season === null ? 'border-spotlight/60 bg-spotlight/10 text-paper' : 'border-line text-paper/60 hover:text-paper'}`}>
                la plus récente de chacun
              </Link>
              {commonSeasons.map((s) => (
                <Link key={s} href={compareHref(ids, s)} className={`rounded-full border px-3 py-1 ${season === s ? 'border-spotlight/60 bg-spotlight/10 text-paper' : 'border-line text-paper/60 hover:text-paper'}`}>
                  {s}
                </Link>
              ))}
              {commonSeasons.length === 0 && <span className="text-xs text-paper/40">aucune saison exploitable commune à tous</span>}
            </nav>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))` }}>
            {compared.map((p, i) => <PlayerCard key={p.id} player={p} index={i} ids={ids} season={season} />)}
          </div>

          {!samePosition && (
            <p className="rounded-lg border border-spotlight/40 bg-spotlight/10 px-4 py-3 text-sm text-spotlight">
              {mixesGoalkeepers
                ? 'Gardien et joueur(s) de champ : aucune métrique commune, pas de radar ni de table partagés.'
                : `Postes différents : chaque percentile est calculé contre les joueurs de SON poste — à lire côte à côte, pas comme un classement direct. Axes : ${POSITION_GROUP_LABELS[reference?.positionGroup ?? 'CM']}.`}
            </p>
          )}

          {axes.length >= 3 && (
            <Card title="Profils superposés" subtitle="percentiles sur les axes du poste · bande = 25ᵉ-75ᵉ, pointillés = médiane">
              <div className="mb-2 flex flex-wrap justify-center gap-5 text-sm">
                {compared.map((p, i) => <span key={p.id} className="flex items-center gap-2 text-paper/80"><SeriesSwatch index={i} /> {p.fullName}</span>)}
              </div>
              <div className="flex justify-center"><ComparisonRadar axes={axes} series={series} /></div>
              {axes.length < axisKeys.length && (
                <p className="text-center text-xs text-paper/40">{axisKeys.length - axes.length} axe(s) retiré(s) : non mesuré(s) pour au moins un joueur.</p>
              )}
            </Card>
          )}

          {tableMetrics.length > 0 && (
            <Card
              title="Métrique par métrique"
              subtitle={sharedGroup
                ? '▲ = meilleur percentile de la ligne (tous classés dans le même groupe de pairs)'
                : 'groupes de pairs différents : pas de « meilleur » désigné, chaque percentile se lit dans le groupe de son joueur'}
            >
              <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
                {METRIC_FAMILIES.map((family) => {
                  const defs = tableMetrics.filter((d) => d.family === family);
                  if (defs.length === 0) return null;
                  return (
                    <div key={family}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-paper/50">{METRIC_FAMILY_LABELS[family]}</h3>
                      <div className="space-y-3">
                        {defs.map((def) => {
                          const pcts = compared.map((p) => p.tier?.byMetric.get(def.key)?.percentile ?? null);
                          const best = sharedGroup ? bestIndex(pcts) : null;
                          return (
                            <div key={def.key} title={def.note}>
                              <div className="mb-1 text-sm text-paper/80">{def.label}</div>
                              <div className="space-y-1">
                                {compared.map((p, i) => {
                                  const raw = p.row?.metrics[def.key];
                                  const pct = pcts[i] ?? null;
                                  return (
                                    <div key={p.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
                                      <span className="num text-right font-mono text-xs text-paper/60">
                                        {raw === undefined ? '—' : formatMetricValue(raw, def.format)}
                                      </span>
                                      <div className="relative h-1.5 rounded-sm bg-raised" aria-hidden="true">
                                        <span className="absolute inset-y-0 w-px bg-paper/25" style={{ left: '50%' }} />
                                        {pct !== null && (
                                          <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${Math.max(pct, 1.5)}%`, background: SERIES_COLORS[i] }} />
                                        )}
                                      </div>
                                      <span className="num text-right text-xs text-paper">
                                        {pct === null ? <span className="text-paper/30">—</span> : <>{best === i && '▲ '}{pct}ᵉ</>}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {compared.some((p) => p.adjusted) && (
            <Card title="Niveau ajusté — toutes compétitions" subtitle={`valeurs × force du championnat, contre tout le poste · [${CI_LABEL}] · des intervalles qui se chevauchent = pas de différence établie`} padded={false}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-paper/50">
                    <th className="px-5 py-2 font-medium">Métrique</th>
                    {compared.map((p, i) => (
                      <th key={p.id} className="px-3 py-2 text-right font-medium"><SeriesSwatch index={i} /> <span className="text-paper/80">{p.fullName}</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  {tableMetrics.filter((d) => d.leagueAdjusted).map((def) => (
                    <tr key={def.key} className="border-b border-line/60">
                      <td className="px-5 py-1.5 text-paper/80">{def.label}</td>
                      {compared.map((p) => {
                        const pct = p.adjusted?.byMetric.get(def.key);
                        return (
                          <td key={p.id} className="px-3 py-1.5 text-right font-mono text-xs">
                            {pct ? (
                              <>
                                <span className="text-paper">{pct.percentile}ᵉ</span>
                                <span className="ml-1 text-paper/40">[{pct.percentileLow ?? pct.percentile}–{pct.percentileHigh ?? pct.percentile}]</span>
                              </>
                            ) : <span className="text-paper/30">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
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
    <article className="rounded-xl border border-line bg-surface p-4" style={{ boxShadow: `inset 0 3px 0 ${SERIES_COLORS[index]}` }}>
      <div className="flex items-start gap-3">
        <Monogram name={p.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={`/players/${p.id}`} className="block truncate font-display text-lg font-bold text-paper hover:text-spotlight">{p.fullName}</Link>
          <div className="flex items-center gap-2 text-xs text-paper/55">
            <SeriesSwatch index={index} />
            {POSITION_GROUP_LABELS[p.positionGroup]} · {age !== null ? `${age} ans` : 'âge inconnu'}
          </div>
        </div>
        <Link href={compareHref(ids.filter((id) => id !== p.id), season)} aria-label={`Retirer ${p.fullName}`} className="text-paper/35 hover:text-signal"><X size={16} /></Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ContractBadge contractUntil={p.contractUntil} compact />
        {p.marketValueEur !== null && <Chip>{formatMarketValue(p.marketValueEur)}</Chip>}
        {p.notes.averageRating !== null && <Chip tone="accent">{p.notes.averageRating.toFixed(1)}/10 · {p.notes.count} note(s)</Chip>}
        {p.shortlistStatuses.map((s) => <Chip key={s.shortlistName} tone={s.status === 'prioritaire' ? 'accent' : 'neutral'}>{STATUS_LABELS[s.status] ?? s.status}</Chip>)}
      </div>
      {p.row ? (
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
          <div className="text-sm text-paper/85">{p.row.competitionName} · {p.row.season}</div>
          <div className="text-paper/55">{p.row.clubName} · {p.row.minutes} min · {p.row.matchesPlayed ?? '?'} matchs</div>
          {p.newerRow && (
            <div className="text-spotlight">
              {p.newerRow.minutes >= MIN_MINUTES ? 'saison plus récente disponible' : 'plus récent sous le seuil'} : {p.newerRow.competitionName} {p.newerRow.season} ({p.newerRow.minutes} min)
            </div>
          )}
          <div className="text-paper/45">{p.tier ? `vs ${describePeerGroup(p.tier, PEER_GROUP_SEASON_SPAN)}` : 'pas de percentiles (moins de 600 min ou non calculés)'}</div>
          <div className="text-paper/45">
            Force du championnat :{' '}
            {p.competition?.status === 'reference' ? 'référence (1.00)'
              : strength ? <span className="text-paper/80">{strength} {CI_LABEL}</span>
                : p.competition ? describeStrengthStatus(p.competition) : '—'}
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-xs text-paper/40">Aucune statistique.</p>
      )}
    </article>
  );
}
