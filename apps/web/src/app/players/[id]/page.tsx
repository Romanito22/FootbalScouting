import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import {
  clubs, competitions, db, players, playerSeasonStats, shortlists,
} from '@vivier/db';
import {
  METRICS, MIN_MINUTES, PEER_GROUP_SEASON_SPAN, POSITION_GROUP_LABELS,
} from '@vivier/metrics';
import { PercentileRadar } from '@/components/PercentileRadar';
import { formatMetricValue } from '@/lib/format';
import {
  describePeerGroup, fetchRowPercentiles, type MetricPercentile, statRowKey,
} from '@/lib/percentiles';
import { addPlayerToShortlist } from '@/app/shortlists/actions';
import { fetchCompetitionStrengths, referenceOf } from '@/lib/strength';
import { AdjustedSection, LeagueStrengthLine } from './AdjustedSection';
import { NotesSection } from './NotesSection';

const RADAR_KEYS = [
  'goals', 'xg', 'key_passes', 'xa',
  'dribbles_completed', 'tackles_won', 'interceptions', 'ball_recoveries',
];

const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) notFound();

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

  const percentilesByRow = await fetchRowPercentiles([playerId]);
  const adjustedByRow = await fetchRowPercentiles([playerId], undefined, 'adjusted');
  const strengths = await fetchCompetitionStrengths();
  const strengthById = new Map(strengths.map((c) => [c.id, c]));
  const referenceName = referenceOf(strengths)?.name ?? null;
  // Saisons dont une AUTRE ligne porte les percentiles (transfert en cours de
  // saison : seule la ligne la plus fournie en minutes est classée).
  const seasonsWithPercentiles = new Set(
    seasons.filter((s) => percentilesByRow.has(statRowKey(s))).map((s) => s.season),
  );

  const allShortlists = await db.select({ id: shortlists.id, name: shortlists.name }).from(shortlists);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-paper">
            {player.fullName}
          </h1>
          <p className="mt-1 font-mono text-sm text-paper/60">
            {POSITION_GROUP_LABELS[player.positionGroup]}
            {player.nationality && player.nationality.length > 0 && ` · ${player.nationality.join(', ')}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-4">
            <Link href={`/players/${player.id}/similar`} className="font-mono text-xs text-paper/50 underline hover:text-spotlight">
              joueurs similaires →
            </Link>
            <Link href={`/players/${player.id}/report`} className="font-mono text-xs text-paper/50 underline hover:text-spotlight">
              rapport →
            </Link>
          </div>
          {allShortlists.length > 0 && (
            <form action={addPlayerToShortlist} className="flex items-center gap-2">
              <input type="hidden" name="playerId" value={player.id} />
              <select name="shortlistId" className="border border-paper/30 bg-ink px-2 py-1 text-xs text-paper">
                {allShortlists.map((sl) => (
                  <option key={sl.id} value={sl.id}>{sl.name}</option>
                ))}
              </select>
              <button type="submit" className="border border-pitch/50 px-2 py-1 text-xs text-pitch hover:border-pitch hover:bg-pitch/10">
                + shortlist
              </button>
            </form>
          )}
        </div>
      </header>

      {seasons.map((s) => {
        const eligible = s.minutes >= MIN_MINUTES;
        const group = percentilesByRow.get(statRowKey(s));
        const percentileByMetric = group?.byMetric ?? new Map<string, MetricPercentile>();

        const radarMetrics = RADAR_KEYS
          .map((key) => {
            const def = METRIC_BY_KEY.get(key);
            const pct = percentileByMetric.get(key);
            if (!def || !pct) return null;
            return { key, label: def.label, percentile: pct.percentile };
          })
          .filter((m) => m !== null);

        return (
          <section key={statRowKey(s)} className="mb-10 border-t border-paper/15 pt-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold text-paper">
                {s.competitionName} · {s.season}
              </h2>
              <p className="font-mono text-xs text-paper/50">
                {s.clubName} — {s.minutes} min ({s.matchesPlayed ?? '?'} matchs)
              </p>
            </div>

            {(() => {
              const competition = strengthById.get(s.competitionId);
              return competition ? (
                <LeagueStrengthLine competition={competition} referenceName={referenceName} />
              ) : null;
            })()}

            {!eligible && (
              <p className="rounded-sm border border-spotlight/40 bg-spotlight/10 px-3 py-2 text-sm text-spotlight">
                Moins de {MIN_MINUTES} minutes jouées : les métriques per-90 sont masquées
                (bruit statistique en dessous de ce seuil).
              </p>
            )}

            {eligible && (
              <>
                {group ? (
                  <p className="mb-4 font-mono text-xs text-paper/60">
                    Groupe de pairs : {describePeerGroup(group, PEER_GROUP_SEASON_SPAN)}
                  </p>
                ) : (
                  <p className="mb-4 font-mono text-xs text-paper/60">
                    {seasonsWithPercentiles.has(s.season)
                      ? 'Percentiles non calculés pour cette ligne : la saison est classée via sa ligne la plus fournie en minutes (ci-dessus ou ci-dessous).'
                      : 'Percentiles pas encore calculés pour cette ligne (lancer compute_percentiles).'}
                  </p>
                )}

                {radarMetrics.length >= 3 && (
                  <div className="mb-6 flex justify-center">
                    <PercentileRadar metrics={radarMetrics} />
                  </div>
                )}

                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-paper/20 text-left text-paper/50">
                      <th className="py-1.5 font-normal">Métrique</th>
                      <th className="py-1.5 text-right font-normal">Valeur</th>
                      <th className="py-1.5 text-right font-normal">Percentile</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {METRICS.map((def) => {
                      const pct = percentileByMetric.get(def.key);
                      const rawValue = (s.metrics as Record<string, number>)[def.key];
                      if (rawValue === undefined) return null;
                      return (
                        <tr key={def.key} className="border-b border-paper/10">
                          <td className="py-1 font-sans text-paper/80">{def.label}</td>
                          <td className="py-1 text-right">
                            {formatMetricValue(rawValue, def.format)}
                          </td>
                          <td className="py-1 text-right text-spotlight">
                            {pct ? `${pct.percentile}ᵉ` : '—'}
                            {pct && group && pct.sampleSize !== group.peerGroupSampleSize && (
                              <span className="ml-1 text-paper/40" title="Effectif réel du classement sur cette métrique (source partielle)">
                                n={pct.sampleSize}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {(() => {
                  const competition = strengthById.get(s.competitionId);
                  return competition ? (
                    <AdjustedSection
                      group={adjustedByRow.get(statRowKey(s))}
                      competition={competition}
                      referenceName={referenceName}
                    />
                  ) : null;
                })()}
              </>
            )}
          </section>
        );
      })}

      <NotesSection playerId={player.id} />
    </main>
  );
}
