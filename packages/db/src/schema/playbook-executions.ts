import { jsonb, pgEnum, pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const executionStatusEnum = pgEnum("execution_status", [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const stepStatusEnum = pgEnum("step_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

// Playbook execution instance
export const playbookExecutions = pgTable("playbook_executions", {
  id: text("id").primaryKey(),
  playbookId: text("playbook_id").notNull(),
  triggeredBy: text("triggered_by").notNull(), // "manual", "pattern", "issue", "schedule"
  triggerRef: text("trigger_ref"), // ID of the pattern/issue that triggered

  status: executionStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Context passed to the playbook
  context: jsonb("context").$type<{
    patternId?: string;
    issueId?: string;
    briefId?: string;
    variables?: Record<string, unknown>;
  }>().notNull().default({}),

  // Execution results
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(0),
  output: jsonb("output").$type<{
    patternsCreated?: string[];
    issuesCreated?: string[];
    briefsCreated?: string[];
    solutionsCreated?: string[];
    verificationsCreated?: string[];
    notifications?: string[];
  }>().default({}),

  error: text("error"),
  logs: jsonb("logs").$type<Array<{
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    stepIndex?: number;
  }>>().default([]),
});

// Individual step execution within a playbook run
export const playbookStepExecutions = pgTable("playbook_step_executions", {
  id: text("id").primaryKey(),
  executionId: text("execution_id").notNull(),
  stepIndex: integer("step_index").notNull(),
  stepName: text("step_name").notNull(),
  actionType: text("action_type").notNull(), // "scout", "analyze", "brief", "verify", "plan", "notify", "condition", "wait"

  status: stepStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),

  // Step configuration
  config: jsonb("config").$type<Record<string, unknown>>().default({}),

  // Step results
  output: jsonb("output").$type<Record<string, unknown>>().default({}),
  error: text("error"),

  // For conditional steps
  conditionResult: boolean("condition_result"),
  skipReason: text("skip_reason"),
});

export type PlaybookExecutionRow = typeof playbookExecutions.$inferSelect;
export type NewPlaybookExecutionRow = typeof playbookExecutions.$inferInsert;
export type PlaybookStepExecutionRow = typeof playbookStepExecutions.$inferSelect;
export type NewPlaybookStepExecutionRow = typeof playbookStepExecutions.$inferInsert;
