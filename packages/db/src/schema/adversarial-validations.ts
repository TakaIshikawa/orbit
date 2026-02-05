import { jsonb, pgEnum, pgTable, text, timestamp, real } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { solutions } from "./solutions.js";

/**
 * Adversarial Validations Schema
 *
 * Implements "red team" style validation where claims are systematically
 * challenged. Each validation captures a challenge and its resolution.
 */

// Challenge types
export const challengeTypeEnum = pgEnum("challenge_type", [
  "framing_challenge",      // Is this the right way to frame the issue?
  "evidence_challenge",     // Is the evidence sufficient/valid?
  "causation_challenge",    // Is the causal relationship valid?
  "scope_challenge",        // Is the scope correctly identified?
  "stakeholder_challenge",  // Are all stakeholders considered?
  "alternative_challenge",  // Is there a better explanation/solution?
  "feasibility_challenge",  // Is the proposed solution feasible?
  "unintended_effects",     // What could go wrong?
  "base_rate_challenge",    // Does this differ from base rates?
  "selection_bias",         // Is the sample representative?
]);

// Challenge severity
export const challengeSeverityEnum = pgEnum("challenge_severity", [
  "critical",   // Would invalidate core claim if unresolved
  "major",      // Significantly weakens claim
  "moderate",   // Notable concern
  "minor",      // Small issue
]);

// Resolution status
export const challengeResolutionEnum = pgEnum("challenge_resolution", [
  "pending",          // Not yet addressed
  "resolved",         // Adequately addressed
  "partially_resolved", // Some concerns remain
  "unresolved",       // Could not be addressed
  "accepted",         // Challenge accepted, claim modified
]);

/**
 * Adversarial Validations - Red team challenges to claims
 */
export const adversarialValidations = pgTable("adversarial_validations", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // What's being challenged
  entityType: text("entity_type").notNull(), // "issue" | "solution" | "causal_claim"
  entityId: text("entity_id").notNull(),

  // The challenge
  challengeType: challengeTypeEnum("challenge_type").notNull(),
  severity: challengeSeverityEnum("severity").notNull(),
  challengeStatement: text("challenge_statement").notNull(),
  challengeReasoning: text("challenge_reasoning").notNull(),

  // Supporting evidence for challenge
  challengeEvidence: jsonb("challenge_evidence").$type<Array<{
    sourceUrl?: string;
    sourceName?: string;
    excerpt: string;
    relevance: "high" | "medium" | "low";
  }>>().default([]),

  // What the challenger proposes instead (if applicable)
  alternativeProposal: text("alternative_proposal"),

  // Resolution
  resolution: challengeResolutionEnum("resolution").notNull().default("pending"),
  resolutionNotes: text("resolution_notes"),
  resolutionEvidence: jsonb("resolution_evidence").$type<Array<{
    sourceUrl?: string;
    sourceName?: string;
    excerpt: string;
  }>>().default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),

  // Impact of challenge
  // How much did this challenge reduce confidence in the claim?
  confidenceImpact: real("confidence_impact"), // -1 to 0 (reduction) or 0 to 1 (strengthened after resolution)

  // Was the original claim modified as a result?
  claimModified: text("claim_modified"), // Description of modification if any

  // Metadata
  challengedBy: text("challenged_by").notNull(), // "system:adversarial" | user ID
  validationRound: text("validation_round"), // Optional grouping for batch validations
});

/**
 * Validation Sessions - Group multiple challenges together
 */
export const validationSessions = pgTable("validation_sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // What's being validated
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),

  // Session metadata
  sessionType: text("session_type").notNull(), // "automated" | "manual" | "peer_review"
  validatorCount: real("validator_count").default(1),

  // Linked challenges
  challengeIds: jsonb("challenge_ids").$type<string[]>().notNull().default([]),

  // Summary
  criticalChallenges: real("critical_challenges").default(0),
  majorChallenges: real("major_challenges").default(0),
  resolvedChallenges: real("resolved_challenges").default(0),

  // Outcome
  overallResult: text("overall_result"), // "validated" | "needs_revision" | "rejected"
  confidenceAdjustment: real("confidence_adjustment"), // -1 to 1
  summary: text("summary"),
});

export type AdversarialValidationRow = typeof adversarialValidations.$inferSelect;
export type NewAdversarialValidationRow = typeof adversarialValidations.$inferInsert;
export type ValidationSessionRow = typeof validationSessions.$inferSelect;
export type NewValidationSessionRow = typeof validationSessions.$inferInsert;
