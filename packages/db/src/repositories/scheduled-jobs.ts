import { eq, desc, and, lte, isNull, or, type SQL } from "drizzle-orm";
import {
  scheduledJobs,
  jobRuns,
  type ScheduledJobRow,
  type NewScheduledJobRow,
  type JobRunRow,
  type NewJobRunRow
} from "../schema/scheduled-jobs.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export class ScheduledJobRepository extends BaseRepository<typeof scheduledJobs, ScheduledJobRow, NewScheduledJobRow> {
  constructor(db: Database) {
    super(db, scheduledJobs, "id");
  }

  async findEnabled(): Promise<ScheduledJobRow[]> {
    return this.db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.enabled, true));
  }

  async findDue(): Promise<ScheduledJobRow[]> {
    const now = new Date();
    return this.db
      .select()
      .from(scheduledJobs)
      .where(
        and(
          eq(scheduledJobs.enabled, true),
          or(
            isNull(scheduledJobs.nextRunAt),
            lte(scheduledJobs.nextRunAt, now)
          )
        )
      );
  }

  async updateNextRun(id: string, nextRunAt: Date): Promise<void> {
    await this.db
      .update(scheduledJobs)
      .set({ nextRunAt, updatedAt: new Date() })
      .where(eq(scheduledJobs.id, id));
  }

  async updateLastRun(id: string, lastRunAt: Date): Promise<void> {
    await this.db
      .update(scheduledJobs)
      .set({ lastRunAt, updatedAt: new Date() })
      .where(eq(scheduledJobs.id, id));
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.db
      .update(scheduledJobs)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(scheduledJobs.id, id));
  }
}

export class JobRunRepository extends BaseRepository<typeof jobRuns, JobRunRow, NewJobRunRow> {
  constructor(db: Database) {
    super(db, jobRuns, "id");
  }

  async findByJob(jobId: string, options: ListOptions = {}): Promise<PaginatedResult<JobRunRow>> {
    const { limit = 20, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: jobRuns.id })
      .from(jobRuns)
      .where(eq(jobRuns.jobId, jobId));

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findRecent(limit = 20): Promise<JobRunRow[]> {
    return this.db
      .select()
      .from(jobRuns)
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit);
  }

  async markCompleted(id: string, output: string, stats: JobRunRow["stats"]): Promise<void> {
    const run = await this.findById(id);
    if (!run) return;

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - new Date(run.startedAt).getTime();

    await this.db
      .update(jobRuns)
      .set({
        status: "completed",
        completedAt,
        durationMs,
        output,
        stats,
      })
      .where(eq(jobRuns.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    const run = await this.findById(id);
    if (!run) return;

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - new Date(run.startedAt).getTime();

    await this.db
      .update(jobRuns)
      .set({
        status: "failed",
        completedAt,
        durationMs,
        error,
      })
      .where(eq(jobRuns.id, id));
  }
}
