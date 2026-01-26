import { jsonb, pgEnum, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const runStatusEnum = pgEnum("run_status", [
  "running",
  "success",
  "failed",
  "timeout",
  "cancelled",
]);

export const runLogs = pgTable("run_logs", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("active"),

  // RunLog-specific fields
  decisionId: text("decision_id").notNull(),
  agentId: text("agent_id").notNull(),
  triggeredBy: jsonb("triggered_by").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  llmCalls: jsonb("llm_calls").notNull().default([]),
  decisions: jsonb("decisions").notNull().default([]),
  toolCalls: jsonb("tool_calls").notNull().default([]),
  runStatus: runStatusEnum("run_status").notNull().default("running"),
  error: text("error"),
  artifacts: jsonb("artifacts").$type<string[]>().notNull().default([]),
  stateChanges: jsonb("state_changes").$type<string[]>().notNull().default([]),
});

export type RunLogRow = typeof runLogs.$inferSelect;
export type NewRunLogRow = typeof runLogs.$inferInsert;
