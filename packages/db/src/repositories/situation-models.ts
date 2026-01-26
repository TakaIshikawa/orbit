import { eq, desc, and, type SQL } from "drizzle-orm";
import { situationModels, type SituationModelRow, type NewSituationModelRow } from "../schema/situation-models.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface SituationModelFilters {
  problemBriefId?: string;
  status?: string;
}

export class SituationModelRepository extends BaseRepository<typeof situationModels, SituationModelRow, NewSituationModelRow> {
  constructor(db: Database) {
    super(db, situationModels, "id");
  }

  async findByFilters(
    filters: SituationModelFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SituationModelRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.problemBriefId) {
      conditions.push(eq(situationModels.problemBriefId, filters.problemBriefId));
    }

    if (filters.status) {
      conditions.push(eq(situationModels.status, filters.status as typeof situationModels.status.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(situationModels)
      .where(whereClause)
      .orderBy(desc(situationModels.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: situationModels.id })
      .from(situationModels)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findByProblemBriefId(problemBriefId: string): Promise<SituationModelRow | null> {
    const results = await this.db
      .select()
      .from(situationModels)
      .where(eq(situationModels.problemBriefId, problemBriefId))
      .orderBy(desc(situationModels.version))
      .limit(1);
    return results[0] ?? null;
  }
}
