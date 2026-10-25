CREATE TABLE "space_alerts" (
	"product_id" text NOT NULL,
	"issue_time" timestamp with time zone NOT NULL,
	"message" text NOT NULL,
	CONSTRAINT "space_alerts_product_id_issue_time_pk" PRIMARY KEY("product_id","issue_time")
);
--> statement-breakpoint
CREATE TABLE "space_flares" (
	"begin_time" timestamp with time zone PRIMARY KEY NOT NULL,
	"max_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"begin_class" text,
	"max_class" text,
	"end_class" text,
	"max_xrlong" double precision,
	"satellite" integer
);
--> statement-breakpoint
CREATE TABLE "space_samples" (
	"series" text NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"value" real NOT NULL,
	CONSTRAINT "space_samples_series_time_source_pk" PRIMARY KEY("series","time","source")
);
--> statement-breakpoint
CREATE TABLE "space_scales" (
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"issued" timestamp with time zone NOT NULL,
	"r" integer,
	"s" integer,
	"g" integer,
	"r_minor_prob" integer,
	"r_major_prob" integer,
	"s_prob" integer,
	"kp_max" real,
	CONSTRAINT "space_scales_day_kind_pk" PRIMARY KEY("day","kind"),
	CONSTRAINT "space_scales_kind_check" CHECK ("space_scales"."kind" in ('observed', 'predicted'))
);
--> statement-breakpoint
CREATE INDEX "space_alerts_issue_idx" ON "space_alerts" USING btree ("issue_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "space_samples_series_time_idx" ON "space_samples" USING btree ("series","time" DESC NULLS LAST);