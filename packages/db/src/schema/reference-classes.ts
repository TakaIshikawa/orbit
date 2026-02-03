import { integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Reference Classes
 *
 * Stores base rates (priors) for categories of issues. These provide the starting
 * probabilities for new issues based on their classification (domains, pattern types).
 *
 * Uses Beta distribution parameters (alpha, beta) which:
 * - Start with uninformative priors (alpha=2, beta=2)
 * - Update as evidence accumulates
 * - Mean = alpha / (alpha + beta)
 * - Confidence increases with sample size (alpha + beta)
 */
export const referenceClasses = pgTable("reference_classes", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),

  // Classification criteria for matching issues to this reference class
  domains: jsonb("domains").$type<string[]>().notNull().default([]),
  patternTypes: jsonb("pattern_types").$type<string[]>().notNull().default([]),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),

  // P(real) base rate - probability that issues of this type are correctly framed
  // Beta distribution: mean = alpha / (alpha + beta)
  pRealAlpha: real("p_real_alpha").notNull().default(2),
  pRealBeta: real("p_real_beta").notNull().default(2),
  pRealSampleSize: integer("p_real_sample_size").notNull().default(0),

  // P(solvable) base rate - probability that interventions on this type succeed
  // Beta distribution: mean = alpha / (alpha + beta)
  pSolvableAlpha: real("p_solvable_alpha").notNull().default(2),
  pSolvableBeta: real("p_solvable_beta").notNull().default(2),
  pSolvableSampleSize: integer("p_solvable_sample_size").notNull().default(0),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReferenceClassRow = typeof referenceClasses.$inferSelect;
export type NewReferenceClassRow = typeof referenceClasses.$inferInsert;
