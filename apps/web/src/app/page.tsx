import Link from 'next/link';
import { count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { BellRing, NotebookPen, Search, Trophy } from 'lucide-react';
import {
  competitions, db, ingestionRuns, players, playerSeasonStats, resolutionQueue, savedSearches,
  scoutNotes, shortlistEntries, shortlists,
} from '@vivier/db';
import {
  getMetric, type PositionGroup, POSITION_GROUP_LABELS, RADAR_METRICS,
} from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { Card, Chip, EmptyState, link, Monogram, PageHeader, StatTile } from '@/components/ui';
import { contractAlert, formatMarketValue } from '@/lib/contract';
import { formatMetricValue } from '@/lib/format';
import { fetchLeaderboard, leaderboardSeasons } from '@/lib/leaderboards';
import { filtersToSearchParams, parseSearchFilters } from '@/lib/searchFilters';
import { runSearch } from '@/lib/searchQuery';

export const metadata = { title: 'Tableau de bord' };

const STATUS_LABELS = {
  a_observer: 'À observer', observe: 'Observé', prioritaire: 'Prioritaire', ecarte: 'Écarté',
} as const;
const STATUS_ORDER = ['prioritaire', 'observe', 'a_observer', 'ecarte'] as const;

/** Postes mis en avant et leur métrique d'appel (la 1ʳᵉ de leur radar). */
const SPOTLIGHT_POSITIONS: PositionGroup[] = ['ST', 'W', 'CM', 'DC'];

/**
 * Tableau de bord : ce qui demande une décision aujourd'hui. Contrats qui
 * arrivent à échéance parmi les joueurs suivis, nouveaux résultats des
 * recherches sauvegardées, shortlists, leaders récents, dernières
 * observations, et l'état des données (on ne décide pas sur des données
 * périmées).
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
      status: shortlistEntries.status,
    })
    .from(shortlistEntries)
    .innerJoin(players, eq(players.id, shortlistEntries.playerId))
    .innerJoin(shortlists, eq(shortlists.id, shortlistEntries.shortlistId))
    .orderBy(players.id, sql`${shortlistEntries.status} = 'prioritaire' DESC`);
  const active = followed.filter((p) => p.status !== 'ecarte');
  const contractAlerts = active
    .filter((p) => ['expired', 'urgent', 'soon'].includes(contractAlert(p.contractUntil)))
    .sort((a, b) => (a.contractUntil ?? '').localeCompare(b.contractUntil ?? ''));
  const followedWithoutContract = active.filter((p) => p.contractUntil === null).length;

  const lists = await db
    .select({
      id: shortlists.id,
      name: shortlists.name,
      brief: shortlists.brief,
      total: count(shortlistEntries.playerId),
      prioritaire: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'prioritaire')`,
      observe: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'observe')`,
      a_observer: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'a_observer')`,
      ecarte: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'ecarte')`,
    })
    .from(shortlists)
    .leftJoin(shortlistEntries, eq(shortlistEntries.shortlistId, shortlists.id))
    .groupBy(shortlists.id)
    .orderBy(desc(shortlists.createdAt));

  const searches = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt)).limit(6);
  const searchSummaries = await Promise.all(searches.map(async (search) => {
    const filters = parseSearchFilters(search.filters as Record<string, string | string[] | undefined>);
    const { rows } = await runSearch(filters);
    const since = search.lastCheckedAt;
    const fresh = since ? rows.filter((r) => r.ingestedAt > since).length : rows.length;
    return { search, total: rows.length, fresh, href: `/search?${filtersToSearchParams(filters).toString()}` };
  }));
  const freshTotal = searchSummaries.reduce((sum, s) => sum + s.fresh, 0);

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
    .limit(4);

  // Leaders : saison la plus récente dont le groupe est assez fourni pour
  // qu'un classement veuille dire quelque chose (≥ 20 joueurs).
  const leaders = await Promise.all(SPOTLIGHT_POSITIONS.map(async (position) => {
    const seasons = await leaderboardSeasons(position);
    const season = seasons.find((s) => s.sampleSize >= 20)?.season ?? seasons[0]?.season;
    const metric = RADAR_METRICS[position][0] ?? 'npxg';
    const rows = season ? await fetchLeaderboard({ position, season, metric, scope: 'tier', limit: 3 }) : [];
    return { position, season, metric, rows };
  }));

  const [pending] = await db.select({ n: count() }).from(resolutionQueue).where(isNull(resolutionQueue.resolvedAt));
  const [statRows] = await db.select({ n: count() }).from(playerSeasonStats);
  const [playerCount] = await db.select({ n: count() }).from(players);
  const [strengthCount] = await db.select({ n: count() }).from(competitions).where(isNotNull(competitions.strengthCoef));
  const [competitionCount] = await db.select({ n: count() }).from(competitions);
  const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(5);
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow={today}
        title="Tableau de bord"
        description="Ce qui demande une décision aujourd'hui : échéances de contrat, nouveaux profils, shortlists en cours."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Joueurs suivis" value={active.length} hint={`${lists.length} shortlist(s)`} />
        <StatTile label="Prioritaires" value={followed.filter((p) => p.status === 'prioritaire').length} tone="accent" />
        <StatTile label="Contrats ≤ 12 mois" value={contractAlerts.length} hint={followedWithoutContract ? `${followedWithoutContract} sans date connue` : undefined} tone={contractAlerts.length ? 'accent' : 'default'} />
        <StatTile label="Nouveaux résultats" value={freshTotal} hint="recherches sauvegardées" tone={freshTotal ? 'accent' : 'default'} />
        <StatTile label="Joueurs en base" value={Number(playerCount?.n ?? 0).toLocaleString('fr-FR')} hint={`${Number(statRows?.n ?? 0).toLocaleString('fr-FR')} lignes de stats`} />
        <StatTile label="Championnats estimés" value={`${Number(strengthCount?.n ?? 0)}/${Number(competitionCount?.n ?? 0)}`} hint="force avec intervalle" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Contrats à surveiller" subtitle="joueurs suivis (hors écartés) en fin de contrat sous 12 mois" className="xl:col-span-2" padded={false}>
          {contractAlerts.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<BellRing size={26} />} title="Aucune échéance proche">
                {followedWithoutContract > 0
                  ? `${followedWithoutContract} joueur(s) suivi(s) sans date de contrat : importe Transfermarkt pour activer les alertes.`
                  : 'Les joueurs de tes shortlists sont tous sous contrat au-delà de 12 mois.'}
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {contractAlerts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Monogram name={p.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/players/${p.id}`} className="font-medium text-paper hover:text-spotlight">{p.fullName}</Link>
                    <div className="text-xs text-paper/50">
                      {POSITION_GROUP_LABELS[p.positionGroup]} · {p.shortlistName} · {STATUS_LABELS[p.status]}
                    </div>
                  </div>
                  <span className="whitespace-nowrap font-mono text-sm text-paper/70">{formatMarketValue(p.marketValueEur)}</span>
                  <ContractBadge contractUntil={p.contractUntil} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recherches sauvegardées" subtitle="nouveaux résultats depuis la dernière consultation" padded={false}>
          {searchSummaries.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<Search size={26} />} title="Aucune recherche">
                <Link href="/search" className={link}>Composer une recherche</Link> et la sauvegarder pour être prévenu des nouveaux profils.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {searchSummaries.map(({ search, total, fresh, href }) => (
                <li key={search.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={href} className="min-w-0 truncate text-sm text-paper hover:text-spotlight">{search.name}</Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {fresh > 0 && <Chip tone="accent">+{fresh}</Chip>}
                    <span className="font-mono text-xs text-paper/45">{total}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Shortlists" subtitle="où en est chaque liste" className="xl:col-span-2" padded={false}>
          {lists.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucune shortlist">
                <Link href="/shortlists" className={link}>Créer une shortlist</Link> à partir d'un besoin (« 6 relayeur, ≤ 6 M€ »).
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {lists.map((l) => {
                const total = Number(l.total);
                return (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/shortlists/${l.id}`} className="font-medium text-paper hover:text-spotlight">{l.name}</Link>
                      <span className="text-xs text-paper/45">{total} joueur{total === 1 ? '' : 's'}</span>
                    </div>
                    {l.brief && <div className="text-xs text-paper/45">{l.brief}</div>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {STATUS_ORDER.map((status) => {
                        const n = Number(l[status]);
                        return n > 0 ? (
                          <Chip key={status} tone={status === 'prioritaire' ? 'accent' : status === 'ecarte' ? 'muted' : 'neutral'}>
                            {STATUS_LABELS[status]} · {n}
                          </Chip>
                        ) : null;
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Dernières observations" padded={false}>
          {notes.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={<NotebookPen size={26} />} title="Aucune note">Les notes se prennent depuis la fiche d'un joueur.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/players/${n.playerId}`} className="text-sm font-medium text-paper hover:text-spotlight">{n.fullName}</Link>
                    {n.rating !== null && <Chip tone="accent">{n.rating}/10</Chip>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-paper/65">{n.context ? `${n.context} — ` : ''}{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Leaders récents" subtitle="saison récente la plus fournie de chaque poste · percentile dans le groupe de pairs indiqué" className="mt-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {leaders.map(({ position, season, metric, rows }) => {
            const def = getMetric(metric);
            return (
              <div key={position}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-paper">{POSITION_GROUP_LABELS[position]}</div>
                  <Link href={`/leaderboards?${new URLSearchParams({ position, metric, ...(season ? { season } : {}) })}`} className="text-xs text-paper/45 hover:text-spotlight">
                    tout voir
                  </Link>
                </div>
                <div className="mb-2 text-xs text-paper/45">{def?.label} · {season ?? '—'}</div>
                {rows.length === 0 ? (
                  <p className="text-xs text-paper/40">Aucune donnée.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {rows.map((r, i) => (
                      <li key={r.playerId} className="flex items-center gap-2 text-sm">
                        <span className="w-4 font-mono text-xs text-paper/35">{i + 1}</span>
                        <Link href={`/players/${r.playerId}`} className="min-w-0 flex-1 truncate text-paper/90 hover:text-spotlight">{r.fullName}</Link>
                        <span className="num font-mono text-xs text-paper">{def ? formatMetricValue(r.rawValue, def.format) : r.rawValue.toFixed(2)}</span>
                        <span className="num w-9 text-right text-xs text-paper/50">{r.percentile}ᵉ</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-paper/40">
          <Trophy size={13} /> <Link href="/leaderboards" className="hover:text-spotlight">Tous les classements par poste, saison et métrique</Link>
        </div>
      </Card>

      <Card title="Données" subtitle="dernières ingestions" className="mt-6" padded={false}>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2 text-paper/60">{new Date(r.startedAt).toLocaleString('fr-FR')}</td>
                <td className="px-3 py-2 text-paper/80">{r.source}</td>
                <td className="px-3 py-2 font-mono text-xs text-paper/50">{r.scope}</td>
                <td className="px-3 py-2">
                  <Chip tone={r.status === 'success' ? 'positive' : r.status === 'running' ? 'accent' : 'negative'}>
                    {r.status === 'success' ? 'terminé' : r.status === 'running' ? 'en cours' : 'échec'}
                  </Chip>
                </td>
                <td className="px-5 py-2 text-right font-mono text-xs text-paper/50">{r.rowsWritten ?? '—'} lignes</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-2.5 text-xs text-paper/45">
          {Number(pending?.n ?? 0) > 0
            ? <Link href="/admin/resolution-queue" className="text-spotlight hover:underline">{Number(pending?.n)} identité(s) à arbitrer</Link>
            : 'aucune identité à arbitrer'}
          <span>·</span>
          <Link href="/health" className="hover:text-spotlight">santé système</Link>
        </div>
      </Card>
    </main>
  );
}
