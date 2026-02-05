import { jsonb, pgEnum, pgTable, text, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const solutionTypeEnum = pgEnum("solution_type", [
  "tool",
  "platform",
  "system",
  "automation",
  "research",
  "model",
  "policy",
  "other",
]);

export const solutionStatusEnum = pgEnum("solution_status", [
  "proposed",
  "approved",
  "in_progress",
  "completed",
  "abandoned",
]);

export const solutions = pgTable("solutions", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("draft"),

  // Solution-specific fields
  situationModelId: text("situation_model_id"),  // nullable - can create solutions without formal situation model
  issueId: text("issue_id"),  // direct link to issue being addressed
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  solutionType: solutionTypeEnum("solution_type").notNull(),
  mechanism: text("mechanism").notNull(),
  components: jsonb("components").notNull().default([]),
  preconditions: jsonb("preconditions").notNull().default([]),
  risks: jsonb("risks").notNull().default([]),
  metrics: jsonb("metrics").notNull().default([]),
  executionPlan: jsonb("execution_plan").notNull().default([]),
  artifacts: jsonb("artifacts").$type<string[]>().notNull().default([]),
  addressesIssues: jsonb("addresses_issues").$type<string[]>().notNull().default([]),

  // Additional planning fields
  targetLeveragePoints: jsonb("target_leverage_points").$type<string[]>().default([]),
  successMetrics: jsonb("success_metrics").default([]),
  estimatedImpact: jsonb("estimated_impact"),
  feasibilityScore: real("feasibility_score"),
  impactScore: real("impact_score"),
  confidence: real("confidence"),

  solutionStatus: solutionStatusEnum("solution_status").notNull().default("proposed"),

  // Assignment fields for tracking who is working on the solution
  assignedTo: text("assigned_to"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),

  // Prior Evidence - Evidence from similar interventions elsewhere
  priorEvidence: jsonb("prior_evidence").$type<{
    // Similar interventions that have been tried
    similarInterventions: Array<{
      name: string;
      description: string;
      context: string;  // Where/when was it tried
      outcome: "success" | "partial_success" | "failure" | "unknown";
      effectSize?: number;  // Measured effect if available
      sampleSize?: number;
      timeframe?: string;
      sourceUrl?: string;
      sourceName?: string;
      relevanceToOurs: "high" | "medium" | "low";
      keyDifferences?: string[];  // How our context differs
    }>;

    // Systematic review evidence if available
    systematicReviews?: Array<{
      title: string;
      sourceUrl: string;
      conclusion: string;
      evidenceQuality: "high" | "moderate" | "low" | "very_low";
      effectEstimate?: string;
      applicability: "directly_applicable" | "partially_applicable" | "uncertain";
    }>;

    // Expert/practitioner evidence
    expertEvidence?: Array<{
      expertName?: string;
      expertise: string;
      opinion: string;
      confidence: number;
      sourceUrl?: string;
    }>;

    // Theory of change validation
    theoryOfChangeEvidence?: {
      mechanismTested: boolean;
      mechanismSupported: boolean;
      testDescription?: string;
      failurePoints?: string[];  // Where the mechanism might fail
    };

    // Overall prior assessment
    overallPriorStrength: "strong" | "moderate" | "weak" | "none";
    expectedSuccessProbability?: number;  // Based on priors
    confidenceInPrior: number;  // 0-1

    lastUpdatedAt: string;
  }>(),

  // Track whether this solution's prior evidence has been validated
  priorEvidenceValidated: boolean("prior_evidence_validated").default(false),
  priorEvidenceValidatedAt: timestamp("prior_evidence_validated_at", { withTimezone: true }),
});

export type SolutionRow = typeof solutions.$inferSelect;
export type NewSolutionRow = typeof solutions.$inferInsert;
