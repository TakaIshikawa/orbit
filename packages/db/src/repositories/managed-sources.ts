import { eq, desc, and, sql, inArray, or, ilike } from "drizzle-orm";
import {
  managedSources,
  sourceAssessmentHistory,
  calculateDebiasedScore,
  calculateOverallCredibility,
  type ManagedSourceRow,
  type NewManagedSourceRow,
  type SourceAssessmentHistoryRow,
  type NewSourceAssessmentHistoryRow,
  type SourceAssessmentInput,
} from "../schema/managed-sources.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface ManagedSourceFilters {
  status?: "active" | "paused" | "removed";
  sourceType?: string;
  incentiveType?: string;
  minCredibility?: number;
  minDebiasedScore?: number;
  domain?: string; // Subject domain filter (e.g., "economics", "health")
  tags?: string[];
  search?: string;
}

export interface CreateManagedSourceInput {
  domain: string;
  name: string;
  url: string;
  description?: string;
  sourceType?: "research" | "news" | "government" | "ngo" | "think_tank" | "industry" | "aggregator" | "preprint" | "other";
  incentiveType?: "academic" | "nonprofit" | "commercial" | "government" | "advocacy" | "wire_service" | "aggregator" | "platform" | "independent";
  domains?: string[];
  tags?: string[];
  notes?: string;
  // Initial assessment (optional)
  assessment?: SourceAssessmentInput;
  assessedBy?: string;
}

export class ManagedSourceRepository extends BaseRepository<
  typeof managedSources,
  ManagedSourceRow,
  NewManagedSourceRow
> {
  constructor(db: Database) {
    super(db, managedSources, "id");
  }

  async findByDomain(domain: string): Promise<ManagedSourceRow | null> {
    const results = await this.db
      .select()
      .from(managedSources)
      .where(eq(managedSources.domain, domain))
      .limit(1);

    return results[0] ?? null;
  }

  async findByFilters(
    filters: ManagedSourceFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<ManagedSourceRow>> {
    const { limit = 50, offset = 0 } = options;
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(managedSources.status, filters.status));
    }

    if (filters.sourceType) {
      conditions.push(eq(managedSources.sourceType, filters.sourceType as "research" | "news" | "government" | "ngo" | "think_tank" | "industry" | "aggregator" | "preprint" | "other"));
    }

    if (filters.incentiveType) {
      conditions.push(eq(managedSources.incentiveType, filters.incentiveType as "academic" | "nonprofit" | "commercial" | "government" | "advocacy" | "wire_service" | "aggregator" | "platform" | "independent"));
    }

    if (filters.minCredibility !== undefined) {
      conditions.push(sql`${managedSources.overallCredibility} >= ${filters.minCredibility}`);
    }

    if (filters.minDebiasedScore !== undefined) {
      conditions.push(sql`${managedSources.debiasedScore} >= ${filters.minDebiasedScore}`);
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(managedSources.name, `%${filters.search}%`),
          ilike(managedSources.domain, `%${filters.search}%`),
          ilike(managedSources.description ?? "", `%${filters.search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(managedSources)
      .where(whereClause)
      .orderBy(desc(managedSources.debiasedScore), desc(managedSources.overallCredibility))
      .limit(limit)
      .offset(offset);

    // Apply domain filter in JS (JSONB array containment)
    let filteredData = data;
    if (filters.domain) {
      filteredData = data.filter(s => s.domains?.includes(filters.domain!));
    }
    if (filters.tags && filters.tags.length > 0) {
      filteredData = filteredData.filter(s =>
        filters.tags!.some(tag => s.tags?.includes(tag))
      );
    }

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(managedSources)
      .where(whereClause);

    return {
      data: filteredData,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async findActive(options: ListOptions = {}): Promise<PaginatedResult<ManagedSourceRow>> {
    return this.findByFilters({ status: "active" }, options);
  }

  async findByDebiasedTier(
    minScore: number,
    maxScore?: number,
    options: ListOptions = {}
  ): Promise<PaginatedResult<ManagedSourceRow>> {
    const { limit = 50, offset = 0 } = options;
    const conditions: ReturnType<typeof eq>[] = [
      eq(managedSources.status, "active"),
      sql`${managedSources.debiasedScore} >= ${minScore}`,
    ];

    if (maxScore !== undefined) {
      conditions.push(sql`${managedSources.debiasedScore} < ${maxScore}`);
    }

    const data = await this.db
      .select()
      .from(managedSources)
      .where(and(...conditions))
      .orderBy(desc(managedSources.debiasedScore))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(managedSources)
      .where(and(...conditions));

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async createSource(input: CreateManagedSourceInput): Promise<ManagedSourceRow> {
    const id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Calculate scores if assessment provided
    let debiasedScore = 0.5;
    let overallCredibility = 0.5;

    const assessment = input.assessment ?? {};
    const assessmentValues = {
      factualAccuracy: assessment.factualAccuracy ?? 0.5,
      methodologicalRigor: assessment.methodologicalRigor ?? 0.5,
      transparencyScore: assessment.transparencyScore ?? 0.5,
      independenceScore: assessment.independenceScore ?? 0.5,
      ideologicalTransparency: assessment.ideologicalTransparency ?? 0.5,
      fundingTransparency: assessment.fundingTransparency ?? 0.5,
      conflictDisclosure: assessment.conflictDisclosure ?? 0.5,
      perspectiveDiversity: assessment.perspectiveDiversity ?? 0.5,
      geographicNeutrality: assessment.geographicNeutrality ?? 0.5,
      temporalNeutrality: assessment.temporalNeutrality ?? 0.5,
      selectionBiasResistance: assessment.selectionBiasResistance ?? 0.5,
      quantificationBias: assessment.quantificationBias ?? 0.5,
    };

    debiasedScore = calculateDebiasedScore(assessmentValues);
    overallCredibility = calculateOverallCredibility({
      ...assessmentValues,
      debiasedScore,
    });

    const now = new Date();

    return this.create({
      id,
      domain: input.domain,
      name: input.name,
      url: input.url,
      description: input.description ?? null,
      status: "active",
      sourceType: input.sourceType ?? "other",
      incentiveType: input.incentiveType ?? "independent",
      domains: input.domains ?? [],
      overallCredibility,
      ...assessmentValues,
      debiasedScore,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      customMetadata: null,
      createdAt: now,
      updatedAt: now,
      pausedAt: null,
      removedAt: null,
      lastAssessedAt: input.assessment ? now : null,
      assessedBy: input.assessedBy ?? null,
      assessmentVersion: 1,
      autoSyncHealth: true,
    });
  }

  async updateAssessment(
    id: string,
    assessment: SourceAssessmentInput,
    assessedBy?: string,
    changeReason?: string
  ): Promise<ManagedSourceRow | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // Build update object with changed fields
    const updates: Partial<NewManagedSourceRow> = {};
    const changedFields: string[] = [];

    const assessmentFields: (keyof SourceAssessmentInput)[] = [
      "factualAccuracy",
      "methodologicalRigor",
      "transparencyScore",
      "independenceScore",
      "ideologicalTransparency",
      "fundingTransparency",
      "conflictDisclosure",
      "perspectiveDiversity",
      "geographicNeutrality",
      "temporalNeutrality",
      "selectionBiasResistance",
      "quantificationBias",
    ];

    for (const field of assessmentFields) {
      if (assessment[field] !== undefined && assessment[field] !== existing[field]) {
        (updates as Record<string, number>)[field] = assessment[field]!;
        changedFields.push(field);
      }
    }

    if (changedFields.length === 0) {
      return existing; // No changes
    }

    // Recalculate scores with new values
    const mergedValues = {
      independenceScore: updates.independenceScore ?? existing.independenceScore,
      ideologicalTransparency: updates.ideologicalTransparency ?? existing.ideologicalTransparency,
      fundingTransparency: updates.fundingTransparency ?? existing.fundingTransparency,
      conflictDisclosure: updates.conflictDisclosure ?? existing.conflictDisclosure,
      perspectiveDiversity: updates.perspectiveDiversity ?? existing.perspectiveDiversity,
      geographicNeutrality: updates.geographicNeutrality ?? existing.geographicNeutrality,
      temporalNeutrality: updates.temporalNeutrality ?? existing.temporalNeutrality,
      selectionBiasResistance: updates.selectionBiasResistance ?? existing.selectionBiasResistance,
      quantificationBias: updates.quantificationBias ?? existing.quantificationBias,
      factualAccuracy: updates.factualAccuracy ?? existing.factualAccuracy,
      methodologicalRigor: updates.methodologicalRigor ?? existing.methodologicalRigor,
      transparencyScore: updates.transparencyScore ?? existing.transparencyScore,
    };

    const newDebiasedScore = calculateDebiasedScore(mergedValues);
    const newOverallCredibility = calculateOverallCredibility({
      ...mergedValues,
      debiasedScore: newDebiasedScore,
    });

    updates.debiasedScore = newDebiasedScore;
    updates.overallCredibility = newOverallCredibility;
    updates.updatedAt = new Date();
    updates.lastAssessedAt = new Date();
    updates.assessedBy = assessedBy ?? null;
    updates.assessmentVersion = existing.assessmentVersion + 1;

    // Record history
    const historyRepo = new SourceAssessmentHistoryRepository(this.db);
    await historyRepo.recordSnapshot(
      id,
      {
        overallCredibility: newOverallCredibility,
        factualAccuracy: mergedValues.factualAccuracy,
        methodologicalRigor: mergedValues.methodologicalRigor,
        transparencyScore: mergedValues.transparencyScore,
        independenceScore: mergedValues.independenceScore,
        ideologicalTransparency: mergedValues.ideologicalTransparency,
        fundingTransparency: mergedValues.fundingTransparency,
        conflictDisclosure: mergedValues.conflictDisclosure,
        perspectiveDiversity: mergedValues.perspectiveDiversity,
        geographicNeutrality: mergedValues.geographicNeutrality,
        temporalNeutrality: mergedValues.temporalNeutrality,
        selectionBiasResistance: mergedValues.selectionBiasResistance,
        quantificationBias: mergedValues.quantificationBias,
        debiasedScore: newDebiasedScore,
      },
      changedFields,
      assessedBy,
      changeReason
    );

    return this.update(id, updates);
  }

  async pauseSource(id: string): Promise<ManagedSourceRow | null> {
    return this.update(id, {
      status: "paused",
      pausedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async resumeSource(id: string): Promise<ManagedSourceRow | null> {
    return this.update(id, {
      status: "active",
      pausedAt: null,
      updatedAt: new Date(),
    });
  }

  async removeSource(id: string): Promise<ManagedSourceRow | null> {
    return this.update(id, {
      status: "removed",
      removedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async restoreSource(id: string): Promise<ManagedSourceRow | null> {
    return this.update(id, {
      status: "active",
      removedAt: null,
      updatedAt: new Date(),
    });
  }

  async getStatsByStatus(): Promise<{
    active: number;
    paused: number;
    removed: number;
  }> {
    const results = await this.db
      .select({
        status: managedSources.status,
        count: sql<number>`count(*)`,
      })
      .from(managedSources)
      .groupBy(managedSources.status);

    const stats = { active: 0, paused: 0, removed: 0 };
    for (const row of results) {
      stats[row.status] = Number(row.count);
    }
    return stats;
  }

  async getDebiasedTierStats(): Promise<{
    tier1: number; // 70%+
    tier2: number; // 60-70%
    tier3: number; // 50-60%
    below: number; // <50%
  }> {
    const results = await this.db
      .select({
        tier: sql<string>`
          CASE
            WHEN ${managedSources.debiasedScore} >= 0.70 THEN 'tier1'
            WHEN ${managedSources.debiasedScore} >= 0.60 THEN 'tier2'
            WHEN ${managedSources.debiasedScore} >= 0.50 THEN 'tier3'
            ELSE 'below'
          END
        `,
        count: sql<number>`count(*)`,
      })
      .from(managedSources)
      .where(eq(managedSources.status, "active"))
      .groupBy(sql`1`);

    const stats = { tier1: 0, tier2: 0, tier3: 0, below: 0 };
    for (const row of results) {
      stats[row.tier as keyof typeof stats] = Number(row.count);
    }
    return stats;
  }

  async bulkImportFromCredibility(
    sources: Array<{
      domain: string;
      name: string;
      url: string;
      sourceType: string;
      incentiveType: string;
      domains: string[];
      assessment: SourceAssessmentInput & { overallCredibility: number; debiasedScore: number };
    }>
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const source of sources) {
      const existing = await this.findByDomain(source.domain);
      if (existing) {
        skipped++;
        continue;
      }

      const id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date();

      await this.create({
        id,
        domain: source.domain,
        name: source.name,
        url: source.url,
        description: null,
        status: "active",
        sourceType: source.sourceType as NewManagedSourceRow["sourceType"],
        incentiveType: source.incentiveType as NewManagedSourceRow["incentiveType"],
        domains: source.domains,
        overallCredibility: source.assessment.overallCredibility,
        factualAccuracy: source.assessment.factualAccuracy ?? 0.5,
        methodologicalRigor: source.assessment.methodologicalRigor ?? 0.5,
        transparencyScore: source.assessment.transparencyScore ?? 0.5,
        independenceScore: source.assessment.independenceScore ?? 0.5,
        ideologicalTransparency: source.assessment.ideologicalTransparency ?? 0.5,
        fundingTransparency: source.assessment.fundingTransparency ?? 0.5,
        conflictDisclosure: source.assessment.conflictDisclosure ?? 0.5,
        perspectiveDiversity: source.assessment.perspectiveDiversity ?? 0.5,
        geographicNeutrality: source.assessment.geographicNeutrality ?? 0.5,
        temporalNeutrality: source.assessment.temporalNeutrality ?? 0.5,
        selectionBiasResistance: source.assessment.selectionBiasResistance ?? 0.5,
        quantificationBias: source.assessment.quantificationBias ?? 0.5,
        debiasedScore: source.assessment.debiasedScore,
        notes: null,
        tags: [],
        customMetadata: null,
        createdAt: now,
        updatedAt: now,
        pausedAt: null,
        removedAt: null,
        lastAssessedAt: now,
        assessedBy: "system_import",
        assessmentVersion: 1,
        autoSyncHealth: true,
      });

      imported++;
    }

    return { imported, skipped };
  }
}

export class SourceAssessmentHistoryRepository extends BaseRepository<
  typeof sourceAssessmentHistory,
  SourceAssessmentHistoryRow,
  NewSourceAssessmentHistoryRow
> {
  constructor(db: Database) {
    super(db, sourceAssessmentHistory, "id");
  }

  async findBySourceId(
    sourceId: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SourceAssessmentHistoryRow>> {
    const { limit = 20, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(sourceAssessmentHistory)
      .where(eq(sourceAssessmentHistory.sourceId, sourceId))
      .orderBy(desc(sourceAssessmentHistory.recordedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(sourceAssessmentHistory)
      .where(eq(sourceAssessmentHistory.sourceId, sourceId));

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async recordSnapshot(
    sourceId: string,
    snapshot: SourceAssessmentHistoryRow["assessmentSnapshot"],
    changedFields: string[],
    assessedBy?: string,
    changeReason?: string
  ): Promise<SourceAssessmentHistoryRow> {
    const id = `hist_${sourceId}_${Date.now().toString(36)}`;

    return this.create({
      id,
      sourceId,
      assessmentSnapshot: snapshot,
      changedFields,
      changeReason: changeReason ?? null,
      assessedBy: assessedBy ?? null,
      recordedAt: new Date(),
    });
  }
}
