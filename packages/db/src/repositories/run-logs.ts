import { eq, desc, and, type SQL } from "drizzle-orm";
import { runLogs, type RunLogRow, type NewRunLogRow } from "../schema/run-logs.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface RunLogFilters {
  decisionId?: string;
  agentId?: string;
  runStatus?: string;
}

export class RunLogRepository extends BaseRepository<typeof runLogs, RunLogRow, NewRunLogRow> {
  constructor(db: Database) {
    super(db, runLogs, "id");
  }

  async findByFilters(
    filters: RunLogFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<RunLogRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.decisionId) {
      conditions.push(eq(runLogs.decisionId, filters.decisionId));
    }

    if (filters.agentId) {
      conditions.push(eq(runLogs.agentId, filters.agentId));
    }

    if (filters.runStatus) {
      conditions.push(eq(runLogs.runStatus, filters.runStatus as typeof runLogs.runStatus.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(runLogs)
      .where(whereClause)
      .orderBy(desc(runLogs.startedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: runLogs.id })
      .from(runLogs)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findByAgent(agentId: string): Promise<RunLogRow[]> {
    return this.db
      .select()
      .from(runLogs)
      .where(eq(runLogs.agentId, agentId))
      .orderBy(desc(runLogs.startedAt));
  }
}
