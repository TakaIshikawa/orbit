/**
 * Information Units Repository
 *
 * Persists decomposed information units and their comparisons.
 * Enables granularity-aware triangulation and cross-validation.
 */

import { eq, and, sql, desc } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  informationUnits,
  unitComparisons,
  claimConsistency,
  type InformationUnitRow,
  type NewInformationUnitRow,
  type UnitComparisonRow,
  type NewUnitComparisonRow,
  type ClaimConsistencyRow,
  type NewClaimConsistencyRow,
} from "../schema/information-units.js";
import { generateId } from "@orbit/core";
import crypto from "crypto";

export class InformationUnitRepository {
  constructor(private db: Database) {}

  // ============================================================================
  // Information Units CRUD
  // ============================================================================

  async create(data: Omit<NewInformationUnitRow, "id" | "statementHash">): Promise<InformationUnitRow> {
    const id = generateId("ifu");
    const statementHash = crypto
      .createHash("sha256")
      .update(data.statement.toLowerCase().trim())
      .digest("hex")
      .slice(0, 16);

    const [row] = await this.db
      .insert(informationUnits)
      .values({ ...data, id, statementHash })
      .returning();

    return row;
  }

  async createMany(units: Omit<NewInformationUnitRow, "id" | "statementHash">[]): Promise<InformationUnitRow[]> {
    if (units.length === 0) return [];

    const rows = units.map((data) => {
      const id = generateId("ifu");
      const statementHash = crypto
        .createHash("sha256")
        .update(data.statement.toLowerCase().trim())
        .digest("hex")
        .slice(0, 16);
      return { ...data, id, statementHash };
    });

    return this.db.insert(informationUnits).values(rows).returning();
  }

  async findById(id: string): Promise<InformationUnitRow | null> {
    const [row] = await this.db
      .select()
      .from(informationUnits)
      .where(eq(informationUnits.id, id))
      .limit(1);

    return row || null;
  }

  async findByIssue(issueId: string): Promise<InformationUnitRow[]> {
    return this.db
      .select()
      .from(informationUnits)
      .where(eq(informationUnits.issueId, issueId))
      .orderBy(informationUnits.granularityLevel, desc(informationUnits.falsifiabilityScore));
  }

  async findBySource(sourceId: string): Promise<InformationUnitRow[]> {
    return this.db
      .select()
      .from(informationUnits)
      .where(eq(informationUnits.sourceId, sourceId))
      .orderBy(informationUnits.granularityLevel);
  }

  async findByGranularityLevel(
    level: string,
    options?: { limit?: number; domains?: string[] }
  ): Promise<InformationUnitRow[]> {
    let query = this.db
      .select()
      .from(informationUnits)
      .where(eq(informationUnits.granularityLevel, level as InformationUnitRow["granularityLevel"]))
      .orderBy(desc(informationUnits.currentConfidence));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    const results = await query;

    // Filter by domains if specified (JSONB containment)
    if (options?.domains && options.domains.length > 0) {
      return results.filter((unit: InformationUnitRow) => {
        const unitDomains = (unit.domains as string[]) || [];
        return options.domains!.some((d: string) => unitDomains.includes(d));
      });
    }

    return results;
  }

  /**
   * Find comparable units at the same granularity level with overlapping scope
   */
  async findComparableUnits(
    unit: InformationUnitRow,
    options?: { limit?: number; minConceptOverlap?: number }
  ): Promise<InformationUnitRow[]> {
    const sameLevel = await this.db
      .select()
      .from(informationUnits)
      .where(
        and(
          eq(informationUnits.granularityLevel, unit.granularityLevel),
          sql`${informationUnits.id} != ${unit.id}`
        )
      )
      .limit(options?.limit || 50);

    // Score by comparability
    const unitConcepts = new Set([
      ...((unit.concepts as string[]) || []),
      ...((unit.domains as string[]) || []),
    ]);

    const scored = sameLevel.map((other: InformationUnitRow) => {
      const otherConcepts = new Set([
        ...((other.concepts as string[]) || []),
        ...((other.domains as string[]) || []),
      ]);

      // Concept overlap
      const intersection = [...unitConcepts].filter((c) => otherConcepts.has(c)).length;
      const union = new Set([...unitConcepts, ...otherConcepts]).size;
      const conceptOverlap = union > 0 ? intersection / union : 0;

      // Temporal overlap (same scope = 1, adjacent = 0.5, else 0)
      const temporalScopes = ["timeless", "era", "period", "recent", "current", "point"];
      const idxA = temporalScopes.indexOf(unit.temporalScope);
      const idxB = temporalScopes.indexOf(other.temporalScope);
      const temporalOverlap = idxA === idxB ? 1 : Math.abs(idxA - idxB) === 1 ? 0.5 : 0.2;

      // Spatial overlap
      const spatialScopes = ["universal", "global", "regional", "national", "local", "specific"];
      const sidxA = spatialScopes.indexOf(unit.spatialScope);
      const sidxB = spatialScopes.indexOf(other.spatialScope);
      const spatialOverlap = sidxA === sidxB ? 1 : Math.abs(sidxA - sidxB) === 1 ? 0.5 : 0.2;

      const comparability = (conceptOverlap * 0.5) + (temporalOverlap * 0.25) + (spatialOverlap * 0.25);

      return { unit: other, comparability, conceptOverlap };
    });

    // Filter and sort
    const minOverlap = options?.minConceptOverlap || 0.1;
    type ScoredUnit = { unit: InformationUnitRow; comparability: number; conceptOverlap: number };
    return scored
      .filter((s: ScoredUnit) => s.comparability >= 0.3 && s.conceptOverlap >= minOverlap)
      .sort((a: ScoredUnit, b: ScoredUnit) => b.comparability - a.comparability)
      .map((s: ScoredUnit) => s.unit);
  }

  /**
   * Check for existing unit with same statement hash (deduplication)
   */
  async findByStatementHash(hash: string): Promise<InformationUnitRow | null> {
    const [row] = await this.db
      .select()
      .from(informationUnits)
      .where(eq(informationUnits.statementHash, hash))
      .limit(1);

    return row || null;
  }

  /**
   * Update confidence after Bayesian update
   */
  async updateConfidence(
    id: string,
    newConfidence: number,
    incrementUpdate = true
  ): Promise<InformationUnitRow | null> {
    const [row] = await this.db
      .update(informationUnits)
      .set({
        currentConfidence: newConfidence,
        updateCount: incrementUpdate ? sql`${informationUnits.updateCount} + 1` : undefined,
        updatedAt: new Date(),
      })
      .where(eq(informationUnits.id, id))
      .returning();

    return row || null;
  }

  // ============================================================================
  // Unit Comparisons
  // ============================================================================

  async createComparison(data: Omit<NewUnitComparisonRow, "id">): Promise<UnitComparisonRow> {
    const id = generateId("ucmp");

    const [row] = await this.db
      .insert(unitComparisons)
      .values({ ...data, id })
      .returning();

    return row;
  }

  async findComparisonsByUnit(unitId: string): Promise<UnitComparisonRow[]> {
    return this.db
      .select()
      .from(unitComparisons)
      .where(
        sql`${unitComparisons.unitAId} = ${unitId} OR ${unitComparisons.unitBId} = ${unitId}`
      )
      .orderBy(desc(unitComparisons.createdAt));
  }

  async findContradictions(options?: { limit?: number }): Promise<UnitComparisonRow[]> {
    let query = this.db
      .select()
      .from(unitComparisons)
      .where(eq(unitComparisons.relationship, "contradicts"))
      .orderBy(desc(unitComparisons.createdAt));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    return query;
  }

  // ============================================================================
  // Claim Consistency
  // ============================================================================

  async upsertConsistency(
    entityType: string,
    entityId: string,
    data: Partial<Omit<NewClaimConsistencyRow, "id" | "entityType" | "entityId">>
  ): Promise<ClaimConsistencyRow> {
    const existing = await this.db
      .select()
      .from(claimConsistency)
      .where(
        and(
          eq(claimConsistency.entityType, entityType),
          eq(claimConsistency.entityId, entityId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const [row] = await this.db
        .update(claimConsistency)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(claimConsistency.id, existing[0].id))
        .returning();
      return row;
    }

    const id = generateId("ccon");
    const [row] = await this.db
      .insert(claimConsistency)
      .values({
        id,
        entityType,
        entityId,
        overallConsistency: data.overallConsistency ?? 0.5,
        weightedConsistency: data.weightedConsistency ?? 0.5,
        ...data,
      })
      .returning();

    return row;
  }

  async getConsistency(entityType: string, entityId: string): Promise<ClaimConsistencyRow | null> {
    const [row] = await this.db
      .select()
      .from(claimConsistency)
      .where(
        and(
          eq(claimConsistency.entityType, entityType),
          eq(claimConsistency.entityId, entityId)
        )
      )
      .limit(1);

    return row || null;
  }

  // ============================================================================
  // Aggregation Queries
  // ============================================================================

  /**
   * Get unit counts by granularity level for an issue
   */
  async getUnitCountsByLevel(issueId: string): Promise<Record<string, number>> {
    const results = await this.db
      .select({
        level: informationUnits.granularityLevel,
        count: sql<number>`count(*)::int`,
      })
      .from(informationUnits)
      .where(eq(informationUnits.issueId, issueId))
      .groupBy(informationUnits.granularityLevel);

    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.level] = r.count;
    }
    return counts;
  }

  /**
   * Get average confidence by granularity level
   */
  async getConfidenceByLevel(issueId: string): Promise<Record<string, number>> {
    const results = await this.db
      .select({
        level: informationUnits.granularityLevel,
        avgConfidence: sql<number>`avg(${informationUnits.currentConfidence})`,
      })
      .from(informationUnits)
      .where(eq(informationUnits.issueId, issueId))
      .groupBy(informationUnits.granularityLevel);

    const confidences: Record<string, number> = {};
    for (const r of results) {
      confidences[r.level] = r.avgConfidence;
    }
    return confidences;
  }

  /**
   * Get comparison statistics for an issue
   */
  async getComparisonStats(issueId: string): Promise<{
    totalComparisons: number;
    agreements: number;
    contradictions: number;
    avgAgreementScore: number;
  }> {
    // Get all units for this issue
    const units = await this.findByIssue(issueId);
    const unitIds = units.map((u) => u.id);

    if (unitIds.length === 0) {
      return { totalComparisons: 0, agreements: 0, contradictions: 0, avgAgreementScore: 0 };
    }

    const comparisons = await this.db
      .select()
      .from(unitComparisons)
      .where(
        sql`${unitComparisons.unitAId} = ANY(${unitIds}) OR ${unitComparisons.unitBId} = ANY(${unitIds})`
      );

    const agreements = comparisons.filter((c: UnitComparisonRow) => c.relationship === "agrees").length;
    const contradictions = comparisons.filter((c: UnitComparisonRow) => c.relationship === "contradicts").length;
    const avgAgreementScore =
      comparisons.length > 0
        ? comparisons.reduce((sum: number, c: UnitComparisonRow) => sum + c.agreementScore, 0) / comparisons.length
        : 0;

    return {
      totalComparisons: comparisons.length,
      agreements,
      contradictions,
      avgAgreementScore,
    };
  }
}

export type { InformationUnitRow, NewInformationUnitRow, UnitComparisonRow, ClaimConsistencyRow };
