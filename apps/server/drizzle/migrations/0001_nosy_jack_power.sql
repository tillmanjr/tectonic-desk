CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"events_inserted" integer DEFAULT 0 NOT NULL,
	"events_updated" integer DEFAULT 0 NOT NULL,
	"events_skipped" integer DEFAULT 0 NOT NULL,
	"details_fetched" integer DEFAULT 0 NOT NULL,
	"mechanisms_upserted" integer DEFAULT 0 NOT NULL,
	"error" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ingest_runs_kind_check" CHECK ("ingest_runs"."kind" in ('feed_day', 'feed_week', 'backfill', 'details'))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "event_type" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "detail_checked_updated" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ingest_runs_kind_started_idx" ON "ingest_runs" USING btree ("kind","started_at" DESC NULLS LAST);