import { jsonb, pgEnum, pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "corroborated",
  "contested",
  "partially_supported",
  "unverified",
]);

export const claimCategoryEnum = pgEnum("claim_category", [
  "factual",
  "statistical",
  "causal",
  "predictive",
  "definitional",
]);

// Store verification results at the claim level
export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // What we're verifying
  sourceType: text("source_type").notNull(), // "pattern" | "brief" | "situation_model"
  sourceId: text("source_id").notNull(),

  // The claim being verified
  claimStatement: text("claim_statement").notNull(),
  claimCategory: claimCategoryEnum("claim_category").notNull(),
  originalConfidence: real("original_confidence").notNull(),

  // Verification result
  status: verificationStatusEnum("status").notNull(),
  adjustedConfidence: real("adjusted_confidence").notNull(),
  verificationNotes: text("verification_notes"),

  // Source assessments
  corroboratingSourcesCount: integer("corroborating_sources_count").notNull().default(0),
  conflictingSourcesCount: integer("conflicting_sources_count").notNull().default(0),
  sourceAssessments: jsonb("source_assessments").$type<Array<{
    url: string;
    name: string;
    credibility: number;
    alignment: "supports" | "contradicts" | "neutral" | "partially_supports";
    relevance: "high" | "medium" | "low" | "none";
    relevantExcerpt: string;
    confidence: number;
  }>>().notNull().default([]),

  // Conflicts identified
  conflicts: jsonb("conflicts").$type<Array<{
    description: string;
    severity: "minor" | "moderate" | "major";
    sources: string[];
  }>>().notNull().default([]),
});

export type VerificationRow = typeof verifications.$inferSelect;
export type NewVerificationRow = typeof verifications.$inferInsert;
