/**
 * System Evaluation Job
 *
 * Periodic evaluation of overall system health:
 * - Pattern confidence distribution and trends
 * - Source reliability across domains
 * - Solution effectiveness metrics
 * - Feedback loop health metrics
 *
 * This runs periodically to create snapshots for trend analysis.
 */

import {
  EvaluationRunRepository,
  ConfidenceAdjustmentRepository,
  SystemLearningRepository,
  PatternRepository,
  SourceHealthRepository,
  SolutionEffectivenessRepository,
  FeedbackEventRepository,
  type Database,
} from "@orbit/db";

export interface EvaluationResult {
  evaluationId: string;
  timestamp: Date;
  metrics: {
    patterns: PatternMetrics;
    sources: SourceMetrics;
    solutions: SolutionMetrics;
    feedbackLoop: FeedbackLoopMetrics;
  };
  trends: TrendMetrics;
  alerts: EvaluationAlert[];
  recommendations: RecommendationItem[];
}

interface TrendMetrics {
  hasPreviousData: boolean;
  comparedTo?: string;
  patterns: {
    confidenceChange: number;
    highConfidenceChange: number;
    lowConfidenceChange: number;
    trend: "improving" | "stable" | "declining";
  };
  sources: {
    healthChange: number;
    reliabilityChange: number;
    trend: "improving" | "stable" | "declining";
  };
  solutions: {
    effectivenessChange: number;
    successRateChange: number;
    trend: "improving" | "stable" | "declining";
  };
  feedbackLoop: {
    pendingChange: number;
    throughputChange: number;
    trend: "improving" | "stable" | "declining";
  };
}

interface PatternMetrics {
  totalPatterns: number;
  avgConfidence: number;
  confidenceDistribution: {
    high: number;    // > 0.7
    medium: number;  // 0.4 - 0.7
    low: number;     // < 0.4
  };
  recentAdjustments: number;
  netConfidenceChange: number;
}

interface SourceMetrics {
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  unhealthySources: number;
  avgReliability: number;
  avgSuccessRate: number;
  sourcesWithAlerts: number;
}

interface SolutionMetrics {
  totalSolutions: number;
  avgEffectiveness: number;
  successRate: number;
  avgImpactVariance: number;
}

interface FeedbackLoopMetrics {
  pendingEvents: number;
  processedLast24h: number;
  adjustmentsMadeLast24h: number;
  learningsUpdatedLast24h: number;
  avgProcessingLag: number; // in hours
}

interface EvaluationAlert {
  type: "warning" | "critical";
  category: "patterns" | "sources" | "solutions" | "feedback";
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

interface RecommendationItem {
  area: string;
  recommendation: string;
  priority: "high" | "medium" | "low";
  expectedImpact: string;
}

export interface EvaluateSystemOptions {
  saveSnapshot?: boolean;
}

/**
 * Run system evaluation job
 */
export async function runSystemEvaluation(
  db: Database,
  options: EvaluateSystemOptions = {}
): Promise<EvaluationResult> {
  const { saveSnapshot = true } = options;

  console.log("[SystemEvaluation] Starting system health evaluation...");

  const evaluationId = `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date();
  const alerts: EvaluationAlert[] = [];
  const recommendations: RecommendationItem[] = [];

  // Collect metrics from each subsystem
  const patternMetrics = await evaluatePatterns(db, alerts, recommendations);
  const sourceMetrics = await evaluateSources(db, alerts, recommendations);
  const solutionMetrics = await evaluateSolutions(db, alerts, recommendations);
  const feedbackMetrics = await evaluateFeedbackLoop(db, alerts, recommendations);

  // Calculate trends based on previous evaluations
  const trends = await calculateTrends(db, patternMetrics, sourceMetrics, solutionMetrics, feedbackMetrics, alerts);

  const result: EvaluationResult = {
    evaluationId,
    timestamp,
    metrics: {
      patterns: patternMetrics,
      sources: sourceMetrics,
      solutions: solutionMetrics,
      feedbackLoop: feedbackMetrics,
    },
    trends,
    alerts,
    recommendations,
  };

  // Save evaluation snapshot
  if (saveSnapshot) {
    const evalRepo = new EvaluationRunRepository(db);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    await evalRepo.create({
      id: evaluationId,
      periodStart,
      periodEnd,
      completedAt: new Date(),
      metrics: {
        // Pattern metrics
        patternsCreated: 0, // Would need to track over period
        patternsVerified: patternMetrics.recentAdjustments,
        avgPatternConfidence: patternMetrics.avgConfidence,
        patternVerificationRate: patternMetrics.totalPatterns > 0
          ? patternMetrics.recentAdjustments / patternMetrics.totalPatterns
          : 0,

        // Issue metrics
        issuesCreated: 0,
        issuesResolved: 0,
        avgResolutionTime: 0,
        avgCompositeScore: 0,

        // Solution metrics
        solutionsProposed: solutionMetrics.totalSolutions,
        solutionsCompleted: Math.round(solutionMetrics.totalSolutions * solutionMetrics.successRate),
        avgEffectiveness: solutionMetrics.avgEffectiveness,
        solutionsExceedingEstimate: 0,

        // Source metrics
        sourcesMonitored: sourceMetrics.totalSources,
        avgSourceHealth: sourceMetrics.totalSources > 0
          ? sourceMetrics.healthySources / sourceMetrics.totalSources
          : 0,
        degradedSources: sourceMetrics.degradedSources,
        avgVerificationAccuracy: sourceMetrics.avgReliability,

        // Feedback metrics
        feedbackEventsProcessed: feedbackMetrics.processedLast24h,
        adjustmentsMade: feedbackMetrics.adjustmentsMadeLast24h,
        avgAdjustmentMagnitude: 0.05, // Default
      },
      recommendations: recommendations,
    });
  }

  // Log summary
  console.log(`[SystemEvaluation] Completed evaluation: ${evaluationId}`);
  console.log(`  Patterns: ${patternMetrics.totalPatterns} (avg confidence: ${(patternMetrics.avgConfidence * 100).toFixed(1)}%)`);
  console.log(`  Sources: ${sourceMetrics.healthySources}/${sourceMetrics.totalSources} healthy`);
  console.log(`  Solutions: ${solutionMetrics.totalSolutions} (avg effectiveness: ${(solutionMetrics.avgEffectiveness * 100).toFixed(1)}%)`);
  console.log(`  Feedback: ${feedbackMetrics.pendingEvents} pending, ${feedbackMetrics.processedLast24h} processed (24h)`);

  if (alerts.length > 0) {
    console.log(`  Alerts: ${alerts.filter(a => a.type === "critical").length} critical, ${alerts.filter(a => a.type === "warning").length} warnings`);
  }

  return result;
}

/**
 * Evaluate pattern health
 */
async function evaluatePatterns(
  db: Database,
  alerts: EvaluationAlert[],
  recommendations: RecommendationItem[]
): Promise<PatternMetrics> {
  const patternRepo = new PatternRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);

  // Get all active patterns
  const { data: patterns, total } = await patternRepo.findMany({ limit: 1000 });

  if (total === 0) {
    return {
      totalPatterns: 0,
      avgConfidence: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      recentAdjustments: 0,
      netConfidenceChange: 0,
    };
  }

  // Calculate confidence distribution
  const high = patterns.filter(p => p.confidence > 0.7).length;
  const medium = patterns.filter(p => p.confidence >= 0.4 && p.confidence <= 0.7).length;
  const low = patterns.filter(p => p.confidence < 0.4).length;
  const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;

  // Get recent adjustments
  const adjustmentStats = await adjustmentRepo.getAdjustmentStats("pattern", 1);
  const netChange = adjustmentStats.avgAdjustmentMagnitude *
    (adjustmentStats.positiveAdjustments - adjustmentStats.negativeAdjustments);

  // Generate alerts
  if (avgConfidence < 0.5) {
    alerts.push({
      type: "warning",
      category: "patterns",
      message: "Average pattern confidence is below 50%",
      metric: "avgConfidence",
      value: avgConfidence,
      threshold: 0.5,
    });
    recommendations.push({
      area: "patterns",
      recommendation: "Review patterns with low confidence for verification or removal",
      priority: "medium",
      expectedImpact: "Improved pattern quality and reliability",
    });
  }

  if (low > total * 0.3) {
    alerts.push({
      type: "warning",
      category: "patterns",
      message: `${((low / total) * 100).toFixed(0)}% of patterns have low confidence`,
      metric: "lowConfidenceRate",
      value: low / total,
      threshold: 0.3,
    });
  }

  return {
    totalPatterns: total,
    avgConfidence,
    confidenceDistribution: { high, medium, low },
    recentAdjustments: adjustmentStats.totalAdjustments,
    netConfidenceChange: netChange,
  };
}

/**
 * Evaluate source health
 */
async function evaluateSources(
  db: Database,
  alerts: EvaluationAlert[],
  recommendations: RecommendationItem[]
): Promise<SourceMetrics> {
  const healthRepo = new SourceHealthRepository(db);

  try {
    const summary = await healthRepo.getHealthSummary();

    // Calculate average reliability from healthy sources
    const { data: allSources } = await healthRepo.findMany({ limit: 500 });
    const avgReliability = allSources.length > 0
      ? allSources.reduce((sum, s) => sum + (s.dynamicReliability ?? s.baseReliability ?? 0.5), 0) / allSources.length
      : 0.5;
    const avgSuccessRate = allSources.length > 0
      ? allSources.reduce((sum, s) => sum + (s.successRate ?? 0), 0) / allSources.length
      : 0;

    // Generate alerts
    if (summary.unhealthy > 0) {
      alerts.push({
        type: "critical",
        category: "sources",
        message: `${summary.unhealthy} sources are unhealthy`,
        metric: "unhealthySources",
        value: summary.unhealthy,
        threshold: 0,
      });
      recommendations.push({
        area: "sources",
        recommendation: "Investigate unhealthy sources and consider temporarily disabling them",
        priority: "high",
        expectedImpact: "Prevent unreliable data from affecting analysis",
      });
    }

    if (summary.totalSources > 0 && summary.degraded > summary.totalSources * 0.2) {
      alerts.push({
        type: "warning",
        category: "sources",
        message: `${((summary.degraded / summary.totalSources) * 100).toFixed(0)}% of sources are degraded`,
        metric: "degradedRate",
        value: summary.degraded / summary.totalSources,
        threshold: 0.2,
      });
    }

    if (avgReliability < 0.6) {
      alerts.push({
        type: "warning",
        category: "sources",
        message: "Average source reliability is below 60%",
        metric: "avgReliability",
        value: avgReliability,
        threshold: 0.6,
      });
      recommendations.push({
        area: "sources",
        recommendation: "Consider adding more high-reliability sources or investigating reliability issues",
        priority: "medium",
        expectedImpact: "Higher quality data for pattern analysis",
      });
    }

    return {
      totalSources: summary.totalSources,
      healthySources: summary.healthy,
      degradedSources: summary.degraded,
      unhealthySources: summary.unhealthy,
      avgReliability,
      avgSuccessRate,
      sourcesWithAlerts: summary.activeAlerts,
    };
  } catch {
    // Table might not exist yet
    return {
      totalSources: 0,
      healthySources: 0,
      degradedSources: 0,
      unhealthySources: 0,
      avgReliability: 0,
      avgSuccessRate: 0,
      sourcesWithAlerts: 0,
    };
  }
}

/**
 * Evaluate solution effectiveness
 */
async function evaluateSolutions(
  db: Database,
  alerts: EvaluationAlert[],
  recommendations: RecommendationItem[]
): Promise<SolutionMetrics> {
  const effectivenessRepo = new SolutionEffectivenessRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  try {
    const stats = await effectivenessRepo.getAggregateStats();

    // Also check learnings for additional insights
    const learning = await learningRepo.findByKey("solution_effectiveness", "overall");
    const successRate = learning?.successRate ?? 0;

    const avgEffectiveness = stats.avgEffectivenessScore ?? 0;
    const avgImpactVariance = stats.avgImpactVariance ?? 0;

    // Generate alerts
    if (avgEffectiveness < 0.5 && stats.totalSolutions > 5) {
      alerts.push({
        type: "warning",
        category: "solutions",
        message: "Average solution effectiveness is below 50%",
        metric: "avgEffectiveness",
        value: avgEffectiveness,
        threshold: 0.5,
      });
      recommendations.push({
        area: "solutions",
        recommendation: "Analyze unsuccessful solutions to identify patterns and improve solution generation",
        priority: "medium",
        expectedImpact: "Better solution recommendations",
      });
    }

    if (avgImpactVariance < -0.2 && stats.totalSolutions > 5) {
      alerts.push({
        type: "warning",
        category: "solutions",
        message: "Solutions consistently underperform impact estimates",
        metric: "avgImpactVariance",
        value: avgImpactVariance,
        threshold: -0.2,
      });
      recommendations.push({
        area: "solutions",
        recommendation: "Calibrate impact estimation to be more conservative",
        priority: "low",
        expectedImpact: "More accurate impact predictions",
      });
    }

    return {
      totalSolutions: stats.totalSolutions,
      avgEffectiveness,
      successRate,
      avgImpactVariance,
    };
  } catch {
    return {
      totalSolutions: 0,
      avgEffectiveness: 0,
      successRate: 0,
      avgImpactVariance: 0,
    };
  }
}

/**
 * Evaluate feedback loop health
 */
async function evaluateFeedbackLoop(
  db: Database,
  alerts: EvaluationAlert[],
  recommendations: RecommendationItem[]
): Promise<FeedbackLoopMetrics> {
  const feedbackRepo = new FeedbackEventRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  try {
    // Get pending events
    const pending = await feedbackRepo.findPending(1000);
    const pendingCount = pending.length;

    // Get processing stats (last 24h)
    const adjustmentStats = await adjustmentRepo.getAdjustmentStats(undefined, 1);

    // Calculate average processing lag
    let avgLagHours = 0;
    if (pending.length > 0) {
      const now = Date.now();
      const totalLag = pending.reduce((sum, e) => sum + (now - e.createdAt.getTime()), 0);
      avgLagHours = (totalLag / pending.length) / (1000 * 60 * 60);
    }

    // Get learnings updated count (approximate from updated timestamps)
    const learnings = await learningRepo.findByCategory("pattern_verification", { limit: 100 });
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const learningsUpdated = learnings.data.filter(l => l.updatedAt > dayAgo).length;

    // Generate alerts
    if (pendingCount > 100) {
      alerts.push({
        type: "warning",
        category: "feedback",
        message: `${pendingCount} feedback events pending processing`,
        metric: "pendingEvents",
        value: pendingCount,
        threshold: 100,
      });
      recommendations.push({
        area: "feedback",
        recommendation: "Consider increasing feedback processor frequency or batch size",
        priority: "medium",
        expectedImpact: "Faster system adaptation to new information",
      });
    }

    if (avgLagHours > 24) {
      alerts.push({
        type: "critical",
        category: "feedback",
        message: `Average feedback processing lag is ${avgLagHours.toFixed(1)} hours`,
        metric: "avgProcessingLag",
        value: avgLagHours,
        threshold: 24,
      });
      recommendations.push({
        area: "feedback",
        recommendation: "Feedback loop is falling behind - check processor job health",
        priority: "high",
        expectedImpact: "Timely confidence adjustments",
      });
    }

    return {
      pendingEvents: pendingCount,
      processedLast24h: adjustmentStats.totalAdjustments, // approximation
      adjustmentsMadeLast24h: adjustmentStats.totalAdjustments,
      learningsUpdatedLast24h: learningsUpdated,
      avgProcessingLag: avgLagHours,
    };
  } catch {
    return {
      pendingEvents: 0,
      processedLast24h: 0,
      adjustmentsMadeLast24h: 0,
      learningsUpdatedLast24h: 0,
      avgProcessingLag: 0,
    };
  }
}

/**
 * Calculate trends by comparing current metrics to previous evaluations
 */
async function calculateTrends(
  db: Database,
  patterns: PatternMetrics,
  sources: SourceMetrics,
  solutions: SolutionMetrics,
  feedbackLoop: FeedbackLoopMetrics,
  alerts: EvaluationAlert[]
): Promise<TrendMetrics> {
  const evalRepo = new EvaluationRunRepository(db);

  // Get the most recent previous evaluation
  const previousEvals = await evalRepo.findMany({ limit: 2 });

  // Skip the current one (if we've already saved), take the last one
  const previousEval = previousEvals.data.length > 0 ? previousEvals.data[0] : null;

  if (!previousEval || !previousEval.metrics) {
    return createEmptyTrends();
  }

  const prevMetrics = previousEval.metrics;

  // Calculate changes
  const confidenceChange = patterns.avgConfidence - (prevMetrics.avgPatternConfidence ?? 0);
  const highConfidenceChange = patterns.confidenceDistribution.high -
    (calculateHighConfidenceFromRate(prevMetrics.patternVerificationRate ?? 0, patterns.totalPatterns));
  const lowConfidenceChange = patterns.confidenceDistribution.low -
    (calculateLowConfidenceFromRate(prevMetrics.patternVerificationRate ?? 0, patterns.totalPatterns));

  const healthChange = (sources.totalSources > 0 ? sources.healthySources / sources.totalSources : 0) -
    (prevMetrics.avgSourceHealth ?? 0);
  const reliabilityChange = sources.avgReliability - (prevMetrics.avgVerificationAccuracy ?? 0);

  const effectivenessChange = solutions.avgEffectiveness - (prevMetrics.avgEffectiveness ?? 0);
  const successRateChange = solutions.successRate -
    (prevMetrics.solutionsProposed > 0
      ? (prevMetrics.solutionsCompleted ?? 0) / prevMetrics.solutionsProposed
      : 0);

  const pendingChange = feedbackLoop.pendingEvents - 0; // We don't store previous pending
  const throughputChange = feedbackLoop.processedLast24h - (prevMetrics.feedbackEventsProcessed ?? 0);

  // Determine trends
  const patternTrend = determineTrend(confidenceChange, 0.02);
  const sourceTrend = determineTrend(healthChange, 0.05);
  const solutionTrend = determineTrend(effectivenessChange, 0.05);
  const feedbackTrend = throughputChange > 0 && pendingChange <= 0 ? "improving" :
    throughputChange < 0 && pendingChange > 0 ? "declining" : "stable";

  // Add trend-based alerts
  if (patternTrend === "declining" && confidenceChange < -0.1) {
    alerts.push({
      type: "warning",
      category: "patterns",
      message: `Pattern confidence declining (${(confidenceChange * 100).toFixed(1)}% since last evaluation)`,
      metric: "confidenceTrend",
      value: confidenceChange,
      threshold: -0.1,
    });
  }

  if (sourceTrend === "declining" && healthChange < -0.1) {
    alerts.push({
      type: "warning",
      category: "sources",
      message: `Source health declining (${(healthChange * 100).toFixed(1)}% since last evaluation)`,
      metric: "healthTrend",
      value: healthChange,
      threshold: -0.1,
    });
  }

  return {
    hasPreviousData: true,
    comparedTo: previousEval.id,
    patterns: {
      confidenceChange,
      highConfidenceChange,
      lowConfidenceChange,
      trend: patternTrend,
    },
    sources: {
      healthChange,
      reliabilityChange,
      trend: sourceTrend,
    },
    solutions: {
      effectivenessChange,
      successRateChange,
      trend: solutionTrend,
    },
    feedbackLoop: {
      pendingChange,
      throughputChange,
      trend: feedbackTrend,
    },
  };
}

function createEmptyTrends(): TrendMetrics {
  return {
    hasPreviousData: false,
    patterns: {
      confidenceChange: 0,
      highConfidenceChange: 0,
      lowConfidenceChange: 0,
      trend: "stable",
    },
    sources: {
      healthChange: 0,
      reliabilityChange: 0,
      trend: "stable",
    },
    solutions: {
      effectivenessChange: 0,
      successRateChange: 0,
      trend: "stable",
    },
    feedbackLoop: {
      pendingChange: 0,
      throughputChange: 0,
      trend: "stable",
    },
  };
}

function determineTrend(change: number, threshold: number): "improving" | "stable" | "declining" {
  if (change > threshold) return "improving";
  if (change < -threshold) return "declining";
  return "stable";
}

function calculateHighConfidenceFromRate(rate: number, total: number): number {
  // Rough approximation based on verification rate
  return Math.round(total * Math.max(0.3, rate * 0.8));
}

function calculateLowConfidenceFromRate(rate: number, total: number): number {
  // Rough approximation
  return Math.round(total * Math.max(0.1, (1 - rate) * 0.3));
}
