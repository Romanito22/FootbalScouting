import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { ListChecks } from 'lucide-react';
import { db, shortlistEntries, shortlists } from '@vivier/db';
import { btnPrimary, Card, Chip, EmptyState, field, label, PageHeader } from '@/components/ui';
import { createShortlist } from './actions';

export const metadata = { title: 'Shortlists' };

export default async function ShortlistsPage() {
  const rows = await db
    .select({
      id: shortlists.id,
      name: shortlists.name,
      brief: shortlists.brief,
      createdAt: shortlists.createdAt,
      total: sql<number>`count(${shortlistEntries.playerId})`,
      prioritaires: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'prioritaire')`,
      observes: sql<number>`count(*) FILTER (WHERE ${shortlistEntries.status} = 'observe')`,
    })
    .from(shortlists)
    .leftJoin(shortlistEntries, eq(shortlistEntries.shortlistId, shortlists.id))
    .groupBy(shortlists.id)
    .orderBy(desc(shortlists.createdAt));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <PageHeader eyebrow="Décider" title="Shortlists" description="Une liste par besoin de recrutement, avec son brief ; chaque joueur avance d'« à observer » à « prioritaire » (ou « écarté »)." />

      <Card title="Nouvelle shortlist" className="mb-6">
        <form action={createShortlist} className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-64`}>Nom<input type="text" name="name" required placeholder="Relayeur été 2027" className={`${field} mt-1`} /></label>
          <label className={`${label} min-w-72 flex-1`}>Brief<input type="text" name="brief" placeholder="6 relayeur, ≤ 24 ans, ≤ 6 M€, gaucher de préférence" className={`${field} mt-1`} /></label>
          <button type="submit" className={btnPrimary}>Créer</button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={<ListChecks size={28} />} title="Aucune shortlist">Crée la première à partir d'un besoin concret.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Link key={row.id} href={`/shortlists/${row.id}`} className="group rounded-xl border border-line bg-surface p-5 transition hover:border-spotlight/50">
              <div className="font-display text-xl font-bold text-paper group-hover:text-spotlight">{row.name}</div>
              <div className="mt-1 line-clamp-2 min-h-10 text-sm text-paper/55">{row.brief ?? 'Pas de brief.'}</div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Chip>{Number(row.total)} joueur{Number(row.total) === 1 ? '' : 's'}</Chip>
                {Number(row.prioritaires) > 0 && <Chip tone="accent">{Number(row.prioritaires)} prioritaire(s)</Chip>}
                {Number(row.observes) > 0 && <Chip>{Number(row.observes)} observé(s)</Chip>}
              </div>
              <div className="mt-3 text-xs text-paper/35">créée le {new Date(row.createdAt).toLocaleDateString('fr-FR')}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
