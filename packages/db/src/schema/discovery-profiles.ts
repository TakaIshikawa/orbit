import { boolean, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Discovery Profiles Schema
 *
 * Saved configurations for discovery workflows, allowing users to
 * create reusable setups with specific sources, domains, and keywords.
 * Supports scheduling for recurring discovery runs.
 */

export const discoveryProfiles = pgTable("discovery_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),

  // Configuration
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),  // References managed_sources
  domains: jsonb("domains").$type<string[]>().notNull().default([]),        // Topic domains to search
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),      // Search keywords
  excludeKeywords: jsonb("exclude_keywords").$type<string[]>().notNull().default([]), // Exclusions

  // Discovery settings
  maxPatterns: integer("max_patterns").notNull().default(20),
  maxIssues: integer("max_issues").notNull().default(5),
  minSourceCredibility: real("min_source_credibility").default(0.5),

  // Scheduling
  isScheduled: boolean("is_scheduled").notNull().default(false),
  cronExpression: text("cron_expression"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),

  // Metadata
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiscoveryProfileRow = typeof discoveryProfiles.$inferSelect;
export type NewDiscoveryProfileRow = typeof discoveryProfiles.$inferInsert;
