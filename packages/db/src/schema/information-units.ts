import { jsonb, pgEnum, pgTable, text, timestamp, real, integer } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";

/**
 * Information Units Schema
 *
 * Decomposes source content into atomic, comparable units at defined granularity levels.
 * Enables proper triangulation, cross-validation, and adversarial testing by comparing
 * information at the same abstraction level.
 *
 * Key insight: Article-to-article comparison is weak because articles mix granularity levels.
 * Decomposition allows comparing data points to data points, causal claims to causal claims, etc.
 */

// Granularity levels from most abstract (0) to most concrete (6)
export const granularityLevelEnum = pgEnum("granularity_level", [
  "paradigm",      // L0: Worldviews, fundamental assumptions
  "theory",        // L1: Causal models, frameworks
  "mechanism",     // L2: How things work, pathways
  "causal_claim",  // L3: If-then predictions
  "statistical",   // L4: Correlations, distributions
  "observation",   // L5: Measured values, events
  "data_point",    // L6: Raw data with source
]);

// Temporal scope of the claim
export const temporalScopeEnum = pgEnum("temporal_scope", [
  "timeless",      // Universal laws, definitions
  "era",           // Decades to centuries
  "period",        // Years to decades
  "recent",        // Months to years
  "current",       // Days to months
  "point",         // Specific moment
]);

// Spatial scope of the claim
export const spatialScopeEnum = pgEnum("spatial_scope", [
  "universal",     // Applies everywhere
  "global",        // Worldwide
  "regional",      // Continent/region
  "national",      // Single country
  "local",         // City/area
  "specific",      // Specific location/entity
]);

// Measurability of the claim
export const measurabilityEnum = pgEnum("measurability", [
  "quantitative",      // Numeric, precise
  "semi_quantitative", // Ranges, ordinal scales
  "qualitative",       // Descriptive, categorical
  "conceptual",        // Abstract, definitional
]);

// Information units extracted from sources
export const informationUnits = pgTable("information_units", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // Source attribution
  sourceId: text("source_id").notNull(),      // Managed source ID
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  itemUrl: text("item_url").notNull(),        // Specific article/page
  itemTitle: text("item_title").notNull(),
  excerpt: text("excerpt").notNull(),         // Verbatim quote supporting this unit

  // Granularity classification
  granularityLevel: granularityLevelEnum("granularity_level").notNull(),
  granularityConfidence: real("granularity_confidence").notNull().default(0.8),

  // The information unit itself
  statement: text("statement").notNull(),     // Normalized statement of the unit
  statementHash: text("statement_hash").notNull(), // For deduplication

  // Scope dimensions (affects comparability)
  temporalScope: temporalScopeEnum("temporal_scope").notNull(),
  temporalSpecifics: jsonb("temporal_specifics").$type<{
    startDate?: string;
    endDate?: string;
    referenceDate?: string;
    isProjection?: boolean;
  }>(),

  spatialScope: spatialScopeEnum("spatial_scope").notNull(),
  spatialSpecifics: jsonb("spatial_specifics").$type<{
    countries?: string[];
    regions?: string[];
    entities?: string[];
  }>(),

  // Domain/topic
  domains: jsonb("domains").$type<string[]>().notNull().default([]),
  concepts: jsonb("concepts").$type<string[]>().notNull().default([]), // Key concepts mentioned

  // Measurability
  measurability: measurabilityEnum("measurability").notNull(),
  quantitativeData: jsonb("quantitative_data").$type<{
    value?: number;
    unit?: string;
    lowerBound?: number;
    upperBound?: number;
    confidenceInterval?: number;
    sampleSize?: number;
  }>(),

  // Epistemological properties
  falsifiabilityScore: real("falsifiability_score").notNull(), // 0-1, higher = easier to falsify
  falsifiabilityCriteria: jsonb("falsifiability_criteria").$type<{
    testableConditions: string[];    // What would prove/disprove this
    observableIndicators: string[];  // What to measure
    timeframeForTest: string;        // When we'd know
  }>(),

  // For Bayesian updates
  priorConfidence: real("prior_confidence").notNull().default(0.5),
  currentConfidence: real("current_confidence").notNull().default(0.5),
  updateCount: integer("update_count").notNull().default(0),

  // Source credibility at this granularity level
  // (Some sources are authoritative for data but not for theories)
  sourceAuthorityForLevel: real("source_authority_for_level").notNull(),

  // Links
  issueId: text("issue_id").references(() => issues.id),
  parentUnitId: text("parent_unit_id"), // Higher-level unit this supports/derives from
  derivedFromUnits: jsonb("derived_from_units").$type<string[]>().default([]), // Lower-level units this is based on
});

// Cross-validation comparisons between units at the same granularity
export const unitComparisons = pgTable("unit_comparisons", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // The two units being compared (must be same granularity level)
  unitAId: text("unit_a_id").notNull().references(() => informationUnits.id),
  unitBId: text("unit_b_id").notNull().references(() => informationUnits.id),
  granularityLevel: granularityLevelEnum("granularity_level").notNull(),

  // Comparability assessment
  comparabilityScore: real("comparability_score").notNull(), // 0-1, how comparable are they
  comparabilityFactors: jsonb("comparability_factors").$type<{
    temporalOverlap: number;    // 0-1
    spatialOverlap: number;     // 0-1
    conceptualOverlap: number;  // 0-1
    methodologicalSimilarity: number; // 0-1
  }>(),

  // Comparison result
  relationship: text("relationship").notNull(), // agrees, contradicts, refines, unrelated
  agreementScore: real("agreement_score").notNull(), // -1 (contradicts) to +1 (agrees)

  // For contradictions
  contradictionType: text("contradiction_type"), // factual, methodological, interpretive, scope
  contradictionAnalysis: jsonb("contradiction_analysis").$type<{
    pointOfDivergence: string;
    possibleReasons: string[];
    resolutionPath: string;
  }>(),

  // Confidence impact
  netConfidenceImpact: real("net_confidence_impact").notNull(), // How much this comparison affects confidence
  impactExplanation: text("impact_explanation"),
});

// Aggregated consistency scores across units supporting a claim
export const claimConsistency = pgTable("claim_consistency", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // The claim being assessed (could be an issue, causal claim, or information unit)
  entityType: text("entity_type").notNull(), // issue, causal_claim, information_unit
  entityId: text("entity_id").notNull(),

  // Units supporting this claim, by granularity level
  supportByLevel: jsonb("support_by_level").$type<{
    [level: string]: {
      unitCount: number;
      sourceCount: number;
      avgConfidence: number;
      agreementRate: number; // % of unit pairs that agree
      contradictionCount: number;
    };
  }>(),

  // Overall consistency metrics
  overallConsistency: real("overall_consistency").notNull(), // 0-1
  weightedConsistency: real("weighted_consistency").notNull(), // Weighted by falsifiability

  // Strongest support and challenges
  strongestSupport: jsonb("strongest_support").$type<{
    unitId: string;
    level: string;
    confidence: number;
    reason: string;
  }[]>(),

  strongestChallenges: jsonb("strongest_challenges").$type<{
    unitId: string;
    level: string;
    contradictionType: string;
    impact: number;
    reason: string;
  }[]>(),

  // Recommended Bayesian update
  recommendedConfidenceUpdate: real("recommended_confidence_update"),
  updateRationale: text("update_rationale"),
});

export type InformationUnitRow = typeof informationUnits.$inferSelect;
export type NewInformationUnitRow = typeof informationUnits.$inferInsert;
export type UnitComparisonRow = typeof unitComparisons.$inferSelect;
export type NewUnitComparisonRow = typeof unitComparisons.$inferInsert;
export type ClaimConsistencyRow = typeof claimConsistency.$inferSelect;
export type NewClaimConsistencyRow = typeof claimConsistency.$inferInsert;
