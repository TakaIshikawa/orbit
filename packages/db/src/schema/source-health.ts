import { jsonb, pgEnum, pgTable, text, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";

/**
 * Source Health Schema
 *
 * Tracks fetch success/failure rates, response times, and dynamic reliability.
 * Enables monitoring of source health and automatic reliability adjustments.
 */

export const fetchStatusEnum = pgEnum("fetch_status", [
  "success",
  "timeout",
  "http_error",
  "network_error",
  "blocked",
  "rate_limited",
]);

export const healthStatusEnum = pgEnum("health_status", [
  "healthy",     // > 90% success rate
  "degraded",    // 70-90% success rate
  "unhealthy",   // < 70% success rate
  "unknown",     // Not enough data
]);

// Individual fetch attempts log
export const sourceFetchLogs = pgTable("source_fetch_logs", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  url: text("url").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),

  // Fetch result
  status: fetchStatusEnum("status").notNull(),
  httpStatusCode: integer("http_status_code"),
  responseTimeMs: integer("response_time_ms"),
  contentLength: integer("content_length"),

  // Error details
  error: text("error"),
  errorType: text("error_type"),

  // Context
  jobId: text("job_id"),
  agentId: text("agent_id"),
});

// Aggregated health metrics per domain
export const sourceHealth = pgTable("source_health", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),

  // Health status
  healthStatus: healthStatusEnum("health_status").notNull().default("unknown"),

  // Fetch statistics (rolling window)
  successRate: real("success_rate"), // 0-1
  totalFetches: integer("total_fetches").notNull().default(0),
  failedFetches: integer("failed_fetches").notNull().default(0),
  successfulFetches: integer("successful_fetches").notNull().default(0),

  // Response time metrics
  avgResponseTimeMs: real("avg_response_time_ms"),
  p95ResponseTimeMs: real("p95_response_time_ms"),
  minResponseTimeMs: integer("min_response_time_ms"),
  maxResponseTimeMs: integer("max_response_time_ms"),

  // Error breakdown
  errorsByType: jsonb("errors_by_type").$type<{
    timeout?: number;
    http_error?: number;
    network_error?: number;
    blocked?: number;
    rate_limited?: number;
  }>(),

  // Reliability scores
  baseReliability: real("base_reliability"), // From static credibility profile
  dynamicReliability: real("dynamic_reliability"), // Calculated from fetch health
  reliabilityConfidence: real("reliability_confidence"), // Confidence in dynamic score (0-1)

  // Verification metrics
  totalVerifications: integer("total_verifications").notNull().default(0),
  corroboratedCount: integer("corroborated_count").notNull().default(0),
  contestedCount: integer("contested_count").notNull().default(0),

  // Alerts
  alertActive: boolean("alert_active").notNull().default(false),
  alertReason: text("alert_reason"),
  alertSince: timestamp("alert_since", { withTimezone: true }),

  // Rolling window tracking
  windowStartAt: timestamp("window_start_at", { withTimezone: true }),
  windowDays: integer("window_days").notNull().default(7),

  // Timestamps
  lastFetchAt: timestamp("last_fetch_at", { withTimezone: true }),
  lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Historical snapshots for trend analysis
export const sourceReliabilityHistory = pgTable("source_reliability_history", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),

  // Snapshot of metrics at this point
  successRate: real("success_rate"),
  dynamicReliability: real("dynamic_reliability"),
  healthStatus: healthStatusEnum("health_status").notNull(),
  totalFetches: integer("total_fetches").notNull(),
  avgResponseTimeMs: real("avg_response_time_ms"),
});

export type SourceFetchLogRow = typeof sourceFetchLogs.$inferSelect;
export type NewSourceFetchLogRow = typeof sourceFetchLogs.$inferInsert;
export type SourceHealthRow = typeof sourceHealth.$inferSelect;
export type NewSourceHealthRow = typeof sourceHealth.$inferInsert;
export type SourceReliabilityHistoryRow = typeof sourceReliabilityHistory.$inferSelect;
export type NewSourceReliabilityHistoryRow = typeof sourceReliabilityHistory.$inferInsert;
