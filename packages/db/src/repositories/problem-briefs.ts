import { eq, desc, and, type SQL } from "drizzle-orm";
import { problemBriefs, type ProblemBriefRow, type NewProblemBriefRow } from "../schema/problem-briefs.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface ProblemBriefFilters {
  issueId?: string;
  status?: string;
}

export class ProblemBriefRepository extends BaseRepository<typeof problemBriefs, ProblemBriefRow, NewProblemBriefRow> {
  constructor(db: Database) {
    super(db, problemBriefs, "id");
  }

  async findByFilters(
    filters: ProblemBriefFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<ProblemBriefRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.issueId) {
      conditions.push(eq(problemBriefs.issueId, filters.issueId));
    }

    if (filters.status) {
      conditions.push(eq(problemBriefs.status, filters.status as typeof problemBriefs.status.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(problemBriefs)
      .where(whereClause)
      .orderBy(desc(problemBriefs.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: problemBriefs.id })
      .from(problemBriefs)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findByIssueId(issueId: string): Promise<ProblemBriefRow | null> {
    const results = await this.db
      .select()
      .from(problemBriefs)
      .where(eq(problemBriefs.issueId, issueId))
      .orderBy(desc(problemBriefs.version))
      .limit(1);
    return results[0] ?? null;
  }
}
