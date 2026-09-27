import { type AnyColumn, and, desc, eq, ne, sql } from 'drizzle-orm';
import { cosineDistance } from 'drizzle-orm/sql/functions/vector';
import { db, players, playerVectors } from '@vivier/db';

export interface SimilarRow {
  playerId: number;
  fullName: string;
  positionGroup: string;
  season: string;
  similarity: number;
}

/** Vecteurs de la saison la plus récente du joueur — c'est le joueur
 * d'aujourd'hui qu'on cherche à remplacer ou à comparer. */
export async function latestVector(playerId: number) {
  const [row] = await db
    .select()
    .from(playerVectors)
    .where(eq(playerVectors.playerId, playerId))
    .orderBy(desc(playerVectors.season))
    .limit(1);
  return row ?? null;
}

/**
 * Plus proches voisins en similarité cosinus (index HNSW). Un joueur a un
 * vecteur par saison : on sur-échantillonne puis on ne garde que sa saison
 * la plus proche, pour ne pas remplir le classement du même nom.
 */
export async function topSimilar(
  column: AnyColumn, targetVec: number[], excludePlayerId: number, limit: number,
): Promise<SimilarRow[]> {
  const distance = cosineDistance(column, targetVec);
  const candidates = await db
    .select({
      playerId: players.id,
      fullName: players.fullName,
      positionGroup: players.positionGroup,
      season: playerVectors.season,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(playerVectors)
    .innerJoin(players, eq(players.id, playerVectors.playerId))
    .where(and(ne(playerVectors.playerId, excludePlayerId), sql`${column} IS NOT NULL`))
    .orderBy(distance)
    .limit(limit * 4);

  const seen = new Set<number>();
  const result: SimilarRow[] = [];
  for (const row of candidates) {
    if (seen.has(row.playerId)) continue;
    seen.add(row.playerId);
    result.push({ ...row, similarity: Number(row.similarity) });
    if (result.length === limit) break;
  }
  return result;
}
