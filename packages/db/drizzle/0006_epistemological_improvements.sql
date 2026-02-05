-- Epistemological Improvements Migration
-- Adds causal chain validation, adversarial validation, predictions, and evidence type classification

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- Evidence strength hierarchy
CREATE TYPE "evidence_strength" AS ENUM (
  'experimental',
  'quasi_experimental',
  'longitudinal',
  'cross_sectional',
  'case_control',
  'observational',
  'expert_consensus',
  'anecdotal',
  'theoretical'
);

-- Causal direction
CREATE TYPE "causal_direction" AS ENUM (
  'forward',
  'reverse',
  'bidirectional',
  'spurious',
  'unknown'
);

-- Counterfactual assessment status
CREATE TYPE "counterfactual_status" AS ENUM (
  'not_assessed',
  'assessed_supported',
  'assessed_weakened',
  'assessed_refuted'
);

-- Challenge types for adversarial validation
CREATE TYPE "challenge_type" AS ENUM (
  'framing_challenge',
  'evidence_challenge',
  'causation_challenge',
  'scope_challenge',
  'stakeholder_challenge',
  'alternative_challenge',
  'feasibility_challenge',
  'unintended_effects',
  'base_rate_challenge',
  'selection_bias'
);

-- Challenge severity
CREATE TYPE "challenge_severity" AS ENUM (
  'critical',
  'major',
  'moderate',
  'minor'
);

-- Challenge resolution status
CREATE TYPE "challenge_resolution" AS ENUM (
  'pending',
  'resolved',
  'partially_resolved',
  'unresolved',
  'accepted'
);

-- Prediction types
CREATE TYPE "prediction_type" AS ENUM (
  'trend_direction',
  'threshold_crossing',
  'event_occurrence',
  'comparative',
  'timing',
  'magnitude',
  'conditional'
);

-- Prediction status
CREATE TYPE "prediction_status" AS ENUM (
  'active',
  'resolved_correct',
  'resolved_incorrect',
  'resolved_partial',
  'expired',
  'withdrawn'
);

-- Evidence type for verifications
CREATE TYPE "evidence_type" AS ENUM (
  'experimental',
  'quasi_experimental',
  'longitudinal',
  'cross_sectional',
  'case_control',
  'meta_analysis',
  'observational',
  'expert_opinion',
  'anecdotal',
  'theoretical',
  'unknown'
);

-- =============================================================================
-- CAUSAL CLAIMS TABLE
-- =============================================================================

CREATE TABLE "causal_claims" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "issue_id" text REFERENCES "issues"("id"),
  "cause" text NOT NULL,
  "effect" text NOT NULL,
  "mechanism" text,
  "direction" "causal_direction" DEFAULT 'forward' NOT NULL,
  "confidence" real DEFAULT 0.5 NOT NULL,
  "evidence_strength" "evidence_strength" NOT NULL,
  "evidence_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "counterfactual_status" "counterfactual_status" DEFAULT 'not_assessed' NOT NULL,
  "counterfactual_analysis" jsonb,
  "hill_criteria" jsonb,
  "evidence_score" real
);

CREATE INDEX "causal_claims_issue_id_idx" ON "causal_claims" ("issue_id");
CREATE INDEX "causal_claims_evidence_strength_idx" ON "causal_claims" ("evidence_strength");

-- =============================================================================
-- CAUSAL CHAINS TABLE
-- =============================================================================

CREATE TABLE "causal_chains" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "issue_id" text REFERENCES "issues"("id"),
  "name" text NOT NULL,
  "description" text,
  "claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "weakest_link_id" text,
  "overall_confidence" real,
  "has_gaps" boolean DEFAULT false NOT NULL,
  "gap_description" text,
  "is_primary" boolean DEFAULT false NOT NULL
);

CREATE INDEX "causal_chains_issue_id_idx" ON "causal_chains" ("issue_id");

-- =============================================================================
-- ADVERSARIAL VALIDATIONS TABLE
-- =============================================================================

CREATE TABLE "adversarial_validations" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "challenge_type" "challenge_type" NOT NULL,
  "severity" "challenge_severity" NOT NULL,
  "challenge_statement" text NOT NULL,
  "challenge_reasoning" text NOT NULL,
  "challenge_evidence" jsonb DEFAULT '[]'::jsonb,
  "alternative_proposal" text,
  "resolution" "challenge_resolution" DEFAULT 'pending' NOT NULL,
  "resolution_notes" text,
  "resolution_evidence" jsonb DEFAULT '[]'::jsonb,
  "resolved_at" timestamp with time zone,
  "resolved_by" text,
  "confidence_impact" real,
  "claim_modified" text,
  "challenged_by" text NOT NULL,
  "validation_round" text
);

CREATE INDEX "adversarial_validations_entity_idx" ON "adversarial_validations" ("entity_type", "entity_id");
CREATE INDEX "adversarial_validations_resolution_idx" ON "adversarial_validations" ("resolution");

-- =============================================================================
-- VALIDATION SESSIONS TABLE
-- =============================================================================

CREATE TABLE "validation_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "session_type" text NOT NULL,
  "validator_count" real DEFAULT 1,
  "challenge_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "critical_challenges" real DEFAULT 0,
  "major_challenges" real DEFAULT 0,
  "resolved_challenges" real DEFAULT 0,
  "overall_result" text,
  "confidence_adjustment" real,
  "summary" text
);

CREATE INDEX "validation_sessions_entity_idx" ON "validation_sessions" ("entity_type", "entity_id");

-- =============================================================================
-- PREDICTIONS TABLE
-- =============================================================================

CREATE TABLE "predictions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "issue_id" text REFERENCES "issues"("id"),
  "prediction_type" "prediction_type" NOT NULL,
  "prediction_statement" text NOT NULL,
  "operationalization" jsonb NOT NULL,
  "probability" real NOT NULL,
  "confidence_interval" jsonb,
  "reasoning" text NOT NULL,
  "key_assumptions" jsonb DEFAULT '[]'::jsonb,
  "based_on_claim_ids" jsonb DEFAULT '[]'::jsonb,
  "prediction_made_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolution_deadline" timestamp with time zone NOT NULL,
  "status" "prediction_status" DEFAULT 'active' NOT NULL,
  "resolved_at" timestamp with time zone,
  "actual_outcome" text,
  "actual_value" real,
  "outcome_source" text,
  "brier_score" real,
  "log_score" real,
  "post_mortem" text,
  "model_updates" jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX "predictions_issue_id_idx" ON "predictions" ("issue_id");
CREATE INDEX "predictions_status_idx" ON "predictions" ("status");
CREATE INDEX "predictions_deadline_idx" ON "predictions" ("resolution_deadline");

-- =============================================================================
-- CALIBRATION RECORDS TABLE
-- =============================================================================

CREATE TABLE "calibration_records" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "scope" text NOT NULL,
  "calibration_bins" jsonb NOT NULL,
  "total_predictions" real NOT NULL,
  "mean_brier_score" real,
  "mean_log_score" real,
  "calibration_error" real,
  "overconfidence_ratio" real,
  "resolution" real,
  "discrimination" real,
  "by_type" jsonb
);

CREATE INDEX "calibration_records_period_idx" ON "calibration_records" ("period_start", "period_end");

-- =============================================================================
-- PREDICTION SETS TABLE
-- =============================================================================

CREATE TABLE "prediction_sets" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "issue_id" text REFERENCES "issues"("id"),
  "prediction_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resolved" boolean DEFAULT false NOT NULL,
  "set_accuracy" real,
  "set_brier_score" real
);

CREATE INDEX "prediction_sets_issue_id_idx" ON "prediction_sets" ("issue_id");

-- =============================================================================
-- MODIFICATIONS TO EXISTING TABLES
-- =============================================================================

-- Add evidence type and quality to verifications
ALTER TABLE "verifications" ADD COLUMN "evidence_type" "evidence_type" DEFAULT 'unknown';
ALTER TABLE "verifications" ADD COLUMN "evidence_quality" jsonb;
ALTER TABLE "verifications" ADD COLUMN "is_stale" boolean DEFAULT false;
ALTER TABLE "verifications" ADD COLUMN "stale_reason" text;
ALTER TABLE "verifications" ADD COLUMN "last_reviewed_at" timestamp with time zone;

-- Add causal analysis and validation status to issues
ALTER TABLE "issues" ADD COLUMN "causal_analysis" jsonb;
ALTER TABLE "issues" ADD COLUMN "validation_status" jsonb;

-- Add prior evidence to solutions
ALTER TABLE "solutions" ADD COLUMN "prior_evidence" jsonb;
ALTER TABLE "solutions" ADD COLUMN "prior_evidence_validated" boolean DEFAULT false;
ALTER TABLE "solutions" ADD COLUMN "prior_evidence_validated_at" timestamp with time zone;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE "causal_claims" IS 'Individual causal assertions with evidence strength classification';
COMMENT ON TABLE "causal_chains" IS 'Connected sequences of causal claims forming complete causal paths';
COMMENT ON TABLE "adversarial_validations" IS 'Red team challenges to claims for validation';
COMMENT ON TABLE "validation_sessions" IS 'Grouped adversarial validation sessions';
COMMENT ON TABLE "predictions" IS 'Testable forecasts for measuring understanding and calibration';
COMMENT ON TABLE "calibration_records" IS 'Aggregate prediction performance metrics';
COMMENT ON TABLE "prediction_sets" IS 'Groups of related predictions for batch evaluation';

COMMENT ON COLUMN "verifications"."evidence_type" IS 'Classification of evidence strength (experimental, observational, etc.)';
COMMENT ON COLUMN "issues"."causal_analysis" IS 'Structured causal analysis linking to formal causal claims and chains';
COMMENT ON COLUMN "issues"."validation_status" IS 'Status of adversarial and predictive validation for this issue';
COMMENT ON COLUMN "solutions"."prior_evidence" IS 'Evidence from similar interventions elsewhere';
