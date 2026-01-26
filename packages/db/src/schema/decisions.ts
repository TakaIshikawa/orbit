import { jsonb, pgEnum, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const decisionTypeEnum = pgEnum("decision_type", ["approve", "reject", "defer", "modify"]);

export const autonomyLevelEnum = pgEnum("autonomy_level", ["L0", "L1", "L2", "L3"]);

export const decisions = pgTable("decisions", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("active"),

  // Decision-specific fields
  solutionId: text("solution_id").notNull(),
  decision: decisionTypeEnum("decision").notNull(),
  rationale: text("rationale").notNull(),
  modifications: text("modifications"),
  autonomyLevel: autonomyLevelEnum("autonomy_level").notNull(),
  approvals: jsonb("approvals").notNull().default([]),
  guardrails: jsonb("guardrails").notNull().default([]),
  runId: text("run_id"),
});

export type DecisionRow = typeof decisions.$inferSelect;
export type NewDecisionRow = typeof decisions.$inferInsert;
