import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db, shortlistEntries, shortlists } from '@vivier/db';
import { createShortlist } from './actions';

export default async function ShortlistsPage() {
  const rows = await db
    .select({
      id: shortlists.id,
      name: shortlists.name,
      brief: shortlists.brief,
      createdAt: shortlists.createdAt,
      entryCount: sql<number>`count(${shortlistEntries.playerId})`,
    })
    .from(shortlists)
    .leftJoin(shortlistEntries, eq(shortlistEntries.shortlistId, shortlists.id))
    .groupBy(shortlists.id)
    .orderBy(desc(shortlists.createdAt));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-paper">Shortlists</h1>

      <form action={createShortlist} className="mb-8 flex flex-wrap items-end gap-3 border-b border-paper/15 pb-6">
        <label className="text-xs text-paper/50">
          Nom
          <input type="text" name="name" required className="mt-1 block border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <label className="text-xs text-paper/50">
          Brief
          <input type="text" name="brief" placeholder="6 relayeur, été 2027, ≤ 6 M€" className="mt-1 block w-64 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper" />
        </label>
        <button type="submit" className="border border-pitch/50 px-3 py-1.5 text-sm text-pitch hover:border-pitch hover:bg-pitch/10">
          Créer
        </button>
      </form>

      {rows.length === 0 && <p className="text-paper/60">Aucune shortlist pour l'instant.</p>}

      {rows.map((row) => (
        <Link
          key={row.id}
          href={`/shortlists/${row.id}`}
          className="mb-2 flex items-center justify-between border-b border-paper/10 py-2 hover:bg-surface"
        >
          <div>
            <p className="text-paper">{row.name}</p>
            {row.brief && <p className="font-mono text-xs text-paper/50">{row.brief}</p>}
          </div>
          <span className="font-mono text-xs text-paper/50">{row.entryCount} joueur(s)</span>
        </Link>
      ))}
    </main>
  );
}
