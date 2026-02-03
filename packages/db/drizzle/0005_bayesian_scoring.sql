-- Bayesian Expected Value Scoring System
-- Migration: 0005_bayesian_scoring.sql
--
-- This migration adds infrastructure for Bayesian scoring:
-- 1. Reference classes table for base rate priors
-- 2. Bayesian updates audit table
-- 3. New columns on issues table for EV scoring

-- ============================================================================
-- Enum Types
-- ============================================================================

CREATE TYPE "bayesian_entity_type" AS ENUM ('issue', 'reference_class');
CREATE TYPE "bayesian_update_type" AS ENUM ('p_real', 'p_solvable');
CREATE TYPE "bayesian_evidence_type" AS ENUM ('verification', 'outcome', 'manual', 'initial');
CREATE TYPE "bayesian_evidence_direction" AS ENUM ('positive', 'negative');

-- ============================================================================
-- Reference Classes Table
-- ============================================================================

CREATE TABLE "reference_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL UNIQUE,
	"description" text,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pattern_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"p_real_alpha" real DEFAULT 2 NOT NULL,
	"p_real_beta" real DEFAULT 2 NOT NULL,
	"p_real_sample_size" integer DEFAULT 0 NOT NULL,
	"p_solvable_alpha" real DEFAULT 2 NOT NULL,
	"p_solvable_beta" real DEFAULT 2 NOT NULL,
	"p_solvable_sample_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================================================
-- Bayesian Updates Audit Table
-- ============================================================================

CREATE TABLE "bayesian_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entity_type" "bayesian_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"update_type" "bayesian_update_type" NOT NULL,
	"prior_alpha" real NOT NULL,
	"prior_beta" real NOT NULL,
	"posterior_alpha" real NOT NULL,
	"posterior_beta" real NOT NULL,
	"evidence_type" "bayesian_evidence_type" NOT NULL,
	"evidence_id" text,
	"evidence_direction" "bayesian_evidence_direction" NOT NULL,
	"reason" text NOT NULL
);

-- Index for finding updates by entity
CREATE INDEX "idx_bayesian_updates_entity" ON "bayesian_updates" ("entity_type", "entity_id");

-- Index for finding updates by evidence source
CREATE INDEX "idx_bayesian_updates_evidence" ON "bayesian_updates" ("evidence_type", "evidence_id");

-- ============================================================================
-- Issues Table Additions
-- ============================================================================

ALTER TABLE "issues" ADD COLUMN "reference_class_id" text;
ALTER TABLE "issues" ADD COLUMN "bayesian_scores" jsonb;
ALTER TABLE "issues" ADD COLUMN "expected_value" real;
ALTER TABLE "issues" ADD COLUMN "ev_confidence" real;

-- Index for querying by expected value
CREATE INDEX "idx_issues_expected_value" ON "issues" ("expected_value" DESC NULLS LAST);

-- Index for finding issues by reference class
CREATE INDEX "idx_issues_reference_class" ON "issues" ("reference_class_id") WHERE "reference_class_id" IS NOT NULL;

-- ============================================================================
-- Seed Default Reference Classes
-- ============================================================================

INSERT INTO "reference_classes" ("id", "name", "description", "domains", "pattern_types", "tags", "p_real_alpha", "p_real_beta", "p_solvable_alpha", "p_solvable_beta") VALUES
('refclass_policy_gap', 'Policy Gap', 'Issues arising from missing or inadequate policies', '["policy", "governance", "regulation"]', '["policy_gap"]', '["systemic", "institutional"]', 3, 2, 2, 3),
('refclass_climate_risk', 'Climate Risk', 'Climate and environmental issues with high confidence but low tractability', '["climate", "environment", "sustainability"]', '["feedback_loop", "structural_inefficiency"]', '["environmental", "long_term"]', 4, 1, 2, 4),
('refclass_health_system', 'Health System', 'Healthcare delivery and public health issues', '["health", "public_health", "healthcare"]', '["structural_inefficiency", "coordination_failure"]', '["health", "access"]', 3, 2, 3, 2),
('refclass_tech_disruption', 'Technology Disruption', 'Issues from rapid technological change', '["technology", "digital", "AI"]', '["information_asymmetry", "coordination_failure"]', '["technology", "disruption"]', 2, 2, 2, 3),
('refclass_resource_scarcity', 'Resource Scarcity', 'Natural resource and supply constraints', '["resources", "economics", "supply_chain"]', '["structural_inefficiency", "feedback_loop"]', '["resources", "scarcity"]', 3, 2, 2, 3),
('refclass_default', 'Default', 'Uninformative prior for unclassified issues', '[]', '[]', '[]', 2, 2, 2, 2);
