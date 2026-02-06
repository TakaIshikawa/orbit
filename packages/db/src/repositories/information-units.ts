/**
 * Information Units Repository
 *
 * Persists decomposed information units and their comparisons.
 * Enables granularity-aware triangulation and cross-validation.
 */

import { eq, and, sql, desc, inArray, or } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  informationUnits,
  unitComparisons,
  claimConsistency,
  crossIssueComparisons,
  type InformationUnitRow,
  type NewInformationUnitRow,
  type UnitComparisonRow,
  type NewUnitComparisonRow,
  type ClaimConsistencyRow,
  type NewClaimConsistencyRow,
  type CrossIssueComparisonRow,
  type NewCrossIssueComparisonRow,
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

  async update(
    id: string,
    data: Partial<Omit<NewInformationUnitRow, "id" | "statementHash" | "createdAt">>
  ): Promise<InformationUnitRow | null> {
    const [row] = await this.db
      .update(informationUnits)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(informationUnits.id, id))
      .returning();

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
        or(
          inArray(unitComparisons.unitAId, unitIds),
          inArray(unitComparisons.unitBId, unitIds)
        )
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

  // ============================================================================
  // Knowledge Base Methods (Cross-Issue Queries)
  // ============================================================================

  /**
   * Find high-falsifiability units that can serve as evidence
   * These are the most reusable units (data_point, observation, statistical)
   */
  async findHighFalsifiabilityUnits(options: {
    minFalsifiability?: number;
    domains?: string[];
    excludeIssueId?: string;
    limit?: number;
  } = {}): Promise<InformationUnitRow[]> {
    const { minFalsifiability = 0.7, domains, excludeIssueId, limit = 100 } = options;

    let query = this.db
      .select()
      .from(informationUnits)
      .where(sql`${informationUnits.falsifiabilityScore} >= ${minFalsifiability}`)
      .orderBy(desc(informationUnits.falsifiabilityScore), desc(informationUnits.currentConfidence))
      .limit(limit);

    const results = await query;

    // Filter by domains and exclude issue in JS (JSONB array overlap is complex in Drizzle)
    return results.filter((unit: InformationUnitRow) => {
      if (excludeIssueId && unit.issueId === excludeIssueId) return false;
      if (domains && domains.length > 0) {
        const unitDomains = unit.domains as string[];
        const hasOverlap = domains.some((d) => unitDomains.includes(d));
        if (!hasOverlap) return false;
      }
      return true;
    });
  }

  /**
   * Find units with overlapping domains and concepts
   * Used to find relevant historical units for comparison
   */
  async findByDomainsAndConcepts(options: {
    domains: string[];
    concepts?: string[];
    minFalsifiability?: number;
    excludeIssueId?: string;
    excludeUnitIds?: string[];
    limit?: number;
  }): Promise<InformationUnitRow[]> {
    const { domains, concepts = [], minFalsifiability = 0.5, excludeIssueId, excludeUnitIds = [], limit = 50 } = options;

    // Get all high-falsifiability units first
    const allUnits = await this.db
      .select()
      .from(informationUnits)
      .where(sql`${informationUnits.falsifiabilityScore} >= ${minFalsifiability}`)
      .orderBy(desc(informationUnits.falsifiabilityScore), desc(informationUnits.createdAt))
      .limit(500); // Get more than needed, then filter

    // Score and filter by domain/concept overlap
    const scored = allUnits
      .filter((unit: InformationUnitRow) => {
        if (excludeIssueId && unit.issueId === excludeIssueId) return false;
        if (excludeUnitIds.includes(unit.id)) return false;
        return true;
      })
      .map((unit: InformationUnitRow) => {
        const unitDomains = unit.domains as string[];
        const unitConcepts = unit.concepts as string[];

        // Calculate overlap scores
        const domainOverlap = domains.filter((d) => unitDomains.includes(d));
        const conceptOverlap = concepts.filter((c) => unitConcepts.includes(c));

        const domainScore = domainOverlap.length / Math.max(domains.length, 1);
        const conceptScore = concepts.length > 0 ? conceptOverlap.length / concepts.length : 0;

        // Combined relevance score (domains matter more than concepts)
        const relevanceScore = domainScore * 0.6 + conceptScore * 0.4;

        return { unit, relevanceScore, domainOverlap, conceptOverlap };
      })
      .filter(({ relevanceScore }) => relevanceScore > 0.1) // Must have some overlap
      .sort((a, b) => {
        // Sort by: falsifiability * relevance (high falsifiability + high relevance = best)
        const scoreA = a.unit.falsifiabilityScore * (0.5 + a.relevanceScore * 0.5);
        const scoreB = b.unit.falsifiabilityScore * (0.5 + b.relevanceScore * 0.5);
        return scoreB - scoreA;
      })
      .slice(0, limit);

    return scored.map(({ unit }) => unit);
  }

  /**
   * Find relevant historical units for validating a new unit
   * Prioritizes high-falsifiability units with domain overlap
   */
  async findRelevantHistoricalUnits(
    newUnit: InformationUnitRow,
    options: { limit?: number; minFalsifiability?: number } = {}
  ): Promise<Array<{ unit: InformationUnitRow; relevanceScore: number; domainOverlap: string[]; conceptOverlap: string[] }>> {
    const { limit = 20, minFalsifiability = 0.6 } = options;
    const domains = newUnit.domains as string[];
    const concepts = newUnit.concepts as string[];

    // Get candidate units
    const candidates = await this.db
      .select()
      .from(informationUnits)
      .where(sql`${informationUnits.falsifiabilityScore} >= ${minFalsifiability}`)
      .orderBy(desc(informationUnits.falsifiabilityScore), desc(informationUnits.currentConfidence))
      .limit(500);

    // Score each candidate
    const scored = candidates
      .filter((unit: InformationUnitRow) => {
        // Exclude same unit and same issue
        if (unit.id === newUnit.id) return false;
        if (unit.issueId === newUnit.issueId) return false;
        return true;
      })
      .map((unit: InformationUnitRow) => {
        const unitDomains = unit.domains as string[];
        const unitConcepts = unit.concepts as string[];

        const domainOverlap = domains.filter((d) => unitDomains.includes(d));
        const conceptOverlap = concepts.filter((c) => unitConcepts.includes(c));

        // Relevance based on overlap
        const domainScore = domainOverlap.length / Math.max(domains.length, unitDomains.length, 1);
        const conceptScore = concepts.length > 0 && unitConcepts.length > 0
          ? conceptOverlap.length / Math.max(concepts.length, unitConcepts.length)
          : 0;

        // Temporal relevance (recent units more relevant)
        const ageInDays = (Date.now() - new Date(unit.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, 1 - ageInDays / 365); // Decay over a year

        // Granularity match bonus (same level or adjacent)
        const levelOrder = ["paradigm", "theory", "mechanism", "causal_claim", "statistical", "observation", "data_point"];
        const newLevel = levelOrder.indexOf(newUnit.granularityLevel);
        const unitLevel = levelOrder.indexOf(unit.granularityLevel);
        const levelDiff = Math.abs(newLevel - unitLevel);
        const granularityScore = levelDiff <= 1 ? 1 : levelDiff <= 2 ? 0.7 : 0.4;

        // Combined relevance score
        const relevanceScore =
          domainScore * 0.35 +
          conceptScore * 0.25 +
          recencyScore * 0.15 +
          granularityScore * 0.15 +
          unit.falsifiabilityScore * 0.1;

        return { unit, relevanceScore, domainOverlap, conceptOverlap };
      })
      .filter(({ relevanceScore, domainOverlap }) => relevanceScore > 0.15 && domainOverlap.length > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    return scored;
  }

  // ============================================================================
  // Cross-Issue Comparisons
  // ============================================================================

  /**
   * Create a cross-issue comparison record
   */
  async createCrossIssueComparison(
    data: Omit<NewCrossIssueComparisonRow, "id">
  ): Promise<CrossIssueComparisonRow> {
    const id = generateId("xic");

    const [row] = await this.db
      .insert(crossIssueComparisons)
      .values({ ...data, id })
      .returning();

    return row;
  }

  /**
   * Get cross-issue comparisons for a unit
   */
  async findCrossIssueComparisons(unitId: string): Promise<CrossIssueComparisonRow[]> {
    return this.db
      .select()
      .from(crossIssueComparisons)
      .where(
        or(
          eq(crossIssueComparisons.newUnitId, unitId),
          eq(crossIssueComparisons.historicalUnitId, unitId)
        )
      )
      .orderBy(desc(crossIssueComparisons.createdAt));
  }

  /**
   * Get cross-issue comparison stats for an issue
   */
  async getCrossIssueComparisonStats(issueId: string): Promise<{
    totalComparisons: number;
    supportingCount: number;
    contradictingCount: number;
    avgConfidenceImpact: number;
  }> {
    const comparisons = await this.db
      .select()
      .from(crossIssueComparisons)
      .where(eq(crossIssueComparisons.newUnitIssueId, issueId));

    const supportingCount = comparisons.filter((c: CrossIssueComparisonRow) => c.relationship === "supports").length;
    const contradictingCount = comparisons.filter((c: CrossIssueComparisonRow) => c.relationship === "contradicts").length;
    const avgConfidenceImpact = comparisons.length > 0
      ? comparisons.reduce((sum: number, c: CrossIssueComparisonRow) => sum + c.confidenceImpact, 0) / comparisons.length
      : 0;

    return {
      totalComparisons: comparisons.length,
      supportingCount,
      contradictingCount,
      avgConfidenceImpact,
    };
  }

  /**
   * Update a unit's knowledge base validation stats
   */
  async updateKnowledgeBaseStats(
    unitId: string,
    updates: { incrementComparisonCount?: boolean; markValidated?: boolean }
  ): Promise<void> {
    const setClauses: Record<string, unknown> = {
      lastUsedForValidation: new Date(),
    };

    if (updates.markValidated) {
      setClauses.kbValidated = true;
    }

    await this.db
      .update(informationUnits)
      .set(setClauses)
      .where(eq(informationUnits.id, unitId));

    if (updates.incrementComparisonCount) {
      await this.db.execute(
        sql`UPDATE information_units SET cross_issue_comparison_count = cross_issue_comparison_count + 1 WHERE id = ${unitId}`
      );
    }
  }

  /**
   * Get knowledge base statistics
   */
  async getKnowledgeBaseStats(): Promise<{
    totalUnits: number;
    highFalsifiabilityUnits: number;
    validatedUnits: number;
    totalCrossIssueComparisons: number;
    unitsByGranularity: Record<string, number>;
  }> {
    const [totalResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(informationUnits);

    const [highFalsResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(informationUnits)
      .where(sql`${informationUnits.falsifiabilityScore} >= 0.7`);

    const [validatedResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(informationUnits)
      .where(eq(informationUnits.kbValidated, true));

    const [crossIssueResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(crossIssueComparisons);

    const granularityResults = await this.db
      .select({
        level: informationUnits.granularityLevel,
        count: sql<number>`count(*)::int`,
      })
      .from(informationUnits)
      .groupBy(informationUnits.granularityLevel);

    const unitsByGranularity: Record<string, number> = {};
    for (const r of granularityResults) {
      unitsByGranularity[r.level] = r.count;
    }

    return {
      totalUnits: totalResult.count,
      highFalsifiabilityUnits: highFalsResult.count,
      validatedUnits: validatedResult.count,
      totalCrossIssueComparisons: crossIssueResult.count,
      unitsByGranularity,
    };
  }
}

export type { InformationUnitRow, NewInformationUnitRow, UnitComparisonRow, ClaimConsistencyRow, CrossIssueComparisonRow };
