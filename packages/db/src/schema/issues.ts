import { jsonb, pgEnum, pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";
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
});

export type IssueRow = typeof issues.$inferSelect;
export type NewIssueRow = typeof issues.$inferInsert;
