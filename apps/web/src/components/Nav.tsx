import Link from 'next/link';
import { count, isNull } from 'drizzle-orm';
import { Search } from 'lucide-react';
import { db, resolutionQueue } from '@vivier/db';
import { fetchLiveStatus, type LiveStatus } from '@/lib/live';
import { LiveIndicator } from './LiveIndicator';
import { SidebarNav } from './SidebarNav';

async function sidebarData(): Promise<{ pending: number | null; live: LiveStatus | null }> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(resolutionQueue)
      .where(isNull(resolutionQueue.resolvedAt));
    return { pending: row?.n ?? 0, live: await fetchLiveStatus() };
  } catch {
    // Base indisponible : la page de santé dira pourquoi, la navigation reste utilisable.
    return { pending: null, live: null };
  }
}

export async function Nav() {
  const { pending, live } = await sidebarData();
  return (
    <aside className="border-b border-line bg-surface/60 print:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-3 px-3 py-3 lg:gap-6 lg:py-5">
        <Link href="/" className="px-3">
          <div className="font-display text-2xl font-bold tracking-tight text-paper">VIVIER</div>
          <div className="hidden text-[11px] text-paper/40 lg:block">moteur de décision de recrutement</div>
        </Link>

        <form action="/players" method="get" className="relative px-1">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-paper/35" aria-hidden="true" />
          <input
            type="search"
            name="q"
            placeholder="Joueur… (ex. mbape)"
            aria-label="Rechercher un joueur par nom"
            className="w-full rounded-md border border-line bg-ink py-1.5 pl-8 pr-2 text-sm text-paper placeholder:text-paper/30 focus:border-spotlight/60 focus:outline-none"
          />
        </form>

        <SidebarNav pendingResolutions={pending} />

        <div className="lg:mt-auto">
          <LiveIndicator initial={live} />
        </div>
      </div>
    </aside>
  );
}
