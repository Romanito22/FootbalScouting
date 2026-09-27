import Link from 'next/link';
import { type PositionGroup, POSITION_GROUP_LABELS, POSITION_GROUPS } from '@vivier/metrics';
import { ContractBadge } from '@/components/ContractBadge';
import { ageOn, formatMarketValue } from '@/lib/contract';
import { listPlayers, PLAYERS_PAGE_SIZE } from '@/lib/players';

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-paper">Joueurs</h1>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 border-b border-paper/15 pb-6">
        <label className="text-xs text-paper/50">
          Nom (recherche floue)
          <input
            type="search" name="q" defaultValue={query ?? ''} placeholder="ex. mbape"
            className="mt-1 block w-64 border border-paper/30 bg-ink px-2 py-1 text-sm text-paper"
          />
        </label>
        <label className="text-xs text-paper/50">
          Poste
          <select name="position" defaultValue={position ?? ''} className="mt-1 block border border-paper/30 bg-ink px-2 py-1 text-sm text-paper">
            <option value="">Tous</option>
            {POSITION_GROUPS.map((pg) => (
              <option key={pg} value={pg}>{POSITION_GROUP_LABELS[pg]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="border border-spotlight px-4 py-1.5 text-sm text-spotlight hover:bg-spotlight/10">
          Chercher
        </button>
        <p className="ml-auto font-mono text-xs text-paper/50">
          {total} joueur{total === 1 ? '' : 's'}{query ? ` pour « ${query} »` : ''}
        </p>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-paper/20 text-left text-paper/50">
            <th className="py-1.5 font-normal">Nom</th>
            <th className="py-1.5 font-normal">Poste</th>
            <th className="py-1.5 text-right font-normal">Âge</th>
            <th className="py-1.5 font-normal">Dernière saison</th>
            <th className="py-1.5 text-right font-normal">Minutes</th>
            <th className="py-1.5 font-normal">Contrat</th>
            <th className="py-1.5 text-right font-normal">Valeur</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-paper/10 hover:bg-surface">
              <td className="py-1.5 font-sans">
                <Link href={`/players/${row.id}`} className="text-paper hover:text-spotlight">
                  {row.fullName}
                </Link>
                {row.nationality && row.nationality.length > 0 && (
                  <span className="ml-2 text-xs text-paper/40">{row.nationality.join(', ')}</span>
                )}
              </td>
              <td className="py-1.5 font-sans text-paper/70">{POSITION_GROUP_LABELS[row.positionGroup]}</td>
              <td className="py-1.5 text-right">{ageOn(row.birthDate) ?? '—'}</td>
              <td className="py-1.5 font-sans text-paper/70">
                {row.season
                  ? <>{row.competitionName} · {row.season} <span className="text-xs text-paper/40">{row.clubName}</span></>
                  : <span className="text-paper/40">aucune stat</span>}
              </td>
              <td className="py-1.5 text-right">{row.minutes ?? '—'}</td>
              <td className="py-1.5"><ContractBadge contractUntil={row.contractUntil} /></td>
              <td className="py-1.5 text-right">{formatMarketValue(row.marketValueEur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-4 text-sm text-paper/60">Aucun joueur.</p>}

      {pages > 1 && (
        <div className="mt-6 flex items-center gap-4 font-mono text-xs text-paper/60">
          {page > 1 && <Link href={pageHref(page - 1)} className="underline hover:text-spotlight">← précédente</Link>}
          <span>page {page} / {pages}</span>
          {page < pages && <Link href={pageHref(page + 1)} className="underline hover:text-spotlight">suivante →</Link>}
        </div>
      )}
    </main>
  );
}
