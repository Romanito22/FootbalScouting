import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type AnyColumn, and, eq, ne, sql } from 'drizzle-orm';
import { cosineDistance } from 'drizzle-orm/sql/functions/vector';
import { db, players, playerVectors } from '@vivier/db';
import { MIN_MINUTES } from '@vivier/metrics';

const RESULT_LIMIT = 10;

async function topSimilar(column: AnyColumn, targetVec: number[], excludeId: number) {
  const distance = cosineDistance(column, targetVec);
  return db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      season: playerVectors.season,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(playerVectors)
    .innerJoin(players, eq(players.id, playerVectors.playerId))
    .where(and(ne(playerVectors.playerId, excludeId), sql`${column} IS NOT NULL`))
    .orderBy(distance)
    .limit(RESULT_LIMIT);
}

export default async function SimilarPlayersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) notFound();

  const [target] = await db
    .select()
    .from(playerVectors)
    .where(eq(playerVectors.playerId, playerId))
    .orderBy(playerVectors.season)
    .limit(1);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="font-mono text-xs text-paper/50">
          <Link href={`/players/${playerId}`} className="hover:text-spotlight">
            ← {player.fullName}
          </Link>
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-paper">
          Joueurs similaires
        </h1>
      </div>

      {!target || !target.styleVec || !target.qualityVec ? (
        <p className="text-paper/60">
          Pas de vecteur calculé pour ce joueur — moins de {MIN_MINUTES} minutes jouées, ou le
          job compute_vectors n'a pas encore tourné.
        </p>
      ) : (
        <>
          <p className="mb-8 rounded-sm border border-spotlight/40 bg-spotlight/10 px-3 py-2 text-sm text-spotlight">
            Base actuelle réduite (une poignée de joueurs par groupe de pairs) : les similarités
            ci-dessous sont honnêtes mais peu discriminantes tant que la base ne grossit pas —
            même limite que les percentiles à faible effectif.
          </p>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
            <SimilarList
              title="Similaires en style"
              subtitle="joue comme lui"
              rows={await topSimilar(playerVectors.styleVec, target.styleVec, playerId)}
            />
            <SimilarList
              title="Similaires en niveau"
              subtitle="aussi bon que lui"
              rows={await topSimilar(playerVectors.qualityVec, target.qualityVec, playerId)}
            />
          </div>
        </>
      )}
    </main>
  );
}

function SimilarList({
  title, subtitle, rows,
}: {
  title: string;
  subtitle: string;
  rows: { playerId: number; fullName: string; positionGroup: string; season: string; similarity: number }[];
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-paper">{title}</h2>
      <p className="mb-3 font-mono text-xs text-paper/50">{subtitle}</p>
      <ol className="space-y-1.5">
        {rows.map((row, i) => (
          <li key={row.playerId} className="flex items-baseline justify-between border-b border-paper/10 pb-1.5 text-sm">
            <span className="font-mono text-paper/40">{i + 1}.</span>
            <Link href={`/players/${row.playerId}`} className="flex-1 px-2 font-sans text-paper hover:text-spotlight">
              {row.fullName}
            </Link>
            <span className="font-mono text-xs text-spotlight">
              {(row.similarity * 100).toFixed(0)} %
            </span>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-paper/50">Aucun résultat.</p>}
      </ol>
    </section>
  );
}
