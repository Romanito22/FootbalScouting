import Link from 'next/link';
import { count, isNull } from 'drizzle-orm';
import { db, resolutionQueue } from '@vivier/db';

const LINKS = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/search', label: 'Recherche' },
  { href: '/players', label: 'Joueurs' },
  { href: '/compare', label: 'Comparer' },
  { href: '/shortlists', label: 'Shortlists' },
  { href: '/competitions', label: 'Championnats' },
] as const;

async function pendingResolutions(): Promise<number | null> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(resolutionQueue)
      .where(isNull(resolutionQueue.resolvedAt));
    return row?.n ?? 0;
  } catch {
    // Base indisponible : la page de santé dira pourquoi, la navigation reste utilisable.
    return null;
  }
}

export async function Nav() {
  const pending = await pendingResolutions();
  return (
    <header className="border-b border-paper/10 print:hidden">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3 text-sm">
        <Link href="/" className="font-display text-lg font-bold tracking-tight text-paper">
          VIVIER
        </Link>
        {LINKS.slice(1).map((link) => (
          <Link key={link.href} href={link.href} className="text-paper/60 hover:text-spotlight">
            {link.label}
          </Link>
        ))}
        <Link href="/admin/resolution-queue" className="text-paper/60 hover:text-spotlight">
          Arbitrage
          {pending !== null && pending > 0 && (
            <span className="ml-1 border border-spotlight/60 px-1 font-mono text-xs text-spotlight">{pending}</span>
          )}
        </Link>
        <Link href="/health" className="text-paper/40 hover:text-spotlight">Santé</Link>
        <form action="/players" method="get" className="ml-auto">
          <input
            type="search"
            name="q"
            placeholder="Joueur… (ex. mbape)"
            aria-label="Rechercher un joueur par nom"
            className="w-56 border border-paper/20 bg-ink px-2 py-1 text-sm text-paper placeholder:text-paper/30"
          />
        </form>
      </nav>
    </header>
  );
}
