import { sql } from 'drizzle-orm';
import { Card, PageHeader, StatTile } from '@/components/ui';
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

export const metadata = { title: 'Santé système' };

export default async function HealthPage() {
  const health = await getHealth();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader eyebrow="Données" title="Santé système" description="Docker → Postgres → pgvector → Drizzle → Next.js : chaque maillon de la chaîne." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Postgres" value={health.ok ? 'connecté' : 'hors ligne'} hint={health.ok ? health.serverTime ?? undefined : undefined} tone={health.ok ? 'default' : 'accent'} />
        <StatTile label="Extension vector" value={health.ok ? health.vectorVersion ?? 'absente' : '—'} />
        <StatTile label="Dernière ingestion" value={health.ok && health.lastRun ? health.lastRun.status : '—'} hint={health.ok && health.lastRun ? new Date(health.lastRun.startedAt).toLocaleString('fr-FR') : undefined} />
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
          <Card title="Dernière ingestion">
            {health.lastRun ? (
              <dl className="space-y-2 text-sm">
                {Object.entries({
                  Source: health.lastRun.source,
                  Périmètre: health.lastRun.scope,
                  Statut: health.lastRun.status,
                  Lignes: String(health.lastRun.rowsWritten ?? '—'),
                  Début: new Date(health.lastRun.startedAt).toLocaleString('fr-FR'),
                  Fin: health.lastRun.finishedAt ? new Date(health.lastRun.finishedAt).toLocaleString('fr-FR') : '—',
                  Erreur: health.lastRun.error ?? '—',
                }).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line/60 pb-1.5">
                    <dt className="text-paper/50">{k}</dt>
                    <dd className="text-right font-mono text-xs text-paper/85">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-paper/50">Aucune ingestion.</p>}
          </Card>
        </div>
      )}
    </main>
  );
}
