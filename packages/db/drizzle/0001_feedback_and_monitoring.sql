-- Migration: Feedback System and Monitoring Tables
-- Adds tables for: verifications, scheduled jobs, playbook executions,
-- solution outcomes, source health, and feedback system

-- Enums for verifications
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'corroborated', 'contested', 'partially_supported', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."claim_category" AS ENUM('factual', 'statistical', 'causal', 'predictive', 'definitional');--> statement-breakpoint

-- Enums for scheduled jobs
CREATE TYPE "public"."job_type" AS ENUM('scout', 'analyze', 'brief', 'verify', 'plan', 'pipeline', 'source_health', 'feedback', 'evaluate');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint

-- Enums for playbook executions
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint

-- Enums for solution outcomes
CREATE TYPE "public"."outcome_source" AS ENUM('automated', 'manual', 'verification', 'metric');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('metric_measurement', 'status_change', 'feedback', 'verification_result');--> statement-breakpoint

-- Enums for source health
CREATE TYPE "public"."fetch_status" AS ENUM('success', 'timeout', 'http_error', 'network_error', 'blocked', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'unhealthy', 'unknown');--> statement-breakpoint

-- Enums for feedback
CREATE TYPE "public"."feedback_type" AS ENUM('verification_result', 'solution_outcome', 'source_accuracy', 'playbook_execution', 'manual_correction');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('pending', 'processed', 'skipped', 'failed');--> statement-breakpoint

-- Verifications table
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"claim_statement" text NOT NULL,
	"claim_category" "claim_category" NOT NULL,
	"original_confidence" real NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"adjusted_confidence" real,
	"verification_notes" text,
	"corroborating_sources_count" integer DEFAULT 0 NOT NULL,
	"conflicting_sources_count" integer DEFAULT 0 NOT NULL,
	"source_assessments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL
);--> statement-breakpoint

-- Scheduled jobs table
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
);--> statement-breakpoint

-- Job runs table
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
);--> statement-breakpoint

-- Playbook executions table
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
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL
);--> statement-breakpoint

-- Playbook step executions table
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
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);--> statement-breakpoint

-- Solution outcomes table
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
	"linked_issue_id" text,
	"previous_status" text,
	"new_status" text,
	"feedback" text,
	"feedback_sentiment" real,
	"notes" text
);--> statement-breakpoint

-- Solution effectiveness table
CREATE TABLE "solution_effectiveness" (
	"id" text PRIMARY KEY NOT NULL,
	"solution_id" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"overall_effectiveness_score" real,
	"confidence_in_score" real,
	"estimated_impact_score" real,
	"actual_impact_score" real,
	"impact_variance" real,
	"metrics_achieved" integer DEFAULT 0 NOT NULL,
	"metrics_missed" integer DEFAULT 0 NOT NULL,
	"metrics_partial" integer DEFAULT 0 NOT NULL,
	"issues_resolved" integer DEFAULT 0 NOT NULL,
	"avg_time_to_resolution" integer,
	"avg_feedback_sentiment" real,
	"outcome_count" integer DEFAULT 0 NOT NULL,
	"metrics_trend" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "solution_effectiveness_solution_id_unique" UNIQUE("solution_id")
);--> statement-breakpoint

-- Source fetch logs table
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
);--> statement-breakpoint

-- Source health table
CREATE TABLE "source_health" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"health_status" "health_status" DEFAULT 'unknown' NOT NULL,
	"success_rate" real,
	"total_fetches" integer DEFAULT 0 NOT NULL,
	"failed_fetches" integer DEFAULT 0 NOT NULL,
	"successful_fetches" integer DEFAULT 0 NOT NULL,
	"avg_response_time_ms" integer,
	"p95_response_time_ms" integer,
	"min_response_time_ms" integer,
	"max_response_time_ms" integer,
	"errors_by_type" jsonb DEFAULT '{}'::jsonb,
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
	"last_calculated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_health_domain_unique" UNIQUE("domain")
);--> statement-breakpoint

-- Source reliability history table
CREATE TABLE "source_reliability_history" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"health_status" "health_status" NOT NULL,
	"success_rate" real,
	"dynamic_reliability" real,
	"total_fetches" integer NOT NULL,
	"total_verifications" integer NOT NULL
);--> statement-breakpoint

-- Feedback events table
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
);--> statement-breakpoint

-- Confidence adjustments table
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
);--> statement-breakpoint

-- System learnings table
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
	"insights" jsonb DEFAULT '[]'::jsonb,
	CONSTRAINT "system_learnings_category_key_unique" UNIQUE("category", "learning_key")
);--> statement-breakpoint

-- Evaluation runs table
CREATE TABLE "evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"metrics" jsonb NOT NULL,
	"trends" jsonb,
	"recommendations" jsonb DEFAULT '[]'::jsonb
);--> statement-breakpoint

-- Indexes for better query performance
CREATE INDEX "verifications_source_idx" ON "verifications" ("source_type", "source_id");--> statement-breakpoint
CREATE INDEX "verifications_status_idx" ON "verifications" ("status");--> statement-breakpoint
CREATE INDEX "job_runs_job_id_idx" ON "job_runs" ("job_id");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" ("status");--> statement-breakpoint
CREATE INDEX "playbook_executions_playbook_id_idx" ON "playbook_executions" ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbook_executions_status_idx" ON "playbook_executions" ("status");--> statement-breakpoint
CREATE INDEX "playbook_step_executions_execution_id_idx" ON "playbook_step_executions" ("execution_id");--> statement-breakpoint
CREATE INDEX "solution_outcomes_solution_id_idx" ON "solution_outcomes" ("solution_id");--> statement-breakpoint
CREATE INDEX "source_fetch_logs_domain_idx" ON "source_fetch_logs" ("domain");--> statement-breakpoint
CREATE INDEX "source_fetch_logs_fetched_at_idx" ON "source_fetch_logs" ("fetched_at");--> statement-breakpoint
CREATE INDEX "source_health_health_status_idx" ON "source_health" ("health_status");--> statement-breakpoint
CREATE INDEX "source_reliability_history_domain_idx" ON "source_reliability_history" ("domain");--> statement-breakpoint
CREATE INDEX "feedback_events_status_idx" ON "feedback_events" ("status");--> statement-breakpoint
CREATE INDEX "feedback_events_target_idx" ON "feedback_events" ("target_entity_type", "target_entity_id");--> statement-breakpoint
CREATE INDEX "confidence_adjustments_entity_idx" ON "confidence_adjustments" ("entity_type", "entity_id");--> statement-breakpoint
CREATE INDEX "system_learnings_category_idx" ON "system_learnings" ("category");--> statement-breakpoint
CREATE INDEX "evaluation_runs_period_idx" ON "evaluation_runs" ("period_start", "period_end");
