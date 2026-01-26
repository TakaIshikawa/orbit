import { jsonb, pgEnum, pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const jobTypeEnum = pgEnum("job_type", [
  "scout",
  "analyze",
  "brief",
  "verify",
  "plan",
  "pipeline",
  "source_health",
  "feedback",
  "evaluate",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

// Job definitions (what to run and when)
export const scheduledJobs = pgTable("scheduled_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  jobType: jobTypeEnum("job_type").notNull(),
  cronExpression: text("cron_expression").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
});

// Job execution history
export const jobRuns = pgTable("job_runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  output: text("output"),
  error: text("error"),
  stats: jsonb("stats").$type<{
    patternsCreated?: number;
    issuesCreated?: number;
    solutionsCreated?: number;
    briefsCreated?: number;
    verificationsCreated?: number;
    sourcesProcessed?: number;
  }>().default({}),
});

export type ScheduledJobRow = typeof scheduledJobs.$inferSelect;
export type NewScheduledJobRow = typeof scheduledJobs.$inferInsert;
export type JobRunRow = typeof jobRuns.$inferSelect;
export type NewJobRunRow = typeof jobRuns.$inferInsert;
