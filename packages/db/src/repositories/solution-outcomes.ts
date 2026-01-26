import { eq, desc, and, gte, lte, type SQL, sql } from "drizzle-orm";
import {
  solutionOutcomes,
  solutionEffectiveness,
  type SolutionOutcomeRow,
  type NewSolutionOutcomeRow,
  type SolutionEffectivenessRow,
  type NewSolutionEffectivenessRow,
} from "../schema/solution-outcomes.js";
import { solutions } from "../schema/solutions.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface OutcomeFilters {
  solutionId?: string;
  outcomeType?: string;
  outcomeSource?: string;
  fromDate?: Date;
  toDate?: Date;
  metricName?: string;
}

export interface MetricHistoryPoint {
  timestamp: Date;
  value: number;
  baselineValue?: number;
  targetValue?: number;
}

export class SolutionOutcomeRepository extends BaseRepository<
  typeof solutionOutcomes,
  SolutionOutcomeRow,
  NewSolutionOutcomeRow
> {
  constructor(db: Database) {
    super(db, solutionOutcomes, "id");
  }

  async findBySolution(
    solutionId: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SolutionOutcomeRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(solutionOutcomes)
      .where(eq(solutionOutcomes.solutionId, solutionId))
      .orderBy(desc(solutionOutcomes.recordedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(solutionOutcomes)
      .where(eq(solutionOutcomes.solutionId, solutionId));

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async findByFilters(
    filters: OutcomeFilters,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SolutionOutcomeRow>> {
    const { limit = 50, offset = 0 } = options;
    const conditions: SQL[] = [];

    if (filters.solutionId) {
      conditions.push(eq(solutionOutcomes.solutionId, filters.solutionId));
    }

    if (filters.outcomeType) {
      conditions.push(
        eq(solutionOutcomes.outcomeType, filters.outcomeType as typeof solutionOutcomes.outcomeType.enumValues[number])
      );
    }

    if (filters.outcomeSource) {
      conditions.push(
        eq(solutionOutcomes.outcomeSource, filters.outcomeSource as typeof solutionOutcomes.outcomeSource.enumValues[number])
      );
    }

    if (filters.fromDate) {
      conditions.push(gte(solutionOutcomes.recordedAt, filters.fromDate));
    }

    if (filters.toDate) {
      conditions.push(lte(solutionOutcomes.recordedAt, filters.toDate));
    }

    if (filters.metricName) {
      conditions.push(eq(solutionOutcomes.metricName, filters.metricName));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(solutionOutcomes)
      .where(whereClause)
      .orderBy(desc(solutionOutcomes.recordedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(solutionOutcomes)
      .where(whereClause);

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async getMetricHistory(
    solutionId: string,
    metricName: string
  ): Promise<MetricHistoryPoint[]> {
    const results = await this.db
      .select({
        recordedAt: solutionOutcomes.recordedAt,
        metricValue: solutionOutcomes.metricValue,
        baselineValue: solutionOutcomes.baselineValue,
        targetValue: solutionOutcomes.targetValue,
      })
      .from(solutionOutcomes)
      .where(
        and(
          eq(solutionOutcomes.solutionId, solutionId),
          eq(solutionOutcomes.metricName, metricName),
          eq(solutionOutcomes.outcomeType, "metric_measurement")
        )
      )
      .orderBy(solutionOutcomes.recordedAt);

    return results
      .filter((r) => r.metricValue !== null)
      .map((r) => ({
        timestamp: r.recordedAt,
        value: r.metricValue!,
        baselineValue: r.baselineValue ?? undefined,
        targetValue: r.targetValue ?? undefined,
      }));
  }

  async getDistinctMetricNames(solutionId: string): Promise<string[]> {
    const results = await this.db
      .selectDistinct({ metricName: solutionOutcomes.metricName })
      .from(solutionOutcomes)
      .where(
        and(
          eq(solutionOutcomes.solutionId, solutionId),
          eq(solutionOutcomes.outcomeType, "metric_measurement")
        )
      );

    return results
      .map((r) => r.metricName)
      .filter((name): name is string => name !== null);
  }
}

export class SolutionEffectivenessRepository extends BaseRepository<
  typeof solutionEffectiveness,
  SolutionEffectivenessRow,
  NewSolutionEffectivenessRow
> {
  constructor(db: Database) {
    super(db, solutionEffectiveness, "id");
  }

  async findBySolution(solutionId: string): Promise<SolutionEffectivenessRow | null> {
    const results = await this.db
      .select()
      .from(solutionEffectiveness)
      .where(eq(solutionEffectiveness.solutionId, solutionId))
      .limit(1);

    return results[0] ?? null;
  }

  async upsert(data: NewSolutionEffectivenessRow): Promise<SolutionEffectivenessRow> {
    const existing = await this.findBySolution(data.solutionId);

    if (existing) {
      const results = await this.db
        .update(solutionEffectiveness)
        .set({
          ...data,
          lastCalculatedAt: new Date(),
        })
        .where(eq(solutionEffectiveness.id, existing.id))
        .returning();
      return results[0];
    }

    return this.create(data);
  }

  async recalculateEffectiveness(solutionId: string): Promise<SolutionEffectivenessRow | null> {
    // Get all outcomes for this solution
    const outcomeRepo = new SolutionOutcomeRepository(this.db);
    const outcomes = await outcomeRepo.findBySolution(solutionId, { limit: 1000 });

    if (outcomes.total === 0) {
      return null;
    }

    // Get solution for estimated impact
    const solutionResults = await this.db
      .select()
      .from(solutions)
      .where(eq(solutions.id, solutionId))
      .limit(1);

    const solution = solutionResults[0];
    if (!solution) {
      return null;
    }

    // Calculate metrics achievement
    let metricsAchieved = 0;
    let metricsMissed = 0;
    let metricsPartial = 0;

    // Group metric measurements by name and check latest values
    const metricsByName = new Map<string, SolutionOutcomeRow[]>();
    for (const outcome of outcomes.data) {
      if (outcome.outcomeType === "metric_measurement" && outcome.metricName) {
        const existing = metricsByName.get(outcome.metricName) || [];
        existing.push(outcome);
        metricsByName.set(outcome.metricName, existing);
      }
    }

    for (const [, measurements] of metricsByName) {
      // Get latest measurement
      const latest = measurements[0]; // Already sorted by desc recordedAt
      if (latest.metricValue !== null && latest.targetValue !== null) {
        const progress = latest.metricValue / latest.targetValue;
        if (progress >= 1) {
          metricsAchieved++;
        } else if (progress >= 0.5) {
          metricsPartial++;
        } else {
          metricsMissed++;
        }
      }
    }

    // Calculate feedback sentiment average
    const feedbackOutcomes = outcomes.data.filter(
      (o) => o.outcomeType === "feedback" && o.feedbackSentiment !== null
    );
    const avgFeedbackSentiment =
      feedbackOutcomes.length > 0
        ? feedbackOutcomes.reduce((sum, o) => sum + o.feedbackSentiment!, 0) /
          feedbackOutcomes.length
        : null;

    // Count issues resolved
    const statusChangeOutcomes = outcomes.data.filter(
      (o) => o.outcomeType === "status_change" && o.newStatus === "resolved"
    );
    const issuesResolved = statusChangeOutcomes.length;

    // Calculate overall effectiveness score
    const totalMetrics = metricsAchieved + metricsMissed + metricsPartial;
    let metricsScore = 0;
    if (totalMetrics > 0) {
      metricsScore = (metricsAchieved + metricsPartial * 0.5) / totalMetrics;
    }

    // Blend feedback and metrics for overall score
    let overallEffectivenessScore: number | null = null;
    if (totalMetrics > 0 || feedbackOutcomes.length > 0) {
      const scores: number[] = [];
      if (totalMetrics > 0) {
        scores.push(metricsScore);
      }
      if (avgFeedbackSentiment !== null) {
        // Convert -1 to 1 scale to 0 to 1
        scores.push((avgFeedbackSentiment + 1) / 2);
      }
      overallEffectivenessScore =
        scores.reduce((sum, s) => sum + s, 0) / scores.length;
    }

    // Calculate confidence based on number of outcomes
    const confidenceInScore = Math.min(1, outcomes.total / 10);

    // Get estimated impact from solution
    const estimatedImpactScore = solution.impactScore ?? null;
    const actualImpactScore = overallEffectivenessScore;
    const impactVariance =
      actualImpactScore !== null && estimatedImpactScore !== null
        ? actualImpactScore - estimatedImpactScore
        : null;

    // Build metrics trend
    const metricsTrend: { metricName: string; dataPoints: { timestamp: string; value: number }[] }[] = [];
    for (const [metricName, measurements] of metricsByName) {
      const dataPoints = measurements
        .filter((m) => m.metricValue !== null)
        .map((m) => ({
          timestamp: m.recordedAt.toISOString(),
          value: m.metricValue!,
        }))
        .reverse(); // Chronological order
      metricsTrend.push({ metricName, dataPoints });
    }

    // Find first and last outcome dates
    const sortedOutcomes = [...outcomes.data].sort(
      (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime()
    );
    const firstOutcomeAt = sortedOutcomes[0]?.recordedAt ?? null;
    const lastOutcomeAt = sortedOutcomes[sortedOutcomes.length - 1]?.recordedAt ?? null;

    // Upsert the effectiveness record
    const effectivenessId = `eff_${solutionId}`;
    return this.upsert({
      id: effectivenessId,
      solutionId,
      overallEffectivenessScore,
      confidenceInScore,
      estimatedImpactScore,
      actualImpactScore,
      impactVariance,
      metricsAchieved,
      metricsMissed,
      metricsPartial,
      issuesResolved,
      avgTimeToResolution: null, // TODO: calculate from status change timestamps
      avgFeedbackSentiment,
      feedbackCount: feedbackOutcomes.length,
      metricsTrend,
      firstOutcomeAt,
      lastOutcomeAt,
      lastCalculatedAt: new Date(),
      createdAt: new Date(),
    });
  }

  async getAggregateStats(): Promise<{
    totalSolutions: number;
    avgEffectivenessScore: number | null;
    solutionsExceedingEstimate: number;
    solutionsBelowEstimate: number;
    avgImpactVariance: number | null;
  }> {
    const results = await this.db
      .select({
        count: sql<number>`count(*)`,
        avgScore: sql<number>`avg(overall_effectiveness_score)`,
        exceedingCount: sql<number>`count(*) filter (where impact_variance > 0)`,
        belowCount: sql<number>`count(*) filter (where impact_variance < 0)`,
        avgVariance: sql<number>`avg(impact_variance)`,
      })
      .from(solutionEffectiveness);

    const row = results[0];
    return {
      totalSolutions: Number(row?.count ?? 0),
      avgEffectivenessScore: row?.avgScore ?? null,
      solutionsExceedingEstimate: Number(row?.exceedingCount ?? 0),
      solutionsBelowEstimate: Number(row?.belowCount ?? 0),
      avgImpactVariance: row?.avgVariance ?? null,
    };
  }
}
