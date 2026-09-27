import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import {
  clubs, competitions, db, players, playerSeasonStats, playerVectors, scoutNotes,
  shortlistEntries, shortlists,
} from '@vivier/db';
import {
  getMetric, MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS, RADAR_METRICS,
} from '@vivier/metrics';
import { PercentileBars, PercentileScale } from '@/components/charts/PercentileBars';
import { ContractBadge } from '@/components/ContractBadge';
import { PercentileRadar } from '@/components/PercentileRadar';
import { Chip, Monogram } from '@/components/ui';
import { formatMarketValue } from '@/lib/contract';
import { formatMetricValue } from '@/lib/format';
import { describePeerGroup, fetchRowPercentiles, statRowKey } from '@/lib/percentiles';
import { latestVector, topSimilar } from '@/lib/similarity';
import { fetchCompetitionStrengths, referenceOf } from '@/lib/strength';
import { LeagueStrengthLine } from '../AdjustedSection';
import { PrintButton } from './PrintButton';

const STATUS_LABELS: Record<string, string> = {
  a_observer: 'À observer', observe: 'Observé', prioritaire: 'Prioritaire', ecarte: 'Écarté',
};

export default async function PlayerReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) notFound();

  const seasonRows = await db
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
    // saison la plus récente ; à saison égale, la ligne la plus fournie
    .orderBy(desc(playerSeasonStats.season), desc(playerSeasonStats.minutes));
  // Le rapport s'appuie sur la saison exploitable la plus récente : une
  // saison récente sous le seuil (3 matchs d'Euro) ne doit pas masquer un
  // échantillon complet de la saison précédente. L'écart est signalé.
  const mostRecent = seasonRows[0];
  const latestSeason = seasonRows.find((r) => r.minutes >= MIN_MINUTES) ?? mostRecent;

  const group = latestSeason
    ? (await fetchRowPercentiles([playerId])).get(statRowKey(latestSeason))
    : undefined;
  const eligible = Boolean(latestSeason && latestSeason.minutes >= MIN_MINUTES);
  const strengths = await fetchCompetitionStrengths();
  const seasonCompetition = latestSeason
    ? strengths.find((c) => c.id === latestSeason.competitionId)
    : undefined;

  const radarMetrics = RADAR_METRICS[player.positionGroup].flatMap((key) => {
    const def = getMetric(key);
    const pct = group?.byMetric.get(key);
    return def && pct ? [{ key, label: def.label, percentile: pct.percentile }] : [];
  });

  const vector = await latestVector(playerId);
  const comparables = vector?.styleVec
    ? await topSimilar(playerVectors.styleVec, vector.styleVec, playerId, 5, {
      targetIsGoalkeeper: player.positionGroup === 'GK',
    })
    : [];

  const notes = await db
    .select()
    .from(scoutNotes)
    .where(eq(scoutNotes.playerId, playerId))
    .orderBy(desc(scoutNotes.createdAt));
  const latestRating = notes.find((n) => n.rating !== null)?.rating ?? null;

  const verdicts = await db
    .select({ shortlistName: shortlists.name, status: shortlistEntries.status })
    .from(shortlistEntries)
    .innerJoin(shortlists, eq(shortlists.id, shortlistEntries.shortlistId))
    .where(eq(shortlistEntries.playerId, playerId));

  const radarRows = RADAR_METRICS[player.positionGroup].flatMap((key) => {
    const def = getMetric(key);
    const pct = group?.byMetric.get(key);
    const raw = latestSeason ? (latestSeason.metrics as Record<string, number>)[key] : undefined;
    return def && pct && raw !== undefined
      ? [{ key, label: def.label, value: formatMetricValue(raw, def.format), percentile: pct.percentile }]
      : [];
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 print:max-w-none print:px-0 print:py-0 lg:px-10">
      <div className="mb-6 flex justify-between print:hidden">
        <a href={`/players/${player.id}`} className="text-sm text-paper/50 hover:text-spotlight">← Fiche</a>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-line bg-surface p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start gap-5 border-b border-line pb-6">
          <Monogram name={player.fullName} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-paper/45">Rapport de scouting · {new Date().toLocaleDateString('fr-FR')}</div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-paper">{player.fullName}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="accent">{POSITION_GROUP_LABELS[player.positionGroup]}</Chip>
              {player.nationality?.map((n) => <Chip key={n}>{n}</Chip>)}
              {player.marketValueEur !== null && <Chip>{formatMarketValue(player.marketValueEur)}</Chip>}
              {player.contractUntil && <ContractBadge contractUntil={player.contractUntil} />}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-line px-3 py-2">
              <dt className="text-xs text-paper/50">Note globale</dt>
              <dd className="text-2xl font-semibold text-paper">{latestRating !== null ? `${latestRating}/10` : '—'}</dd>
            </div>
            <div className="rounded-lg border border-line px-3 py-2">
              <dt className="text-xs text-paper/50">Verdict</dt>
              <dd className="mt-1 space-y-0.5 text-xs text-paper/80">
                {verdicts.length === 0 ? 'Non classé' : verdicts.map((v) => (
                  <div key={v.shortlistName}>{STATUS_LABELS[v.status]} <span className="text-paper/45">· {v.shortlistName}</span></div>
                ))}
              </dd>
            </div>
          </dl>
        </header>

        {latestSeason && (
          <section className="border-b border-line py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl font-bold text-paper">{latestSeason.competitionName} · {latestSeason.season}</h2>
              <span className="text-sm text-paper/55">{latestSeason.clubName} · {latestSeason.minutes} min · {latestSeason.matchesPlayed ?? '?'} matchs</span>
            </div>
            {seasonCompetition && (
              <div className="mt-2"><LeagueStrengthLine competition={seasonCompetition} referenceName={referenceOf(strengths)?.name ?? null} /></div>
            )}
            {mostRecent && mostRecent !== latestSeason && (
              <p className="mt-2 text-xs text-spotlight">
                Saison plus récente disponible mais sous le seuil de {MIN_MINUTES} min : {mostRecent.competitionName} · {mostRecent.season} ({mostRecent.minutes} min).
              </p>
            )}
            {!eligible && <p className="mt-3 text-sm text-paper/60">Moins de {MIN_MINUTES} minutes jouées : percentiles non disponibles.</p>}
            {eligible && group && radarMetrics.length >= 3 && (
              <>
                <p className="mt-3 text-xs text-paper/55">Percentiles vs {describePeerGroup(group, PEER_GROUP_SEASON_SPAN)}</p>
                <div className="mt-4 grid items-center gap-6 md:grid-cols-2 print:grid-cols-2">
                  <div className="flex justify-center"><PercentileRadar metrics={radarMetrics} /></div>
                  <div>
                    <PercentileBars rows={radarRows} dense />
                    <div className="mt-1"><PercentileScale /></div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <section className="border-b border-line py-6 print:break-inside-avoid">
          <h2 className="mb-3 font-display text-xl font-bold text-paper">Comparables (style)</h2>
          {comparables.length === 0 ? <p className="text-sm text-paper/50">Pas encore de vecteur calculé.</p> : (
            <ol className="grid gap-2 sm:grid-cols-2">
              {comparables.map((c, i) => (
                <li key={c.playerId} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="text-paper">{i + 1}. {c.fullName} <span className="text-xs text-paper/40">{c.season}</span></span>
                  <span className="num font-mono text-paper/80">{(c.similarity * 100).toFixed(0)} %</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="pt-6">
          <h2 className="mb-3 font-display text-xl font-bold text-paper">Notes de scouting</h2>
          {notes.length === 0 ? <p className="text-sm text-paper/50">Aucune note.</p> : (
            <div className="space-y-4">
              {notes.map((note) => (
                <article key={note.id} className="border-l-2 border-spotlight/50 pl-4 print:break-inside-avoid">
                  <div className="flex justify-between text-xs text-paper/50">
                    <span>{note.context ?? '—'}{note.observedAt && ` · ${new Date(note.observedAt).toLocaleDateString('fr-FR')}`}</span>
                    {note.rating !== null && <span className="font-semibold text-paper">{note.rating}/10</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">{note.body}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </article>
    </main>
  );
}
