import Link from 'next/link';
import { count, desc, isNull } from 'drizzle-orm';
import { Search } from 'lucide-react';
import { db, ingestionRuns, resolutionQueue } from '@vivier/db';
import { SidebarNav } from './SidebarNav';

async function sidebarData(): Promise<{ pending: number | null; lastRun: Date | null }> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(resolutionQueue)
      .where(isNull(resolutionQueue.resolvedAt));
    const [run] = await db
      .select({ at: ingestionRuns.startedAt })
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(1);
    return { pending: row?.n ?? 0, lastRun: run?.at ?? null };
  } catch {
    // Base indisponible : la page de santé dira pourquoi, la navigation reste utilisable.
    return { pending: null, lastRun: null };
  }
}

function ago(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export async function Nav() {
  const { pending, lastRun } = await sidebarData();
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

        <div className="mt-auto hidden px-3 text-[11px] leading-relaxed text-paper/40 lg:block">
          Dernière ingestion
          <div className="text-paper/60">{lastRun ? ago(lastRun) : 'aucune'}</div>
        </div>
      </div>
    </aside>
  );
}
