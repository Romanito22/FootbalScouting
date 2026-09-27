'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight, Database, Gauge, LayoutDashboard, ListChecks, Search, Trophy, Users, Scale,
} from 'lucide-react';

const GROUPS = [
  {
    label: 'Décider',
    links: [
      { href: '/', label: 'Tableau de bord', icon: LayoutDashboard },
      { href: '/search', label: 'Recherche', icon: Search },
      { href: '/compare', label: 'Comparer', icon: ArrowLeftRight },
      { href: '/shortlists', label: 'Shortlists', icon: ListChecks },
    ],
  },
  {
    label: 'Explorer',
    links: [
      { href: '/players', label: 'Joueurs', icon: Users },
      { href: '/leaderboards', label: 'Classements', icon: Trophy },
      { href: '/competitions', label: 'Championnats', icon: Scale },
    ],
  },
  {
    label: 'Données',
    links: [
      { href: '/admin/resolution-queue', label: 'Arbitrage', icon: Database },
      { href: '/health', label: 'Santé système', icon: Gauge },
    ],
  },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ pendingResolutions }: { pendingResolutions: number | null }) {
  const pathname = usePathname();
  return (
    // Mobile : une rangée défilante ; grand écran : colonne groupée.
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
      {GROUPS.map((group) => (
        <div key={group.label} className="contents lg:block">
          <div className="mb-1.5 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-paper/35 lg:block">
            {group.label}
          </div>
          <ul className="contents lg:block lg:space-y-0.5">
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition ${
                      active
                        ? 'bg-raised font-medium text-paper shadow-[inset_2px_0_0_var(--color-spotlight)]'
                        : 'text-paper/60 hover:bg-raised/60 hover:text-paper'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} className={active ? 'text-spotlight' : ''} aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    {href === '/admin/resolution-queue' && pendingResolutions !== null && pendingResolutions > 0 && (
                      <span className="rounded-full bg-spotlight/15 px-1.5 text-xs font-semibold text-spotlight">
                        {pendingResolutions}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
