CREATE TYPE "public"."artifact_status" AS ENUM('draft', 'final', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('document', 'code', 'tool', 'dataset', 'analysis', 'deployment', 'other');--> statement-breakpoint
CREATE TYPE "public"."autonomy_level" AS ENUM('L0', 'L1', 'L2', 'L3');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('approve', 'reject', 'defer', 'modify');--> statement-breakpoint
CREATE TYPE "public"."observation_frequency" AS ENUM('one_time', 'recurring', 'continuous');--> statement-breakpoint
CREATE TYPE "public"."pattern_type" AS ENUM('policy_gap', 'structural_inefficiency', 'feedback_loop', 'information_asymmetry', 'coordination_failure', 'other');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('draft', 'active', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('identified', 'investigating', 'solution_proposed', 'in_progress', 'resolved', 'wont_fix');--> statement-breakpoint
CREATE TYPE "public"."propagation_velocity" AS ENUM('fast', 'medium', 'slow');--> statement-breakpoint
CREATE TYPE "public"."time_horizon" AS ENUM('months', 'years', 'decades');--> statement-breakpoint
CREATE TYPE "public"."solution_status" AS ENUM('proposed', 'approved', 'in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."solution_type" AS ENUM('tool', 'platform', 'system', 'automation', 'research', 'model', 'other');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'success', 'failed', 'timeout', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."playbook_status" AS ENUM('draft', 'active', 'deprecated');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"solution_id" text NOT NULL,
	"run_id" text NOT NULL,
	"title" text NOT NULL,
	"artifact_type" "artifact_type" NOT NULL,
	"content_ref" jsonb NOT NULL,
	"format" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"derived_from" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifact_status" "artifact_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"solution_id" text NOT NULL,
	"decision" "decision_type" NOT NULL,
	"rationale" text NOT NULL,
	"modifications" text,
	"autonomy_level" "autonomy_level" NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guardrails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"run_id" text
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"pattern_type" "pattern_type" NOT NULL,
	"domains" jsonb NOT NULL,
	"geographies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"first_observed" timestamp with time zone NOT NULL,
	"observation_frequency" "observation_frequency" NOT NULL,
	"cluster_id" text,
	"confidence" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"pattern_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"root_causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_domains" jsonb NOT NULL,
	"leverage_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_impact" real NOT NULL,
	"score_urgency" real NOT NULL,
	"score_tractability" real NOT NULL,
	"score_legitimacy" real NOT NULL,
	"score_neglectedness" real NOT NULL,
	"composite_score" real NOT NULL,
	"upstream_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"downstream_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_horizon" time_horizon NOT NULL,
	"propagation_velocity" "propagation_velocity" NOT NULL,
	"issue_status" "issue_status" DEFAULT 'identified' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"issue_id" text NOT NULL,
	"goals" jsonb NOT NULL,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uncertainties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_space" jsonb NOT NULL,
	"required_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "situation_models" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"problem_brief_id" text NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system_map" jsonb NOT NULL,
	"uncertainty_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_leverage_points" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solutions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"situation_model_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"solution_type" "solution_type" NOT NULL,
	"mechanism" text NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preconditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"execution_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"addresses_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"solution_status" "solution_status" DEFAULT 'proposed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"decision_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"triggered_by" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"llm_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"run_status" "run_status" DEFAULT 'running' NOT NULL,
	"error" text,
	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state_changes" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"parent_hash" text,
	"author" text NOT NULL,
	"author_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "record_status" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"applicable_to" jsonb NOT NULL,
	"problem_brief_template" jsonb NOT NULL,
	"investigation_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"solution_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"success_rate" real,
	"avg_time_to_resolution" integer,
	"forked_from" text,
	"playbook_status" "playbook_status" DEFAULT 'draft' NOT NULL
);
