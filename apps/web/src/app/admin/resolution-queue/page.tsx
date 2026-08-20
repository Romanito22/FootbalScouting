import { inArray, isNull } from 'drizzle-orm';
import { db, players, resolutionQueue } from '@vivier/db';
import { OUTFIELD_POSITION_GROUPS, POSITION_GROUP_LABELS } from '@vivier/metrics';
import { attachToExistingPlayer, createNewPlayer } from './actions';

export default async function ResolutionQueuePage() {
  const entries = await db
    .select()
    .from(resolutionQueue)
    .where(isNull(resolutionQueue.resolvedAt));

  const candidateIds = [...new Set(entries.flatMap((e) => e.candidates.map((c) => c.playerId)))];
  const candidatePlayers = candidateIds.length
    ? await db.select().from(players).where(inArray(players.id, candidateIds))
    : [];
  const playerById = new Map(candidatePlayers.map((p) => [p.id, p]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-paper">
        File d'attente — résolution d'identité
      </h1>
      <p className="mb-8 font-mono text-xs text-paper/50">
        {entries.length} entrée{entries.length === 1 ? '' : 's'} en attente d'arbitrage
      </p>

      {entries.length === 0 && (
        <p className="text-paper/60">Rien à arbitrer pour l'instant.</p>
      )}

      {entries.map((entry) => (
        <section key={entry.id} className="mb-8 border-t border-paper/15 pt-5">
          <div className="mb-3">
            <p className="font-display text-lg font-bold text-paper">{entry.rawName}</p>
            <p className="font-mono text-xs text-paper/50">
              {entry.source} · {entry.sourceId}
            </p>
          </div>

          <div className="mb-4 space-y-2">
            {entry.candidates.map((candidate) => {
              const candidatePlayer = playerById.get(candidate.playerId);
              return (
                <form key={candidate.playerId} action={attachToExistingPlayer} className="flex items-center gap-3">
                  <input type="hidden" name="entryId" value={entry.id} />
                  <input type="hidden" name="playerId" value={candidate.playerId} />
                  <button
                    type="submit"
                    className="rounded-sm border border-paper/30 px-3 py-1 text-sm text-paper hover:border-spotlight hover:text-spotlight"
                  >
                    Rattacher à {candidatePlayer?.fullName ?? `#${candidate.playerId}`}
                  </button>
                  <span className="font-mono text-xs text-paper/50">
                    score {(candidate.score * 100).toFixed(0)} %
                  </span>
                </form>
              );
            })}
          </div>

          <form action={createNewPlayer} className="flex items-center gap-3">
            <input type="hidden" name="entryId" value={entry.id} />
            <select
              name="positionGroup"
              required
              className="border border-paper/30 bg-ink px-2 py-1 text-sm text-paper"
            >
              <option value="">Poste…</option>
              {OUTFIELD_POSITION_GROUPS.map((pg) => (
                <option key={pg} value={pg}>{POSITION_GROUP_LABELS[pg]}</option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-sm border border-pitch/50 px-3 py-1 text-sm text-pitch hover:border-pitch hover:bg-pitch/10"
            >
              Créer un nouveau joueur
            </button>
          </form>
        </section>
      ))}
    </main>
  );
}
