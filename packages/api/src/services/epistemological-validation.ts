import { generateId } from "@orbit/core";
import {
  getDatabase,
  IssueRepository,
  CausalClaimRepository,
  AdversarialValidationRepository,
  PredictionRepository,
  type IssueRow,
  type CausalClaimRow,
  type AdversarialValidationRow,
  type PredictionRow,
} from "@orbit/db";
import { getLLMClient } from "@orbit/llm";
import { z } from "zod";

/**
 * Evidence strength weights for scoring causal claims
 */
const EVIDENCE_STRENGTH_MAP: Record<string, number> = {
  experimental: 1.0,
  quasi_experimental: 0.85,
  longitudinal: 0.75,
  cross_sectional: 0.6,
  case_control: 0.55,
  observational: 0.4,
  expert_consensus: 0.35,
  anecdotal: 0.2,
  theoretical: 0.15,
};

/**
 * Challenge generation schema for LLM
 */
const ChallengeGenerationSchema = z.object({
  challenges: z.array(
    z.object({
      challengeType: z.enum([
        "framing_challenge",
        "evidence_challenge",
        "causation_challenge",
        "scope_challenge",
        "stakeholder_challenge",
        "alternative_challenge",
        "feasibility_challenge",
        "unintended_effects",
        "base_rate_challenge",
        "selection_bias",
      ]),
      severity: z.enum(["critical", "major", "moderate", "minor"]),
      challengeStatement: z.string(),
      challengeReasoning: z.string(),
      alternativeProposal: z.string().optional(),
    })
  ),
});

/**
 * Causal analysis schema for LLM
 */
const CausalAnalysisSchema = z.object({
  causalClaims: z.array(
    z.object({
      cause: z.string(),
      effect: z.string(),
      mechanism: z.string(),
      evidenceStrength: z.enum([
        "experimental",
        "quasi_experimental",
        "longitudinal",
        "cross_sectional",
        "case_control",
        "observational",
        "expert_consensus",
        "anecdotal",
        "theoretical",
      ]),
      confidence: z.number().min(0).max(1),
      direction: z.enum([
        "forward",
        "reverse",
        "bidirectional",
        "spurious",
        "unknown",
      ]),
      evidenceDescription: z.string(),
      hillCriteria: z.object({
        strength: z.number().min(0).max(1),
        consistency: z.number().min(0).max(1),
        specificity: z.number().min(0).max(1),
        temporality: z.number().min(0).max(1),
        gradient: z.number().min(0).max(1),
        plausibility: z.number().min(0).max(1),
        coherence: z.number().min(0).max(1),
        experiment: z.number().min(0).max(1),
        analogy: z.number().min(0).max(1),
      }),
    })
  ),
  primaryChain: z.array(z.number()), // Indices into causalClaims forming the main chain
  uncertainties: z.array(
    z.object({
      description: z.string(),
      impact: z.enum(["high", "medium", "low"]),
      resolvable: z.boolean(),
      resolutionPath: z.string().optional(),
    })
  ),
  cruxes: z.array(
    z.object({
      statement: z.string(),
      currentBelief: z.number().min(0).max(1),
      ifTrueImpact: z.string(),
      ifFalseImpact: z.string(),
    })
  ),
  causalSummary: z.string(),
  overallConfidence: z.number().min(0).max(1),
});

/**
 * Prediction generation schema for LLM
 */
const PredictionGenerationSchema = z.object({
  predictions: z.array(
    z.object({
      predictionType: z.enum([
        "trend_direction",
        "threshold_crossing",
        "event_occurrence",
        "comparative",
        "timing",
        "magnitude",
        "conditional",
      ]),
      predictionStatement: z.string(),
      operationalization: z.object({
        metric: z.string().optional(),
        threshold: z.number().optional(),
        comparisonValue: z.number().optional(),
        dataSource: z.string().optional(),
        measurementMethod: z.string(),
      }),
      probability: z.number().min(0).max(1),
      confidenceInterval: z
        .object({
          lower: z.number(),
          upper: z.number(),
          confidence: z.number(),
        })
        .optional(),
      reasoning: z.string(),
      keyAssumptions: z.array(z.string()),
      timeframeMonths: z.number(), // How many months until resolution
    })
  ),
});

export class EpistemologicalValidationService {
  private db = getDatabase();
  private issueRepo = new IssueRepository(this.db);
  private causalRepo = new CausalClaimRepository(this.db);
  private adversarialRepo = new AdversarialValidationRepository(this.db);
  private predictionRepo = new PredictionRepository(this.db);
  private llm = getLLMClient();

  /**
   * Run full epistemological validation on an issue
   */
  async validateIssue(issueId: string): Promise<{
    causalAnalysis: {
      claims: CausalClaimRow[];
      chainId: string;
      confidence: number;
    };
    adversarialValidation: {
      sessionId: string;
      challenges: AdversarialValidationRow[];
      result: string;
    };
    predictions: {
      setId: string;
      predictions: PredictionRow[];
    };
    validationScore: number;
  }> {
    const issue = await this.issueRepo.findById(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    console.log(`Starting epistemological validation for issue: ${issue.title}`);

    // Step 1: Analyze causal structure
    console.log("  1. Analyzing causal structure...");
    const causalAnalysis = await this.analyzeCausalStructure(issue);

    // Step 2: Generate adversarial challenges
    console.log("  2. Generating adversarial challenges...");
    const adversarialValidation = await this.runAdversarialValidation(issue);

    // Step 3: Generate predictions
    console.log("  3. Generating predictions...");
    const predictions = await this.generatePredictions(issue, causalAnalysis.claims);

    // Step 4: Calculate overall validation score
    const validationScore = this.calculateValidationScore(
      causalAnalysis,
      adversarialValidation,
      predictions
    );

    // Step 5: Update issue with validation status
    await this.issueRepo.update(issueId, {
      causalAnalysis: {
        primaryChainId: causalAnalysis.chainId,
        causalClaimIds: causalAnalysis.claims.map((c) => c.id),
        confidenceInCausation: causalAnalysis.confidence,
        lastAnalyzedAt: new Date().toISOString(),
      },
      validationStatus: {
        adversarialValidationComplete: true,
        adversarialSessionId: adversarialValidation.sessionId,
        predictionsGenerated: true,
        predictionSetId: predictions.setId,
        causalClaimsValidated: true,
        validationScore,
        lastValidatedAt: new Date().toISOString(),
      },
    });

    console.log(`  Validation complete. Score: ${(validationScore * 100).toFixed(1)}%`);

    return {
      causalAnalysis,
      adversarialValidation,
      predictions,
      validationScore,
    };
  }

  /**
   * Analyze causal structure of an issue
   */
  async analyzeCausalStructure(issue: IssueRow): Promise<{
    claims: CausalClaimRow[];
    chainId: string;
    confidence: number;
  }> {
    const systemPrompt = `You are an expert in causal inference and epistemology. Your task is to analyze the causal structure of a systemic issue.

For each causal claim, you must:
1. Identify the cause and effect
2. Describe the mechanism (how does cause lead to effect?)
3. Classify evidence strength based on the hierarchy:
   - experimental: RCT or controlled experiment
   - quasi_experimental: Natural experiment, regression discontinuity
   - longitudinal: Repeated observations over time
   - cross_sectional: Single-point comparison across groups
   - case_control: Retrospective comparison
   - observational: Correlation without controls
   - expert_consensus: Expert opinion with reasoning
   - anecdotal: Individual cases without systematic study
   - theoretical: Derived from theory without empirical test

4. Assess Bradford Hill criteria (0-1 scale each):
   - strength: Large effect size
   - consistency: Replicated across studies
   - specificity: Specific association
   - temporality: Cause precedes effect
   - gradient: Dose-response relationship
   - plausibility: Mechanism is plausible
   - coherence: Fits with other knowledge
   - experiment: Experimental support exists
   - analogy: Similar relationships exist

5. Identify causal direction (forward, reverse, bidirectional, spurious, unknown)

6. Note any key uncertainties and cruxes (beliefs that, if changed, would change your conclusion)

Be rigorous and conservative in your assessments. It's better to acknowledge uncertainty than to overstate confidence.`;

    const userPrompt = `Analyze the causal structure of this issue:

Title: ${issue.title}
Summary: ${issue.summary}
Root Causes (initial framing): ${issue.rootCauses.join(", ")}
Affected Domains: ${issue.affectedDomains.join(", ")}
Sources: ${JSON.stringify(issue.sources, null, 2)}

Provide:
1. All causal claims implied by this issue (cause → effect relationships)
2. Which claims form the primary causal chain
3. Key uncertainties in the causal model
4. Cruxes - what beliefs would change your conclusion about causation?
5. Overall confidence in the causal model (0-1)`;

    const result = await this.llm.completeStructured(
      [{ role: "user", content: userPrompt }],
      {
        schema: CausalAnalysisSchema,
        systemPrompt,
        schemaName: "causal_analysis",
        schemaDescription: "Causal structure analysis of an issue",
      }
    );

    const analysis = result.data;

    // Create causal claims
    const claims: CausalClaimRow[] = [];
    for (const claim of analysis.causalClaims) {
      const hillCriteria = {
        strength: { score: claim.hillCriteria.strength, notes: "" },
        consistency: { score: claim.hillCriteria.consistency, notes: "" },
        specificity: { score: claim.hillCriteria.specificity, notes: "" },
        temporality: { score: claim.hillCriteria.temporality, notes: "" },
        gradient: { score: claim.hillCriteria.gradient, notes: "" },
        plausibility: { score: claim.hillCriteria.plausibility, notes: "" },
        coherence: { score: claim.hillCriteria.coherence, notes: "" },
        experiment: { score: claim.hillCriteria.experiment, notes: "" },
        analogy: { score: claim.hillCriteria.analogy, notes: "" },
        overallScore:
          Object.values(claim.hillCriteria).reduce((a, b) => a + b, 0) / 9,
        assessedAt: new Date().toISOString(),
      };

      const created = await this.causalRepo.createClaim({
        id: generateId("cclaim"),
        issueId: issue.id,
        cause: claim.cause,
        effect: claim.effect,
        mechanism: claim.mechanism,
        evidenceStrength: claim.evidenceStrength,
        confidence: claim.confidence,
        direction: claim.direction,
        evidenceSources: [
          {
            sourceUrl: "",
            sourceName: "LLM Analysis",
            excerpt: claim.evidenceDescription,
            peerReviewed: false,
            relevance: "high" as const,
          },
        ],
        hillCriteria,
      });
      claims.push(created);
    }

    // Create the primary causal chain
    const primaryClaimIds = analysis.primaryChain.map((i) => claims[i]?.id).filter(Boolean);
    const chain = await this.causalRepo.createChain({
      id: generateId("cchain"),
      issueId: issue.id,
      name: `Primary chain for ${issue.title}`,
      description: analysis.causalSummary,
      claimIds: primaryClaimIds,
      isPrimary: true,
    });

    return {
      claims,
      chainId: chain.id,
      confidence: analysis.overallConfidence,
    };
  }

  /**
   * Run adversarial validation ("red team") on an issue
   */
  async runAdversarialValidation(issue: IssueRow): Promise<{
    sessionId: string;
    challenges: AdversarialValidationRow[];
    result: string;
  }> {
    const systemPrompt = `You are a critical analyst whose job is to find weaknesses, gaps, and potential errors in the framing of systemic issues.

Your role is to challenge claims rigorously but fairly. For each challenge:
1. Identify the type of challenge (framing, evidence, causation, scope, etc.)
2. Assess severity (critical, major, moderate, minor)
3. Provide clear reasoning
4. Suggest alternatives where applicable

Challenge types:
- framing_challenge: Is this the right way to frame the issue?
- evidence_challenge: Is the evidence sufficient/valid?
- causation_challenge: Is the causal relationship valid?
- scope_challenge: Is the scope correctly identified?
- stakeholder_challenge: Are all stakeholders considered?
- alternative_challenge: Is there a better explanation/solution?
- feasibility_challenge: Is the proposed solution feasible?
- unintended_effects: What could go wrong?
- base_rate_challenge: Does this differ from base rates?
- selection_bias: Is the sample representative?

Be constructively critical - the goal is to improve the analysis, not to dismiss it.`;

    const userPrompt = `Challenge the following issue framing:

Title: ${issue.title}
Summary: ${issue.summary}
Root Causes: ${issue.rootCauses.join(", ")}
Affected Domains: ${issue.affectedDomains.join(", ")}
Leverage Points: ${issue.leveragePoints.join(", ")}

IUTLN Scores:
- Impact: ${(issue.scoreImpact * 100).toFixed(0)}%
- Urgency: ${(issue.scoreUrgency * 100).toFixed(0)}%
- Tractability: ${(issue.scoreTractability * 100).toFixed(0)}%
- Legitimacy: ${(issue.scoreLegitimacy * 100).toFixed(0)}%
- Neglectedness: ${(issue.scoreNeglectedness * 100).toFixed(0)}%

Generate 5-8 challenges covering different aspects. Include at least one critical or major challenge if warranted.`;

    const result = await this.llm.completeStructured(
      [{ role: "user", content: userPrompt }],
      {
        schema: ChallengeGenerationSchema,
        systemPrompt,
        schemaName: "adversarial_challenges",
        schemaDescription: "Red team challenges for issue validation",
      }
    );

    // Create validation session
    const session = await this.adversarialRepo.createSession({
      id: generateId("vsess"),
      entityType: "issue",
      entityId: issue.id,
      sessionType: "automated",
      validatorCount: 1,
      challengeIds: [],
    });

    // Create challenges
    const challenges: AdversarialValidationRow[] = [];
    for (const challenge of result.data.challenges) {
      const created = await this.adversarialRepo.createChallenge({
        id: generateId("vchal"),
        entityType: "issue",
        entityId: issue.id,
        challengeType: challenge.challengeType,
        severity: challenge.severity,
        challengeStatement: challenge.challengeStatement,
        challengeReasoning: challenge.challengeReasoning,
        alternativeProposal: challenge.alternativeProposal,
        challengedBy: "system:adversarial",
        validationRound: session.id,
      });
      challenges.push(created);

      // Add to session
      await this.adversarialRepo.addChallengeToSession(session.id, created.id);
    }

    // Determine result based on challenges
    const criticalCount = challenges.filter((c) => c.severity === "critical").length;
    const majorCount = challenges.filter((c) => c.severity === "major").length;

    let overallResult: "validated" | "needs_revision" | "rejected";
    if (criticalCount > 1 || (criticalCount === 1 && majorCount > 2)) {
      overallResult = "rejected";
    } else if (criticalCount > 0 || majorCount > 1) {
      overallResult = "needs_revision";
    } else {
      overallResult = "validated";
    }

    // Complete session
    await this.adversarialRepo.completeSession(session.id, {
      overallResult,
      confidenceAdjustment:
        overallResult === "validated"
          ? 0.1
          : overallResult === "needs_revision"
            ? -0.1
            : -0.3,
      summary: `Generated ${challenges.length} challenges: ${criticalCount} critical, ${majorCount} major`,
    });

    return {
      sessionId: session.id,
      challenges,
      result: overallResult,
    };
  }

  /**
   * Generate predictions based on issue understanding
   */
  async generatePredictions(
    issue: IssueRow,
    causalClaims: CausalClaimRow[]
  ): Promise<{
    setId: string;
    predictions: PredictionRow[];
  }> {
    const systemPrompt = `You are an expert forecaster who generates testable predictions based on understanding of systemic issues.

For each prediction:
1. Make it specific and operationalizable
2. Assign a probability (0-1) - be well-calibrated, not overconfident
3. Define how it will be measured
4. Specify the timeframe
5. List key assumptions

Good predictions are:
- Specific enough to be clearly resolved
- Measurable with available data
- Time-bounded
- Informative (neither too obvious nor too speculative)
- Based on the causal model

Generate a mix of:
- trend_direction: Will a metric increase/decrease?
- threshold_crossing: Will a metric cross a threshold?
- event_occurrence: Will a specific event happen?
- comparative: Will A be greater than B?
- conditional: If X happens, will Y follow?`;

    const causalContext = causalClaims
      .map(
        (c) =>
          `- ${c.cause} → ${c.effect} (${c.evidenceStrength}, ${(c.confidence * 100).toFixed(0)}% confidence)`
      )
      .join("\n");

    const userPrompt = `Generate testable predictions based on this issue:

Title: ${issue.title}
Summary: ${issue.summary}
Time Horizon: ${issue.timeHorizon}
Propagation Velocity: ${issue.propagationVelocity}

Causal Claims:
${causalContext}

Generate 3-5 predictions that would:
1. Test whether the causal model is correct
2. Provide early warning if the issue is worsening
3. Indicate if interventions are working

Set reasonable timeframes (1-36 months) based on the issue's time horizon.`;

    const result = await this.llm.completeStructured(
      [{ role: "user", content: userPrompt }],
      {
        schema: PredictionGenerationSchema,
        systemPrompt,
        schemaName: "prediction_generation",
        schemaDescription: "Testable predictions for calibration",
      }
    );

    // Create prediction set
    const set = await this.predictionRepo.createPredictionSet({
      id: generateId("pset"),
      name: `Predictions for ${issue.title}`,
      issueId: issue.id,
      predictionIds: [],
    });

    // Create predictions
    const predictions: PredictionRow[] = [];
    for (const pred of result.data.predictions) {
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + pred.timeframeMonths);

      const created = await this.predictionRepo.createPrediction({
        id: generateId("pred"),
        issueId: issue.id,
        predictionType: pred.predictionType,
        predictionStatement: pred.predictionStatement,
        operationalization: pred.operationalization,
        probability: pred.probability,
        confidenceInterval: pred.confidenceInterval,
        reasoning: pred.reasoning,
        keyAssumptions: pred.keyAssumptions,
        basedOnClaimIds: causalClaims.map((c) => c.id),
        resolutionDeadline: deadline,
      });
      predictions.push(created);

      // Add to set
      await this.predictionRepo.addPredictionToSet(set.id, created.id);
    }

    return {
      setId: set.id,
      predictions,
    };
  }

  /**
   * Calculate overall validation score
   */
  private calculateValidationScore(
    causalAnalysis: { confidence: number; claims: CausalClaimRow[] },
    adversarialValidation: { result: string; challenges: AdversarialValidationRow[] },
    predictions: { predictions: PredictionRow[] }
  ): number {
    // Causal confidence component (40%)
    const causalScore = causalAnalysis.confidence;

    // Average evidence strength of claims
    const avgEvidenceStrength =
      causalAnalysis.claims.length > 0
        ? causalAnalysis.claims.reduce(
            (sum, c) =>
              sum + (EVIDENCE_STRENGTH_MAP[c.evidenceStrength] || 0.3),
            0
          ) / causalAnalysis.claims.length
        : 0.3;

    // Adversarial validation component (40%)
    let adversarialScore = 0;
    switch (adversarialValidation.result) {
      case "validated":
        adversarialScore = 0.9;
        break;
      case "needs_revision":
        adversarialScore = 0.5;
        break;
      case "rejected":
        adversarialScore = 0.2;
        break;
    }

    // Prediction quality component (20%)
    // Higher score for more predictions with moderate probabilities (well-calibrated)
    const predictionScore =
      predictions.predictions.length > 0
        ? Math.min(1, predictions.predictions.length / 5) *
          predictions.predictions.reduce((sum, p) => {
            // Penalize extreme probabilities (overconfident)
            const calibrationPenalty =
              p.probability > 0.9 || p.probability < 0.1 ? 0.7 : 1;
            return sum + calibrationPenalty;
          }, 0) /
            predictions.predictions.length
        : 0.5;

    // Weighted average
    const score =
      causalScore * 0.2 +
      avgEvidenceStrength * 0.2 +
      adversarialScore * 0.4 +
      predictionScore * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get validation status summary for an issue
   */
  async getValidationSummary(issueId: string): Promise<{
    isValidated: boolean;
    validationScore: number | null;
    causalClaimCount: number;
    challengeCount: number;
    unresolvedChallenges: number;
    predictionCount: number;
    activePredictions: number;
    lastValidatedAt: string | null;
  }> {
    const issue = await this.issueRepo.findById(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    const causalClaims = await this.causalRepo.findClaimsByIssue(issueId);
    const challenges = await this.adversarialRepo.findChallengesByEntity(
      "issue",
      issueId
    );
    const predictions = await this.predictionRepo.findPredictionsByIssue(issueId);

    const unresolvedChallenges = challenges.filter(
      (c) => c.resolution === "pending"
    ).length;
    const activePredictions = predictions.filter(
      (p) => p.status === "active"
    ).length;

    return {
      isValidated: !!issue.validationStatus?.adversarialValidationComplete,
      validationScore: issue.validationStatus?.validationScore ?? null,
      causalClaimCount: causalClaims.length,
      challengeCount: challenges.length,
      unresolvedChallenges,
      predictionCount: predictions.length,
      activePredictions,
      lastValidatedAt: issue.validationStatus?.lastValidatedAt ?? null,
    };
  }
}
