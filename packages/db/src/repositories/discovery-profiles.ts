import { eq, desc, and, sql, ilike, or } from "drizzle-orm";
import {
  discoveryProfiles,
  type DiscoveryProfileRow,
  type NewDiscoveryProfileRow,
} from "../schema/discovery-profiles.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface DiscoveryProfileFilters {
  isScheduled?: boolean;
  isDefault?: boolean;
  search?: string;
}

export interface CreateDiscoveryProfileInput {
  name: string;
  description?: string;
  sourceIds?: string[];
  domains?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
  maxPatterns?: number;
  maxIssues?: number;
  minSourceCredibility?: number;
  isDefault?: boolean;
}

export interface UpdateDiscoveryProfileInput {
  name?: string;
  description?: string;
  sourceIds?: string[];
  domains?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
  maxPatterns?: number;
  maxIssues?: number;
  minSourceCredibility?: number;
  isDefault?: boolean;
  isScheduled?: boolean;
  cronExpression?: string;
  nextRunAt?: Date;
}

export class DiscoveryProfileRepository extends BaseRepository<
  typeof discoveryProfiles,
  DiscoveryProfileRow,
  NewDiscoveryProfileRow
> {
  constructor(db: Database) {
    super(db, discoveryProfiles, "id");
  }

  async findByFilters(
    filters: DiscoveryProfileFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<DiscoveryProfileRow>> {
    const { limit = 50, offset = 0 } = options;
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.isScheduled !== undefined) {
      conditions.push(eq(discoveryProfiles.isScheduled, filters.isScheduled));
    }

    if (filters.isDefault !== undefined) {
      conditions.push(eq(discoveryProfiles.isDefault, filters.isDefault));
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(discoveryProfiles.name, `%${filters.search}%`),
          ilike(discoveryProfiles.description ?? "", `%${filters.search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(discoveryProfiles)
      .where(whereClause)
      .orderBy(desc(discoveryProfiles.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(discoveryProfiles)
      .where(whereClause);

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async findDefault(): Promise<DiscoveryProfileRow | null> {
    const results = await this.db
      .select()
      .from(discoveryProfiles)
      .where(eq(discoveryProfiles.isDefault, true))
      .limit(1);

    return results[0] ?? null;
  }

  async setDefault(id: string): Promise<DiscoveryProfileRow | null> {
    // First, clear existing default
    await this.db
      .update(discoveryProfiles)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(discoveryProfiles.isDefault, true));

    // Then set new default
    const results = await this.db
      .update(discoveryProfiles)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(discoveryProfiles.id, id))
      .returning();

    return results[0] ?? null;
  }

  async findScheduled(options: ListOptions = {}): Promise<PaginatedResult<DiscoveryProfileRow>> {
    return this.findByFilters({ isScheduled: true }, options);
  }

  async createProfile(input: CreateDiscoveryProfileInput): Promise<DiscoveryProfileRow> {
    const id = `dprf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    // If this is being set as default, clear existing default first
    if (input.isDefault) {
      await this.db
        .update(discoveryProfiles)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(discoveryProfiles.isDefault, true));
    }

    return this.create({
      id,
      name: input.name,
      description: input.description ?? null,
      sourceIds: input.sourceIds ?? [],
      domains: input.domains ?? [],
      keywords: input.keywords ?? [],
      excludeKeywords: input.excludeKeywords ?? [],
      maxPatterns: input.maxPatterns ?? 20,
      maxIssues: input.maxIssues ?? 5,
      minSourceCredibility: input.minSourceCredibility ?? 0.5,
      isScheduled: false,
      cronExpression: null,
      lastRunAt: null,
      nextRunAt: null,
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateProfile(id: string, input: UpdateDiscoveryProfileInput): Promise<DiscoveryProfileRow | null> {
    const now = new Date();

    // If this is being set as default, clear existing default first
    if (input.isDefault) {
      await this.db
        .update(discoveryProfiles)
        .set({ isDefault: false, updatedAt: now })
        .where(and(
          eq(discoveryProfiles.isDefault, true),
          sql`${discoveryProfiles.id} != ${id}`
        ));
    }

    const updates: Partial<NewDiscoveryProfileRow> = {
      updatedAt: now,
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.sourceIds !== undefined) updates.sourceIds = input.sourceIds;
    if (input.domains !== undefined) updates.domains = input.domains;
    if (input.keywords !== undefined) updates.keywords = input.keywords;
    if (input.excludeKeywords !== undefined) updates.excludeKeywords = input.excludeKeywords;
    if (input.maxPatterns !== undefined) updates.maxPatterns = input.maxPatterns;
    if (input.maxIssues !== undefined) updates.maxIssues = input.maxIssues;
    if (input.minSourceCredibility !== undefined) updates.minSourceCredibility = input.minSourceCredibility;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.isScheduled !== undefined) updates.isScheduled = input.isScheduled;
    if (input.cronExpression !== undefined) updates.cronExpression = input.cronExpression;
    if (input.nextRunAt !== undefined) updates.nextRunAt = input.nextRunAt;

    return this.update(id, updates);
  }

  async enableSchedule(id: string, cronExpression: string, nextRunAt?: Date): Promise<DiscoveryProfileRow | null> {
    return this.update(id, {
      isScheduled: true,
      cronExpression,
      nextRunAt: nextRunAt ?? null,
      updatedAt: new Date(),
    });
  }

  async disableSchedule(id: string): Promise<DiscoveryProfileRow | null> {
    return this.update(id, {
      isScheduled: false,
      cronExpression: null,
      nextRunAt: null,
      updatedAt: new Date(),
    });
  }

  async recordRun(id: string, nextRunAt?: Date): Promise<DiscoveryProfileRow | null> {
    return this.update(id, {
      lastRunAt: new Date(),
      nextRunAt: nextRunAt ?? null,
      updatedAt: new Date(),
    });
  }
}
