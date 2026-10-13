CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"updated" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"depth_km" double precision,
	"mag" double precision,
	"mag_type" text,
	"place" text,
	"net" text,
	"status" text,
	"alert" text,
	"sig" integer,
	"felt" integer,
	"cdi" double precision,
	"mmi" double precision,
	"tsunami" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mechanisms" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"code" text NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"strike1" double precision,
	"dip1" double precision,
	"rake1" double precision,
	"strike2" double precision,
	"dip2" double precision,
	"rake2" double precision,
	"t_azimuth" double precision,
	"t_plunge" double precision,
	"p_azimuth" double precision,
	"p_plunge" double precision,
	"n_azimuth" double precision,
	"n_plunge" double precision,
	"mrr" double precision,
	"mtt" double precision,
	"mpp" double precision,
	"mrt" double precision,
	"mrp" double precision,
	"mtp" double precision,
	"scalar_moment" double precision,
	"mw" double precision,
	"depth_km" double precision,
	"percent_dc" double precision,
	"planes_reconstructed" boolean DEFAULT false NOT NULL,
	"product_updated" timestamp with time zone,
	"raw" jsonb NOT NULL,
	CONSTRAINT "mechanisms_kind_check" CHECK ("mechanisms"."kind" in ('mt', 'fm'))
);
--> statement-breakpoint
ALTER TABLE "mechanisms" ADD CONSTRAINT "mechanisms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_time_idx" ON "events" USING btree ("time");--> statement-breakpoint
CREATE INDEX "events_lat_lon_idx" ON "events" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "events_mag_idx" ON "events" USING btree ("mag");--> statement-breakpoint
CREATE UNIQUE INDEX "mechanisms_event_kind_source_code_uq" ON "mechanisms" USING btree ("event_id","kind","source","code");--> statement-breakpoint
CREATE INDEX "mechanisms_event_id_idx" ON "mechanisms" USING btree ("event_id");