import { pgEnum, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Entity types for Bayesian updates
 */
export const bayesianEntityTypeEnum = pgEnum("bayesian_entity_type", [
  "issue",
  "reference_class",
]);

/**
 * Update types (which probability is being updated)
 */
export const bayesianUpdateTypeEnum = pgEnum("bayesian_update_type", [
  "p_real",
  "p_solvable",
]);

/**
 * Evidence types that trigger updates
 */
export const bayesianEvidenceTypeEnum = pgEnum("bayesian_evidence_type", [
  "verification",    // Verification result (corroborated/contested)
  "outcome",         // Solution outcome (success/failure)
  "manual",          // Manual adjustment by user
  "initial",         // Initial prior assignment
]);

/**
 * Direction of evidence (positive = confirms, negative = refutes)
 */
export const bayesianEvidenceDirectionEnum = pgEnum("bayesian_evidence_direction", [
  "positive",   // Evidence supports (adds to alpha)
  "negative",   // Evidence refutes (adds to beta)
]);

/**
 * Bayesian Updates
 *
 * Audit trail for all probability updates. Records the prior and posterior
 * distributions after each piece of evidence arrives. This enables:
 * - Debugging why a probability has its current value
 * - Rolling back updates if evidence was incorrect
 * - Understanding the evolution of beliefs over time
 */
export const bayesianUpdates = pgTable("bayesian_updates", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // Target of the update
  entityType: bayesianEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  updateType: bayesianUpdateTypeEnum("update_type").notNull(),

  // Prior distribution (before this update)
  priorAlpha: real("prior_alpha").notNull(),
  priorBeta: real("prior_beta").notNull(),

  // Posterior distribution (after this update)
  posteriorAlpha: real("posterior_alpha").notNull(),
  posteriorBeta: real("posterior_beta").notNull(),

  // Evidence details
  evidenceType: bayesianEvidenceTypeEnum("evidence_type").notNull(),
  evidenceId: text("evidence_id"),  // ID of verification/outcome that triggered this
  evidenceDirection: bayesianEvidenceDirectionEnum("evidence_direction").notNull(),
  reason: text("reason").notNull(),  // Human-readable explanation
});

export type BayesianUpdateRow = typeof bayesianUpdates.$inferSelect;
export type NewBayesianUpdateRow = typeof bayesianUpdates.$inferInsert;
