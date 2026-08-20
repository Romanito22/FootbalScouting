import { notFound } from 'next/navigation';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { cosineDistance } from 'drizzle-orm/sql/functions/vector';
import {
  clubs, competitions, db, peerGroups, playerPercentiles, players, playerSeasonStats,
  playerVectors, scoutNotes, shortlistEntries, shortlists,
} from '@vivier/db';
import { METRICS, MIN_MINUTES, POSITION_GROUP_LABELS } from '@vivier/metrics';
import { PercentileRadar } from '@/components/PercentileRadar';
import { formatMetricValue } from '@/lib/format';
import { PrintButton } from './PrintButton';

const RADAR_KEYS = [
  'goals', 'xg', 'key_passes', 'xa',
  'dribbles_completed', 'tackles_won', 'interceptions', 'ball_recoveries',
];
const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));
const STATUS_LABELS: Record<string, string> = {
  a_observer: 'À observer', observe: 'Observé', prioritaire: 'Prioritaire', ecarte: 'Écarté',
};

export default async function PlayerReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) notFound();

  const [latestSeason] = await db
    .select({
      season: playerSeasonStats.season,
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
    .orderBy(desc(playerSeasonStats.season))
    .limit(1);

  const percentiles = latestSeason
    ? await db
      .select({
        metric: playerPercentiles.metric,
        percentile: playerPercentiles.percentile,
        peerGroupLabel: peerGroups.label,
        peerGroupSampleSize: peerGroups.sampleSize,
      })
      .from(playerPercentiles)
      .innerJoin(peerGroups, eq(peerGroups.id, playerPercentiles.peerGroupId))
      .where(and(eq(playerPercentiles.playerId, playerId), eq(playerPercentiles.season, latestSeason.season)))
    : [];
  const percentileByMetric = new Map(percentiles.map((p) => [p.metric, p]));
  const eligible = Boolean(latestSeason && latestSeason.minutes >= MIN_MINUTES);

  const radarMetrics = RADAR_KEYS
    .map((key) => {
      const def = METRIC_BY_KEY.get(key);
      const pct = percentileByMetric.get(key);
      if (!def || !pct) return null;
      return { key, label: def.label, percentile: pct.percentile };
    })
    .filter((m) => m !== null);

  const [vector] = await db.select().from(playerVectors).where(eq(playerVectors.playerId, playerId)).limit(1);
  const comparables = vector?.styleVec
    ? await db
      .select({
        fullName: players.fullName,
        positionGroup: players.positionGroup,
        similarity: sql<number>`1 - (${cosineDistance(playerVectors.styleVec, vector.styleVec)})`,
      })
      .from(playerVectors)
      .innerJoin(players, eq(players.id, playerVectors.playerId))
      .where(ne(playerVectors.playerId, playerId))
      .orderBy(cosineDistance(playerVectors.styleVec, vector.styleVec))
      .limit(5)
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <header className="mb-8 border-b border-paper/20 pb-4">
        <h1 className="font-display text-4xl font-bold tracking-tight text-paper">{player.fullName}</h1>
        <p className="mt-1 font-mono text-sm text-paper/60">
          {POSITION_GROUP_LABELS[player.positionGroup]}
          {player.nationality && player.nationality.length > 0 && ` · ${player.nationality.join(', ')}`}
          {player.marketValueEur !== null && ` · ${(player.marketValueEur / 1_000_000).toFixed(1)} M€`}
        </p>
      </header>

      <section className="mb-8 flex flex-wrap gap-6 font-mono text-sm">
        <div>
          <p className="text-paper/50">Note globale</p>
          <p className="text-lg text-spotlight">{latestRating !== null ? `${latestRating}/10` : '—'}</p>
        </div>
        <div>
          <p className="text-paper/50">Verdict</p>
          {verdicts.length === 0 && <p className="text-paper/70">Non classé</p>}
          {verdicts.map((v) => (
            <p key={v.shortlistName} className="text-paper/70">
              {v.shortlistName} — {STATUS_LABELS[v.status]}
            </p>
          ))}
        </div>
      </section>

      {latestSeason && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-bold text-paper">
            {latestSeason.competitionName} · {latestSeason.season}
          </h2>
          <p className="mb-4 font-mono text-xs text-paper/50">
            {latestSeason.clubName} — {latestSeason.minutes} min ({latestSeason.matchesPlayed ?? '?'} matchs)
          </p>

          {!eligible && (
            <p className="text-sm text-paper/60">
              Moins de {MIN_MINUTES} minutes jouées : percentiles non disponibles.
            </p>
          )}

          {eligible && radarMetrics.length >= 3 && (
            <div className="mb-4 flex justify-center">
              <PercentileRadar metrics={radarMetrics} />
            </div>
          )}
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-display text-xl font-bold text-paper">Comparables (style)</h2>
        {comparables.length === 0 && <p className="text-sm text-paper/50">Pas encore de vecteur calculé.</p>}
        <ol className="space-y-1 font-mono text-sm">
          {comparables.map((c, i) => (
            <li key={`${c.fullName}-${i}`} className="flex justify-between border-b border-paper/10 py-1">
              <span className="font-sans text-paper">{i + 1}. {c.fullName}</span>
              <span className="text-spotlight">{(c.similarity * 100).toFixed(0)} %</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold text-paper">Notes de scouting</h2>
        {notes.length === 0 && <p className="text-sm text-paper/50">Aucune note.</p>}
        <div className="space-y-3">
          {notes.map((note) => (
            <article key={note.id} className="border-b border-paper/10 pb-2">
              <div className="mb-1 flex justify-between font-mono text-xs text-paper/50">
                <span>
                  {note.context ?? '—'}
                  {note.observedAt && ` · ${new Date(note.observedAt).toLocaleDateString('fr-FR')}`}
                </span>
                {note.rating !== null && <span className="text-spotlight">{note.rating}/10</span>}
              </div>
              <p className="whitespace-pre-wrap text-sm text-paper/90">{note.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
