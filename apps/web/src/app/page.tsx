import { sql } from 'drizzle-orm';
import {
  clubs, competitions, db, ingestionRuns, peerGroups, playerAliases,
  playerPercentiles, players, playerSeasonStats, playerVectors,
  resolutionQueue, scoutNotes, shortlistEntries, shortlists,
} from '@vivier/db';

const TABLES = [
  { name: 'competitions', table: competitions },
  { name: 'clubs', table: clubs },
  { name: 'players', table: players },
  { name: 'player_aliases', table: playerAliases },
  { name: 'resolution_queue', table: resolutionQueue },
  { name: 'player_season_stats', table: playerSeasonStats },
  { name: 'peer_groups', table: peerGroups },
  { name: 'player_percentiles', table: playerPercentiles },
  { name: 'player_vectors', table: playerVectors },
  { name: 'shortlists', table: shortlists },
  { name: 'shortlist_entries', table: shortlistEntries },
  { name: 'scout_notes', table: scoutNotes },
  { name: 'ingestion_runs', table: ingestionRuns },
] as const;

async function getHealth() {
  try {
    const nowRows = await db.execute<{ now: string }>(sql`SELECT now()::text AS now`);
    const serverTime = nowRows[0]?.now ?? null;

    const vectorRows = await db.execute<{ extversion: string }>(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );

    const counts = await Promise.all(
      TABLES.map(async ({ name, table }) => {
        const rows = await db.execute<{ count: string }>(
          sql`SELECT count(*)::text AS count FROM ${table}`,
        );
        return { name, count: Number(rows[0]?.count ?? 0) };
      }),
    );

    const lastRunRows = await db
      .select()
      .from(ingestionRuns)
      .orderBy(sql`${ingestionRuns.startedAt} DESC`)
      .limit(1);

    return {
      ok: true as const,
      serverTime,
      vectorVersion: vectorRows[0]?.extversion ?? null,
      counts,
      lastRun: lastRunRows[0] ?? null,
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function HealthPage() {
  const health = await getHealth();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-base font-bold tracking-tight">VIVIER — santé système</h1>
        <div className="flex gap-4">
          <a href="/search" className="text-neutral-400 underline hover:text-neutral-200">
            recherche →
          </a>
          <a href="/players" className="text-neutral-400 underline hover:text-neutral-200">
            joueurs →
          </a>
          <a href="/shortlists" className="text-neutral-400 underline hover:text-neutral-200">
            shortlists →
          </a>
          <a href="/admin/resolution-queue" className="text-neutral-400 underline hover:text-neutral-200">
            file d'attente →
          </a>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-1 text-neutral-500">connexion postgres</h2>
        {health.ok ? (
          <p className="text-green-500">OK — {health.serverTime}</p>
        ) : (
          <p className="whitespace-pre-wrap text-red-500">ERREUR — {health.error}</p>
        )}
      </section>

      {health.ok && (
        <>
          <section className="mb-6">
            <h2 className="mb-1 text-neutral-500">extension vector</h2>
            <p>{health.vectorVersion ?? 'non installée'}</p>
          </section>

          <section className="mb-6">
            <h2 className="mb-1 text-neutral-500">tables</h2>
            <table className="w-full border-collapse">
              <tbody>
                {health.counts.map(({ name, count }) => (
                  <tr key={name} className="border-b border-neutral-800">
                    <td className="py-0.5 pr-4 text-neutral-400">{name}</td>
                    <td className="py-0.5 text-right tabular-nums">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-1 text-neutral-500">dernière ingestion</h2>
            {health.lastRun ? (
              <pre className="whitespace-pre-wrap">{JSON.stringify(health.lastRun, null, 2)}</pre>
            ) : (
              <p className="text-neutral-500">aucune ingestion</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
