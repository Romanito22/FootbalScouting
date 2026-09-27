import Link from 'next/link';
import { UserSearch } from 'lucide-react';
import { type PositionGroup, POSITION_GROUP_LABELS, POSITION_GROUPS } from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { btnGhost, btnPrimary, Card, EmptyState, field, label, Monogram, PageHeader } from '@/components/ui';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { listPlayers, PLAYERS_PAGE_SIZE } from '@/lib/players';

export const metadata = { title: 'Joueurs' };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = first(params.q) ?? null;
  const rawPosition = first(params.position);
  const position = (POSITION_GROUPS as readonly string[]).includes(rawPosition ?? '')
    ? (rawPosition as PositionGroup)
    : null;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);

  const { rows, total } = await listPlayers({ query, position, page });
  const pages = Math.max(1, Math.ceil(total / PLAYERS_PAGE_SIZE));

  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (position) next.set('position', position);
    next.set('page', String(n));
    return `/players?${next.toString()}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <PageHeader
        eyebrow="Explorer"
        title="Joueurs"
        description={`${total.toLocaleString('fr-FR')} joueur${total === 1 ? '' : 's'}${query ? ` pour « ${query} »` : ' en base'} · recherche tolérante aux fautes et aux accents.`}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className={`${label} w-72`}>
          Nom
          <input type="search" name="q" defaultValue={query ?? ''} placeholder="ex. mbape" className={`${field} mt-1`} />
        </label>
        <label className={`${label} w-56`}>
          Poste
          <select name="position" defaultValue={position ?? ''} className={`${field} mt-1`}>
            <option value="">Tous</option>
            {POSITION_GROUPS.map((pg) => <option key={pg} value={pg}>{POSITION_GROUP_LABELS[pg]}</option>)}
          </select>
        </label>
        <button type="submit" className={btnPrimary}>Chercher</button>
        {(query || position) && <Link href="/players" className={btnGhost}>Effacer</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<UserSearch size={28} />} title="Aucun joueur">Essaie une autre orthographe ou un autre poste.</EmptyState>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-paper/50">
                  <th className="px-5 py-2 font-medium">Joueur</th>
                  <th className="py-2 pr-3 font-medium">Poste</th>
                  <th className="py-2 pr-3 text-right font-medium">Âge</th>
                  <th className="py-2 pr-3 font-medium">Dernière saison</th>
                  <th className="py-2 pr-3 text-right font-medium">Min.</th>
                  <th className="py-2 pr-3 font-medium">Contrat</th>
                  <th className="py-2 pr-5 text-right font-medium">Valeur</th>
                </tr>
              </thead>
              <tbody className="num">
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 hover:bg-raised/50">
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-3">
                        <Monogram name={row.fullName} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/players/${row.id}`} className="font-medium text-paper hover:text-spotlight">{row.fullName}</Link>
                          {row.nationality && row.nationality.length > 0 && (
                            <div className="text-xs text-paper/40">{row.nationality.join(', ')}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-paper/70">{POSITION_GROUP_LABELS[row.positionGroup]}</td>
                    <td className="py-2 pr-3 text-right font-mono text-paper/70">{ageOn(row.birthDate) ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {row.season ? (
                        <>
                          <div className="whitespace-nowrap text-paper/80">{row.competitionName} · {row.season}</div>
                          <div className="text-xs text-paper/40">{row.clubName}</div>
                        </>
                      ) : <span className="text-paper/35">aucune stat</span>}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-paper/70">{row.minutes ?? '—'}</td>
                    <td className="py-2 pr-3"><ContractBadge contractUntil={row.contractUntil} compact /></td>
                    <td className="whitespace-nowrap py-2 pr-5 text-right font-mono text-paper/80">{formatMarketValue(row.marketValueEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-paper/60">
              {page > 1 ? <Link href={pageHref(page - 1)} className={btnGhost}>← Précédente</Link> : <span />}
              <span className="text-xs">page {page} / {pages}</span>
              {page < pages ? <Link href={pageHref(page + 1)} className={btnGhost}>Suivante →</Link> : <span />}
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
