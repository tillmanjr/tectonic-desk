CREATE TABLE "volcano_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"week" date NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "volcano_reports_category_check" CHECK ("volcano_reports"."category" in ('new', 'ongoing'))
);
--> statement-breakpoint
CREATE TABLE "volcano_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"number" integer,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"color" text,
	"notice_at" timestamp with time zone,
	"synopsis" text,
	"url" text,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "volcano_status_source_check" CHECK ("volcano_status"."source" in ('usgs', 'geonet'))
);
--> statement-breakpoint
ALTER TABLE "ingest_runs" DROP CONSTRAINT "ingest_runs_kind_check";--> statement-breakpoint
CREATE UNIQUE INDEX "volcano_reports_number_week_uq" ON "volcano_reports" USING btree ("number","week");--> statement-breakpoint
CREATE INDEX "volcano_reports_week_idx" ON "volcano_reports" USING btree ("week" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "volcano_status_source_key_observed_idx" ON "volcano_status" USING btree ("source","key","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "volcano_status_number_idx" ON "volcano_status" USING btree ("number");--> statement-breakpoint
CREATE INDEX "volcano_status_observed_idx" ON "volcano_status" USING btree ("observed_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_kind_check" CHECK ("ingest_runs"."kind" in ('feed_day', 'feed_week', 'backfill', 'details', 'volcano_status', 'volcano_reports'));