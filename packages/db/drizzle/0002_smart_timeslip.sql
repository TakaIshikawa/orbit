CREATE TYPE "public"."computer_use_status" AS ENUM('running', 'completed', 'failed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('pending', 'processed', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('verification_result', 'solution_outcome', 'source_accuracy', 'playbook_execution', 'manual_correction');--> statement-breakpoint
CREATE TYPE "public"."simple_status" AS ENUM('needs_attention', 'being_worked', 'blocked', 'watching', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."claim_category" AS ENUM('factual', 'statistical', 'causal', 'predictive', 'definitional');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'corroborated', 'contested', 'partially_supported', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('scout', 'analyze', 'brief', 'verify', 'plan', 'pipeline', 'source_health', 'feedback', 'evaluate');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."outcome_source" AS ENUM('automated', 'manual', 'verification', 'metric');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('metric_measurement', 'status_change', 'feedback', 'verification_result');--> statement-breakpoint
CREATE TYPE "public"."fetch_status" AS ENUM('success', 'timeout', 'http_error', 'network_error', 'blocked', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'unhealthy', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."incentive_type" AS ENUM('academic', 'nonprofit', 'commercial', 'government', 'advocacy', 'wire_service', 'aggregator', 'platform', 'independent');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'paused', 'removed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('research', 'news', 'government', 'ngo', 'think_tank', 'industry', 'aggregator', 'preprint', 'other');--> statement-breakpoint
ALTER TYPE "public"."solution_type" ADD VALUE 'policy' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "computer_use_invocations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"action" jsonb NOT NULL,
	"success" integer NOT NULL,
	"error" text,
	"duration_ms" integer NOT NULL,
	"screenshot_path" text
);
--> statement-breakpoint
CREATE TABLE "computer_use_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"objective" text NOT NULL,
	"start_url" text,
	"config" jsonb NOT NULL,
	"status" "computer_use_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"error" text,
	"execution_id" text,
	"playbook_id" text
);
--> statement-breakpoint
CREATE TABLE "confidence_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"previous_value" real NOT NULL,
	"new_value" real NOT NULL,
	"adjustment_delta" real NOT NULL,
	"reason" text NOT NULL,
	"feedback_event_id" text,
	"context" jsonb
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metrics" jsonb NOT NULL,
	"trends" jsonb,
	"recommendations" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"feedback_type" "feedback_type" NOT NULL,
	"status" "feedback_status" DEFAULT 'pending' NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_entity_id" text NOT NULL,
	"target_entity_type" text NOT NULL,
	"target_entity_id" text NOT NULL,
	"feedback_data" jsonb NOT NULL,
	"adjustment_applied" boolean DEFAULT false,
	"adjustment_details" jsonb,
	"processing_error" text
);
--> statement-breakpoint
CREATE TABLE "system_learnings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"learning_key" text NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"success_rate" real,
	"avg_confidence" real,
	"avg_effectiveness" real,
	"avg_accuracy" real,
	"correlations" jsonb DEFAULT '[]'::jsonb,
	"insights" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"claim_statement" text NOT NULL,
	"claim_category" "claim_category" NOT NULL,
	"original_confidence" real NOT NULL,
	"status" "verification_status" NOT NULL,
	"adjusted_confidence" real NOT NULL,
	"verification_notes" text,
	"corroborating_sources_count" integer DEFAULT 0 NOT NULL,
	"conflicting_sources_count" integer DEFAULT 0 NOT NULL,
	"source_assessments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"output" text,
	"error" text,
	"stats" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"job_type" "job_type" NOT NULL,
	"cron_expression" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbook_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"playbook_id" text NOT NULL,
	"triggered_by" text NOT NULL,
	"trigger_ref" text,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"logs" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "playbook_step_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"step_name" text NOT NULL,
	"action_type" text NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"config" jsonb DEFAULT '{}'::jsonb,
	"output" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"condition_result" boolean,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "solution_effectiveness" (
	"id" text PRIMARY KEY NOT NULL,
	"solution_id" text NOT NULL,
	"overall_effectiveness_score" real,
	"confidence_in_score" real,
	"estimated_impact_score" real,
	"actual_impact_score" real,
	"impact_variance" real,
	"metrics_achieved" integer DEFAULT 0 NOT NULL,
	"metrics_missed" integer DEFAULT 0 NOT NULL,
	"metrics_partial" integer DEFAULT 0 NOT NULL,
	"issues_resolved" integer DEFAULT 0 NOT NULL,
	"avg_time_to_resolution" real,
	"avg_feedback_sentiment" real,
	"feedback_count" integer DEFAULT 0 NOT NULL,
	"metrics_trend" jsonb,
	"first_outcome_at" timestamp with time zone,
	"last_outcome_at" timestamp with time zone,
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solution_effectiveness_solution_id_unique" UNIQUE("solution_id")
);
--> statement-breakpoint
CREATE TABLE "solution_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"solution_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text NOT NULL,
	"outcome_type" "outcome_type" NOT NULL,
	"outcome_source" "outcome_source" NOT NULL,
	"metric_name" text,
	"metric_value" real,
	"baseline_value" real,
	"target_value" real,
	"metric_unit" text,
	"linked_issue_id" text,
	"previous_status" text,
	"new_status" text,
	"feedback" text,
	"feedback_sentiment" real,
	"verification_id" text,
	"verification_outcome" text,
	"notes" text,
	"evidence" jsonb
);
--> statement-breakpoint
CREATE TABLE "source_fetch_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "fetch_status" NOT NULL,
	"http_status_code" integer,
	"response_time_ms" integer,
	"content_length" integer,
	"error" text,
	"error_type" text,
	"job_id" text,
	"agent_id" text
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"health_status" "health_status" DEFAULT 'unknown' NOT NULL,
	"success_rate" real,
	"total_fetches" integer DEFAULT 0 NOT NULL,
	"failed_fetches" integer DEFAULT 0 NOT NULL,
	"successful_fetches" integer DEFAULT 0 NOT NULL,
	"avg_response_time_ms" real,
	"p95_response_time_ms" real,
	"min_response_time_ms" integer,
	"max_response_time_ms" integer,
	"errors_by_type" jsonb,
	"base_reliability" real,
	"dynamic_reliability" real,
	"reliability_confidence" real,
	"total_verifications" integer DEFAULT 0 NOT NULL,
	"corroborated_count" integer DEFAULT 0 NOT NULL,
	"contested_count" integer DEFAULT 0 NOT NULL,
	"alert_active" boolean DEFAULT false NOT NULL,
	"alert_reason" text,
	"alert_since" timestamp with time zone,
	"window_start_at" timestamp with time zone,
	"window_days" integer DEFAULT 7 NOT NULL,
	"last_fetch_at" timestamp with time zone,
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_health_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "source_reliability_history" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success_rate" real,
	"dynamic_reliability" real,
	"health_status" "health_status" NOT NULL,
	"total_fetches" integer NOT NULL,
	"avg_response_time_ms" real
);
--> statement-breakpoint
CREATE TABLE "managed_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"source_type" "source_type" DEFAULT 'other' NOT NULL,
	"incentive_type" "incentive_type" DEFAULT 'independent' NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"overall_credibility" real DEFAULT 0.5 NOT NULL,
	"factual_accuracy" real DEFAULT 0.5 NOT NULL,
	"methodological_rigor" real DEFAULT 0.5 NOT NULL,
	"transparency_score" real DEFAULT 0.5 NOT NULL,
	"independence_score" real DEFAULT 0.5 NOT NULL,
	"ideological_transparency" real DEFAULT 0.5 NOT NULL,
	"funding_transparency" real DEFAULT 0.5 NOT NULL,
	"conflict_disclosure" real DEFAULT 0.5 NOT NULL,
	"perspective_diversity" real DEFAULT 0.5 NOT NULL,
	"geographic_neutrality" real DEFAULT 0.5 NOT NULL,
	"temporal_neutrality" real DEFAULT 0.5 NOT NULL,
	"selection_bias_resistance" real DEFAULT 0.5 NOT NULL,
	"quantification_bias" real DEFAULT 0.5 NOT NULL,
	"debiased_score" real DEFAULT 0.5 NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"last_assessed_at" timestamp with time zone,
	"assessed_by" text,
	"assessment_version" real DEFAULT 1 NOT NULL,
	"auto_sync_health" boolean DEFAULT true NOT NULL,
	CONSTRAINT "managed_sources_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "source_assessment_history" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"assessment_snapshot" jsonb NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_reason" text,
	"assessed_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solutions" ALTER COLUMN "situation_model_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "playbooks" ALTER COLUMN "applicable_to" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "playbooks" ALTER COLUMN "problem_brief_template" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "playbooks" ALTER COLUMN "problem_brief_template" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "headline" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "why_now" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "key_number" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "simple_status" "simple_status";--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "issue_id" text;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "target_leverage_points" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "success_metrics" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "estimated_impact" jsonb;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "feasibility_score" real;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "impact_score" real;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "confidence" real;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "solutions" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "playbooks" ADD COLUMN "triggers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "playbooks" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "playbooks" ADD COLUMN "is_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "computer_use_invocations" ADD CONSTRAINT "computer_use_invocations_session_id_computer_use_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."computer_use_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_effectiveness" ADD CONSTRAINT "solution_effectiveness_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_outcomes" ADD CONSTRAINT "solution_outcomes_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_outcomes" ADD CONSTRAINT "solution_outcomes_linked_issue_id_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;