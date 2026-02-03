import { boolean, jsonb, pgEnum, pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const timeHorizonEnum = pgEnum("time_horizon", ["months", "years", "decades"]);

export const propagationVelocityEnum = pgEnum("propagation_velocity", ["fast", "medium", "slow"]);

export const issueStatusEnum = pgEnum("issue_status", [
  "identified",
  "investigating",
  "solution_proposed",
  "in_progress",
  "resolved",
  "wont_fix",
]);

export const simpleStatusEnum = pgEnum("simple_status", [
  "needs_attention",
  "being_worked",
  "blocked",
  "watching",
  "resolved",
]);

export const issues = pgTable("issues", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("draft"),

  // Issue-specific fields
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  patternIds: jsonb("pattern_ids").$type<string[]>().notNull().default([]),

  // Sources used to generate this issue (with item-level references)
  sources: jsonb("sources").$type<Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    itemTitle: string;
    itemUrl: string;
    excerpt?: string;
    credibility?: number;
  }>>().notNull().default([]),

  // Condensed display (human-readable summaries for UI)
  headline: text("headline"),                           // One sentence, specific, no jargon
  whyNow: text("why_now"),                              // Time-sensitivity explanation
  keyNumber: text("key_number"),                        // Anchor statistic ("500K firms")
  simpleStatus: simpleStatusEnum("simple_status"),      // Simplified status for UI

  // Systemic framing
  rootCauses: jsonb("root_causes").$type<string[]>().notNull().default([]),
  affectedDomains: jsonb("affected_domains").$type<string[]>().notNull(),
  leveragePoints: jsonb("leverage_points").$type<string[]>().notNull().default([]),

  // IUTLN scores
  scoreImpact: real("score_impact").notNull(),
  scoreUrgency: real("score_urgency").notNull(),
  scoreTractability: real("score_tractability").notNull(),
  scoreLegitimacy: real("score_legitimacy").notNull(),
  scoreNeglectedness: real("score_neglectedness").notNull(),
  compositeScore: real("composite_score").notNull(),

  // Issue graph
  upstreamIssues: jsonb("upstream_issues").$type<string[]>().notNull().default([]),
  downstreamIssues: jsonb("downstream_issues").$type<string[]>().notNull().default([]),
  relatedIssues: jsonb("related_issues").$type<string[]>().notNull().default([]),

  // Time dimension
  timeHorizon: timeHorizonEnum("time_horizon").notNull(),
  propagationVelocity: propagationVelocityEnum("propagation_velocity").notNull(),

  // State
  issueStatus: issueStatusEnum("issue_status").notNull().default("identified"),

  // Archive fields
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: text("archived_by"),
  archiveReason: text("archive_reason"),

  // Bayesian Expected Value scoring
  // Links to the reference class that provides base rate priors
  referenceClassId: text("reference_class_id"),

  // Bayesian scores stored as JSONB for flexibility
  bayesianScores: jsonb("bayesian_scores").$type<{
    pReal: { alpha: number; beta: number; mean: number };
    pSolvable: { alpha: number; beta: number; mean: number };
    impact: { estimate: number; confidence: number };
    reach: { estimate: number; confidence: number; unit?: string };
    cost: { estimate: number; confidence: number; unit?: string };
    lastUpdatedAt: string;
  }>(),

  // Computed Expected Value: P(real) × P(solvable) × Impact × Reach - Cost
  expectedValue: real("expected_value"),
  // Confidence in EV estimate (increases with more observations)
  evConfidence: real("ev_confidence"),
});

export type IssueRow = typeof issues.$inferSelect;
export type NewIssueRow = typeof issues.$inferInsert;
