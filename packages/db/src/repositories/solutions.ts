import { eq, desc, and, type SQL } from "drizzle-orm";
import { solutions, type SolutionRow, type NewSolutionRow } from "../schema/solutions.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface SolutionFilters {
  situationModelId?: string;
  issueId?: string;
  solutionType?: string;
  solutionStatus?: string;
  status?: string;
}

export class SolutionRepository extends BaseRepository<typeof solutions, SolutionRow, NewSolutionRow> {
  constructor(db: Database) {
    super(db, solutions, "id");
  }

  async findByFilters(
    filters: SolutionFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SolutionRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.situationModelId) {
      conditions.push(eq(solutions.situationModelId, filters.situationModelId));
    }

    if (filters.issueId) {
      conditions.push(eq(solutions.issueId, filters.issueId));
    }

    if (filters.solutionType) {
      conditions.push(eq(solutions.solutionType, filters.solutionType as typeof solutions.solutionType.enumValues[number]));
    }

    if (filters.solutionStatus) {
      conditions.push(eq(solutions.solutionStatus, filters.solutionStatus as typeof solutions.solutionStatus.enumValues[number]));
    }

    if (filters.status) {
      conditions.push(eq(solutions.status, filters.status as typeof solutions.status.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(solutions)
      .where(whereClause)
      .orderBy(desc(solutions.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: solutions.id })
      .from(solutions)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findBySituationModel(situationModelId: string): Promise<SolutionRow[]> {
    return this.db
      .select()
      .from(solutions)
      .where(eq(solutions.situationModelId, situationModelId))
      .orderBy(desc(solutions.createdAt));
  }

  async updateSolutionStatus(
    id: string,
    newStatus: "proposed" | "approved" | "in_progress" | "completed" | "abandoned"
  ): Promise<SolutionRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const result = await this.db
      .update(solutions)
      .set({ solutionStatus: newStatus })
      .where(eq(solutions.id, id))
      .returning();

    return result[0] ?? null;
  }

  async findCompleted(options: ListOptions = {}): Promise<PaginatedResult<SolutionRow>> {
    const { limit = 20, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(solutions)
      .where(eq(solutions.solutionStatus, "completed"))
      .orderBy(desc(solutions.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: solutions.id })
      .from(solutions)
      .where(eq(solutions.solutionStatus, "completed"));

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }
}
