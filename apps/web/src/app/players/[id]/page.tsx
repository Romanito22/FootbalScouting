import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { ArrowLeftRight, FileText, Sparkles } from 'lucide-react';
import {
  clubs, competitions, db, players, playerSeasonStats, shortlists,
} from '@vivier/db';
import {
  getMetric, MIN_MINUTES, metricsForPosition, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS,
  RADAR_METRICS,
} from '@vivier/metrics';
import { PercentileBars, PercentileScale } from '@/components/charts/PercentileBars';
import { PeerStrip } from '@/components/charts/PeerStrip';
import { SeasonTrend, type TrendPoint } from '@/components/charts/SeasonTrend';
import { ContractBadge } from '@/components/ContractBadge';
import { PercentileRadar } from '@/components/PercentileRadar';
import {
  btnPrimary, btnSecondary, Card, Chip, EmptyState, field, Monogram,
} from '@/components/ui';
import { addPlayerToShortlist } from '@/app/shortlists/actions';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { formatMetricValue } from '@/lib/format';
import {
  describePeerGroup, fetchPeerValues, fetchRowPercentiles, type MetricPercentile, statRowKey,
} from '@/lib/percentiles';
import { fetchCompetitionStrengths, referenceOf } from '@/lib/strength';
import { AdjustedSection, LeagueStrengthLine } from './AdjustedSection';
import { MetricsTable } from './MetricsTable';
import { NotesSection } from './NotesSection';

type Params = Record<string, string | string[] | undefined>;

const FOOT_LABELS = { left: 'gaucher', right: 'droitier', both: 'ambidextre' } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player] = Number.isInteger(Number(id))
    ? await db.select({ name: players.fullName }).from(players).where(eq(players.id, Number(id)))
    : [];
  return { title: player?.name ?? 'Joueur' };
}

export default async function PlayerPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) notFound();

  const [currentClub] = player.currentClubId
    ? await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, player.currentClubId))
    : [];

  const seasons = await db
    .select({
      playerId: playerSeasonStats.playerId,
      season: playerSeasonStats.season,
      competitionId: playerSeasonStats.competitionId,
      clubId: playerSeasonStats.clubId,
      minutes: playerSeasonStats.minutes,
      matchesPlayed: playerSeasonStats.matchesPlayed,
      metrics: playerSeasonStats.metrics,
      competitionName: competitions.name,
      clubName: clubs.name,
    })
    .from(playerSeasonStats)
    .innerJoin(competitions, eq(competitions.id, playerSeasonStats.competitionId))
    .innerJoin(clubs, eq(clubs.id, playerSeasonStats.clubId))
    .where(eq(playerSeasonStats.playerId, playerId))
    .orderBy(desc(playerSeasonStats.season), desc(playerSeasonStats.minutes));

  const [percentilesByRow, adjustedByRow, strengths, allShortlists] = await Promise.all([
    fetchRowPercentiles([playerId]),
    fetchRowPercentiles([playerId], undefined, 'adjusted'),
    fetchCompetitionStrengths(),
    db.select({ id: shortlists.id, name: shortlists.name }).from(shortlists),
  ]);
  const strengthById = new Map(strengths.map((c) => [c.id, c]));
  const referenceName = referenceOf(strengths)?.name ?? null;

  // Saison approfondie : celle demandée, sinon la plus récente exploitable.
  const requested = typeof query.row === 'string' ? query.row : null;
  const selected = seasons.find((s) => statRowKey(s) === requested)
    ?? seasons.find((s) => s.minutes >= MIN_MINUTES)
    ?? seasons[0];
  const group = selected ? percentilesByRow.get(statRowKey(selected)) : undefined;
  const eligible = Boolean(selected && selected.minutes >= MIN_MINUTES);
  const radarKeys = RADAR_METRICS[player.positionGroup];
  const percentileByMetric = group?.byMetric ?? new Map<string, MetricPercentile>();
  const selectedMetrics = (selected?.metrics ?? {}) as Record<string, number>;
  const peerValues = group ? await fetchPeerValues(group.peerGroupId, [...radarKeys]) : new Map();
  const competition = selected ? strengthById.get(selected.competitionId) : undefined;
  // Une AUTRE ligne de la même saison porte les percentiles (transfert : seule
  // la plus fournie en minutes est classée).
  const siblingClassified = selected && !group && seasons.some(
    (s) => s !== selected && s.season === selected.season && percentilesByRow.has(statRowKey(s)),
  );

  const radarMetrics = radarKeys.flatMap((key) => {
    const def = getMetric(key);
    const pct = percentileByMetric.get(key);
    return def && pct ? [{ key, label: def.label, percentile: pct.percentile }] : [];
  });

  // Évolution : percentiles de chaque saison classée, dans l'ordre chronologique.
  const classified = [...seasons].reverse().filter((s) => percentilesByRow.has(statRowKey(s)));
  const trends = radarKeys.flatMap((key) => {
    const def = getMetric(key);
    const points: TrendPoint[] = classified.flatMap((s) => {
      const pct = percentilesByRow.get(statRowKey(s))?.byMetric.get(key);
      return pct ? [{ label: `${s.competitionName} ${s.season}`, percentile: pct.percentile }] : [];
    });
    return def && points.length >= 2 ? [{ key, title: def.label, points }] : [];
  });

  const age = ageOn(player.birthDate);
  const latest = seasons[0];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      {/* ---- identité ---- */}
      <Card padded={false} className="mb-6">
        <div className="flex flex-wrap items-start gap-5 p-6">
          <Monogram name={player.fullName} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl font-bold tracking-tight text-paper">{player.fullName}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="accent">{POSITION_GROUP_LABELS[player.positionGroup]}</Chip>
              {player.nationality?.map((n) => <Chip key={n}>{n}</Chip>)}
              {player.foot && <Chip>{FOOT_LABELS[player.foot]}</Chip>}
              {player.heightCm && <Chip>{player.heightCm} cm</Chip>}
            </div>
            <p className="mt-2 text-sm text-paper/60">
              {currentClub?.name ?? latest?.clubName ?? 'Club inconnu'}
              {latest && <span className="text-paper/40"> · dernière saison : {latest.competitionName} {latest.season}</span>}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-line bg-ink/40 px-3 py-2">
              <dt className="text-xs text-paper/50">Âge</dt>
              <dd className="mt-0.5 text-xl font-semibold text-paper">{age ?? '—'}</dd>
            </div>
            <div className="rounded-lg border border-line bg-ink/40 px-3 py-2">
              <dt className="text-xs text-paper/50">Valeur</dt>
              <dd className="mt-0.5 text-xl font-semibold text-paper">{formatMarketValue(player.marketValueEur)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-ink/40 px-3 py-2">
              <dt className="text-xs text-paper/50">Contrat</dt>
              <dd className="mt-1 text-xl"><ContractBadge contractUntil={player.contractUntil} compact /></dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-3">
          <Link href={`/players/${player.id}/similar`} className={btnSecondary}><Sparkles size={15} /> Similaires</Link>
          <Link href={`/compare?ids=${player.id}`} className={btnSecondary}><ArrowLeftRight size={15} /> Comparer</Link>
          <Link href={`/players/${player.id}/report`} className={btnSecondary}><FileText size={15} /> Rapport</Link>
          {allShortlists.length > 0 && (
            <form action={addPlayerToShortlist} className="ml-auto flex items-center gap-2">
              <input type="hidden" name="playerId" value={player.id} />
              <select name="shortlistId" aria-label="Shortlist" className={`${field} w-48`}>
                {allShortlists.map((sl) => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
              </select>
              <button type="submit" className={`${btnPrimary} whitespace-nowrap`}>+ Shortlist</button>
            </form>
          )}
        </div>
      </Card>

      {seasons.length === 0 ? (
        <EmptyState title="Aucune statistique">Ce joueur n'apparaît dans aucune compétition ingérée.</EmptyState>
      ) : (
        <>
          {/* ---- choix de la saison ---- */}
          <nav aria-label="Saisons" className="mb-6 flex gap-2 overflow-x-auto pb-1">
            {seasons.map((s) => {
              const isSelected = selected === s;
              const short = s.minutes < MIN_MINUTES;
              return (
                <Link
                  key={statRowKey(s)}
                  href={`/players/${player.id}?row=${encodeURIComponent(statRowKey(s))}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                    isSelected ? 'border-spotlight/60 bg-spotlight/10' : 'border-line bg-surface hover:border-paper/25'
                  }`}
                >
                  <div className={`text-sm font-medium ${isSelected ? 'text-paper' : 'text-paper/80'}`}>
                    {s.competitionName} · {s.season}
                  </div>
                  <div className={`text-xs ${short ? 'text-paper/35' : 'text-paper/50'}`}>
                    {s.clubName} · {s.minutes} min{short ? ` (< ${MIN_MINUTES})` : ''}
                  </div>
                </Link>
              );
            })}
          </nav>

          {selected && (
            <div className="space-y-6">
              <Card padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="font-display text-xl font-bold text-paper">
                      {selected.competitionName} · {selected.season}
                    </div>
                    <div className="text-sm text-paper/55">
                      {selected.clubName} · {selected.minutes} min · {selected.matchesPlayed ?? '?'} matchs
                    </div>
                  </div>
                  {competition && <LeagueStrengthLine competition={competition} referenceName={referenceName} />}
                </div>
                <div className="border-t border-line px-5 py-2.5 text-xs text-paper/55">
                  {!eligible
                    ? `Moins de ${MIN_MINUTES} minutes : les métriques per-90 sont masquées (bruit statistique sous ce seuil).`
                    : group
                      ? <>Groupe de pairs : <span className="text-paper/80">{describePeerGroup(group, PEER_GROUP_SEASON_SPAN)}</span></>
                      : siblingClassified
                        ? 'Percentiles portés par la ligne la plus fournie en minutes de cette saison (transfert).'
                        : 'Percentiles pas encore calculés (pnpm pipeline:refresh).'}
                </div>
              </Card>

              {eligible && group && (
                <>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <Card title="Profil" subtitle="radar du poste · bande = 25ᵉ-75ᵉ du groupe, pointillés = médiane">
                      <div className="flex justify-center">
                        {radarMetrics.length >= 3 ? <PercentileRadar metrics={radarMetrics} /> : <p className="text-sm text-paper/50">Pas assez de métriques mesurées.</p>}
                      </div>
                    </Card>
                    <Card title="Métriques clés du poste" subtitle="per-90 · percentile dans le groupe de pairs">
                      <PercentileBars
                        rows={radarKeys.flatMap((key) => {
                          const def = getMetric(key);
                          const pct = percentileByMetric.get(key);
                          const raw = selectedMetrics[key];
                          if (!def || !pct || raw === undefined) return [];
                          return [{ key, label: def.label, value: formatMetricValue(raw, def.format), percentile: pct.percentile, note: def.note }];
                        })}
                      />
                      <div className="mt-1"><PercentileScale /></div>
                    </Card>
                  </div>

                  <Card title="Où il se situe dans son groupe" subtitle={`chaque point = un joueur du groupe (${group.peerGroupSampleSize}) · trait = médiane`}>
                    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                      {radarKeys.map((key) => {
                        const def = getMetric(key);
                        const raw = selectedMetrics[key];
                        const peers = peerValues.get(key) ?? [];
                        if (!def || raw === undefined || peers.length === 0) return null;
                        return (
                          <PeerStrip
                            key={key}
                            label={def.label}
                            peers={peers}
                            playerValue={raw}
                            higherIsBetter={def.higherIsBetter}
                            format={(v) => formatMetricValue(v, def.format)}
                          />
                        );
                      })}
                    </div>
                  </Card>

                  <Card title="Toutes les métriques" subtitle="per-90 par famille · survol d'une ligne pour sa définition">
                    <MetricsTable
                      metrics={selectedMetrics}
                      definitions={metricsForPosition(player.positionGroup)}
                      percentiles={percentileByMetric}
                      groupSampleSize={group.peerGroupSampleSize}
                    />
                  </Card>

                  {competition && (
                    <Card title="Niveau ajusté — toutes compétitions" subtitle="la production corrigée de la force du championnat, classée contre tout le poste">
                      <AdjustedSection
                        group={adjustedByRow.get(statRowKey(selected))}
                        competition={competition}
                        referenceName={referenceName}
                      />
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {trends.length > 0 && (
            <Card title="Évolution" subtitle="percentile de chaque saison, relatif au groupe de pairs de SA saison" className="mt-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {trends.map((t) => <SeasonTrend key={t.key} title={t.title} points={t.points} />)}
              </div>
            </Card>
          )}

          <Card title="Historique" subtitle="toutes les lignes de stats du joueur" className="mt-6" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-paper/50">
                    <th className="px-5 py-2 font-medium">Saison</th>
                    <th className="px-3 py-2 font-medium">Club</th>
                    <th className="px-3 py-2 text-right font-medium">Min.</th>
                    <th className="px-3 py-2 text-right font-medium">Matchs</th>
                    {radarKeys.slice(0, 4).map((key) => (
                      <th key={key} className="px-3 py-2 text-right font-medium">{getMetric(key)?.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  {seasons.map((s) => {
                    const metrics = s.metrics as Record<string, number>;
                    const shown = s.minutes >= MIN_MINUTES;
                    return (
                      <tr key={statRowKey(s)} className={`border-b border-line/60 ${selected === s ? 'bg-raised' : 'hover:bg-raised/50'}`}>
                        <td className="px-5 py-2">
                          <Link href={`/players/${player.id}?row=${encodeURIComponent(statRowKey(s))}`} className="text-paper hover:text-spotlight">
                            {s.competitionName} · {s.season}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-paper/60">{s.clubName}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.minutes}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.matchesPlayed ?? '—'}</td>
                        {radarKeys.slice(0, 4).map((key) => {
                          const def = getMetric(key);
                          const value = metrics[key];
                          return (
                            <td key={key} className="px-3 py-2 text-right font-mono text-paper/80">
                              {!shown ? <span className="text-paper/25">masqué</span>
                                : value === undefined || !def ? '—' : formatMetricValue(value, def.format)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card title="Notes de scouting" subtitle="l'œil humain — la seule donnée qui n'existe nulle part ailleurs" className="mt-6">
        <NotesSection playerId={player.id} />
      </Card>

    </main>
  );
}
