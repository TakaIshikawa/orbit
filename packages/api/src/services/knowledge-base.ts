/**
 * Knowledge Base Service
 *
 * Accumulates information units over time and uses historical high-falsifiability
 * units to validate new claims. This enables:
 *
 * 1. Cross-issue validation: New claims are checked against accumulated knowledge
 * 2. Falsifiability-weighted evidence: Concrete facts (data points, observations)
 *    carry more weight than abstract claims (theories, paradigms)
 * 3. Temporal relevance: Recent evidence is weighted more heavily
 * 4. Confidence updates: Unit confidence adjusted based on historical support/contradiction
 */

import Anthropic from "@anthropic-ai/sdk";
import { generateId } from "@orbit/core";
import {
  getDatabase,
  InformationUnitRepository,
  type InformationUnitRow,
  type CrossIssueComparisonRow,
} from "@orbit/db";

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeBaseValidationResult {
  unitId: string;
  validatedAgainst: number;
  supportingEvidence: CrossIssueComparisonRow[];
  contradictingEvidence: CrossIssueComparisonRow[];
  netConfidenceImpact: number;
  summary: string;
}

export interface CrossIssueComparisonInput {
  newUnit: InformationUnitRow;
  historicalUnit: InformationUnitRow;
  domainOverlap: string[];
  conceptOverlap: string[];
}

export interface ComparisonResult {
  relationship: "supports" | "contradicts" | "refines" | "unrelated";
  similarityScore: number;
  confidenceImpact: number;
  explanation: string;
  temporalRelevance: "current" | "outdated" | "historical";
  temporalNote?: string;
}

// ============================================================================
// Knowledge Base Service
// ============================================================================

class KnowledgeBaseService {
  private anthropic: Anthropic;
  private unitRepo: InformationUnitRepository;

  constructor() {
    this.anthropic = new Anthropic();
    const db = getDatabase();
    this.unitRepo = new InformationUnitRepository(db);
  }

  /**
   * Validate a new unit against the accumulated knowledge base
   */
  async validateAgainstKnowledgeBase(
    newUnit: InformationUnitRow,
    options: { maxComparisons?: number; minFalsifiability?: number } = {}
  ): Promise<KnowledgeBaseValidationResult> {
    const { maxComparisons = 10, minFalsifiability = 0.6 } = options;

    // Find relevant historical units
    const relevantUnits = await this.unitRepo.findRelevantHistoricalUnits(newUnit, {
      limit: maxComparisons * 2, // Get more than needed in case some are filtered
      minFalsifiability,
    });

    if (relevantUnits.length === 0) {
      return {
        unitId: newUnit.id,
        validatedAgainst: 0,
        supportingEvidence: [],
        contradictingEvidence: [],
        netConfidenceImpact: 0,
        summary: "No relevant historical evidence found for validation",
      };
    }

    // Compare against top relevant units
    const comparisons: CrossIssueComparisonRow[] = [];
    const supportingEvidence: CrossIssueComparisonRow[] = [];
    const contradictingEvidence: CrossIssueComparisonRow[] = [];

    for (const { unit: historicalUnit, relevanceScore, domainOverlap, conceptOverlap } of relevantUnits.slice(0, maxComparisons)) {
      try {
        const comparison = await this.compareUnits({
          newUnit,
          historicalUnit,
          domainOverlap,
          conceptOverlap,
        });

        // Record the comparison
        const comparisonRow = await this.unitRepo.createCrossIssueComparison({
          newUnitId: newUnit.id,
          newUnitIssueId: newUnit.issueId || "",
          historicalUnitId: historicalUnit.id,
          historicalUnitIssueId: historicalUnit.issueId || "",
          relationship: comparison.relationship,
          similarityScore: comparison.similarityScore,
          relevanceScore,
          domainOverlap,
          conceptOverlap,
          confidenceImpact: comparison.confidenceImpact,
          impactExplanation: comparison.explanation,
          historicalUnitFalsifiability: historicalUnit.falsifiabilityScore,
          falsifiabilityWeight: this.calculateFalsifiabilityWeight(historicalUnit.falsifiabilityScore),
          temporalRelevance: comparison.temporalRelevance,
          temporalNote: comparison.temporalNote,
        });

        comparisons.push(comparisonRow);

        if (comparison.relationship === "supports") {
          supportingEvidence.push(comparisonRow);
        } else if (comparison.relationship === "contradicts") {
          contradictingEvidence.push(comparisonRow);
        }

        // Update historical unit stats
        await this.unitRepo.updateKnowledgeBaseStats(historicalUnit.id, {
          incrementComparisonCount: true,
        });
      } catch (error) {
        console.error(`[KnowledgeBase] Failed to compare units: ${error}`);
      }
    }

    // Calculate net confidence impact
    const netConfidenceImpact = comparisons.reduce((sum, c) => sum + c.confidenceImpact, 0);

    // Mark the new unit as KB validated
    await this.unitRepo.updateKnowledgeBaseStats(newUnit.id, {
      markValidated: true,
    });

    // Generate summary
    const summary = this.generateValidationSummary(supportingEvidence, contradictingEvidence, netConfidenceImpact);

    return {
      unitId: newUnit.id,
      validatedAgainst: comparisons.length,
      supportingEvidence,
      contradictingEvidence,
      netConfidenceImpact,
      summary,
    };
  }

  /**
   * Validate all new units for an issue against the knowledge base
   */
  async validateIssueUnits(
    issueId: string,
    options: { maxComparisonsPerUnit?: number; minFalsifiability?: number } = {}
  ): Promise<{
    unitsValidated: number;
    totalComparisons: number;
    netConfidenceImpact: number;
    summary: string;
  }> {
    const { maxComparisonsPerUnit = 5, minFalsifiability = 0.6 } = options;

    // Get units for this issue that haven't been KB validated
    const allUnits = await this.unitRepo.findByIssue(issueId);
    const unvalidatedUnits = allUnits.filter((u) => !u.kbValidated);

    if (unvalidatedUnits.length === 0) {
      return {
        unitsValidated: 0,
        totalComparisons: 0,
        netConfidenceImpact: 0,
        summary: "All units already validated against knowledge base",
      };
    }

    let totalComparisons = 0;
    let totalConfidenceImpact = 0;
    let supportingCount = 0;
    let contradictingCount = 0;

    // Validate each unvalidated unit
    for (const unit of unvalidatedUnits) {
      const result = await this.validateAgainstKnowledgeBase(unit, {
        maxComparisons: maxComparisonsPerUnit,
        minFalsifiability,
      });

      totalComparisons += result.validatedAgainst;
      totalConfidenceImpact += result.netConfidenceImpact;
      supportingCount += result.supportingEvidence.length;
      contradictingCount += result.contradictingEvidence.length;

      // Update unit confidence based on KB validation
      if (Math.abs(result.netConfidenceImpact) > 0.01) {
        const currentConfidence = unit.currentConfidence;
        const newConfidence = Math.max(0, Math.min(1, currentConfidence + result.netConfidenceImpact));

        await this.unitRepo.update(unit.id, {
          currentConfidence: newConfidence,
          updateCount: unit.updateCount + 1,
        });
      }
    }

    const summary = [
      `Validated ${unvalidatedUnits.length} units against ${totalComparisons} historical units.`,
      `Found ${supportingCount} supporting and ${contradictingCount} contradicting pieces of evidence.`,
      totalConfidenceImpact > 0
        ? `Net positive confidence impact: +${(totalConfidenceImpact * 100).toFixed(1)}%`
        : totalConfidenceImpact < 0
        ? `Net negative confidence impact: ${(totalConfidenceImpact * 100).toFixed(1)}%`
        : `No net confidence impact.`,
    ].join(" ");

    return {
      unitsValidated: unvalidatedUnits.length,
      totalComparisons,
      netConfidenceImpact: totalConfidenceImpact,
      summary,
    };
  }

  /**
   * Compare a new unit against a historical unit using LLM
   */
  private async compareUnits(input: CrossIssueComparisonInput): Promise<ComparisonResult> {
    const { newUnit, historicalUnit, domainOverlap, conceptOverlap } = input;

    const prompt = `You are comparing two information units to determine if the historical unit supports, contradicts, or is unrelated to the new unit.

## New Unit (being validated)
- Statement: "${newUnit.statement}"
- Granularity Level: ${newUnit.granularityLevel}
- Domains: ${(newUnit.domains as string[]).join(", ")}
- Temporal Scope: ${newUnit.temporalScope}
- Falsifiability: ${(newUnit.falsifiabilityScore * 100).toFixed(0)}%
- Source: ${newUnit.sourceName}

## Historical Unit (potential evidence)
- Statement: "${historicalUnit.statement}"
- Granularity Level: ${historicalUnit.granularityLevel}
- Domains: ${(historicalUnit.domains as string[]).join(", ")}
- Temporal Scope: ${historicalUnit.temporalScope}
- Falsifiability: ${(historicalUnit.falsifiabilityScore * 100).toFixed(0)}%
- Source: ${historicalUnit.sourceName}
- Confidence: ${(historicalUnit.currentConfidence * 100).toFixed(0)}%

## Overlap
- Domains: ${domainOverlap.join(", ") || "none"}
- Concepts: ${conceptOverlap.join(", ") || "none"}

## Task
Determine:
1. **Relationship**: Does the historical unit support, contradict, refine, or is it unrelated to the new unit?
   - "supports": Historical unit provides evidence for the new unit's claim
   - "contradicts": Historical unit provides counter-evidence to the new unit's claim
   - "refines": Historical unit adds nuance/detail but doesn't strongly support or contradict
   - "unrelated": Units are not meaningfully comparable

2. **Similarity Score** (0-1): How similar are the claims? (1 = nearly identical claims)

3. **Confidence Impact** (-0.2 to +0.2): How much should this comparison adjust confidence in the new unit?
   - Weight by: historical unit's falsifiability (${(historicalUnit.falsifiabilityScore * 100).toFixed(0)}%), confidence (${(historicalUnit.currentConfidence * 100).toFixed(0)}%), and source credibility
   - Supporting high-falsifiability evidence = positive impact
   - Contradicting high-falsifiability evidence = negative impact

4. **Temporal Relevance**: Is the historical unit current, outdated, or historical context?

Respond in JSON format:
{
  "relationship": "supports" | "contradicts" | "refines" | "unrelated",
  "similarityScore": 0.0-1.0,
  "confidenceImpact": -0.2 to +0.2,
  "explanation": "Brief explanation of the comparison",
  "temporalRelevance": "current" | "outdated" | "historical",
  "temporalNote": "Optional note about temporal considerations"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type");
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const result = JSON.parse(jsonMatch[0]) as ComparisonResult;

      // Validate and clamp values
      result.similarityScore = Math.max(0, Math.min(1, result.similarityScore));
      result.confidenceImpact = Math.max(-0.2, Math.min(0.2, result.confidenceImpact));

      // Apply falsifiability weighting to confidence impact
      const falsifiabilityWeight = this.calculateFalsifiabilityWeight(historicalUnit.falsifiabilityScore);
      result.confidenceImpact *= falsifiabilityWeight;

      return result;
    } catch (error) {
      console.error(`[KnowledgeBase] LLM comparison failed: ${error}`);

      // Fallback to heuristic comparison
      return this.heuristicComparison(newUnit, historicalUnit);
    }
  }

  /**
   * Heuristic comparison when LLM is unavailable
   */
  private heuristicComparison(newUnit: InformationUnitRow, historicalUnit: InformationUnitRow): ComparisonResult {
    // Simple similarity based on domain and concept overlap
    const newDomains = new Set(newUnit.domains as string[]);
    const histDomains = new Set(historicalUnit.domains as string[]);
    const domainOverlap = [...newDomains].filter((d) => histDomains.has(d)).length;
    const domainUnion = new Set([...newDomains, ...histDomains]).size;
    const domainSimilarity = domainOverlap / Math.max(domainUnion, 1);

    const newConcepts = new Set(newUnit.concepts as string[]);
    const histConcepts = new Set(historicalUnit.concepts as string[]);
    const conceptOverlap = [...newConcepts].filter((c) => histConcepts.has(c)).length;
    const conceptUnion = new Set([...newConcepts, ...histConcepts]).size;
    const conceptSimilarity = conceptOverlap / Math.max(conceptUnion, 1);

    const similarityScore = domainSimilarity * 0.4 + conceptSimilarity * 0.6;

    // Default to "refines" with minimal impact for heuristic
    return {
      relationship: similarityScore > 0.5 ? "refines" : "unrelated",
      similarityScore,
      confidenceImpact: 0,
      explanation: "Heuristic comparison (LLM unavailable)",
      temporalRelevance: "current",
    };
  }

  /**
   * Calculate falsifiability weight (higher falsifiability = more weight)
   */
  private calculateFalsifiabilityWeight(falsifiability: number): number {
    // Exponential weighting: data_point (0.95) has much more weight than theory (0.3)
    return Math.pow(falsifiability, 1.5);
  }

  /**
   * Generate a human-readable validation summary
   */
  private generateValidationSummary(
    supporting: CrossIssueComparisonRow[],
    contradicting: CrossIssueComparisonRow[],
    netImpact: number
  ): string {
    const parts: string[] = [];

    if (supporting.length > 0) {
      parts.push(`${supporting.length} historical unit(s) support this claim`);
    }

    if (contradicting.length > 0) {
      parts.push(`${contradicting.length} historical unit(s) contradict this claim`);
    }

    if (netImpact > 0.05) {
      parts.push(`Overall evidence strengthens confidence (+${(netImpact * 100).toFixed(1)}%)`);
    } else if (netImpact < -0.05) {
      parts.push(`Overall evidence weakens confidence (${(netImpact * 100).toFixed(1)}%)`);
    } else {
      parts.push("Mixed or neutral evidence");
    }

    return parts.join(". ") + ".";
  }

  /**
   * Get knowledge base statistics
   */
  async getStats() {
    return this.unitRepo.getKnowledgeBaseStats();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: KnowledgeBaseService | null = null;

export function getKnowledgeBaseService(): KnowledgeBaseService {
  if (!instance) {
    instance = new KnowledgeBaseService();
  }
  return instance;
}

export { KnowledgeBaseService };
