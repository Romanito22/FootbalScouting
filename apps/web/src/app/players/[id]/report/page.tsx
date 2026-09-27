import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import {
  clubs, competitions, db, players, playerSeasonStats, playerVectors, scoutNotes,
  shortlistEntries, shortlists,
} from '@vivier/db';
import {
  METRICS, MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS,
} from '@vivier/metrics';
import { PercentileRadar } from '@/components/PercentileRadar';
import { describePeerGroup, fetchRowPercentiles, statRowKey } from '@/lib/percentiles';
import { latestVector, topSimilar } from '@/lib/similarity';
import { fetchCompetitionStrengths, referenceOf } from '@/lib/strength';
import { LeagueStrengthLine } from '../AdjustedSection';
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

  const radarMetrics = RADAR_KEYS
    .map((key) => {
      const def = METRIC_BY_KEY.get(key);
      const pct = group?.byMetric.get(key);
      if (!def || !pct) return null;
      return { key, label: def.label, percentile: pct.percentile };
    })
    .filter((m) => m !== null);

  const vector = await latestVector(playerId);
  const comparables = vector?.styleVec
    ? await topSimilar(playerVectors.styleVec, vector.styleVec, playerId, 5)
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
          {seasonCompetition && (
            <LeagueStrengthLine
              competition={seasonCompetition}
              referenceName={referenceOf(strengths)?.name ?? null}
            />
          )}
          {mostRecent && mostRecent !== latestSeason && (
            <p className="mb-4 font-mono text-xs text-spotlight">
              Saison plus récente disponible mais sous le seuil de {MIN_MINUTES} min :{' '}
              {mostRecent.competitionName} · {mostRecent.season} ({mostRecent.minutes} min).
            </p>
          )}

          {!eligible && (
            <p className="text-sm text-paper/60">
              Moins de {MIN_MINUTES} minutes jouées : percentiles non disponibles.
            </p>
          )}

          {eligible && group && radarMetrics.length >= 3 && (
            <>
              <p className="mb-2 font-mono text-xs text-paper/60">
                Percentiles vs {describePeerGroup(group, PEER_GROUP_SEASON_SPAN)}
              </p>
              <div className="mb-4 flex justify-center">
                <PercentileRadar metrics={radarMetrics} />
              </div>
            </>
          )}
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-display text-xl font-bold text-paper">Comparables (style)</h2>
        {comparables.length === 0 && <p className="text-sm text-paper/50">Pas encore de vecteur calculé.</p>}
        <ol className="space-y-1 font-mono text-sm">
          {comparables.map((c, i) => (
            <li key={c.playerId} className="flex justify-between border-b border-paper/10 py-1">
              <span className="font-sans text-paper">
                {i + 1}. {c.fullName}
                <span className="ml-2 font-mono text-xs text-paper/40">{c.season}</span>
              </span>
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
