import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import {
  clubs, competitions, db, peerGroups, playerPercentiles, players, playerSeasonStats,
} from '@vivier/db';
import { METRICS, MIN_MINUTES, POSITION_GROUP_LABELS } from '@vivier/metrics';
import { PercentileRadar } from '@/components/PercentileRadar';
import { formatMetricValue } from '@/lib/format';

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
    .orderBy(desc(playerSeasonStats.season));

  const percentileRows = await db
    .select({
      season: playerPercentiles.season,
      metric: playerPercentiles.metric,
      rawValue: playerPercentiles.rawValue,
      percentile: playerPercentiles.percentile,
      peerGroupLabel: peerGroups.label,
      peerGroupSampleSize: peerGroups.sampleSize,
    })
    .from(playerPercentiles)
    .innerJoin(peerGroups, eq(peerGroups.id, playerPercentiles.peerGroupId))
    .where(eq(playerPercentiles.playerId, playerId));

  const percentilesBySeason = new Map<string, typeof percentileRows>();
  for (const row of percentileRows) {
    const list = percentilesBySeason.get(row.season) ?? [];
    list.push(row);
    percentilesBySeason.set(row.season, list);
  }

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
        <Link href={`/players/${player.id}/similar`} className="font-mono text-xs text-paper/50 underline hover:text-spotlight">
          joueurs similaires →
        </Link>
      </header>

      {seasons.map((s) => {
        const eligible = s.minutes >= MIN_MINUTES;
        const percentiles = percentilesBySeason.get(s.season) ?? [];
        const peerGroupLabel = percentiles[0]?.peerGroupLabel;
        const peerGroupSampleSize = percentiles[0]?.peerGroupSampleSize;
        const percentileByMetric = new Map(percentiles.map((p) => [p.metric, p]));

        const radarMetrics = RADAR_KEYS
          .map((key) => {
            const def = METRIC_BY_KEY.get(key);
            const pct = percentileByMetric.get(key);
            if (!def || !pct) return null;
            return { key, label: def.label, percentile: pct.percentile };
          })
          .filter((m) => m !== null);

        return (
          <section key={s.season} className="mb-10 border-t border-paper/15 pt-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold text-paper">
                {s.competitionName} · {s.season}
              </h2>
              <p className="font-mono text-xs text-paper/50">
                {s.clubName} — {s.minutes} min ({s.matchesPlayed ?? '?'} matchs)
              </p>
            </div>

            {!eligible && (
              <p className="rounded-sm border border-spotlight/40 bg-spotlight/10 px-3 py-2 text-sm text-spotlight">
                Moins de {MIN_MINUTES} minutes jouées : les métriques per-90 sont masquées
                (bruit statistique en dessous de ce seuil).
              </p>
            )}

            {eligible && (
              <>
                {peerGroupLabel && (
                  <p className="mb-4 font-mono text-xs text-paper/60">
                    Groupe de pairs : {peerGroupLabel} ({peerGroupSampleSize} joueur
                    {peerGroupSampleSize === 1 ? '' : 's'})
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
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}
