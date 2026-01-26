import { jsonb, pgEnum, pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";

export const patternTypeEnum = pgEnum("pattern_type", [
  "policy_gap",
  "structural_inefficiency",
  "feedback_loop",
  "information_asymmetry",
  "coordination_failure",
  "other",
]);

export const observationFrequencyEnum = pgEnum("observation_frequency", [
  "one_time",
  "recurring",
  "continuous",
]);

export const recordStatusEnum = pgEnum("record_status", [
  "draft",
  "active",
  "superseded",
  "archived",
]);

export const patterns = pgTable("patterns", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("draft"),

  // Pattern-specific fields
  title: text("title").notNull(),
  description: text("description").notNull(),
  patternType: patternTypeEnum("pattern_type").notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  geographies: jsonb("geographies").$type<string[]>().notNull().default([]),
  sources: jsonb("sources").notNull(),
  firstObserved: timestamp("first_observed", { withTimezone: true }).notNull(),
  observationFrequency: observationFrequencyEnum("observation_frequency").notNull(),
  clusterId: text("cluster_id"),
  confidence: real("confidence").notNull(),
});

export type PatternRow = typeof patterns.$inferSelect;
export type NewPatternRow = typeof patterns.$inferInsert;
