import { sql } from 'drizzle-orm';
import { db } from '@vivier/db';
import { describeScope } from './scope';

/**
 * État « temps réel » des données, lu dans `ingestion_runs` (le pipeline y
 * inscrit chaque run dès son démarrage). Le web ne contacte jamais de
 * source externe : il observe la base, que le job `live` alimente.
 */
export interface LiveStatus {
  /** Fin du dernier run réussi (ingestion ou recalcul) : change = nouvelles données. */
  lastSuccessAt: string | null;
  /** Runs en cours (un run « running » de plus de 6 h est considéré interrompu). */
  running: { source: string; label: string; startedAt: string }[];
  lastFailure: { source: string; label: string; at: string } | null;
}

export const STALE_RUN_HOURS = 6;

export async function fetchLiveStatus(): Promise<LiveStatus> {
  const [summary] = await db.execute<{ last_success_at: string | null }>(sql`
    SELECT to_char(max(finished_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_success_at
    FROM ingestion_runs WHERE status = 'success'
  `);
  const running = await db.execute<{ source: string; scope: string; started_at: string }>(sql`
    SELECT source::text, scope,
           to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at
    FROM ingestion_runs
    WHERE status = 'running' AND started_at > now() - make_interval(hours => ${STALE_RUN_HOURS})
    ORDER BY started_at
  `);
  const [failure] = await db.execute<{ source: string; scope: string; at: string }>(sql`
    SELECT source::text, scope,
           to_char(coalesce(finished_at, started_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
    FROM ingestion_runs
    WHERE status = 'failed' AND started_at > now() - interval '24 hours'
    ORDER BY started_at DESC LIMIT 1
  `);
  return {
    lastSuccessAt: summary?.last_success_at ?? null,
    running: running.map((r) => ({
      source: r.source, label: describeScope(r.source, r.scope), startedAt: r.started_at,
    })),
    lastFailure: failure
      ? { source: failure.source, label: describeScope(failure.source, failure.scope), at: failure.at }
      : null,
  };
}
