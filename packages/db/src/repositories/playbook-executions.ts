import { eq, desc, and, sql } from "drizzle-orm";
import {
  playbookExecutions,
  playbookStepExecutions,
  type PlaybookExecutionRow,
  type NewPlaybookExecutionRow,
  type PlaybookStepExecutionRow,
  type NewPlaybookStepExecutionRow,
} from "../schema/playbook-executions.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export class PlaybookExecutionRepository extends BaseRepository<
  typeof playbookExecutions,
  PlaybookExecutionRow,
  NewPlaybookExecutionRow
> {
  constructor(db: Database) {
    super(db, playbookExecutions, "id");
  }

  async findByPlaybook(playbookId: string, options: ListOptions = {}): Promise<PaginatedResult<PlaybookExecutionRow>> {
    const { limit = 20, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(playbookExecutions)
      .where(eq(playbookExecutions.playbookId, playbookId))
      .orderBy(desc(playbookExecutions.startedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: playbookExecutions.id })
      .from(playbookExecutions)
      .where(eq(playbookExecutions.playbookId, playbookId));

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findRunning(): Promise<PlaybookExecutionRow[]> {
    return this.db
      .select()
      .from(playbookExecutions)
      .where(eq(playbookExecutions.status, "running"));
  }

  /**
   * Find discovery runs with running/pending prioritized, then by date
   */
  async findDiscoveryRunsWithPriority(options: ListOptions = {}): Promise<PaginatedResult<PlaybookExecutionRow>> {
    const { limit = 20, offset = 0 } = options;

    // Count total discovery runs
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(playbookExecutions)
      .where(eq(playbookExecutions.playbookId, "discovery"));

    const total = Number(countResult[0]?.count ?? 0);

    // Get discovery runs with custom ordering using SQL CASE:
    // 1. Running/pending first (status priority)
    // 2. Then by startedAt descending
    const statusPriority = sql<number>`CASE ${playbookExecutions.status}
      WHEN 'running' THEN 1
      WHEN 'pending' THEN 2
      ELSE 3
    END`;

    const data = await this.db
      .select()
      .from(playbookExecutions)
      .where(eq(playbookExecutions.playbookId, "discovery"))
      .orderBy(statusPriority, desc(playbookExecutions.startedAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  async updateStatus(
    id: string,
    status: PlaybookExecutionRow["status"],
    updates?: Partial<Pick<PlaybookExecutionRow, "currentStep" | "error" | "output" | "completedAt">>
  ): Promise<void> {
    await this.db
      .update(playbookExecutions)
      .set({ status, ...updates })
      .where(eq(playbookExecutions.id, id));
  }

  async appendLog(
    id: string,
    level: "info" | "warn" | "error",
    message: string,
    stepIndex?: number
  ): Promise<void> {
    const execution = await this.findById(id);
    if (!execution) return;

    const logs = [...(execution.logs || []), {
      timestamp: new Date().toISOString(),
      level,
      message,
      stepIndex,
    }];

    await this.db
      .update(playbookExecutions)
      .set({ logs })
      .where(eq(playbookExecutions.id, id));
  }

  async incrementStep(id: string): Promise<void> {
    const execution = await this.findById(id);
    if (!execution) return;

    await this.db
      .update(playbookExecutions)
      .set({ currentStep: execution.currentStep + 1 })
      .where(eq(playbookExecutions.id, id));
  }
}

export class PlaybookStepExecutionRepository extends BaseRepository<
  typeof playbookStepExecutions,
  PlaybookStepExecutionRow,
  NewPlaybookStepExecutionRow
> {
  constructor(db: Database) {
    super(db, playbookStepExecutions, "id");
  }

  async findByExecution(executionId: string): Promise<PlaybookStepExecutionRow[]> {
    return this.db
      .select()
      .from(playbookStepExecutions)
      .where(eq(playbookStepExecutions.executionId, executionId))
      .orderBy(playbookStepExecutions.stepIndex);
  }

  async updateStatus(
    id: string,
    status: PlaybookStepExecutionRow["status"],
    updates?: Partial<Pick<PlaybookStepExecutionRow, "output" | "error" | "completedAt" | "durationMs" | "conditionResult" | "skipReason">>
  ): Promise<void> {
    await this.db
      .update(playbookStepExecutions)
      .set({ status, ...updates })
      .where(eq(playbookStepExecutions.id, id));
  }

  async markStarted(id: string): Promise<void> {
    await this.db
      .update(playbookStepExecutions)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(playbookStepExecutions.id, id));
  }

  async markCompleted(id: string, output: Record<string, unknown>): Promise<void> {
    const step = await this.findById(id);
    if (!step || !step.startedAt) return;

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - new Date(step.startedAt).getTime();

    await this.db
      .update(playbookStepExecutions)
      .set({ status: "completed", completedAt, durationMs, output })
      .where(eq(playbookStepExecutions.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    const step = await this.findById(id);
    if (!step) return;

    const completedAt = new Date();
    const durationMs = step.startedAt
      ? completedAt.getTime() - new Date(step.startedAt).getTime()
      : 0;

    await this.db
      .update(playbookStepExecutions)
      .set({ status: "failed", completedAt, durationMs, error })
      .where(eq(playbookStepExecutions.id, id));
  }

  async markSkipped(id: string, reason: string): Promise<void> {
    await this.db
      .update(playbookStepExecutions)
      .set({ status: "skipped", skipReason: reason })
      .where(eq(playbookStepExecutions.id, id));
  }
}
