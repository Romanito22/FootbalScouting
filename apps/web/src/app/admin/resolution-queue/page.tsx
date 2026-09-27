import { inArray, isNull } from 'drizzle-orm';
import { db, players, resolutionQueue } from '@vivier/db';
import { POSITION_GROUP_LABELS, POSITION_GROUPS } from '@vivier/metrics';
import { CheckCircle2 } from 'lucide-react';
import { btnPrimary, btnSecondary, Card, EmptyState, field, label, PageHeader } from '@/components/ui';
import { attachToExistingPlayer, createNewPlayer } from './actions';

export const metadata = { title: 'Arbitrage' };

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
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow="Données"
        title="Arbitrage d'identité"
        description={`${entries.length} entrée${entries.length === 1 ? '' : 's'} en attente : des joueurs vus dans une source mais qu'on ne peut rattacher avec certitude. Rattacher à un candidat, ou créer un nouveau joueur ; le prochain run du pipeline écrit alors ses stats.`}
      />

      {entries.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title="Rien à arbitrer">Toutes les identités sont résolues.</EmptyState>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id} title={entry.rawName} subtitle={`${entry.source} · ${entry.sourceId}`}>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-paper/45">Candidats</div>
                  <div className="space-y-2">
                    {entry.candidates.map((candidate) => {
                      const candidatePlayer = playerById.get(candidate.playerId);
                      return (
                        <form key={candidate.playerId} action={attachToExistingPlayer} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                          <input type="hidden" name="entryId" value={entry.id} />
                          <input type="hidden" name="playerId" value={candidate.playerId} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-paper">{candidatePlayer?.fullName ?? `#${candidate.playerId}`}</div>
                            <div className="mt-1 h-1.5 rounded-sm bg-raised" aria-hidden="true">
                              <div className="h-full rounded-r-[4px] bg-spotlight" style={{ width: `${candidate.score * 100}%` }} />
                            </div>
                          </div>
                          <span className="num w-10 text-right font-mono text-xs text-paper/70">{(candidate.score * 100).toFixed(0)} %</span>
                          <button type="submit" className={btnSecondary}>Rattacher</button>
                        </form>
                      );
                    })}
                    {entry.candidates.length === 0 && <p className="text-sm text-paper/50">Aucun candidat.</p>}
                  </div>
                </div>
                <form action={createNewPlayer} className="space-y-3">
                  <input type="hidden" name="entryId" value={entry.id} />
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-paper/45">Ou créer un nouveau joueur</div>
                  <label className={label}>
                    Poste
                    <select name="positionGroup" required className={`${field} mt-1`}>
                      <option value="">Choisir…</option>
                      {POSITION_GROUPS.map((pg) => <option key={pg} value={pg}>{POSITION_GROUP_LABELS[pg]}</option>)}
                    </select>
                  </label>
                  <button type="submit" className={btnPrimary}>Créer le joueur</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
