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
  includeArchived?: boolean; // Default false - excludes archived issues
}

export interface IssueSortOptions extends ListOptions {
  sortBy?: "compositeScore" | "createdAt" | "urgency" | "impact" | "expectedValue";
}

/**
 * Bayesian scores stored on issues
 */
export interface BayesianScores {
  pReal: { alpha: number; beta: number; mean: number };
  pSolvable: { alpha: number; beta: number; mean: number };
  impact: { estimate: number; confidence: number };
  reach: { estimate: number; confidence: number; unit?: string };
  cost: { estimate: number; confidence: number; unit?: string };
  lastUpdatedAt: string;
}

/**
 * Options for querying by expected value
 */
export interface ExpectedValueQueryOptions {
  minEV?: number;
  maxEV?: number;
  minConfidence?: number;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
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

    // Exclude archived issues by default
    if (!filters.includeArchived) {
      conditions.push(eq(issues.isArchived, false));
    }

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
      expectedValue: issues.expectedValue,
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

  async archive(id: string, reason?: string, archivedBy?: string): Promise<IssueRow | null> {
    const results = await this.db
      .update(issues)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: archivedBy,
        archiveReason: reason,
      })
      .where(eq(issues.id, id))
      .returning();
    return results[0] ?? null;
  }

  async unarchive(id: string): Promise<IssueRow | null> {
    const results = await this.db
      .update(issues)
      .set({
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      })
      .where(eq(issues.id, id))
      .returning();
    return results[0] ?? null;
  }

  // ============================================================================
  // Bayesian Scoring Methods
  // ============================================================================

  /**
   * Initialize Bayesian scores for an issue from a reference class
   */
  async initializeBayesianScores(
    issueId: string,
    referenceClassId: string,
    priorPReal: { alpha: number; beta: number },
    priorPSolvable: { alpha: number; beta: number },
    impact: { estimate: number; confidence: number },
    reach: { estimate: number; confidence: number; unit?: string },
    cost: { estimate: number; confidence: number; unit?: string }
  ): Promise<IssueRow | null> {
    const bayesianScores: BayesianScores = {
      pReal: {
        alpha: priorPReal.alpha,
        beta: priorPReal.beta,
        mean: priorPReal.alpha / (priorPReal.alpha + priorPReal.beta),
      },
      pSolvable: {
        alpha: priorPSolvable.alpha,
        beta: priorPSolvable.beta,
        mean: priorPSolvable.alpha / (priorPSolvable.alpha + priorPSolvable.beta),
      },
      impact,
      reach,
      cost,
      lastUpdatedAt: new Date().toISOString(),
    };

    const expectedValue = this.computeExpectedValue(bayesianScores);
    const evConfidence = this.computeEVConfidence(bayesianScores);

    return this.update(issueId, {
      referenceClassId,
      bayesianScores,
      expectedValue,
      evConfidence,
    });
  }

  /**
   * Update a probability (pReal or pSolvable) based on evidence
   */
  async updateProbability(
    issueId: string,
    field: "pReal" | "pSolvable",
    success: boolean
  ): Promise<IssueRow | null> {
    const issue = await this.findById(issueId);
    if (!issue || !issue.bayesianScores) {
      return null;
    }

    const scores = issue.bayesianScores as BayesianScores;
    const current = scores[field];

    // Bayesian update: success adds to alpha, failure adds to beta
    const newAlpha = success ? current.alpha + 1 : current.alpha;
    const newBeta = success ? current.beta : current.beta + 1;
    const newMean = newAlpha / (newAlpha + newBeta);

    const updatedScores: BayesianScores = {
      ...scores,
      [field]: { alpha: newAlpha, beta: newBeta, mean: newMean },
      lastUpdatedAt: new Date().toISOString(),
    };

    const expectedValue = this.computeExpectedValue(updatedScores);
    const evConfidence = this.computeEVConfidence(updatedScores);

    return this.update(issueId, {
      bayesianScores: updatedScores,
      expectedValue,
      evConfidence,
    });
  }

  /**
   * Recalculate expected value for an issue (e.g., after impact/reach/cost update)
   */
  async recalculateExpectedValue(issueId: string): Promise<IssueRow | null> {
    const issue = await this.findById(issueId);
    if (!issue || !issue.bayesianScores) {
      return null;
    }

    const scores = issue.bayesianScores as BayesianScores;
    const expectedValue = this.computeExpectedValue(scores);
    const evConfidence = this.computeEVConfidence(scores);

    return this.update(issueId, {
      bayesianScores: {
        ...scores,
        lastUpdatedAt: new Date().toISOString(),
      },
      expectedValue,
      evConfidence,
    });
  }

  /**
   * Find issues by expected value with optional filters
   */
  async findByExpectedValue(
    options: ExpectedValueQueryOptions = {}
  ): Promise<PaginatedResult<IssueRow>> {
    const {
      minEV,
      maxEV,
      minConfidence,
      limit = 20,
      offset = 0,
      includeArchived = false,
    } = options;

    const conditions: SQL[] = [];

    // Only include issues with expected value calculated
    conditions.push(sql`${issues.expectedValue} IS NOT NULL`);

    if (!includeArchived) {
      conditions.push(eq(issues.isArchived, false));
    }

    if (minEV !== undefined) {
      conditions.push(gte(issues.expectedValue, minEV));
    }

    if (maxEV !== undefined) {
      conditions.push(lte(issues.expectedValue, maxEV));
    }

    if (minConfidence !== undefined) {
      conditions.push(gte(issues.evConfidence, minConfidence));
    }

    const whereClause = and(...conditions);

    const data = await this.db
      .select()
      .from(issues)
      .where(whereClause)
      .orderBy(sql`${issues.expectedValue} DESC NULLS LAST`)
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(whereClause);

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Get prior probabilities for a new issue (returns current Bayesian state)
   */
  getPriorProbabilities(issue: IssueRow): {
    pReal: { alpha: number; beta: number; mean: number } | null;
    pSolvable: { alpha: number; beta: number; mean: number } | null;
  } {
    if (!issue.bayesianScores) {
      return { pReal: null, pSolvable: null };
    }
    const scores = issue.bayesianScores as BayesianScores;
    return {
      pReal: scores.pReal,
      pSolvable: scores.pSolvable,
    };
  }

  // ============================================================================
  // Expected Value Computation Helpers
  // ============================================================================

  /**
   * Compute expected value from Bayesian scores
   * EV = P(real) × P(solvable) × Impact × Reach - Cost
   *
   * All values are normalized to [0, 1] scale, so EV range is [-1, 1]
   */
  private computeExpectedValue(scores: BayesianScores): number {
    const pReal = scores.pReal.mean;
    const pSolvable = scores.pSolvable.mean;
    const impact = scores.impact.estimate;
    const reach = scores.reach.estimate;
    const cost = scores.cost.estimate;

    // EV formula: probability of success × value - cost
    const value = pReal * pSolvable * impact * reach;
    const ev = value - cost;

    // Clamp to [-1, 1] range
    return Math.max(-1, Math.min(1, ev));
  }

  /**
   * Compute confidence in the EV estimate
   * Higher when all components have high confidence
   */
  private computeEVConfidence(scores: BayesianScores): number {
    // Confidence for Beta distributions increases with observations
    // Confidence = 1 - 1/(alpha + beta - 1) for alpha, beta > 1
    const pRealConf = 1 - 1 / Math.max(1, scores.pReal.alpha + scores.pReal.beta - 1);
    const pSolvableConf = 1 - 1 / Math.max(1, scores.pSolvable.alpha + scores.pSolvable.beta - 1);

    // Impact, reach, cost confidences are direct
    const impactConf = scores.impact.confidence;
    const reachConf = scores.reach.confidence;
    const costConf = scores.cost.confidence;

    // Overall confidence is the geometric mean of all components
    // This ensures low confidence in any component pulls down overall confidence
    const components = [pRealConf, pSolvableConf, impactConf, reachConf, costConf];
    const product = components.reduce((acc, c) => acc * c, 1);
    const geometricMean = Math.pow(product, 1 / components.length);

    return geometricMean;
  }
}
