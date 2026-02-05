import { jsonb, pgEnum, pgTable, text, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";

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

// Evidence type classification for assessing claim strength
export const evidenceTypeEnum = pgEnum("evidence_type", [
  "experimental",         // RCT, controlled experiment
  "quasi_experimental",   // Natural experiment, regression discontinuity
  "longitudinal",         // Time series, cohort studies
  "cross_sectional",      // Surveys, snapshots
  "case_control",         // Retrospective comparison
  "meta_analysis",        // Systematic synthesis of studies
  "observational",        // Correlation without controls
  "expert_opinion",       // Expert consensus
  "anecdotal",            // Individual cases
  "theoretical",          // Theory-derived without empirical test
  "unknown",              // Evidence type not classified
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

  // Evidence type classification (NEW)
  evidenceType: evidenceTypeEnum("evidence_type").default("unknown"),

  // Evidence quality assessment (NEW)
  evidenceQuality: jsonb("evidence_quality").$type<{
    // Sample characteristics
    sampleSize?: number;
    representativeness: "high" | "medium" | "low" | "unknown";

    // Methodological quality
    methodologicalRigor: "high" | "medium" | "low" | "unknown";
    potentialBiases: string[];
    controlsUsed: boolean;

    // Replication
    replicatedCount: number;
    replicationConsistency: "consistent" | "mixed" | "inconsistent" | "not_replicated";

    // Effect characteristics
    effectSize?: number;
    effectSizeInterpretation?: "large" | "medium" | "small" | "negligible";
    statisticalSignificance?: boolean;
    pValue?: number;
    confidenceInterval?: { lower: number; upper: number };

    // Recency and relevance
    studyRecency: "recent" | "dated" | "historical" | "unknown";
    contextRelevance: "directly_applicable" | "partially_applicable" | "different_context" | "unknown";

    // Overall grade
    overallGrade: "A" | "B" | "C" | "D" | "F" | "ungraded";
    gradingNotes?: string;
  }>(),

  // Is this verification still current?
  isStale: boolean("is_stale").default(false),
  staleReason: text("stale_reason"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
});

export type VerificationRow = typeof verifications.$inferSelect;
export type NewVerificationRow = typeof verifications.$inferInsert;
