import { eq, desc, and, type SQL } from "drizzle-orm";
import { decisions, type DecisionRow, type NewDecisionRow } from "../schema/decisions.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface DecisionFilters {
  solutionId?: string;
  decision?: string;
  autonomyLevel?: string;
  status?: string;
}

export class DecisionRepository extends BaseRepository<typeof decisions, DecisionRow, NewDecisionRow> {
  constructor(db: Database) {
    super(db, decisions, "id");
  }

  async findByFilters(
    filters: DecisionFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<DecisionRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.solutionId) {
      conditions.push(eq(decisions.solutionId, filters.solutionId));
    }

    if (filters.decision) {
      conditions.push(eq(decisions.decision, filters.decision as typeof decisions.decision.enumValues[number]));
    }

    if (filters.autonomyLevel) {
      conditions.push(eq(decisions.autonomyLevel, filters.autonomyLevel as typeof decisions.autonomyLevel.enumValues[number]));
    }

    if (filters.status) {
      conditions.push(eq(decisions.status, filters.status as typeof decisions.status.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(decisions)
      .where(whereClause)
      .orderBy(desc(decisions.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: decisions.id })
      .from(decisions)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findBySolutionId(solutionId: string): Promise<DecisionRow[]> {
    return this.db
      .select()
      .from(decisions)
      .where(eq(decisions.solutionId, solutionId))
      .orderBy(desc(decisions.createdAt));
  }

  async findByRunId(runId: string): Promise<DecisionRow | null> {
    const results = await this.db
      .select()
      .from(decisions)
      .where(eq(decisions.runId, runId))
      .limit(1);
    return results[0] ?? null;
  }
}
