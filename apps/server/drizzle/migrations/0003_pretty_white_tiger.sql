CREATE TABLE "catalog_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_time" timestamp with time zone NOT NULL,
	"to_time" timestamp with time zone NOT NULL,
	"min_mag" double precision,
	"bbox" text,
	"events" integer NOT NULL,
	"pages" integer NOT NULL,
	"run_id" integer NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_windows_key_uq" UNIQUE NULLS NOT DISTINCT("from_time","to_time","min_mag","bbox")
);
--> statement-breakpoint
ALTER TABLE "catalog_windows" ADD CONSTRAINT "catalog_windows_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_windows_from_idx" ON "catalog_windows" USING btree ("from_time");--> statement-breakpoint
CREATE INDEX "events_mag_time_idx" ON "events" USING btree ("mag","time");