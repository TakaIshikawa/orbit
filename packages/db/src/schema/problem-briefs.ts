import { jsonb, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const problemBriefs = pgTable("problem_briefs", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("draft"),

  // Problem brief-specific fields
  issueId: text("issue_id").notNull(),
  goals: jsonb("goals").notNull(),
  constraints: jsonb("constraints").notNull().default([]),
  uncertainties: jsonb("uncertainties").notNull().default([]),
  actionSpace: jsonb("action_space").notNull(),
  requiredEvidence: jsonb("required_evidence").notNull().default([]),
});

export type ProblemBriefRow = typeof problemBriefs.$inferSelect;
export type NewProblemBriefRow = typeof problemBriefs.$inferInsert;
