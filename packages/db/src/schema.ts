import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, date, index, integer, jsonb, numeric,
  pgEnum, pgTable, primaryKey, serial, smallint, text, timestamp,
  uniqueIndex, vector,
} from 'drizzle-orm/pg-core';

/* ---------- Énumérations ---------- */

export const positionGroupEnum = pgEnum('position_group', [
  'GK', 'DC', 'FB', 'DM', 'CM', 'AM', 'W', 'ST',
]);

export const footEnum = pgEnum('foot', ['left', 'right', 'both']);

export const sourceEnum = pgEnum('source', [
  'statsbomb', 'transfermarkt', 'fbref', 'manual',
]);

export const shortlistStatusEnum = pgEnum('shortlist_status', [
  'a_observer', 'observe', 'prioritaire', 'ecarte',
]);

/* ---------- Référentiel ---------- */

export const competitions = pgTable('competitions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  tier: smallint('tier').notNull(),
  // Renseignés en phase 7. NULL = pas encore estimé, ce qui doit être visible dans l'UI.
  strengthCoef: numeric('strength_coef', { precision: 5, scale: 3 }),
  strengthCoefLow: numeric('strength_coef_low', { precision: 5, scale: 3 }),
  strengthCoefHigh: numeric('strength_coef_high', { precision: 5, scale: 3 }),
  uefaCoef: numeric('uefa_coef', { precision: 6, scale: 3 }),
  sourceIds: jsonb('source_ids').$type<Record<string, string>>().notNull().default({}),
}, (t) => [
  uniqueIndex('competitions_name_country_uq').on(t.name, t.country),
]);

export const clubs = pgTable('clubs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  country: text('country'),
  competitionId: integer('competition_id').references(() => competitions.id),
  isNationalTeam: boolean('is_national_team').notNull().default(false),
  sourceIds: jsonb('source_ids').$type<Record<string, string>>().notNull().default({}),
}, (t) => [
  index('clubs_normalized_name_idx').on(t.normalizedName),
]);

/* ---------- Joueurs ---------- */

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  // sans accents, minuscules, sans particules : clé de rapprochement entre sources
  normalizedName: text('normalized_name').notNull(),
  birthDate: date('birth_date'),
  nationality: text('nationality').array(),
  foot: footEnum('foot'),
  heightCm: smallint('height_cm'),
  positionGroup: positionGroupEnum('position_group').notNull(),
  positionDetail: text('position_detail'),
  currentClubId: integer('current_club_id').references(() => clubs.id),
  contractUntil: date('contract_until'),
  marketValueEur: bigint('market_value_eur', { mode: 'number' }),
  sourceIds: jsonb('source_ids').$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('players_matching_idx').on(t.normalizedName, t.birthDate),
  index('players_position_idx').on(t.positionGroup),
  index('players_contract_idx').on(t.contractUntil),
  // recherche floue : "mbape" doit trouver "mbappe"
  index('players_name_trgm_idx').using('gin', sql`${t.normalizedName} gin_trgm_ops`),
]);

/**
 * Registre de résolution d'identité. Chaque identifiant externe rencontré y est
 * consigné avec son score de confiance. C'est la table la plus importante du
 * projet : elle rend les rapprochements auditables et réversibles.
 */
export const playerAliases = pgTable('player_aliases', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  source: sourceEnum('source').notNull(),
  sourceId: text('source_id').notNull(),
  rawName: text('raw_name').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  resolvedManually: boolean('resolved_manually').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('player_aliases_source_uq').on(t.source, t.sourceId),
  index('player_aliases_player_idx').on(t.playerId),
]);

/** Rapprochements en attente d'arbitrage humain. Il y en aura des centaines. */
export const resolutionQueue = pgTable('resolution_queue', {
  id: serial('id').primaryKey(),
  source: sourceEnum('source').notNull(),
  sourceId: text('source_id').notNull(),
  rawName: text('raw_name').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  candidates: jsonb('candidates').$type<Array<{ playerId: number; score: number }>>()
    .notNull().default([]),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('resolution_queue_source_uq').on(t.source, t.sourceId),
]);

/* ---------- Statistiques ---------- */

export const playerSeasonStats = pgTable('player_season_stats', {
  playerId: integer('player_id').notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),            // format canonique : '2025-2026'
  competitionId: integer('competition_id').notNull().references(() => competitions.id),
  clubId: integer('club_id').notNull().references(() => clubs.id),
  minutes: integer('minutes').notNull(),
  matchesPlayed: smallint('matches_played'),
  nineties: numeric('nineties', { precision: 6, scale: 2 })
    .generatedAlwaysAs(sql`minutes / 90.0`),
  /** Toutes les métriques per-90, clés définies dans packages/metrics. */
  metrics: jsonb('metrics').$type<Record<string, number>>().notNull(),
  source: sourceEnum('source').notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.playerId, t.season, t.competitionId, t.clubId] }),
  index('pss_season_comp_idx').on(t.season, t.competitionId),
  index('pss_minutes_idx').on(t.minutes),
  index('pss_metrics_gin').using('gin', t.metrics),
]);

/**
 * Groupe de pairs : rendu explicite en table parce que la règle produit impose
 * de l'afficher à l'utilisateur avec chaque percentile.
 */
export const peerGroups = pgTable('peer_groups', {
  id: text('id').primaryKey(),                 // 'CM|tier1|BIG5|2025-2026'
  label: text('label').notNull(),              // 'Milieux centraux · Big 5 · 2025-26'
  positionGroup: positionGroupEnum('position_group').notNull(),
  season: text('season').notNull(),
  minMinutes: integer('min_minutes').notNull().default(600),
  sampleSize: integer('sample_size').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('peer_groups_sample_positive', sql`${t.sampleSize} > 0`),
]);

export const playerPercentiles = pgTable('player_percentiles', {
  playerId: integer('player_id').notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  peerGroupId: text('peer_group_id').notNull().references(() => peerGroups.id),
  metric: text('metric').notNull(),
  rawValue: numeric('raw_value'),
  percentile: smallint('percentile').notNull(),
}, (t) => [
  primaryKey({ columns: [t.playerId, t.season, t.peerGroupId, t.metric] }),
  index('pp_group_metric_idx').on(t.peerGroupId, t.metric, t.percentile),
  check('pp_percentile_range', sql`${t.percentile} BETWEEN 0 AND 100`),
]);

/* ---------- Recherche (phase 4) ---------- */

/** Critères de filtre sérialisés (poste, âge, minutes, seuil de percentile,
 * etc.) — la même forme que les searchParams de la page /search. */
export const savedSearches = pgTable('saved_searches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  filters: jsonb('filters').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
});

/* ---------- Similarité (phase 5) ---------- */

export const playerVectors = pgTable('player_vectors', {
  playerId: integer('player_id').notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  season: text('season').notNull(),
  /** Comment il joue. */
  styleVec: vector('style_vec', { dimensions: 32 }),
  /** À quel niveau il le fait, ajusté du championnat. */
  qualityVec: vector('quality_vec', { dimensions: 32 }),
  modelVersion: text('model_version').notNull(),
}, (t) => [
  primaryKey({ columns: [t.playerId, t.season] }),
  index('pv_style_hnsw').using('hnsw', t.styleVec.op('vector_cosine_ops')),
  index('pv_quality_hnsw').using('hnsw', t.qualityVec.op('vector_cosine_ops')),
]);

/* ---------- Travail de scouting (phase 6) ---------- */

export const shortlists = pgTable('shortlists', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  brief: text('brief'),                        // "6 relayeur, été 2027, ≤ 6 M€"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const shortlistEntries = pgTable('shortlist_entries', {
  shortlistId: integer('shortlist_id').notNull()
    .references(() => shortlists.id, { onDelete: 'cascade' }),
  playerId: integer('player_id').notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  status: shortlistStatusEnum('status').notNull().default('a_observer'),
  rank: integer('rank'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.shortlistId, t.playerId] }),
]);

/** L'œil humain. C'est la seule donnée du projet qui n'existe nulle part ailleurs. */
export const scoutNotes = pgTable('scout_notes', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  observedAt: date('observed_at'),
  context: text('context'),                    // 'vs OM, 12/03, entré 78e'
  body: text('body').notNull(),
  rating: smallint('rating'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('scout_notes_player_idx').on(t.playerId),
  check('scout_notes_rating_range', sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 10`),
]);

/* ---------- Journal du pipeline ---------- */

export const ingestionRuns = pgTable('ingestion_runs', {
  id: serial('id').primaryKey(),
  source: sourceEnum('source').notNull(),
  scope: text('scope').notNull(),              // 'FRA-Ligue 1|2025-2026'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  rowsWritten: integer('rows_written'),
  status: text('status').notNull().default('running'),
  error: text('error'),
}, (t) => [
  index('ingestion_runs_source_idx').on(t.source, t.startedAt),
]);
