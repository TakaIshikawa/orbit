import { jsonb, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const situationModels = pgTable("situation_models", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("draft"),

  // Situation model-specific fields
  problemBriefId: text("problem_brief_id").notNull(),
  claims: jsonb("claims").notNull().default([]),
  evidence: jsonb("evidence").notNull().default([]),
  systemMap: jsonb("system_map").notNull(),
  uncertaintyMap: jsonb("uncertainty_map").notNull().default([]),
  keyInsights: jsonb("key_insights").$type<string[]>().notNull().default([]),
  recommendedLeveragePoints: jsonb("recommended_leverage_points").$type<string[]>().notNull().default([]),
});

export type SituationModelRow = typeof situationModels.$inferSelect;
export type NewSituationModelRow = typeof situationModels.$inferInsert;
