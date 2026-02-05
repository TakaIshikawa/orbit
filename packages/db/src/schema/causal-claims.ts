import { jsonb, pgEnum, pgTable, text, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";

/**
 * Causal Claims Schema
 *
 * Tracks causal relationships with evidence strength classification.
 * Implements a hierarchy of evidence quality and counterfactual assessment.
 */

// Evidence strength hierarchy (strongest to weakest)
export const evidenceStrengthEnum = pgEnum("evidence_strength", [
  "experimental",        // RCT or controlled experiment
  "quasi_experimental",  // Natural experiment, regression discontinuity
  "longitudinal",        // Repeated observations over time
  "cross_sectional",     // Single-point comparison across groups
  "case_control",        // Retrospective comparison
  "observational",       // Correlation without controls
  "expert_consensus",    // Expert opinion with reasoning
  "anecdotal",           // Individual cases without systematic study
  "theoretical",         // Derived from theory without empirical test
]);

// Causal direction confidence
export const causalDirectionEnum = pgEnum("causal_direction", [
  "forward",             // X causes Y
  "reverse",             // Y causes X
  "bidirectional",       // X ↔ Y
  "spurious",            // Both caused by Z
  "unknown",             // Direction unclear
]);

// Counterfactual assessment status
export const counterfactualStatusEnum = pgEnum("counterfactual_status", [
  "not_assessed",
  "assessed_supported",    // Counterfactual analysis supports causation
  "assessed_weakened",     // Counterfactual analysis weakens claim
  "assessed_refuted",      // Counterfactual analysis refutes claim
]);

/**
 * Causal Claims - Individual causal assertions with evidence
 */
export const causalClaims = pgTable("causal_claims", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // Link to issue
  issueId: text("issue_id").references(() => issues.id),

  // The causal assertion
  cause: text("cause").notNull(),
  effect: text("effect").notNull(),
  mechanism: text("mechanism"),  // How cause leads to effect

  // Direction and confidence
  direction: causalDirectionEnum("direction").notNull().default("forward"),
  confidence: real("confidence").notNull().default(0.5),

  // Evidence classification
  evidenceStrength: evidenceStrengthEnum("evidence_strength").notNull(),
  evidenceSources: jsonb("evidence_sources").$type<Array<{
    sourceUrl: string;
    sourceName: string;
    studyType?: string;
    sampleSize?: number;
    effectSize?: number;
    pValue?: number;
    confidenceInterval?: { lower: number; upper: number };
    yearPublished?: number;
    peerReviewed: boolean;
    excerpt: string;
    relevance: "high" | "medium" | "low";
  }>>().notNull().default([]),

  // Counterfactual assessment
  counterfactualStatus: counterfactualStatusEnum("counterfactual_status").notNull().default("not_assessed"),
  counterfactualAnalysis: jsonb("counterfactual_analysis").$type<{
    question: string;  // "What would happen if cause were absent?"
    assessment: string;
    alternativeExplanations: Array<{
      explanation: string;
      plausibility: number;  // 0-1
      refutation?: string;
    }>;
    confounders: Array<{
      variable: string;
      controlled: boolean;
      impact: "high" | "medium" | "low";
    }>;
    assessedAt: string;
    assessedBy: string;
  }>(),

  // Bradford Hill criteria assessment
  hillCriteria: jsonb("hill_criteria").$type<{
    strength: { score: number; notes: string };        // Large effect size
    consistency: { score: number; notes: string };     // Replicated across studies
    specificity: { score: number; notes: string };     // Specific association
    temporality: { score: number; notes: string };     // Cause precedes effect
    gradient: { score: number; notes: string };        // Dose-response relationship
    plausibility: { score: number; notes: string };    // Mechanism is plausible
    coherence: { score: number; notes: string };       // Fits with other knowledge
    experiment: { score: number; notes: string };      // Experimental support
    analogy: { score: number; notes: string };         // Similar relationships exist
    overallScore: number;
    assessedAt: string;
  }>(),

  // Derived score based on evidence hierarchy
  evidenceScore: real("evidence_score"),  // Computed from evidenceStrength + criteria
});

/**
 * Causal Chains - Connected sequences of causal claims
 */
export const causalChains = pgTable("causal_chains", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // Link to issue
  issueId: text("issue_id").references(() => issues.id),

  // Chain metadata
  name: text("name").notNull(),
  description: text("description"),

  // Ordered list of causal claim IDs forming the chain
  claimIds: jsonb("claim_ids").$type<string[]>().notNull().default([]),

  // Chain-level assessment
  // Overall chain is only as strong as weakest link
  weakestLinkId: text("weakest_link_id"),
  overallConfidence: real("overall_confidence"),

  // Completeness check - are there gaps?
  hasGaps: boolean("has_gaps").notNull().default(false),
  gapDescription: text("gap_description"),

  // Is this the primary causal path or an alternative?
  isPrimary: boolean("is_primary").notNull().default(false),
});

export type CausalClaimRow = typeof causalClaims.$inferSelect;
export type NewCausalClaimRow = typeof causalClaims.$inferInsert;
export type CausalChainRow = typeof causalChains.$inferSelect;
export type NewCausalChainRow = typeof causalChains.$inferInsert;
