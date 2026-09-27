import { sql } from 'drizzle-orm';
import { db } from '@vivier/db';
import type { PositionGroup } from '@vivier/metrics';

export interface PlayerListRow {
  id: number;
  fullName: string;
  positionGroup: PositionGroup;
  birthDate: string | null;
  contractUntil: string | null;
  marketValueEur: number | null;
  nationality: string[] | null;
  season: string | null;
  minutes: number | null;
  clubName: string | null;
  competitionName: string | null;
  /** Similarité de nom (0-1) quand une recherche est active. */
  nameScore: number | null;
}

export const PLAYERS_PAGE_SIZE = 50;

/**
 * Un joueur par ligne, avec sa saison la plus récente (la plus fournie en
 * minutes à saison égale). Recherche floue par nom via pg_trgm sur le nom
 * normalisé (sans accents, minuscules) : « mbape » trouve « Kylian Mbappé
 * Lottin » — `<%` (similarité de mot) plutôt que `%` (similarité globale),
 * qu'un nom complet à rallonge ferait passer sous le seuil.
 */
export async function listPlayers({
  query, position, page,
}: {
  query: string | null;
  position: PositionGroup | null;
  page: number;
}): Promise<{ rows: PlayerListRow[]; total: number }> {
  const q = query?.trim() ? query.trim() : null;
  const nameFilter = q
    ? sql`AND (lower(unaccent(${q})) <% p.normalized_name
             OR p.normalized_name LIKE '%' || lower(unaccent(${q})) || '%')`
    : sql``;
  const positionFilter = position ? sql`AND p.position_group = ${position}` : sql``;
  const nameScore = q ? sql`word_similarity(lower(unaccent(${q})), p.normalized_name)` : sql`NULL::real`;
  const order = q ? sql`name_score DESC, minutes DESC NULLS LAST` : sql`minutes DESC NULLS LAST, full_name`;

  const rows = await db.execute<{
    id: number;
    full_name: string;
    position_group: PositionGroup;
    birth_date: string | null;
    contract_until: string | null;
    market_value_eur: string | null;
    nationality: string[] | null;
    season: string | null;
    minutes: number | null;
    club_name: string | null;
    competition_name: string | null;
    name_score: number | null;
    total: string;
  }>(sql`
    WITH latest AS (
      SELECT DISTINCT ON (p.id)
             p.id, p.full_name, p.position_group, p.birth_date::text AS birth_date,
             p.contract_until::text AS contract_until, p.market_value_eur, p.nationality,
             pss.season, pss.minutes, cl.name AS club_name, co.name AS competition_name,
             ${nameScore} AS name_score
      FROM players p
      LEFT JOIN player_season_stats pss ON pss.player_id = p.id
      LEFT JOIN clubs cl ON cl.id = pss.club_id
      LEFT JOIN competitions co ON co.id = pss.competition_id
      WHERE true ${nameFilter} ${positionFilter}
      ORDER BY p.id, pss.season DESC NULLS LAST, pss.minutes DESC NULLS LAST
    )
    SELECT *, count(*) OVER () AS total
    FROM latest
    ORDER BY ${order}
    LIMIT ${PLAYERS_PAGE_SIZE} OFFSET ${(page - 1) * PLAYERS_PAGE_SIZE}
  `);

  return {
    total: Number(rows[0]?.total ?? 0),
    rows: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      positionGroup: r.position_group,
      birthDate: r.birth_date,
      contractUntil: r.contract_until,
      marketValueEur: r.market_value_eur === null ? null : Number(r.market_value_eur),
      nationality: r.nationality,
      season: r.season,
      minutes: r.minutes,
      clubName: r.club_name,
      competitionName: r.competition_name,
      nameScore: r.name_score === null ? null : Number(r.name_score),
    })),
  };
}
