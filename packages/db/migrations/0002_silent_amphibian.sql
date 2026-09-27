ALTER TABLE "peer_groups" ADD COLUMN "tier" smallint;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "competition_id" integer;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "club_id" integer;--> statement-breakpoint
ALTER TABLE "player_percentiles" ADD COLUMN "sample_size" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_percentiles" ADD CONSTRAINT "player_percentiles_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_percentiles" ADD CONSTRAINT "player_percentiles_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
