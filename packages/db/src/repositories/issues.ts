import { eq, ilike, desc, and, gte, lte, type SQL, sql } from "drizzle-orm";
import { issues, type IssueRow, type NewIssueRow } from "../schema/issues.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface IssueFilters {
  issueStatus?: string;
  domain?: string;
  timeHorizon?: string;
  minCompositeScore?: number;
  maxCompositeScore?: number;
  search?: string;
}

export interface IssueSortOptions extends ListOptions {
  sortBy?: "compositeScore" | "createdAt" | "urgency" | "impact";
}

export class IssueRepository extends BaseRepository<typeof issues, IssueRow, NewIssueRow> {
  constructor(db: Database) {
    super(db, issues, "id");
  }

  async findByFilters(
    filters: IssueFilters,
    options: IssueSortOptions = {}
  ): Promise<PaginatedResult<IssueRow>> {
    const { limit = 20, offset = 0, sortBy = "compositeScore", order = "desc" } = options;
    const conditions: SQL[] = [];

    if (filters.issueStatus) {
      conditions.push(eq(issues.issueStatus, filters.issueStatus as typeof issues.issueStatus.enumValues[number]));
    }

    if (filters.timeHorizon) {
      conditions.push(eq(issues.timeHorizon, filters.timeHorizon as typeof issues.timeHorizon.enumValues[number]));
    }

    if (filters.minCompositeScore !== undefined) {
      conditions.push(gte(issues.compositeScore, filters.minCompositeScore));
    }

    if (filters.maxCompositeScore !== undefined) {
      conditions.push(lte(issues.compositeScore, filters.maxCompositeScore));
    }

    if (filters.search) {
      conditions.push(ilike(issues.title, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort column
    const sortColumn = {
      compositeScore: issues.compositeScore,
      createdAt: issues.createdAt,
      urgency: issues.scoreUrgency,
      impact: issues.scoreImpact,
    }[sortBy];

    const orderFn = order === "asc" ? sql`${sortColumn} ASC` : sql`${sortColumn} DESC`;

    const data = await this.db
      .select()
      .from(issues)
      .where(whereClause)
      .orderBy(orderFn)
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: issues.id })
      .from(issues)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findRelated(issueId: string): Promise<{
    upstream: IssueRow[];
    downstream: IssueRow[];
    related: IssueRow[];
  }> {
    const issue = await this.findById(issueId);
    if (!issue) {
      return { upstream: [], downstream: [], related: [] };
    }

    const [upstream, downstream, related] = await Promise.all([
      issue.upstreamIssues.length > 0
        ? this.db.select().from(issues).where(sql`${issues.id} = ANY(${issue.upstreamIssues})`)
        : Promise.resolve([]),
      issue.downstreamIssues.length > 0
        ? this.db.select().from(issues).where(sql`${issues.id} = ANY(${issue.downstreamIssues})`)
        : Promise.resolve([]),
      issue.relatedIssues.length > 0
        ? this.db.select().from(issues).where(sql`${issues.id} = ANY(${issue.relatedIssues})`)
        : Promise.resolve([]),
    ]);

    return { upstream, downstream, related };
  }
}
