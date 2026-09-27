import Link from 'next/link';
import { count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  competitions, db, ingestionRuns, players, playerSeasonStats, resolutionQueue, savedSearches,
  scoutNotes, shortlistEntries, shortlists,
} from '@vivier/db';
import { POSITION_GROUP_LABELS } from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { contractAlert, formatMarketValue } from '@/lib/contract';
import { parseSearchFilters, filtersToSearchParams } from '@/lib/searchFilters';
import { runSearch } from '@/lib/searchQuery';

const STATUS_LABELS = {
  a_observer: 'À observer', observe: 'Observé', prioritaire: 'Prioritaire', ecarte: 'Écarté',
} as const;

/**
 * Tableau de bord : ce qui demande une décision aujourd'hui. Contrats qui
 * arrivent à échéance parmi les joueurs suivis, nouveaux résultats des
 * recherches sauvegardées, shortlists, dernières observations, et l'état
 * des données (on ne décide pas sur des données périmées).
 */
export default async function DashboardPage() {
  const followed = await db
    .selectDistinctOn([players.id], {
      id: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      contractUntil: players.contractUntil,
      marketValueEur: players.marketValueEur,
      shortlistName: shortlists.name,
      shortlistId: shortlists.id,
      status: shortlistEntries.status,
    })
    .from(shortlistEntries)
    .innerJoin(players, eq(players.id, shortlistEntries.playerId))
    .innerJoin(shortlists, eq(shortlists.id, shortlistEntries.shortlistId))
    .orderBy(players.id, sql`${shortlistEntries.status} = 'prioritaire' DESC`);
  const contractAlerts = followed
    .filter((p) => p.status !== 'ecarte')
    .filter((p) => ['expired', 'urgent', 'soon'].includes(contractAlert(p.contractUntil)))
    .sort((a, b) => (a.contractUntil ?? '').localeCompare(b.contractUntil ?? ''));
  const followedWithoutContract = followed.filter((p) => p.contractUntil === null).length;

  const lists = await db
    .select({
      id: shortlists.id,
      name: shortlists.name,
      brief: shortlists.brief,
      total: count(shortlistEntries.playerId),
      prioritaires: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'prioritaire')`,
      aObserver: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'a_observer')`,
    })
    .from(shortlists)
    .leftJoin(shortlistEntries, eq(shortlistEntries.shortlistId, shortlists.id))
    .groupBy(shortlists.id)
    .orderBy(desc(shortlists.createdAt));

  const searches = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt)).limit(8);
  const searchSummaries = await Promise.all(searches.map(async (search) => {
    const filters = parseSearchFilters(search.filters as Record<string, string | string[] | undefined>);
    const { rows } = await runSearch(filters);
    const since = search.lastCheckedAt;
    const fresh = since ? rows.filter((r) => r.ingestedAt > since).length : rows.length;
    return { search, total: rows.length, fresh, href: `/search?${filtersToSearchParams(filters).toString()}` };
  }));

  const notes = await db
    .select({
      id: scoutNotes.id,
      playerId: scoutNotes.playerId,
      fullName: players.fullName,
      body: scoutNotes.body,
      rating: scoutNotes.rating,
      context: scoutNotes.context,
      createdAt: scoutNotes.createdAt,
    })
    .from(scoutNotes)
    .innerJoin(players, eq(players.id, scoutNotes.playerId))
    .orderBy(desc(scoutNotes.createdAt))
    .limit(5);

  const [pending] = await db.select({ n: count() }).from(resolutionQueue).where(isNull(resolutionQueue.resolvedAt));
  const [statRows] = await db.select({ n: count() }).from(playerSeasonStats);
  const [playerCount] = await db.select({ n: count() }).from(players);
  const [strengthCount] = await db.select({ n: count() }).from(competitions).where(isNotNull(competitions.strengthCoef));
  const [competitionCount] = await db.select({ n: count() }).from(competitions);
  const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(4);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight text-paper">Tableau de bord</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-paper">Contrats à surveiller</h2>
          <p className="mb-3 text-xs text-paper/50">
            Joueurs en shortlist (hors écartés) dont le contrat se termine dans les 12 mois.
          </p>
          {contractAlerts.length === 0 ? (
            <p className="text-sm text-paper/60">
              Aucune échéance proche parmi les joueurs suivis
              {followedWithoutContract > 0 && ` (${followedWithoutContract} sans date de contrat connue — importer Transfermarkt)`}.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {contractAlerts.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-paper/10 pb-1.5">
                  <span>
                    <Link href={`/players/${p.id}`} className="text-paper hover:text-spotlight">{p.fullName}</Link>
                    <span className="ml-2 text-xs text-paper/40">
                      {POSITION_GROUP_LABELS[p.positionGroup]} · {p.shortlistName} · {STATUS_LABELS[p.status]}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="whitespace-nowrap font-mono text-xs text-paper/50">{formatMarketValue(p.marketValueEur)}</span>
                    <ContractBadge contractUntil={p.contractUntil} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-paper">Recherches sauvegardées</h2>
          <p className="mb-3 text-xs text-paper/50">Nouveaux résultats depuis la dernière consultation.</p>
          {searchSummaries.length === 0 ? (
            <p className="text-sm text-paper/60">
              Aucune — <Link href="/search" className="underline hover:text-spotlight">en créer une</Link>.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {searchSummaries.map(({ search, total, fresh, href }) => (
                <li key={search.id} className="flex items-baseline justify-between gap-3 border-b border-paper/10 pb-1.5">
                  <Link href={href} className="text-paper hover:text-spotlight">{search.name}</Link>
                  <span className="font-mono text-xs">
                    {fresh > 0 && <span className="mr-2 border border-spotlight/60 px-1 text-spotlight">+{fresh} nouveau{fresh === 1 ? '' : 'x'}</span>}
                    <span className="text-paper/50">{total} résultat{total === 1 ? '' : 's'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-paper">Shortlists</h2>
          {lists.length === 0 ? (
            <p className="text-sm text-paper/60">
              Aucune — <Link href="/shortlists" className="underline hover:text-spotlight">en créer une</Link>.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {lists.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 border-b border-paper/10 pb-1.5">
                  <span>
                    <Link href={`/shortlists/${l.id}`} className="text-paper hover:text-spotlight">{l.name}</Link>
                    {l.brief && <span className="ml-2 text-xs text-paper/40">{l.brief}</span>}
                  </span>
                  <span className="font-mono text-xs text-paper/50">
                    {Number(l.total)} joueur{Number(l.total) === 1 ? '' : 's'} · {Number(l.prioritaires)} prioritaire{Number(l.prioritaires) === 1 ? '' : 's'} · {Number(l.aObserver)} à observer
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-paper">Dernières observations</h2>
          {notes.length === 0 ? (
            <p className="text-sm text-paper/60">Aucune note de scouting pour l'instant.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="border-b border-paper/10 pb-2">
                  <div className="flex items-baseline justify-between">
                    <Link href={`/players/${n.playerId}`} className="text-paper hover:text-spotlight">{n.fullName}</Link>
                    <span className="font-mono text-xs text-paper/50">
                      {n.rating !== null && <span className="mr-2 text-spotlight">{n.rating}/10</span>}
                      {new Date(n.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-paper/70">{n.context ? `${n.context} — ` : ''}{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-12 border-t border-paper/15 pt-4">
        <h2 className="mb-2 font-display text-lg font-bold text-paper">Données</h2>
        <p className="font-mono text-xs text-paper/60">
          {Number(playerCount?.n ?? 0)} joueurs · {Number(statRows?.n ?? 0)} lignes de stats ·{' '}
          {Number(strengthCount?.n ?? 0)}/{Number(competitionCount?.n ?? 0)} compétitions avec coefficient de force ·{' '}
          {Number(pending?.n ?? 0) > 0
            ? <Link href="/admin/resolution-queue" className="text-spotlight underline">{Number(pending?.n)} identité(s) à arbitrer</Link>
            : 'aucune identité à arbitrer'}
          {' · '}<Link href="/health" className="underline hover:text-spotlight">santé système</Link>
        </p>
        <ul className="mt-2 space-y-0.5 font-mono text-xs text-paper/50">
          {runs.map((r) => (
            <li key={r.id}>
              {new Date(r.startedAt).toLocaleString('fr-FR')} · {r.source} · {r.scope} ·{' '}
              <span className={r.status === 'success' ? 'text-pitch' : 'text-signal'}>{r.status}</span>
              {r.rowsWritten !== null && ` · ${r.rowsWritten} lignes`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
