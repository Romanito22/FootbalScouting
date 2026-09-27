import { sql } from 'drizzle-orm';
import { Card, Chip, PageHeader, StatTile } from '@/components/ui';
import { describeScope, SOURCE_LABELS } from '@/lib/scope';
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

const RUN_HISTORY = 20;

const STATUS_CHIPS: Record<string, { tone: 'accent' | 'neutral' | 'negative'; label: string }> = {
  running: { tone: 'accent', label: 'en cours' },
  success: { tone: 'neutral', label: 'réussi' },
  failed: { tone: 'negative', label: 'échec' },
};
const statusChip = (status: string) => STATUS_CHIPS[status] ?? { tone: 'neutral' as const, label: status };

function duration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return '—';
  const seconds = Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000);
  if (seconds < 1) return '< 1 s';
  if (seconds < 90) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

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

    const runs = await db
      .select()
      .from(ingestionRuns)
      .orderBy(sql`${ingestionRuns.startedAt} DESC, ${ingestionRuns.id} DESC`)
      .limit(RUN_HISTORY);

    return {
      ok: true as const,
      serverTime,
      vectorVersion: vectorRows[0]?.extversion ?? null,
      counts,
      runs,
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const metadata = { title: 'Santé système' };

export default async function HealthPage() {
  const health = await getHealth();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader eyebrow="Données" title="Santé système" description="Docker → Postgres → pgvector → Drizzle → Next.js : chaque maillon de la chaîne." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Postgres" value={health.ok ? 'connecté' : 'hors ligne'} hint={health.ok ? health.serverTime ?? undefined : undefined} tone={health.ok ? 'default' : 'accent'} />
        <StatTile label="Extension vector" value={health.ok ? health.vectorVersion ?? 'absente' : '—'} />
        <StatTile
          label="Dernière tâche"
          value={health.ok && health.runs[0] ? statusChip(health.runs[0].status).label : '—'}
          hint={health.ok && health.runs[0] ? new Date(health.runs[0].startedAt).toLocaleString('fr-FR') : undefined}
        />
      </div>

      {!health.ok ? (
        <Card title="Erreur de connexion">
          <pre className="whitespace-pre-wrap text-sm text-signal">{health.error}</pre>
          <p className="mt-3 text-sm text-paper/60">Lancer <code>pnpm db:up</code> puis <code>pnpm db:migrate</code>.</p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Tables" padded={false}>
            <table className="w-full text-sm">
              <tbody className="num">
                {health.counts.map(({ name, count }) => (
                  <tr key={name} className="border-b border-line/60">
                    <td className="px-5 py-1.5 font-mono text-xs text-paper/70">{name}</td>
                    <td className="px-5 py-1.5 text-right font-mono text-paper">{count.toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title={`Ingestions et recalculs · ${RUN_HISTORY} dernières tâches`} padded={false}>
            {health.runs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-paper/50">Aucune tâche enregistrée.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="num">
                  {health.runs.map((run) => (
                    <tr key={run.id} className="border-b border-line/60 align-top">
                      <td className="px-5 py-1.5">
                        <div className="text-paper/85">{SOURCE_LABELS[run.source] ?? run.source} · {describeScope(run.source, run.scope)}</div>
                        <div className="text-xs text-paper/40">
                          {new Date(run.startedAt).toLocaleString('fr-FR')} · {duration(run.startedAt, run.finishedAt)}
                        </div>
                        {run.error && <div className="mt-0.5 line-clamp-2 font-mono text-xs text-[#e08a80]" title={run.error}>{run.error}</div>}
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs text-paper/70">{run.rowsWritten?.toLocaleString('fr-FR') ?? '—'}</td>
                      <td className="px-5 py-1.5 text-right">
                        <Chip tone={statusChip(run.status).tone}>{statusChip(run.status).label}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}
