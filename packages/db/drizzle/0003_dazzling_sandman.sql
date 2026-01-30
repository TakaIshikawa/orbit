CREATE TABLE "discovery_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclude_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_patterns" integer DEFAULT 20 NOT NULL,
	"max_issues" integer DEFAULT 5 NOT NULL,
	"min_source_credibility" real DEFAULT 0.5,
	"is_scheduled" boolean DEFAULT false NOT NULL,
	"cron_expression" text,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "archive_reason" text;