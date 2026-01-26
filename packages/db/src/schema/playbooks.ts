import { jsonb, pgEnum, pgTable, text, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const playbookStatusEnum = pgEnum("playbook_status", ["draft", "active", "deprecated"]);

// Operator action config for computer-use
export interface OperatorActionConfig {
  taskType: "computer_use";
  objective: string;
  startUrl?: string;
  successCriteria?: string[];
  headless?: boolean;
  maxSteps?: number;
  displaySize?: {
    width: number;
    height: number;
  };
}

// Step action types
export type PlaybookStepAction =
  | { type: "scout"; config: { sources?: string[]; maxPatterns?: number } }
  | { type: "analyze"; config: { maxIssues?: number } }
  | { type: "brief"; config: { issueId?: string } }
  | { type: "verify"; config: { maxClaims?: number; maxSources?: number } }
  | { type: "plan"; config: { maxSolutions?: number } }
  | { type: "notify"; config: { channel: string; message: string } }
  | { type: "condition"; config: { expression: string; onTrue?: number; onFalse?: number } }
  | { type: "wait"; config: { duration: number; unit: "seconds" | "minutes" | "hours" } }
  | { type: "human_review"; config: { prompt: string; timeout?: number } }
  | { type: "operator"; config: OperatorActionConfig };

export interface PlaybookStep {
  name: string;
  description?: string;
  action: PlaybookStepAction;
  continueOnError?: boolean;
  retryCount?: number;
}

export interface PlaybookTrigger {
  type: "manual" | "pattern_created" | "issue_created" | "schedule" | "webhook";
  conditions?: {
    patternTypes?: string[];
    domains?: string[];
    minConfidence?: number;
    minScore?: number;
  };
  schedule?: string; // cron expression for schedule trigger
}

export const playbooks = pgTable("playbooks", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("draft"),

  // Playbook metadata
  name: text("name").notNull(),
  description: text("description").notNull(),

  // Trigger configuration
  triggers: jsonb("triggers").$type<PlaybookTrigger[]>().notNull().default([]),

  // Applicability conditions (legacy, kept for compatibility)
  applicableTo: jsonb("applicable_to").$type<{
    patternTypes?: string[];
    domains?: string[];
  }>().notNull().default({}),

  // Step definitions
  steps: jsonb("steps").$type<PlaybookStep[]>().notNull().default([]),

  // Legacy fields (kept for compatibility)
  problemBriefTemplate: jsonb("problem_brief_template").default({}),
  investigationSteps: jsonb("investigation_steps").$type<string[]>().notNull().default([]),
  solutionPatterns: jsonb("solution_patterns").notNull().default([]),

  // Metrics
  timesUsed: integer("times_used").notNull().default(0),
  successRate: real("success_rate"),
  avgTimeToResolution: integer("avg_time_to_resolution"),

  // Relationships
  forkedFrom: text("forked_from"),

  // Status
  playbookStatus: playbookStatusEnum("playbook_status").notNull().default("draft"),
  isEnabled: boolean("is_enabled").notNull().default(false),
});

export type PlaybookRow = typeof playbooks.$inferSelect;
export type NewPlaybookRow = typeof playbooks.$inferInsert;
