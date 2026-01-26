/**
 * Computer Use Sessions Schema
 *
 * Database schema for tracking computer-use sessions and invocations.
 */

import { jsonb, pgEnum, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const computerUseStatusEnum = pgEnum("computer_use_status", [
  "running",
  "completed",
  "failed",
  "stopped",
]);

// Computer-use session configuration
export interface ComputerUseConfigRecord {
  displayWidth: number;
  displayHeight: number;
  headless: boolean;
  maxSteps: number;
  actionTimeoutMs: number;
}

// Computer action record
export interface ComputerActionRecord {
  type: string;
  text?: string;
  coordinate?: [number, number];
  startCoordinate?: [number, number];
  endCoordinate?: [number, number];
}

// Tool invocation record
export interface ToolInvocationRecord {
  id: string;
  stepNumber: number;
  timestamp: string;
  action: ComputerActionRecord;
  screenshotPath?: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

/**
 * Computer-use sessions table
 * Tracks each computer-use execution session
 */
export const computerUseSessions = pgTable("computer_use_sessions", {
  id: text("id").primaryKey(),

  // Session metadata
  objective: text("objective").notNull(),
  startUrl: text("start_url"),

  // Configuration
  config: jsonb("config").$type<ComputerUseConfigRecord>().notNull(),

  // Status and timing
  status: computerUseStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Execution metrics
  totalSteps: integer("total_steps").notNull().default(0),

  // Results
  summary: text("summary"),
  error: text("error"),

  // Relationships
  executionId: text("execution_id"), // Link to playbook execution if applicable
  playbookId: text("playbook_id"),   // Link to playbook if applicable
});

/**
 * Computer-use invocations table
 * Tracks each tool invocation within a session
 */
export const computerUseInvocations = pgTable("computer_use_invocations", {
  id: text("id").primaryKey(),

  // Session reference
  sessionId: text("session_id").notNull().references(() => computerUseSessions.id),

  // Invocation details
  stepNumber: integer("step_number").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),

  // Action performed
  action: jsonb("action").$type<ComputerActionRecord>().notNull(),

  // Results
  success: integer("success").notNull(), // 1 for true, 0 for false
  error: text("error"),
  durationMs: integer("duration_ms").notNull(),

  // Screenshot reference (path, not the actual image)
  screenshotPath: text("screenshot_path"),
});

export type ComputerUseSessionRow = typeof computerUseSessions.$inferSelect;
export type NewComputerUseSessionRow = typeof computerUseSessions.$inferInsert;
export type ComputerUseInvocationRow = typeof computerUseInvocations.$inferSelect;
export type NewComputerUseInvocationRow = typeof computerUseInvocations.$inferInsert;
