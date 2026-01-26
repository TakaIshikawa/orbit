import { eq, ilike, inArray, desc, and, type SQL } from "drizzle-orm";
import { patterns, type PatternRow, type NewPatternRow } from "../schema/patterns.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface PatternFilters {
  patternType?: string;
  domain?: string;
  status?: string;
  search?: string;
}

export class PatternRepository extends BaseRepository<typeof patterns, PatternRow, NewPatternRow> {
  constructor(db: Database) {
    super(db, patterns, "id");
  }

  async findByFilters(
    filters: PatternFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<PatternRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.patternType) {
      conditions.push(eq(patterns.patternType, filters.patternType as typeof patterns.patternType.enumValues[number]));
    }

    if (filters.status) {
      conditions.push(eq(patterns.status, filters.status as typeof patterns.status.enumValues[number]));
    }

    if (filters.search) {
      conditions.push(ilike(patterns.title, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(patterns)
      .where(whereClause)
      .orderBy(desc(patterns.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count with same filters
    const countResult = await this.db
      .select({ count: patterns.id })
      .from(patterns)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findByCluster(clusterId: string): Promise<PatternRow[]> {
    return this.db
      .select()
      .from(patterns)
      .where(eq(patterns.clusterId, clusterId));
  }
}
