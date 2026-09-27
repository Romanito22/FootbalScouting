CREATE TYPE "public"."strength_status" AS ENUM('reference', 'estimated', 'insufficient_links', 'disconnected', 'unstable');--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "strength_status" "strength_status";--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "strength_links" integer;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "strength_samples" jsonb;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "strength_model_version" text;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "strength_computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "peer_groups" ADD COLUMN "kind" text DEFAULT 'tier' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "adjusted_value" numeric;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "adjusted_low" numeric;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "adjusted_high" numeric;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "percentile_low" smallint;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "percentile_high" smallint;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD CONSTRAINT "pp_percentile_interval" CHECK (("player_percentiles"."percentile_low" IS NULL AND "player_percentiles"."percentile_high" IS NULL)
      OR ("player_percentiles"."percentile_low" BETWEEN 0 AND "player_percentiles"."percentile"
          AND "player_percentiles"."percentile_high" BETWEEN "player_percentiles"."percentile" AND 100));