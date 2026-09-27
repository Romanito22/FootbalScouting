import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { db, players, scoutNotes, shortlistEntries, shortlists } from '@vivier/db';
import { POSITION_GROUP_LABELS } from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { btnDanger, btnPrimary, Chip, EmptyState, field, link, Monogram, PageHeader } from '@/components/ui';
import { MAX_COMPARED } from '@/lib/compareIds';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { deleteShortlist, moveEntry, removeEntry, updateEntryStatus } from '../actions';

const COLUMNS = [
  { status: 'prioritaire', label: 'Prioritaire', hint: 'à activer' },
  { status: 'observe', label: 'Observé', hint: 'vu, à trancher' },
  { status: 'a_observer', label: 'À observer', hint: 'à aller voir' },
  { status: 'ecarte', label: 'Écarté', hint: 'hors cible' },
] as const;

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
      birthDate: players.birthDate,
      contractUntil: players.contractUntil,
      marketValueEur: players.marketValueEur,
      latestRating: sql<number | null>`(
        SELECT ${scoutNotes.rating} FROM ${scoutNotes}
        WHERE ${scoutNotes.playerId} = ${players.id} AND ${scoutNotes.rating} IS NOT NULL
        ORDER BY ${scoutNotes.createdAt} DESC LIMIT 1
      )`,
      notesCount: sql<number>`(SELECT count(*) FROM ${scoutNotes} WHERE ${scoutNotes.playerId} = ${players.id})`,
    })
    .from(shortlistEntries)
    .innerJoin(players, eq(players.id, shortlistEntries.playerId))
    .where(eq(shortlistEntries.shortlistId, shortlistId))
    .orderBy(sql`${shortlistEntries.rank} NULLS LAST, ${shortlistEntries.addedAt}`);

  return (
    <main className="mx-auto max-w-[96rem] px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow={<Link href="/shortlists" className="hover:text-spotlight">← Shortlists</Link>}
        title={shortlist.name}
        description={shortlist.brief ?? 'Pas de brief.'}
        actions={
          <>
            {entries.length > 1 && (
              <form id="compare-form" action="/compare" method="get">
                <button type="submit" className={btnPrimary} title={`Coche jusqu'à ${MAX_COMPARED} joueurs`}>
                  Comparer la sélection (≤ {MAX_COMPARED})
                </button>
              </form>
            )}
            <form action={deleteShortlist}>
              <input type="hidden" name="id" value={shortlist.id} />
              <button type="submit" className={btnDanger}><Trash2 size={14} /> Supprimer</button>
            </form>
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState title="Aucun joueur pour l'instant">
          Ajoute des joueurs depuis leur fiche (bouton « + Shortlist »), depuis la <Link href="/search" className={link}>recherche</Link> ou les <Link href="/leaderboards" className={link}>classements</Link>.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const cards = entries.filter((e) => e.status === column.status);
            return (
              <section key={column.status} className="flex min-h-40 flex-col rounded-xl border border-line bg-surface/60">
                <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
                  <div>
                    <h2 className={`font-display text-lg font-bold ${column.status === 'prioritaire' ? 'text-spotlight' : column.status === 'ecarte' ? 'text-paper/45' : 'text-paper'}`}>
                      {column.label}
                    </h2>
                    <div className="text-xs text-paper/40">{column.hint}</div>
                  </div>
                  <span className="text-sm text-paper/50">{cards.length}</span>
                </header>
                <ol className="flex-1 space-y-2.5 p-3">
                  {cards.map((entry, i) => (
                    <li key={entry.playerId} className={`rounded-lg border border-line bg-surface p-3 ${column.status === 'ecarte' ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox" name="ids" value={entry.playerId} form="compare-form"
                          defaultChecked={entry.status === 'prioritaire'}
                          aria-label={`Comparer ${entry.fullName}`}
                          className="mt-2"
                        />
                        <Monogram name={entry.fullName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/players/${entry.playerId}`} className="block truncate font-medium text-paper hover:text-spotlight">
                            {entry.fullName}
                          </Link>
                          <div className="text-xs text-paper/50">
                            {POSITION_GROUP_LABELS[entry.positionGroup]} · {ageOn(entry.birthDate) !== null ? `${ageOn(entry.birthDate)} ans` : 'âge inconnu'}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <form action={moveEntry}>
                            <input type="hidden" name="shortlistId" value={shortlistId} />
                            <input type="hidden" name="playerId" value={entry.playerId} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" disabled={i === 0} aria-label="Monter" className="text-paper/40 hover:text-spotlight disabled:opacity-20"><ChevronUp size={16} /></button>
                          </form>
                          <form action={moveEntry}>
                            <input type="hidden" name="shortlistId" value={shortlistId} />
                            <input type="hidden" name="playerId" value={entry.playerId} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" disabled={i === cards.length - 1} aria-label="Descendre" className="text-paper/40 hover:text-spotlight disabled:opacity-20"><ChevronDown size={16} /></button>
                          </form>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {entry.contractUntil && <ContractBadge contractUntil={entry.contractUntil} />}
                        {entry.marketValueEur !== null && <Chip>{formatMarketValue(entry.marketValueEur)}</Chip>}
                        {entry.latestRating !== null
                          ? <Chip tone="accent">{entry.latestRating}/10</Chip>
                          : <Chip tone="muted">pas noté</Chip>}
                        {Number(entry.notesCount) > 0 && <Chip tone="muted">{Number(entry.notesCount)} note(s)</Chip>}
                      </div>
                      <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
                        <form action={updateEntryStatus} className="flex flex-1 items-center gap-1.5">
                          <input type="hidden" name="shortlistId" value={shortlistId} />
                          <input type="hidden" name="playerId" value={entry.playerId} />
                          <select name="status" defaultValue={entry.status} aria-label="Statut" className={`${field} py-1 text-xs`}>
                            {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                          </select>
                          <button type="submit" className="rounded-md border border-line px-2 py-1 text-xs text-paper/70 hover:border-spotlight/60 hover:text-spotlight">OK</button>
                        </form>
                        <form action={removeEntry}>
                          <input type="hidden" name="shortlistId" value={shortlistId} />
                          <input type="hidden" name="playerId" value={entry.playerId} />
                          <button type="submit" aria-label={`Retirer ${entry.fullName}`} className="text-paper/35 hover:text-signal"><X size={16} /></button>
                        </form>
                      </div>
                    </li>
                  ))}
                  {cards.length === 0 && <li className="px-1 py-4 text-center text-xs text-paper/30">—</li>}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
