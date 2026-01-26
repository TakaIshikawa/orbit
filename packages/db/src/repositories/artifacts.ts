import { eq, desc, and, type SQL } from "drizzle-orm";
import { artifacts, type ArtifactRow, type NewArtifactRow } from "../schema/artifacts.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface ArtifactFilters {
  solutionId?: string;
  runId?: string;
  artifactType?: string;
  artifactStatus?: string;
  status?: string;
}

export class ArtifactRepository extends BaseRepository<typeof artifacts, ArtifactRow, NewArtifactRow> {
  constructor(db: Database) {
    super(db, artifacts, "id");
  }

  async findByFilters(
    filters: ArtifactFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<ArtifactRow>> {
    const { limit = 20, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.solutionId) {
      conditions.push(eq(artifacts.solutionId, filters.solutionId));
    }

    if (filters.runId) {
      conditions.push(eq(artifacts.runId, filters.runId));
    }

    if (filters.artifactType) {
      conditions.push(eq(artifacts.artifactType, filters.artifactType as typeof artifacts.artifactType.enumValues[number]));
    }

    if (filters.artifactStatus) {
      conditions.push(eq(artifacts.artifactStatus, filters.artifactStatus as typeof artifacts.artifactStatus.enumValues[number]));
    }

    if (filters.status) {
      conditions.push(eq(artifacts.status, filters.status as typeof artifacts.status.enumValues[number]));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(artifacts)
      .where(whereClause)
      .orderBy(desc(artifacts.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: artifacts.id })
      .from(artifacts)
      .where(whereClause);

    return {
      data,
      total: countResult.length,
      limit,
      offset,
    };
  }

  async findBySolutionId(solutionId: string): Promise<ArtifactRow[]> {
    return this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.solutionId, solutionId))
      .orderBy(desc(artifacts.createdAt));
  }

  async findByRunId(runId: string): Promise<ArtifactRow[]> {
    return this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.runId, runId))
      .orderBy(desc(artifacts.createdAt));
  }
}
