import { type AnyColumn, and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { cosineDistance } from 'drizzle-orm/sql/functions/vector';
import { db, players, playerVectors } from '@vivier/db';
import type { PositionGroup } from '@vivier/metrics';

const HNSW_EF_SEARCH = 400;

export interface SimilarRow {
  playerId: number;
  fullName: string;
  positionGroup: PositionGroup;
  season: string;
  similarity: number;
  birthDate: string | null;
  contractUntil: string | null;
  marketValueEur: number | null;
}

/** Contraintes de recrutement appliquées à la recherche de voisins. */
export interface SimilarConstraints {
  /** Gardiens et joueurs de champ : deux espaces vectoriels distincts. */
  targetIsGoalkeeper: boolean;
  samePositionAs?: PositionGroup | null;
  ageMax?: number | null;
  marketValueMax?: number | null;
  contractBefore?: string | null;
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
  constraints: SimilarConstraints,
): Promise<SimilarRow[]> {
  const distance = cosineDistance(column, targetVec);
  // Gardiens et joueurs de champ vivent dans deux espaces vectoriels
  // distincts (métriques disjointes) : une similarité entre eux n'a pas de sens.
  const conditions = [
    ne(playerVectors.playerId, excludePlayerId),
    sql`${column} IS NOT NULL`,
    constraints.targetIsGoalkeeper
      ? eq(players.positionGroup, 'GK')
      : ne(players.positionGroup, 'GK'),
  ];
  if (constraints.samePositionAs) conditions.push(eq(players.positionGroup, constraints.samePositionAs));
  if (constraints.ageMax != null) {
    conditions.push(sql`date_part('year', age(current_date, ${players.birthDate})) <= ${constraints.ageMax}`);
  }
  if (constraints.marketValueMax != null) {
    conditions.push(lte(players.marketValueEur, constraints.marketValueMax));
  }
  if (constraints.contractBefore) conditions.push(lte(players.contractUntil, constraints.contractBefore));
  // L'index HNSW filtre APRÈS avoir retenu ses ef_search plus proches
  // voisins (40 par défaut) : avec le filtre gardien / champ, un gardien
  // n'aurait que quelques voisins valides. Bassin élargi, le temps de la
  // requête (SET LOCAL, supporté par toutes les versions de pgvector).
  const candidates = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL hnsw.ef_search = ${sql.raw(String(HNSW_EF_SEARCH))}`);
    return tx
      .select({
        playerId: players.id,
        fullName: players.fullName,
        positionGroup: players.positionGroup,
        season: playerVectors.season,
        similarity: sql<number>`1 - (${distance})`,
        birthDate: players.birthDate,
        contractUntil: players.contractUntil,
        marketValueEur: players.marketValueEur,
      })
      .from(playerVectors)
      .innerJoin(players, eq(players.id, playerVectors.playerId))
      .where(and(...conditions))
      .orderBy(distance)
      .limit(limit * 4);
  });

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
