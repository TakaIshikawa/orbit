import { eq, desc, and, type SQL } from "drizzle-orm";
import { verifications, type VerificationRow, type NewVerificationRow } from "../schema/verifications.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface VerificationFilters {
  sourceType?: string;
  sourceId?: string;
  status?: string;
}

export class VerificationRepository extends BaseRepository<typeof verifications, VerificationRow, NewVerificationRow> {
  constructor(db: Database) {
    super(db, verifications, "id");
  }

  async findByFilters(
    filters: VerificationFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<VerificationRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.sourceType) {
      conditions.push(eq(verifications.sourceType, filters.sourceType));
    }

    if (filters.sourceId) {
      conditions.push(eq(verifications.sourceId, filters.sourceId));
    }

    if (filters.status) {
      conditions.push(eq(verifications.status, filters.status as typeof verifications.status.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(verifications)
      .where(whereClause)
      .orderBy(desc(verifications.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: verifications.id })
      .from(verifications)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findBySource(sourceType: string, sourceId: string): Promise<VerificationRow[]> {
    return this.db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.sourceType, sourceType),
          eq(verifications.sourceId, sourceId)
        )
      )
      .orderBy(desc(verifications.createdAt));
  }

  async findBySourceIds(
    sources: Array<{ sourceType: string; sourceId: string }>
  ): Promise<VerificationRow[]> {
    if (sources.length === 0) return [];

    // Build OR conditions for each source
    const results: VerificationRow[] = [];
    for (const source of sources) {
      const rows = await this.db
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.sourceType, source.sourceType),
            eq(verifications.sourceId, source.sourceId)
          )
        );
      results.push(...rows);
    }

    // Sort by createdAt descending
    return results.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getVerificationSummary(sourceType: string, sourceId: string): Promise<{
    totalClaims: number;
    corroborated: number;
    contested: number;
    partiallySupported: number;
    unverified: number;
    averageConfidence: number;
  }> {
    const results = await this.findBySource(sourceType, sourceId);

    if (results.length === 0) {
      return {
        totalClaims: 0,
        corroborated: 0,
        contested: 0,
        partiallySupported: 0,
        unverified: 0,
        averageConfidence: 0,
      };
    }

    return {
      totalClaims: results.length,
      corroborated: results.filter(r => r.status === "corroborated").length,
      contested: results.filter(r => r.status === "contested").length,
      partiallySupported: results.filter(r => r.status === "partially_supported").length,
      unverified: results.filter(r => r.status === "unverified").length,
      averageConfidence: results.reduce((sum, r) => sum + r.adjustedConfidence, 0) / results.length,
    };
  }
}
