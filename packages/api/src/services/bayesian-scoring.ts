/**
 * Bayesian Scoring Service
 *
 * Implements Bayesian Expected Value scoring for issues:
 * - Initializes scores from reference class priors
 * - Updates probabilities based on evidence (verifications, outcomes)
 * - Records all updates for auditability
 * - Propagates learning back to reference classes
 *
 * EV Formula: P(real) × P(solvable) × Impact × Reach - Cost
 */

import { generateId } from "@orbit/core";
import {
  getDatabase,
  IssueRepository,
  ReferenceClassRepository,
  BayesianUpdateRepository,
  VerificationRepository,
  SolutionOutcomeRepository,
  type IssueRow,
  type ReferenceClassRow,
  type BayesianScores,
} from "@orbit/db";

// ============================================================================
// Types
// ============================================================================

/**
 * Initial estimates from LLM (IUTLN scores mapped to Bayesian inputs)
 */
export interface InitialEstimates {
  // Map from IUTLN legitimacy to initial P(real) adjustment
  legitimacy: number; // 0-1
  // Map from IUTLN tractability to initial P(solvable) adjustment
  tractability: number; // 0-1
  // Map from IUTLN impact to impact estimate
  impact: number; // 0-1
  // Reach estimate (normalized 0-1)
  reach?: number;
  // Cost estimate (normalized 0-1)
  cost?: number;
}

/**
 * Explanation of why an issue has its current EV score
 */
export interface ScoreExplanation {
  issueId: string;
  expectedValue: number;
  evConfidence: number;

  // Component breakdown
  components: {
    pReal: {
      mean: number;
      alpha: number;
      beta: number;
      sampleSize: number;
      explanation: string;
    };
    pSolvable: {
      mean: number;
      alpha: number;
      beta: number;
      sampleSize: number;
      explanation: string;
    };
    impact: {
      estimate: number;
      confidence: number;
      explanation: string;
    };
    reach: {
      estimate: number;
      confidence: number;
      unit?: string;
      explanation: string;
    };
    cost: {
      estimate: number;
      confidence: number;
      unit?: string;
      explanation: string;
    };
  };

  // Reference class info
  referenceClass: {
    id: string;
    name: string;
    baseRatePReal: number;
    baseRatePSolvable: number;
  } | null;

  // Recent updates
  recentUpdates: Array<{
    timestamp: string;
    type: "p_real" | "p_solvable";
    direction: "positive" | "negative";
    reason: string;
    delta: number;
  }>;

  // Formula explanation
  formulaExplanation: string;
}

// ============================================================================
// Service
// ============================================================================

export class BayesianScoringService {
  private db = getDatabase();
  private issueRepo: IssueRepository;
  private refClassRepo: ReferenceClassRepository;
  private updateRepo: BayesianUpdateRepository;
  private verificationRepo: VerificationRepository;

  constructor() {
    this.issueRepo = new IssueRepository(this.db);
    this.refClassRepo = new ReferenceClassRepository(this.db);
    this.updateRepo = new BayesianUpdateRepository(this.db);
    this.verificationRepo = new VerificationRepository(this.db);
  }

  // ============================================================================
  // Initialize Scores for New Issue
  // ============================================================================

  /**
   * Initialize Bayesian scores for a new issue.
   *
   * 1. Find matching reference class based on domains/pattern types
   * 2. Copy priors from reference class
   * 3. Adjust based on LLM estimates (as weak evidence)
   * 4. Calculate initial EV
   */
  async initializeIssue(
    issueId: string,
    domains: string[],
    patternTypes: string[],
    estimates: InitialEstimates
  ): Promise<BayesianScores | null> {
    // Find matching reference class
    const refClass = await this.refClassRepo.findBestMatch(domains, patternTypes);

    // Start with default priors if no reference class found
    const priorPReal = refClass
      ? { alpha: refClass.pRealAlpha, beta: refClass.pRealBeta }
      : { alpha: 2, beta: 2 };

    const priorPSolvable = refClass
      ? { alpha: refClass.pSolvableAlpha, beta: refClass.pSolvableBeta }
      : { alpha: 2, beta: 2 };

    // Adjust priors based on LLM estimates (treat as weak evidence)
    // Legitimacy affects P(real), Tractability affects P(solvable)
    const adjustedPReal = this.adjustPriorWithEstimate(priorPReal, estimates.legitimacy);
    const adjustedPSolvable = this.adjustPriorWithEstimate(priorPSolvable, estimates.tractability);

    // Impact, reach, cost from estimates
    const impact = {
      estimate: estimates.impact,
      confidence: 0.5, // LLM estimates start with moderate confidence
    };

    const reach = {
      estimate: estimates.reach ?? 0.5, // Default to middle if not specified
      confidence: 0.3, // Lower confidence for reach
    };

    const cost = {
      estimate: estimates.cost ?? 0.3, // Default to moderate cost
      confidence: 0.4, // Moderate confidence for cost
    };

    // Initialize in database
    const updated = await this.issueRepo.initializeBayesianScores(
      issueId,
      refClass?.id ?? "refclass_default",
      adjustedPReal,
      adjustedPSolvable,
      impact,
      reach,
      cost
    );

    if (!updated) {
      return null;
    }

    // Record initial update in audit trail
    await this.updateRepo.recordUpdate({
      id: generateId("bup"),
      entityType: "issue",
      entityId: issueId,
      updateType: "p_real",
      priorAlpha: priorPReal.alpha,
      priorBeta: priorPReal.beta,
      posteriorAlpha: adjustedPReal.alpha,
      posteriorBeta: adjustedPReal.beta,
      evidenceType: "initial",
      evidenceDirection: estimates.legitimacy >= 0.5 ? "positive" : "negative",
      reason: `Initialized from reference class "${refClass?.name ?? "default"}" with legitimacy estimate ${(estimates.legitimacy * 100).toFixed(0)}%`,
    });

    await this.updateRepo.recordUpdate({
      id: generateId("bup"),
      entityType: "issue",
      entityId: issueId,
      updateType: "p_solvable",
      priorAlpha: priorPSolvable.alpha,
      priorBeta: priorPSolvable.beta,
      posteriorAlpha: adjustedPSolvable.alpha,
      posteriorBeta: adjustedPSolvable.beta,
      evidenceType: "initial",
      evidenceDirection: estimates.tractability >= 0.5 ? "positive" : "negative",
      reason: `Initialized from reference class "${refClass?.name ?? "default"}" with tractability estimate ${(estimates.tractability * 100).toFixed(0)}%`,
    });

    return updated.bayesianScores as BayesianScores;
  }

  /**
   * Adjust a prior based on an LLM estimate.
   * Treats the estimate as weak evidence (equivalent to ~1 observation).
   */
  private adjustPriorWithEstimate(
    prior: { alpha: number; beta: number },
    estimate: number
  ): { alpha: number; beta: number } {
    // Weight of the LLM estimate (equivalent to ~0.5 observations)
    const weight = 0.5;

    // Adjust alpha/beta based on estimate
    // High estimate (>0.5) increases alpha, low estimate increases beta
    const alphaDelta = weight * (estimate - 0.5) * 2; // Ranges from -0.5 to +0.5
    const betaDelta = weight * (0.5 - estimate) * 2;

    return {
      alpha: Math.max(1, prior.alpha + alphaDelta),
      beta: Math.max(1, prior.beta + betaDelta),
    };
  }

  // ============================================================================
  // Process Verification Feedback
  // ============================================================================

  /**
   * Process a verification result and update P(real) for the linked issue.
   *
   * Verification statuses map to evidence:
   * - corroborated → positive (alpha++)
   * - contested → negative (beta++)
   * - partially_supported → weak positive (alpha += 0.5)
   * - unverified → no update
   */
  async processVerification(verificationId: string): Promise<void> {
    const verification = await this.verificationRepo.findById(verificationId);
    if (!verification) {
      console.log(`[Bayesian] Verification ${verificationId} not found`);
      return;
    }

    // Verifications are linked to issues via sourceType="issue"
    if (verification.sourceType !== "issue") {
      console.log(`[Bayesian] Verification ${verificationId} not linked to an issue`);
      return;
    }

    const issueId = verification.sourceId;
    const issue = await this.issueRepo.findById(issueId);
    if (!issue || !issue.bayesianScores) {
      console.log(`[Bayesian] Issue ${issueId} not found or has no Bayesian scores`);
      return;
    }

    const scores = issue.bayesianScores as BayesianScores;
    const priorAlpha = scores.pReal.alpha;
    const priorBeta = scores.pReal.beta;

    // Map verification status to update
    let posteriorAlpha = priorAlpha;
    let posteriorBeta = priorBeta;
    let evidenceDirection: "positive" | "negative" = "positive";

    switch (verification.status) {
      case "corroborated":
        posteriorAlpha = priorAlpha + 1;
        evidenceDirection = "positive";
        break;
      case "contested":
        posteriorBeta = priorBeta + 1;
        evidenceDirection = "negative";
        break;
      case "partially_supported":
        posteriorAlpha = priorAlpha + 0.5;
        evidenceDirection = "positive";
        break;
      case "unverified":
      case "pending":
        // No update for unverified or pending
        return;
    }

    // Update issue
    const newMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
    const updatedScores: BayesianScores = {
      ...scores,
      pReal: { alpha: posteriorAlpha, beta: posteriorBeta, mean: newMean },
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.issueRepo.update(issueId, {
      bayesianScores: updatedScores,
      expectedValue: this.computeExpectedValue(updatedScores),
      evConfidence: this.computeEVConfidence(updatedScores),
    });

    // Record update
    await this.updateRepo.recordUpdate({
      id: generateId("bup"),
      entityType: "issue",
      entityId: issueId,
      updateType: "p_real",
      priorAlpha,
      priorBeta,
      posteriorAlpha,
      posteriorBeta,
      evidenceType: "verification",
      evidenceId: verificationId,
      evidenceDirection,
      reason: `Verification ${verification.status}: "${verification.claimStatement.slice(0, 100)}..."`,
    });

    // Update reference class base rates
    if (issue.referenceClassId) {
      await this.refClassRepo.updateBaseRates(
        issue.referenceClassId,
        "pReal",
        evidenceDirection === "positive"
      );

      // Record reference class update
      const refClass = await this.refClassRepo.findById(issue.referenceClassId);
      if (refClass) {
        await this.updateRepo.recordUpdate({
          id: generateId("bup"),
          entityType: "reference_class",
          entityId: issue.referenceClassId,
          updateType: "p_real",
          priorAlpha,
          priorBeta,
          posteriorAlpha: evidenceDirection === "positive" ? priorAlpha + 1 : priorAlpha,
          posteriorBeta: evidenceDirection === "negative" ? priorBeta + 1 : priorBeta,
          evidenceType: "verification",
          evidenceId: verificationId,
          evidenceDirection,
          reason: `Reference class "${refClass.name}" updated from verification`,
        });
      }
    }

    console.log(
      `[Bayesian] Updated issue ${issueId} P(real): ${(priorAlpha / (priorAlpha + priorBeta)).toFixed(3)} → ${newMean.toFixed(3)}`
    );
  }

  // ============================================================================
  // Process Solution Outcome
  // ============================================================================

  /**
   * Process a solution outcome and update P(solvable) for the linked issue.
   *
   * Outcome types map to evidence:
   * - Issue resolved → positive (alpha++)
   * - Metrics achieved → positive
   * - Metrics missed → negative (beta++)
   * - Positive feedback → weak positive
   * - Negative feedback → weak negative
   */
  async processSolutionOutcome(outcomeId: string): Promise<void> {
    const outcomeRepo = new SolutionOutcomeRepository(this.db);
    const outcome = await outcomeRepo.findById(outcomeId);
    if (!outcome) {
      console.log(`[Bayesian] Solution outcome ${outcomeId} not found`);
      return;
    }

    // Get the linked issue
    const issueId = outcome.linkedIssueId;
    if (!issueId) {
      console.log(`[Bayesian] Solution outcome ${outcomeId} has no linked issue`);
      return;
    }

    const issue = await this.issueRepo.findById(issueId);
    if (!issue || !issue.bayesianScores) {
      console.log(`[Bayesian] Issue ${issueId} not found or has no Bayesian scores`);
      return;
    }

    const scores = issue.bayesianScores as BayesianScores;
    const priorAlpha = scores.pSolvable.alpha;
    const priorBeta = scores.pSolvable.beta;

    // Determine outcome direction based on type
    let posteriorAlpha = priorAlpha;
    let posteriorBeta = priorBeta;
    let evidenceDirection: "positive" | "negative" = "positive";
    let reason = "";

    switch (outcome.outcomeType) {
      case "status_change":
        if (outcome.newStatus === "resolved") {
          posteriorAlpha = priorAlpha + 1;
          evidenceDirection = "positive";
          reason = `Issue status changed to resolved`;
        } else if (outcome.newStatus === "wont_fix") {
          posteriorBeta = priorBeta + 0.5;
          evidenceDirection = "negative";
          reason = `Issue marked as won't fix`;
        }
        break;

      case "metric_measurement":
        if (outcome.metricValue !== null && outcome.targetValue !== null) {
          const achieved = outcome.metricValue >= outcome.targetValue;
          if (achieved) {
            posteriorAlpha = priorAlpha + 1;
            evidenceDirection = "positive";
            reason = `Metric "${outcome.metricName}" achieved (${outcome.metricValue} >= ${outcome.targetValue})`;
          } else {
            posteriorBeta = priorBeta + 1;
            evidenceDirection = "negative";
            reason = `Metric "${outcome.metricName}" missed (${outcome.metricValue} < ${outcome.targetValue})`;
          }
        }
        break;

      case "feedback":
        if (outcome.feedbackSentiment !== null) {
          if (outcome.feedbackSentiment > 0.3) {
            posteriorAlpha = priorAlpha + 0.3;
            evidenceDirection = "positive";
            reason = `Positive feedback received (sentiment: ${outcome.feedbackSentiment.toFixed(2)})`;
          } else if (outcome.feedbackSentiment < -0.3) {
            posteriorBeta = priorBeta + 0.3;
            evidenceDirection = "negative";
            reason = `Negative feedback received (sentiment: ${outcome.feedbackSentiment.toFixed(2)})`;
          }
        }
        break;

      case "verification_result":
        if (outcome.verificationOutcome === "corroborated") {
          posteriorAlpha = priorAlpha + 0.5;
          evidenceDirection = "positive";
          reason = `Solution verified as effective`;
        } else if (outcome.verificationOutcome === "contested") {
          posteriorBeta = priorBeta + 0.5;
          evidenceDirection = "negative";
          reason = `Solution effectiveness contested`;
        }
        break;
    }

    // Only update if there was a change
    if (posteriorAlpha === priorAlpha && posteriorBeta === priorBeta) {
      return;
    }

    // Update issue
    const newMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
    const updatedScores: BayesianScores = {
      ...scores,
      pSolvable: { alpha: posteriorAlpha, beta: posteriorBeta, mean: newMean },
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.issueRepo.update(issueId, {
      bayesianScores: updatedScores,
      expectedValue: this.computeExpectedValue(updatedScores),
      evConfidence: this.computeEVConfidence(updatedScores),
    });

    // Record update
    await this.updateRepo.recordUpdate({
      id: generateId("bup"),
      entityType: "issue",
      entityId: issueId,
      updateType: "p_solvable",
      priorAlpha,
      priorBeta,
      posteriorAlpha,
      posteriorBeta,
      evidenceType: "outcome",
      evidenceId: outcomeId,
      evidenceDirection,
      reason,
    });

    // Update reference class base rates
    if (issue.referenceClassId) {
      await this.refClassRepo.updateBaseRates(
        issue.referenceClassId,
        "pSolvable",
        evidenceDirection === "positive"
      );
    }

    console.log(
      `[Bayesian] Updated issue ${issueId} P(solvable): ${(priorAlpha / (priorAlpha + priorBeta)).toFixed(3)} → ${newMean.toFixed(3)}`
    );
  }

  // ============================================================================
  // Process Information Unit Consistency
  // ============================================================================

  /**
   * Update P(real) based on information unit consistency analysis.
   *
   * Consistency scores from decomposed units provide evidence for issue validity:
   * - High consistency (>0.7) with many units → positive evidence
   * - Low consistency (<0.4) or contradictions → negative evidence
   * - Weighted by falsifiability (concrete claims weigh more)
   */
  async processConsistency(issueId: string): Promise<void> {
    const db = getDatabase();
    const { InformationUnitRepository } = await import("@orbit/db");
    const unitRepo = new InformationUnitRepository(db);

    const issue = await this.issueRepo.findById(issueId);
    if (!issue || !issue.bayesianScores) {
      console.log(`[Bayesian] Issue ${issueId} not found or has no Bayesian scores`);
      return;
    }

    // Get consistency data
    const consistency = await unitRepo.getConsistency("issue", issueId);
    const unitCountsByLevel = await unitRepo.getUnitCountsByLevel(issueId);
    const comparisonStats = await unitRepo.getComparisonStats(issueId);

    const totalUnits = Object.values(unitCountsByLevel).reduce((a, b) => a + b, 0);
    if (totalUnits < 3) {
      console.log(`[Bayesian] Issue ${issueId} has insufficient units (${totalUnits}) for consistency update`);
      return;
    }

    const scores = issue.bayesianScores as BayesianScores;
    const priorAlpha = scores.pReal.alpha;
    const priorBeta = scores.pReal.beta;

    // Calculate update based on consistency metrics
    let posteriorAlpha = priorAlpha;
    let posteriorBeta = priorBeta;
    let evidenceDirection: "positive" | "negative" = "positive";
    let reason = "";

    const weightedConsistency = consistency?.weightedConsistency || 0.5;
    const contradictionRate = comparisonStats.totalComparisons > 0
      ? comparisonStats.contradictions / comparisonStats.totalComparisons
      : 0;

    // Scale update by evidence strength (more units = stronger signal)
    const evidenceStrength = Math.min(1, totalUnits / 20); // Max at 20 units

    if (weightedConsistency >= 0.7 && contradictionRate < 0.2) {
      // Strong consistency - positive evidence
      const increment = 0.5 * evidenceStrength * (weightedConsistency - 0.5);
      posteriorAlpha = priorAlpha + increment;
      evidenceDirection = "positive";
      reason = `High consistency (${(weightedConsistency * 100).toFixed(0)}%) across ${totalUnits} units, ${comparisonStats.agreements} agreements`;
    } else if (weightedConsistency < 0.4 || contradictionRate > 0.3) {
      // Low consistency or many contradictions - negative evidence
      const decrement = 0.5 * evidenceStrength * Math.max(0.5 - weightedConsistency, contradictionRate);
      posteriorBeta = priorBeta + decrement;
      evidenceDirection = "negative";
      reason = `Low consistency (${(weightedConsistency * 100).toFixed(0)}%) or high contradictions (${comparisonStats.contradictions}/${comparisonStats.totalComparisons})`;
    } else {
      // Mixed evidence - smaller update toward consistency
      const delta = 0.2 * evidenceStrength * (weightedConsistency - 0.5);
      if (delta > 0) {
        posteriorAlpha = priorAlpha + delta;
        evidenceDirection = "positive";
      } else {
        posteriorBeta = priorBeta - delta;
        evidenceDirection = "negative";
      }
      reason = `Mixed consistency (${(weightedConsistency * 100).toFixed(0)}%) from ${totalUnits} units`;
    }

    // Only update if there was meaningful change
    if (Math.abs(posteriorAlpha - priorAlpha) < 0.05 && Math.abs(posteriorBeta - priorBeta) < 0.05) {
      return;
    }

    // Update issue
    const newMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
    const updatedScores: BayesianScores = {
      ...scores,
      pReal: { alpha: posteriorAlpha, beta: posteriorBeta, mean: newMean },
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.issueRepo.update(issueId, {
      bayesianScores: updatedScores,
      expectedValue: this.computeExpectedValue(updatedScores),
      evConfidence: this.computeEVConfidence(updatedScores),
    });

    // Record update
    await this.updateRepo.recordUpdate({
      id: generateId("bup"),
      entityType: "issue",
      entityId: issueId,
      updateType: "p_real",
      priorAlpha,
      priorBeta,
      posteriorAlpha,
      posteriorBeta,
      evidenceType: "verification", // Using verification as proxy for consistency updates
      evidenceId: undefined,
      evidenceDirection,
      reason,
    });

    console.log(
      `[Bayesian] Updated issue ${issueId} P(real) from consistency: ${(priorAlpha / (priorAlpha + priorBeta)).toFixed(3)} → ${newMean.toFixed(3)} (${reason})`
    );
  }

  // ============================================================================
  // Explain Score
  // ============================================================================

  /**
   * Generate a detailed explanation of why an issue has its current EV score.
   */
  async explainScore(issueId: string): Promise<ScoreExplanation | null> {
    const issue = await this.issueRepo.findById(issueId);
    if (!issue || !issue.bayesianScores) {
      return null;
    }

    const scores = issue.bayesianScores as BayesianScores;

    // Get reference class info
    let referenceClassInfo: ScoreExplanation["referenceClass"] = null;
    if (issue.referenceClassId) {
      const refClass = await this.refClassRepo.findById(issue.referenceClassId);
      if (refClass) {
        referenceClassInfo = {
          id: refClass.id,
          name: refClass.name,
          baseRatePReal: refClass.pRealAlpha / (refClass.pRealAlpha + refClass.pRealBeta),
          baseRatePSolvable: refClass.pSolvableAlpha / (refClass.pSolvableAlpha + refClass.pSolvableBeta),
        };
      }
    }

    // Get recent updates
    const updates = await this.updateRepo.findRecentByEntity("issue", issueId, 5);
    const recentUpdates = updates.map((u) => ({
      timestamp: u.createdAt.toISOString(),
      type: u.updateType,
      direction: u.evidenceDirection,
      reason: u.reason,
      delta:
        u.posteriorAlpha / (u.posteriorAlpha + u.posteriorBeta) -
        u.priorAlpha / (u.priorAlpha + u.priorBeta),
    }));

    // Build explanation
    const pRealSampleSize = scores.pReal.alpha + scores.pReal.beta - 4; // Subtract initial prior
    const pSolvableSampleSize = scores.pSolvable.alpha + scores.pSolvable.beta - 4;

    const components: ScoreExplanation["components"] = {
      pReal: {
        mean: scores.pReal.mean,
        alpha: scores.pReal.alpha,
        beta: scores.pReal.beta,
        sampleSize: Math.max(0, pRealSampleSize),
        explanation: this.explainProbability(
          "P(real)",
          scores.pReal.mean,
          pRealSampleSize,
          referenceClassInfo?.baseRatePReal
        ),
      },
      pSolvable: {
        mean: scores.pSolvable.mean,
        alpha: scores.pSolvable.alpha,
        beta: scores.pSolvable.beta,
        sampleSize: Math.max(0, pSolvableSampleSize),
        explanation: this.explainProbability(
          "P(solvable)",
          scores.pSolvable.mean,
          pSolvableSampleSize,
          referenceClassInfo?.baseRatePSolvable
        ),
      },
      impact: {
        estimate: scores.impact.estimate,
        confidence: scores.impact.confidence,
        explanation: `Impact estimated at ${(scores.impact.estimate * 100).toFixed(0)}% (confidence: ${(scores.impact.confidence * 100).toFixed(0)}%)`,
      },
      reach: {
        estimate: scores.reach.estimate,
        confidence: scores.reach.confidence,
        unit: scores.reach.unit,
        explanation: `Reach estimated at ${(scores.reach.estimate * 100).toFixed(0)}% ${scores.reach.unit ? `(${scores.reach.unit})` : ""} (confidence: ${(scores.reach.confidence * 100).toFixed(0)}%)`,
      },
      cost: {
        estimate: scores.cost.estimate,
        confidence: scores.cost.confidence,
        unit: scores.cost.unit,
        explanation: `Cost estimated at ${(scores.cost.estimate * 100).toFixed(0)}% ${scores.cost.unit ? `(${scores.cost.unit})` : ""} (confidence: ${(scores.cost.confidence * 100).toFixed(0)}%)`,
      },
    };

    // Formula explanation
    const ev = issue.expectedValue ?? this.computeExpectedValue(scores);
    const formulaExplanation = `EV = P(real) × P(solvable) × Impact × Reach - Cost
     = ${scores.pReal.mean.toFixed(3)} × ${scores.pSolvable.mean.toFixed(3)} × ${scores.impact.estimate.toFixed(3)} × ${scores.reach.estimate.toFixed(3)} - ${scores.cost.estimate.toFixed(3)}
     = ${(scores.pReal.mean * scores.pSolvable.mean * scores.impact.estimate * scores.reach.estimate).toFixed(3)} - ${scores.cost.estimate.toFixed(3)}
     = ${ev.toFixed(3)}`;

    return {
      issueId,
      expectedValue: ev,
      evConfidence: issue.evConfidence ?? this.computeEVConfidence(scores),
      components,
      referenceClass: referenceClassInfo,
      recentUpdates,
      formulaExplanation,
    };
  }

  /**
   * Generate a human-readable explanation for a probability value.
   */
  private explainProbability(
    name: string,
    value: number,
    sampleSize: number,
    baseRate?: number
  ): string {
    const percentage = (value * 100).toFixed(0);
    let explanation = `${name} = ${percentage}%`;

    if (baseRate !== undefined) {
      const delta = value - baseRate;
      const direction = delta >= 0 ? "higher" : "lower";
      explanation += ` (${Math.abs(delta * 100).toFixed(0)}% ${direction} than reference class base rate)`;
    }

    if (sampleSize > 0) {
      explanation += `. Based on ${sampleSize} observation${sampleSize === 1 ? "" : "s"}.`;
    } else {
      explanation += `. Based on initial priors (no observations yet).`;
    }

    return explanation;
  }

  // ============================================================================
  // Computation Helpers
  // ============================================================================

  /**
   * Compute expected value from Bayesian scores.
   */
  private computeExpectedValue(scores: BayesianScores): number {
    const value =
      scores.pReal.mean *
      scores.pSolvable.mean *
      scores.impact.estimate *
      scores.reach.estimate;
    const ev = value - scores.cost.estimate;
    return Math.max(-1, Math.min(1, ev));
  }

  /**
   * Compute confidence in the EV estimate.
   */
  private computeEVConfidence(scores: BayesianScores): number {
    const pRealConf = 1 - 1 / Math.max(1, scores.pReal.alpha + scores.pReal.beta - 1);
    const pSolvableConf = 1 - 1 / Math.max(1, scores.pSolvable.alpha + scores.pSolvable.beta - 1);
    const impactConf = scores.impact.confidence;
    const reachConf = scores.reach.confidence;
    const costConf = scores.cost.confidence;

    const components = [pRealConf, pSolvableConf, impactConf, reachConf, costConf];
    const product = components.reduce((acc, c) => acc * c, 1);
    return Math.pow(product, 1 / components.length);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let service: BayesianScoringService | null = null;

export function getBayesianScoringService(): BayesianScoringService {
  if (!service) {
    service = new BayesianScoringService();
  }
  return service;
}
