import { eq, ilike, desc, and, type SQL } from "drizzle-orm";
import { playbooks, type PlaybookRow, type NewPlaybookRow } from "../schema/playbooks.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface PlaybookFilters {
  playbookStatus?: string;
  search?: string;
  status?: string;
}

export class PlaybookRepository extends BaseRepository<typeof playbooks, PlaybookRow, NewPlaybookRow> {
  constructor(db: Database) {
    super(db, playbooks, "id");
  }

  async findByFilters(
    filters: PlaybookFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<PlaybookRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.playbookStatus) {
      conditions.push(eq(playbooks.playbookStatus, filters.playbookStatus as typeof playbooks.playbookStatus.enumValues[number]));
    }

    if (filters.status) {
      conditions.push(eq(playbooks.status, filters.status as typeof playbooks.status.enumValues[number]));
    }

    if (filters.search) {
      conditions.push(ilike(playbooks.name, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(playbooks)
      .where(whereClause)
      .orderBy(desc(playbooks.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: playbooks.id })
      .from(playbooks)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findByForkedFrom(playbookId: string): Promise<PlaybookRow[]> {
    return this.db
      .select()
      .from(playbooks)
      .where(eq(playbooks.forkedFrom, playbookId));
  }
}
