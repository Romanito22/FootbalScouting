import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, players, shortlistEntries, shortlists } from '@vivier/db';
import { POSITION_GROUP_LABELS } from '@vivier/metrics';
import { deleteShortlist, moveEntry, removeEntry, updateEntryStatus } from '../actions';

const STATUS_LABELS: Record<string, string> = {
  a_observer: 'À observer',
  observe: 'Observé',
  prioritaire: 'Prioritaire',
  ecarte: 'Écarté',
};

export default async function ShortlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shortlistId = Number(id);
  if (!Number.isInteger(shortlistId)) notFound();

  const [shortlist] = await db.select().from(shortlists).where(eq(shortlists.id, shortlistId));
  if (!shortlist) notFound();

  const entries = await db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      status: shortlistEntries.status,
    })
    .from(shortlistEntries)
    .innerJoin(players, eq(players.id, shortlistEntries.playerId))
    .where(eq(shortlistEntries.shortlistId, shortlistId))
    .orderBy(sql`${shortlistEntries.rank} NULLS LAST, ${shortlistEntries.addedAt}`);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-paper">{shortlist.name}</h1>
          {shortlist.brief && <p className="mt-1 font-mono text-xs text-paper/50">{shortlist.brief}</p>}
        </div>
        <form action={deleteShortlist}>
          <input type="hidden" name="id" value={shortlist.id} />
          <button type="submit" className="border border-signal/50 px-3 py-1 text-xs text-signal hover:border-signal hover:bg-signal/10">
            Supprimer la shortlist
          </button>
        </form>
      </div>

      {entries.length === 0 && (
        <p className="text-paper/60">
          Aucun joueur pour l'instant — ajoute-en depuis une fiche joueur.
        </p>
      )}

      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={entry.playerId} className="flex items-center gap-3 border-b border-paper/10 pb-2">
            <div className="flex flex-col">
              <form action={moveEntry}>
                <input type="hidden" name="shortlistId" value={shortlistId} />
                <input type="hidden" name="playerId" value={entry.playerId} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" disabled={i === 0} className="block text-paper/40 hover:text-spotlight disabled:opacity-20">▲</button>
              </form>
              <form action={moveEntry}>
                <input type="hidden" name="shortlistId" value={shortlistId} />
                <input type="hidden" name="playerId" value={entry.playerId} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" disabled={i === entries.length - 1} className="block text-paper/40 hover:text-spotlight disabled:opacity-20">▼</button>
              </form>
            </div>

            <Link href={`/players/${entry.playerId}`} className="flex-1 text-paper hover:text-spotlight">
              {entry.fullName}
              <span className="ml-2 font-mono text-xs text-paper/50">
                {POSITION_GROUP_LABELS[entry.positionGroup as keyof typeof POSITION_GROUP_LABELS]}
              </span>
            </Link>

            <form action={updateEntryStatus} className="flex items-center gap-2">
              <input type="hidden" name="shortlistId" value={shortlistId} />
              <input type="hidden" name="playerId" value={entry.playerId} />
              <select name="status" defaultValue={entry.status} className="border border-paper/30 bg-ink px-2 py-1 text-xs text-paper">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <button type="submit" className="border border-paper/30 px-2 py-1 text-xs text-paper/70 hover:border-spotlight hover:text-spotlight">
                OK
              </button>
            </form>

            <form action={removeEntry}>
              <input type="hidden" name="shortlistId" value={shortlistId} />
              <input type="hidden" name="playerId" value={entry.playerId} />
              <button type="submit" className="text-xs text-signal/70 hover:text-signal">
                retirer
              </button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}
