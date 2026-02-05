/**
 * Information Decomposition Service
 *
 * Decomposes source content into atomic information units at defined granularity levels.
 * This enables proper triangulation, cross-validation, and adversarial testing by
 * comparing information at the same abstraction level.
 *
 * Key insight: Comparing articles is epistemologically weak because they mix granularity levels.
 * By decomposing into units, we can:
 * 1. Compare data points to data points
 * 2. Compare causal claims to causal claims
 * 3. Weight updates by falsifiability (concrete claims update faster)
 * 4. Track consistency across the granularity hierarchy
 */

import Anthropic from "@anthropic-ai/sdk";
import { generateId } from "@orbit/core";
import crypto from "crypto";
import type { FetchedItem } from "./source-fetchers/index.js";

// Granularity levels with their properties
export const GRANULARITY_LEVELS = {
  paradigm: {
    level: 0,
    name: "Paradigm",
    description: "Worldviews, fundamental assumptions, mental models",
    falsifiabilityBase: 0.1,
    updateRate: 0.05, // Very slow to update
    examples: ["Markets tend toward efficiency", "Human behavior is fundamentally rational"],
  },
  theory: {
    level: 1,
    name: "Theory",
    description: "Causal models, explanatory frameworks",
    falsifiabilityBase: 0.3,
    updateRate: 0.1,
    examples: ["Increased money supply causes inflation", "Climate change is driven by GHG emissions"],
  },
  mechanism: {
    level: 2,
    name: "Mechanism",
    description: "How things work, causal pathways, processes",
    falsifiabilityBase: 0.5,
    updateRate: 0.2,
    examples: ["CO2 traps infrared radiation → warming", "Virus spreads via respiratory droplets"],
  },
  causal_claim: {
    level: 3,
    name: "Causal Claim",
    description: "Specific if-then predictions, conditional relationships",
    falsifiabilityBase: 0.6,
    updateRate: 0.3,
    examples: ["If CO2 doubles, temperature rises 2-4°C", "Lockdowns reduce R0 by 40-60%"],
  },
  statistical: {
    level: 4,
    name: "Statistical Relationship",
    description: "Correlations, distributions, trends, aggregates",
    falsifiabilityBase: 0.8,
    updateRate: 0.5,
    examples: ["CO2 and temperature have r=0.85 correlation", "GDP grew 2.3% in Q3 2023"],
  },
  observation: {
    level: 5,
    name: "Empirical Observation",
    description: "Measured values, documented events, reported facts",
    falsifiabilityBase: 0.9,
    updateRate: 0.7,
    examples: ["US unemployment was 3.7% in November 2023", "Hurricane struck Florida on Oct 15"],
  },
  data_point: {
    level: 6,
    name: "Data Point",
    description: "Raw data from primary sources, specific measurements",
    falsifiabilityBase: 0.95,
    updateRate: 0.9,
    examples: ["BLS release: 3.7% ±0.1%", "NOAA station reading: 421.08 ppm"],
  },
} as const;

export type GranularityLevel = keyof typeof GRANULARITY_LEVELS;

export interface DecomposedUnit {
  statement: string;
  granularityLevel: GranularityLevel;
  granularityConfidence: number;

  // Scope
  temporalScope: "timeless" | "era" | "period" | "recent" | "current" | "point";
  temporalSpecifics?: {
    startDate?: string;
    endDate?: string;
    referenceDate?: string;
    isProjection?: boolean;
  };
  spatialScope: "universal" | "global" | "regional" | "national" | "local" | "specific";
  spatialSpecifics?: {
    countries?: string[];
    regions?: string[];
    entities?: string[];
  };

  // Domain
  domains: string[];
  concepts: string[];

  // Measurability
  measurability: "quantitative" | "semi_quantitative" | "qualitative" | "conceptual";
  quantitativeData?: {
    value?: number;
    unit?: string;
    lowerBound?: number;
    upperBound?: number;
    confidenceInterval?: number;
  };

  // Epistemological
  falsifiabilityScore: number;
  falsifiabilityCriteria: {
    testableConditions: string[];
    observableIndicators: string[];
    timeframeForTest: string;
  };

  // Source
  excerpt: string;
  sourceAuthorityForLevel: number;
}

export interface ComparisonResult {
  comparabilityScore: number;
  comparabilityFactors: {
    temporalOverlap: number;
    spatialOverlap: number;
    conceptualOverlap: number;
    methodologicalSimilarity: number;
  };
  relationship: "agrees" | "contradicts" | "refines" | "unrelated";
  agreementScore: number; // -1 to +1
  contradictionType?: "factual" | "methodological" | "interpretive" | "scope";
  contradictionAnalysis?: {
    pointOfDivergence: string;
    possibleReasons: string[];
    resolutionPath: string;
  };
  netConfidenceImpact: number;
  impactExplanation: string;
}

export class InformationDecompositionService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  /**
   * Decompose a source item into atomic information units
   */
  async decomposeItem(
    item: FetchedItem,
    sourceCredibility: number,
    contentType: "foundational" | "current" | "research"
  ): Promise<DecomposedUnit[]> {
    const content = item.summary || item.content;
    if (!content || content.length < 100) {
      return [];
    }

    // Source authority varies by content type and granularity
    const sourceAuthorityByLevel = this.computeSourceAuthority(sourceCredibility, contentType);

    const prompt = `Decompose this content into atomic information units at different granularity levels.

CONTENT:
Title: ${item.title}
${item.publishedAt ? `Published: ${item.publishedAt.toISOString().split("T")[0]}` : ""}
${item.authors?.length ? `Authors: ${item.authors.join(", ")}` : ""}

${content.slice(0, 4000)}

---

GRANULARITY LEVELS (extract units at each applicable level):

L0 PARADIGM: Worldviews, fundamental assumptions
   - Falsifiability: Very low (requires paradigm shift)
   - Example: "Markets tend toward efficiency"

L1 THEORY: Causal models, explanatory frameworks
   - Falsifiability: Low (can accommodate anomalies)
   - Example: "Climate change is driven by GHG emissions"

L2 MECHANISM: How things work, causal pathways
   - Falsifiability: Moderate (testable pathways)
   - Example: "CO2 traps infrared radiation causing warming"

L3 CAUSAL_CLAIM: Specific if-then predictions
   - Falsifiability: Moderate-high (specific prediction)
   - Example: "If CO2 doubles, temperature rises 2-4°C"

L4 STATISTICAL: Correlations, trends, aggregates
   - Falsifiability: High (recomputable)
   - Example: "Global temperature rose 1.1°C since pre-industrial"

L5 OBSERVATION: Measured values, documented events
   - Falsifiability: Very high (verifiable)
   - Example: "2023 was the hottest year on record"

L6 DATA_POINT: Raw data with specific source
   - Falsifiability: Highest (primary source)
   - Example: "NOAA: 421.08 ppm CO2 on 2023-05-15"

---

For EACH information unit, extract:
1. statement: Clear, atomic statement (one claim only)
2. granularityLevel: paradigm/theory/mechanism/causal_claim/statistical/observation/data_point
3. granularityConfidence: 0-1 confidence in level classification
4. temporalScope: timeless/era/period/recent/current/point
5. temporalSpecifics: {startDate?, endDate?, referenceDate?, isProjection?}
6. spatialScope: universal/global/regional/national/local/specific
7. spatialSpecifics: {countries?, regions?, entities?}
8. domains: relevant domains (max 3)
9. concepts: key concepts mentioned (max 5)
10. measurability: quantitative/semi_quantitative/qualitative/conceptual
11. quantitativeData: {value?, unit?, lowerBound?, upperBound?} if applicable
12. falsifiabilityCriteria: {testableConditions[], observableIndicators[], timeframeForTest}
13. excerpt: EXACT quote from the text supporting this unit

IMPORTANT:
- Extract ATOMIC units (one claim per unit)
- Include the EXACT excerpt that supports each unit
- Be precise about scope (don't overgeneralize)
- For statistics, include confidence intervals if available
- Lower-level units are MORE VALUABLE for validation

Respond in JSON:
{
  "units": [
    {
      "statement": "...",
      "granularityLevel": "statistical",
      "granularityConfidence": 0.9,
      "temporalScope": "current",
      "temporalSpecifics": {"referenceDate": "2023-01-01"},
      "spatialScope": "global",
      "spatialSpecifics": {},
      "domains": ["climate"],
      "concepts": ["temperature", "warming"],
      "measurability": "quantitative",
      "quantitativeData": {"value": 1.1, "unit": "°C"},
      "falsifiabilityCriteria": {
        "testableConditions": ["Remeasure with different methodology"],
        "observableIndicators": ["Global mean surface temperature"],
        "timeframeForTest": "Immediate (historical data)"
      },
      "excerpt": "Global temperatures have risen 1.1°C above pre-industrial levels"
    }
  ]
}

Extract up to 15 units, prioritizing lower granularity levels (more falsifiable).`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return (parsed.units || []).map((unit: DecomposedUnit) => ({
            ...unit,
            falsifiabilityScore: this.computeFalsifiability(unit),
            sourceAuthorityForLevel: sourceAuthorityByLevel[unit.granularityLevel] || 0.5,
          }));
        }
      }
    } catch (error) {
      console.error("[Decomposition] Failed to decompose item:", error);
    }

    return [];
  }

  /**
   * Compare two information units at the same granularity level
   */
  async compareUnits(unitA: DecomposedUnit, unitB: DecomposedUnit): Promise<ComparisonResult> {
    // Check granularity match
    if (unitA.granularityLevel !== unitB.granularityLevel) {
      return {
        comparabilityScore: 0,
        comparabilityFactors: {
          temporalOverlap: 0,
          spatialOverlap: 0,
          conceptualOverlap: 0,
          methodologicalSimilarity: 0,
        },
        relationship: "unrelated",
        agreementScore: 0,
        netConfidenceImpact: 0,
        impactExplanation: "Units at different granularity levels cannot be directly compared",
      };
    }

    // Compute comparability factors
    const temporalOverlap = this.computeTemporalOverlap(unitA, unitB);
    const spatialOverlap = this.computeSpatialOverlap(unitA, unitB);
    const conceptualOverlap = this.computeConceptualOverlap(unitA, unitB);

    const comparabilityScore = (temporalOverlap + spatialOverlap + conceptualOverlap) / 3;

    // If not comparable enough, skip detailed comparison
    if (comparabilityScore < 0.3) {
      return {
        comparabilityScore,
        comparabilityFactors: {
          temporalOverlap,
          spatialOverlap,
          conceptualOverlap,
          methodologicalSimilarity: 0,
        },
        relationship: "unrelated",
        agreementScore: 0,
        netConfidenceImpact: 0,
        impactExplanation: "Units not comparable (different scope)",
      };
    }

    // Use LLM for detailed comparison
    const prompt = `Compare these two information units at the same granularity level.

UNIT A:
Statement: ${unitA.statement}
Level: ${unitA.granularityLevel}
Temporal: ${unitA.temporalScope} ${JSON.stringify(unitA.temporalSpecifics || {})}
Spatial: ${unitA.spatialScope} ${JSON.stringify(unitA.spatialSpecifics || {})}
Domains: ${unitA.domains.join(", ")}
${unitA.quantitativeData ? `Data: ${JSON.stringify(unitA.quantitativeData)}` : ""}
Excerpt: "${unitA.excerpt}"

UNIT B:
Statement: ${unitB.statement}
Level: ${unitB.granularityLevel}
Temporal: ${unitB.temporalScope} ${JSON.stringify(unitB.temporalSpecifics || {})}
Spatial: ${unitB.spatialScope} ${JSON.stringify(unitB.spatialSpecifics || {})}
Domains: ${unitB.domains.join(", ")}
${unitB.quantitativeData ? `Data: ${JSON.stringify(unitB.quantitativeData)}` : ""}
Excerpt: "${unitB.excerpt}"

---

Analyze:
1. Do these units address the same phenomenon?
2. Are they measuring/claiming the same thing?
3. Do they agree, contradict, or refine each other?

For CONTRADICTIONS, identify:
- Type: factual (different facts), methodological (different methods), interpretive (different framing), scope (different boundaries)
- Point of divergence
- Possible reasons for disagreement
- How to resolve

Respond in JSON:
{
  "relationship": "agrees|contradicts|refines|unrelated",
  "agreementScore": 0.8,  // -1 (strong contradiction) to +1 (strong agreement)
  "methodologicalSimilarity": 0.7,  // 0-1
  "contradictionType": "factual",  // if contradicts
  "contradictionAnalysis": {
    "pointOfDivergence": "...",
    "possibleReasons": ["..."],
    "resolutionPath": "..."
  },
  "explanation": "Brief explanation of the comparison"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Compute confidence impact based on agreement, comparability, and falsifiability
          const falsifiabilityWeight = (unitA.falsifiabilityScore + unitB.falsifiabilityScore) / 2;
          const netConfidenceImpact =
            parsed.agreementScore * comparabilityScore * falsifiabilityWeight * 0.1;

          return {
            comparabilityScore,
            comparabilityFactors: {
              temporalOverlap,
              spatialOverlap,
              conceptualOverlap,
              methodologicalSimilarity: parsed.methodologicalSimilarity || 0.5,
            },
            relationship: parsed.relationship,
            agreementScore: parsed.agreementScore,
            contradictionType: parsed.contradictionType,
            contradictionAnalysis: parsed.contradictionAnalysis,
            netConfidenceImpact,
            impactExplanation: parsed.explanation,
          };
        }
      }
    } catch (error) {
      console.error("[Decomposition] Comparison failed:", error);
    }

    return {
      comparabilityScore,
      comparabilityFactors: {
        temporalOverlap,
        spatialOverlap,
        conceptualOverlap,
        methodologicalSimilarity: 0.5,
      },
      relationship: "unrelated",
      agreementScore: 0,
      netConfidenceImpact: 0,
      impactExplanation: "Comparison failed",
    };
  }

  /**
   * Calculate recommended Bayesian update based on unit comparisons
   */
  calculateBayesianUpdate(
    priorConfidence: number,
    comparisons: ComparisonResult[],
    units: DecomposedUnit[]
  ): { posteriorConfidence: number; updateRationale: string } {
    if (comparisons.length === 0) {
      return { posteriorConfidence: priorConfidence, updateRationale: "No comparable units" };
    }

    // Weight updates by falsifiability (more falsifiable = stronger update)
    let totalImpact = 0;
    const impactsByLevel: Record<string, number[]> = {};

    for (let i = 0; i < comparisons.length; i++) {
      const comparison = comparisons[i];
      const unit = units[i];
      const level = unit?.granularityLevel || "statistical";

      if (!impactsByLevel[level]) impactsByLevel[level] = [];
      impactsByLevel[level].push(comparison.netConfidenceImpact);

      // Weight by falsifiability
      const levelInfo = GRANULARITY_LEVELS[level as GranularityLevel];
      const weight = levelInfo?.updateRate || 0.5;
      totalImpact += comparison.netConfidenceImpact * weight;
    }

    // Apply update with diminishing returns
    const updateMagnitude = Math.tanh(totalImpact); // Squash to [-1, 1]
    const posteriorConfidence = Math.max(0, Math.min(1, priorConfidence + updateMagnitude * 0.2));

    // Generate rationale
    const levelSummary = Object.entries(impactsByLevel)
      .map(([level, impacts]) => {
        const avg = impacts.reduce((a, b) => a + b, 0) / impacts.length;
        return `${level}: ${avg > 0 ? "+" : ""}${(avg * 100).toFixed(1)}%`;
      })
      .join(", ");

    return {
      posteriorConfidence,
      updateRationale: `Update from ${comparisons.length} comparisons. By level: ${levelSummary}. ` +
        `Prior: ${(priorConfidence * 100).toFixed(1)}% → Posterior: ${(posteriorConfidence * 100).toFixed(1)}%`,
    };
  }

  /**
   * Compute falsifiability score for a unit
   */
  private computeFalsifiability(unit: DecomposedUnit): number {
    const levelInfo = GRANULARITY_LEVELS[unit.granularityLevel];
    let score = levelInfo?.falsifiabilityBase || 0.5;

    // Adjust for measurability
    if (unit.measurability === "quantitative") score += 0.1;
    if (unit.measurability === "conceptual") score -= 0.1;

    // Adjust for temporal specificity
    if (unit.temporalScope === "point") score += 0.05;
    if (unit.temporalScope === "timeless") score -= 0.05;

    // Adjust for spatial specificity
    if (unit.spatialScope === "specific") score += 0.05;
    if (unit.spatialScope === "universal") score -= 0.05;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Compute source authority by granularity level
   * Some sources are authoritative for data but not theories
   */
  private computeSourceAuthority(
    baseCredibility: number,
    contentType: "foundational" | "current" | "research"
  ): Record<GranularityLevel, number> {
    // Research sources are better for theories and mechanisms
    // Data portals are better for statistics and data points
    // Current sources are better for recent observations

    const modifiers: Record<string, Record<GranularityLevel, number>> = {
      foundational: {
        paradigm: 0.8,
        theory: 0.9,
        mechanism: 0.8,
        causal_claim: 0.7,
        statistical: 0.6,
        observation: 0.5,
        data_point: 0.4,
      },
      current: {
        paradigm: 0.3,
        theory: 0.4,
        mechanism: 0.5,
        causal_claim: 0.6,
        statistical: 0.8,
        observation: 0.9,
        data_point: 0.7,
      },
      research: {
        paradigm: 0.6,
        theory: 0.8,
        mechanism: 0.9,
        causal_claim: 0.8,
        statistical: 0.7,
        observation: 0.6,
        data_point: 0.5,
      },
    };

    const mods = modifiers[contentType] || modifiers.current;
    const result: Record<string, number> = {};

    for (const level of Object.keys(GRANULARITY_LEVELS)) {
      result[level] = baseCredibility * (mods[level as GranularityLevel] || 0.5);
    }

    return result as Record<GranularityLevel, number>;
  }

  private computeTemporalOverlap(unitA: DecomposedUnit, unitB: DecomposedUnit): number {
    // Same temporal scope = high overlap
    if (unitA.temporalScope === unitB.temporalScope) {
      return 0.8;
    }

    // Adjacent scopes = moderate overlap
    const scopes = ["timeless", "era", "period", "recent", "current", "point"];
    const idxA = scopes.indexOf(unitA.temporalScope);
    const idxB = scopes.indexOf(unitB.temporalScope);
    const distance = Math.abs(idxA - idxB);

    if (distance === 1) return 0.6;
    if (distance === 2) return 0.3;
    return 0.1;
  }

  private computeSpatialOverlap(unitA: DecomposedUnit, unitB: DecomposedUnit): number {
    // Same spatial scope = high overlap
    if (unitA.spatialScope === unitB.spatialScope) {
      return 0.8;
    }

    // Check for containment (global contains regional contains national)
    const scopes = ["universal", "global", "regional", "national", "local", "specific"];
    const idxA = scopes.indexOf(unitA.spatialScope);
    const idxB = scopes.indexOf(unitB.spatialScope);
    const distance = Math.abs(idxA - idxB);

    if (distance === 1) return 0.6;
    if (distance === 2) return 0.3;
    return 0.1;
  }

  private computeConceptualOverlap(unitA: DecomposedUnit, unitB: DecomposedUnit): number {
    // Compute Jaccard similarity of concepts and domains
    const conceptsA = new Set([...unitA.concepts, ...unitA.domains]);
    const conceptsB = new Set([...unitB.concepts, ...unitB.domains]);

    if (conceptsA.size === 0 || conceptsB.size === 0) return 0.5;

    const intersection = [...conceptsA].filter((c) => conceptsB.has(c)).length;
    const union = new Set([...conceptsA, ...conceptsB]).size;

    return intersection / union;
  }
}

// Singleton
let service: InformationDecompositionService | null = null;

export function getInformationDecompositionService(): InformationDecompositionService {
  if (!service) {
    service = new InformationDecompositionService();
  }
  return service;
}
