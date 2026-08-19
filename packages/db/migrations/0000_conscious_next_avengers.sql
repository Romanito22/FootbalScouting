CREATE TYPE "public"."foot" AS ENUM('left', 'right', 'both');--> statement-breakpoint
CREATE TYPE "public"."position_group" AS ENUM('GK', 'DC', 'FB', 'DM', 'CM', 'AM', 'W', 'ST');--> statement-breakpoint
CREATE TYPE "public"."shortlist_status" AS ENUM('a_observer', 'observe', 'prioritaire', 'ecarte');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('statsbomb', 'transfermarkt', 'fbref', 'manual');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country" text,
	"competition_id" integer,
	"is_national_team" boolean DEFAULT false NOT NULL,
	"source_ids" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"tier" smallint NOT NULL,
	"strength_coef" numeric(5, 3),
	"strength_coef_low" numeric(5, 3),
	"strength_coef_high" numeric(5, 3),
	"uefa_coef" numeric(6, 3),
	"source_ids" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source" NOT NULL,
	"scope" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_written" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "peer_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position_group" "position_group" NOT NULL,
	"season" text NOT NULL,
	"min_minutes" integer DEFAULT 600 NOT NULL,
	"sample_size" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_groups_sample_positive" CHECK ("peer_groups"."sample_size" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"raw_name" text NOT NULL,
	"confidence" numeric(4, 3),
	"resolved_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_percentiles" (
	"player_id" integer NOT NULL,
	"season" text NOT NULL,
	"peer_group_id" text NOT NULL,
	"metric" text NOT NULL,
	"raw_value" numeric,
	"percentile" smallint NOT NULL,
	CONSTRAINT "player_percentiles_player_id_season_peer_group_id_metric_pk" PRIMARY KEY("player_id","season","peer_group_id","metric"),
	CONSTRAINT "pp_percentile_range" CHECK ("player_percentiles"."percentile" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_season_stats" (
	"player_id" integer NOT NULL,
	"season" text NOT NULL,
	"competition_id" integer NOT NULL,
	"club_id" integer NOT NULL,
	"minutes" integer NOT NULL,
	"matches_played" smallint,
	"nineties" numeric(6, 2) GENERATED ALWAYS AS (minutes / 90.0) STORED,
	"metrics" jsonb NOT NULL,
	"source" "source" NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_season_stats_player_id_season_competition_id_club_id_pk" PRIMARY KEY("player_id","season","competition_id","club_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_vectors" (
	"player_id" integer NOT NULL,
	"season" text NOT NULL,
	"style_vec" vector(32),
	"quality_vec" vector(32),
	"model_version" text NOT NULL,
	CONSTRAINT "player_vectors_player_id_season_pk" PRIMARY KEY("player_id","season")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"birth_date" date,
	"nationality" text[],
	"foot" "foot",
	"height_cm" smallint,
	"position_group" "position_group" NOT NULL,
	"position_detail" text,
	"current_club_id" integer,
	"contract_until" date,
	"market_value_eur" bigint,
	"source_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resolution_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source" NOT NULL,
	"source_id" text NOT NULL,
	"raw_name" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scout_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"observed_at" date,
	"context" text,
	"body" text NOT NULL,
	"rating" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scout_notes_rating_range" CHECK ("scout_notes"."rating" IS NULL OR "scout_notes"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortlist_entries" (
	"shortlist_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"status" "shortlist_status" DEFAULT 'a_observer' NOT NULL,
	"rank" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_entries_shortlist_id_player_id_pk" PRIMARY KEY("shortlist_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shortlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brief" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clubs" ADD CONSTRAINT "clubs_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_percentiles" ADD CONSTRAINT "player_percentiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_percentiles" ADD CONSTRAINT "player_percentiles_peer_group_id_peer_groups_id_fk" FOREIGN KEY ("peer_group_id") REFERENCES "public"."peer_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_vectors" ADD CONSTRAINT "player_vectors_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_current_club_id_clubs_id_fk" FOREIGN KEY ("current_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scout_notes" ADD CONSTRAINT "scout_notes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_shortlist_id_shortlists_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."shortlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shortlist_entries" ADD CONSTRAINT "shortlist_entries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clubs_normalized_name_idx" ON "clubs" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competitions_name_country_uq" ON "competitions" USING btree ("name","country");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingestion_runs_source_idx" ON "ingestion_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "player_aliases_source_uq" ON "player_aliases" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_aliases_player_idx" ON "player_aliases" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pp_group_metric_idx" ON "player_percentiles" USING btree ("peer_group_id","metric","percentile");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pss_season_comp_idx" ON "player_season_stats" USING btree ("season","competition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pss_minutes_idx" ON "player_season_stats" USING btree ("minutes");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pss_metrics_gin" ON "player_season_stats" USING gin ("metrics");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pv_style_hnsw" ON "player_vectors" USING hnsw ("style_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pv_quality_hnsw" ON "player_vectors" USING hnsw ("quality_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_matching_idx" ON "players" USING btree ("normalized_name","birth_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_position_idx" ON "players" USING btree ("position_group");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_contract_idx" ON "players" USING btree ("contract_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_name_trgm_idx" ON "players" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resolution_queue_source_uq" ON "resolution_queue" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_notes_player_idx" ON "scout_notes" USING btree ("player_id");