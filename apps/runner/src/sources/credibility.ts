/**
 * Source Credibility Framework
 *
 * Evaluates sources for:
 * - Factual reliability
 * - Incentive structures that may bias reporting
 * - Statistical verifiability
 * - Independence from manipulative interests
 * - Anti-bias dimensions for true utility
 */

import { SourceHealthRepository, type Database } from "@orbit/db";

export interface IncentiveProfile {
  type: "commercial" | "political" | "ideological" | "academic" | "governmental" | "nonprofit" | "independent";
  fundingSources?: string[];
  potentialConflicts?: string[];
  advertisingModel?: boolean;
  engagementOptimized?: boolean;
}

export interface AccessibilityProfile {
  access: "public" | "freemium" | "registration" | "paywall" | "restricted";
  rateLimit?: "none" | "low" | "moderate" | "strict";
  apiAvailable?: boolean;
  robotsAllowed?: boolean;
  notes?: string;
}

/**
 * Anti-Bias Metrics
 * These metrics specifically measure how resistant a source is to various forms of bias.
 * Higher scores = more debiased/neutral.
 */
export interface AntiBiasMetrics {
  // Independence from pressure (0-1)
  independenceScore: number;        // Freedom from commercial/political pressure

  // Transparency about potential biases (0-1)
  ideologicalTransparency: number;  // Does it disclose its ideological stance?
  fundingTransparency: number;      // Does it disclose funding sources?
  conflictDisclosure: number;       // Does it disclose conflicts of interest?

  // Structural anti-bias measures (0-1)
  perspectiveDiversity: number;     // Does it represent multiple viewpoints?
  geographicNeutrality: number;     // Does it avoid geographic/cultural bias?
  temporalNeutrality: number;       // Does it avoid recency bias?

  // Data integrity (0-1)
  selectionBiasResistance: number;  // Does it avoid cherry-picking?
  quantificationBias: number;       // Does it acknowledge unmeasurable factors?
}

export interface SourceCredibility {
  // Core reliability scores (0-1)
  factualAccuracy: number;        // Track record of accurate reporting
  sourceCitation: number;         // Does it cite primary sources?
  methodologyTransparency: number; // Are methods/data collection explained?
  correctionPolicy: number;       // Does it issue corrections?

  // Incentive analysis
  incentiveProfile: IncentiveProfile;
  independenceScore: number;      // Freedom from commercial/political pressure

  // Anti-bias metrics
  antiBias: AntiBiasMetrics;

  // Verification potential
  statisticalVerifiability: number; // Can claims be verified with data?
  crossReferenceability: number;    // Can it be checked against other sources?

  // Composite scores
  overallCredibility: number;     // Traditional weighted score
  debiasedScore: number;          // Anti-bias weighted score (prioritizes independence)
  confidenceInAssessment: number;

  // Flags
  flags: CredibilityFlag[];
}

export interface CredibilityFlag {
  type: "warning" | "caution" | "info";
  category: "incentive" | "accuracy" | "methodology" | "transparency" | "verification";
  message: string;
}

/**
 * Anti-bias profile defaults by source type
 * These represent baseline expectations for different source categories
 */
export const ANTI_BIAS_DEFAULTS: Record<IncentiveProfile["type"], Partial<AntiBiasMetrics>> = {
  academic: {
    ideologicalTransparency: 0.8,
    fundingTransparency: 0.85,
    conflictDisclosure: 0.8,
    perspectiveDiversity: 0.7,
    geographicNeutrality: 0.6,  // Western academic bias
    temporalNeutrality: 0.7,
    selectionBiasResistance: 0.6,  // Publication bias
    quantificationBias: 0.7,
  },
  governmental: {
    ideologicalTransparency: 0.4,  // Often doesn't disclose political influence
    fundingTransparency: 0.9,      // Public funding is transparent
    conflictDisclosure: 0.5,
    perspectiveDiversity: 0.4,     // Single government viewpoint
    geographicNeutrality: 0.3,     // National interest bias
    temporalNeutrality: 0.6,
    selectionBiasResistance: 0.5,
    quantificationBias: 0.8,       // Good at data collection
  },
  nonprofit: {
    ideologicalTransparency: 0.7,
    fundingTransparency: 0.8,
    conflictDisclosure: 0.7,
    perspectiveDiversity: 0.6,
    geographicNeutrality: 0.5,
    temporalNeutrality: 0.7,
    selectionBiasResistance: 0.6,
    quantificationBias: 0.7,
  },
  commercial: {
    ideologicalTransparency: 0.3,
    fundingTransparency: 0.4,
    conflictDisclosure: 0.3,
    perspectiveDiversity: 0.5,
    geographicNeutrality: 0.4,
    temporalNeutrality: 0.4,  // Recency/engagement bias
    selectionBiasResistance: 0.3,
    quantificationBias: 0.5,
  },
  political: {
    ideologicalTransparency: 0.6,  // Often explicit about stance
    fundingTransparency: 0.5,
    conflictDisclosure: 0.3,
    perspectiveDiversity: 0.2,
    geographicNeutrality: 0.3,
    temporalNeutrality: 0.3,
    selectionBiasResistance: 0.2,
    quantificationBias: 0.4,
  },
  ideological: {
    ideologicalTransparency: 0.7,  // Usually explicit
    fundingTransparency: 0.5,
    conflictDisclosure: 0.4,
    perspectiveDiversity: 0.2,
    geographicNeutrality: 0.4,
    temporalNeutrality: 0.5,
    selectionBiasResistance: 0.2,
    quantificationBias: 0.5,
  },
  independent: {
    ideologicalTransparency: 0.5,
    fundingTransparency: 0.5,
    conflictDisclosure: 0.5,
    perspectiveDiversity: 0.5,
    geographicNeutrality: 0.5,
    temporalNeutrality: 0.5,
    selectionBiasResistance: 0.5,
    quantificationBias: 0.5,
  },
};

// Known source profiles - curated list of evaluated sources
export const SOURCE_PROFILES: Record<string, Partial<SourceCredibility>> = {
  // ============================================
  // ACADEMIC/RESEARCH - Generally high credibility
  // ============================================
  "arxiv.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    independenceScore: 0.9,
    statisticalVerifiability: 0.85,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.9,
      ideologicalTransparency: 0.85,
      fundingTransparency: 0.9,
      conflictDisclosure: 0.85,
      perspectiveDiversity: 0.8,      // Open to all researchers
      geographicNeutrality: 0.65,     // Some Western bias
      temporalNeutrality: 0.75,
      selectionBiasResistance: 0.85,  // No publication bias - accepts all
      quantificationBias: 0.8,
    },
    flags: [{ type: "info", category: "methodology", message: "Preprints - not peer reviewed" }],
  },
  "nature.com": {
    factualAccuracy: 0.95,
    sourceCitation: 0.95,
    methodologyTransparency: 0.95,
    correctionPolicy: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "academic", advertisingModel: false },
    antiBias: {
      independenceScore: 0.85,
      ideologicalTransparency: 0.8,
      fundingTransparency: 0.9,
      conflictDisclosure: 0.9,
      perspectiveDiversity: 0.6,      // Favors established researchers
      geographicNeutrality: 0.5,      // UK/Western bias
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.5,   // Significant publication bias
      quantificationBias: 0.75,
    },
  },
  "sciencedirect.com": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.85,
      ideologicalTransparency: 0.8,
      fundingTransparency: 0.85,
      conflictDisclosure: 0.85,
      perspectiveDiversity: 0.65,
      geographicNeutrality: 0.55,
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.55,
      quantificationBias: 0.75,
    },
  },
  "nber.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.9,
    independenceScore: 0.8,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.8,
      ideologicalTransparency: 0.75,
      fundingTransparency: 0.85,
      conflictDisclosure: 0.8,
      perspectiveDiversity: 0.55,     // US economics mainstream
      geographicNeutrality: 0.4,      // US-centric
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.7,
      quantificationBias: 0.65,       // Quantitative economics bias
    },
    flags: [{ type: "info", category: "methodology", message: "Working papers - not peer reviewed but high quality" }],
  },
  "ssrn.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.9,
    methodologyTransparency: 0.8,
    independenceScore: 0.85,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.85,
      ideologicalTransparency: 0.8,
      fundingTransparency: 0.8,
      conflictDisclosure: 0.75,
      perspectiveDiversity: 0.75,     // Open platform
      geographicNeutrality: 0.6,
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.8,   // Low barrier to entry
      quantificationBias: 0.7,
    },
    flags: [{ type: "info", category: "methodology", message: "Preprints - quality varies by paper" }],
  },
  "scholar.google.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.95,
    independenceScore: 0.9,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.9,
      ideologicalTransparency: 0.85,
      fundingTransparency: 0.8,
      conflictDisclosure: 0.75,
      perspectiveDiversity: 0.85,     // Indexes everything
      geographicNeutrality: 0.7,
      temporalNeutrality: 0.8,
      selectionBiasResistance: 0.85,  // No editorial selection
      quantificationBias: 0.7,
    },
    flags: [{ type: "info", category: "accuracy", message: "Aggregator - quality depends on source papers" }],
  },
  "pubmed.ncbi.nlm.nih.gov": {
    factualAccuracy: 0.95,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    independenceScore: 0.9,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.9,
      ideologicalTransparency: 0.85,
      fundingTransparency: 0.9,
      conflictDisclosure: 0.9,
      perspectiveDiversity: 0.7,
      geographicNeutrality: 0.55,     // English-language bias
      temporalNeutrality: 0.8,
      selectionBiasResistance: 0.7,
      quantificationBias: 0.75,
    },
  },
  "jstor.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.85,
    independenceScore: 0.9,
    incentiveProfile: { type: "academic" },
    antiBias: {
      independenceScore: 0.9,
      ideologicalTransparency: 0.8,
      fundingTransparency: 0.85,
      conflictDisclosure: 0.8,
      perspectiveDiversity: 0.75,
      geographicNeutrality: 0.6,
      temporalNeutrality: 0.85,       // Historical archive - good temporal coverage
      selectionBiasResistance: 0.65,
      quantificationBias: 0.8,
    },
  },

  // ============================================
  // GOVERNMENT/STATISTICAL - High for data
  // ============================================
  "census.gov": {
    factualAccuracy: 0.95,
    sourceCitation: 0.9,
    methodologyTransparency: 0.95,
    statisticalVerifiability: 0.95,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },
    antiBias: {
      independenceScore: 0.75,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.95,
      conflictDisclosure: 0.6,
      perspectiveDiversity: 0.5,
      geographicNeutrality: 0.2,      // US only
      temporalNeutrality: 0.8,
      selectionBiasResistance: 0.85,  // Comprehensive data collection
      quantificationBias: 0.9,
    },
    flags: [{ type: "info", category: "incentive", message: "Government source - may reflect policy priorities" }],
  },
  "bls.gov": {
    factualAccuracy: 0.95,
    statisticalVerifiability: 0.95,
    methodologyTransparency: 0.95,
    independenceScore: 0.8,
    incentiveProfile: { type: "governmental" },
    antiBias: {
      independenceScore: 0.8,
      ideologicalTransparency: 0.6,
      fundingTransparency: 0.95,
      conflictDisclosure: 0.65,
      perspectiveDiversity: 0.55,
      geographicNeutrality: 0.2,      // US only
      temporalNeutrality: 0.85,
      selectionBiasResistance: 0.9,   // Systematic data collection
      quantificationBias: 0.9,
    },
  },
  "fred.stlouisfed.org": {
    factualAccuracy: 0.95,
    sourceCitation: 0.9,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.95,
    independenceScore: 0.8,
    incentiveProfile: { type: "governmental" },
    antiBias: {
      independenceScore: 0.8,
      ideologicalTransparency: 0.55,
      fundingTransparency: 0.95,
      conflictDisclosure: 0.6,
      perspectiveDiversity: 0.5,
      geographicNeutrality: 0.3,      // Primarily US data
      temporalNeutrality: 0.9,        // Excellent historical data
      selectionBiasResistance: 0.85,
      quantificationBias: 0.9,
    },
  },
  "data.gov": {
    factualAccuracy: 0.9,
    methodologyTransparency: 0.85,
    statisticalVerifiability: 0.9,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },
    antiBias: {
      independenceScore: 0.75,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.95,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.45,
      geographicNeutrality: 0.2,
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.75,
      quantificationBias: 0.85,
    },
  },
  "cdc.gov": {
    factualAccuracy: 0.9,
    sourceCitation: 0.85,
    methodologyTransparency: 0.85,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental" },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.4,   // Public health messaging priorities
      fundingTransparency: 0.9,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.4,
      geographicNeutrality: 0.25,
      temporalNeutrality: 0.6,
      selectionBiasResistance: 0.6,
      quantificationBias: 0.85,
    },
    flags: [{ type: "info", category: "incentive", message: "Public health agency - may prioritize messaging over nuance" }],
  },
  "who.int": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    methodologyTransparency: 0.8,
    independenceScore: 0.65,
    incentiveProfile: { type: "governmental", potentialConflicts: ["member state politics", "funding pressures"] },
    antiBias: {
      independenceScore: 0.65,
      ideologicalTransparency: 0.35,
      fundingTransparency: 0.75,
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.55,     // International but political
      geographicNeutrality: 0.65,     // Better than single-country
      temporalNeutrality: 0.6,
      selectionBiasResistance: 0.5,
      quantificationBias: 0.75,
    },
    flags: [{ type: "caution", category: "incentive", message: "International org - subject to political pressures" }],
  },

  // ============================================
  // INTERNATIONAL DATA ORGANIZATIONS
  // ============================================
  "data.worldbank.org": {
    factualAccuracy: 0.9,
    statisticalVerifiability: 0.9,
    methodologyTransparency: 0.85,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental", potentialConflicts: ["development lending priorities"] },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.85,
      conflictDisclosure: 0.5,
      perspectiveDiversity: 0.55,
      geographicNeutrality: 0.75,     // Good global coverage
      temporalNeutrality: 0.8,
      selectionBiasResistance: 0.7,
      quantificationBias: 0.85,
    },
  },
  "worldbank.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    methodologyTransparency: 0.8,
    independenceScore: 0.65,
    incentiveProfile: { type: "governmental", potentialConflicts: ["development lending priorities"] },
    antiBias: {
      independenceScore: 0.65,
      ideologicalTransparency: 0.4,   // Pro-market development ideology
      fundingTransparency: 0.8,
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.45,
      geographicNeutrality: 0.6,
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.55,
      quantificationBias: 0.75,
    },
  },
  "data.oecd.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.85,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.9,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },
    antiBias: {
      independenceScore: 0.75,
      ideologicalTransparency: 0.55,
      fundingTransparency: 0.9,
      conflictDisclosure: 0.6,
      perspectiveDiversity: 0.5,
      geographicNeutrality: 0.5,      // Developed country bias
      temporalNeutrality: 0.85,
      selectionBiasResistance: 0.8,
      quantificationBias: 0.9,
    },
  },
  "oecd.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.85,
    methodologyTransparency: 0.85,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental", potentialConflicts: ["member country interests"] },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.85,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.45,
      geographicNeutrality: 0.4,      // Rich country club
      temporalNeutrality: 0.75,
      selectionBiasResistance: 0.65,
      quantificationBias: 0.8,
    },
  },
  "imf.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    methodologyTransparency: 0.8,
    independenceScore: 0.6,
    incentiveProfile: { type: "governmental", potentialConflicts: ["creditor nation priorities", "austerity ideology"] },
    antiBias: {
      independenceScore: 0.6,
      ideologicalTransparency: 0.35,  // Austerity ideology often implicit
      fundingTransparency: 0.8,
      conflictDisclosure: 0.4,
      perspectiveDiversity: 0.3,      // Single economic paradigm
      geographicNeutrality: 0.4,      // Creditor nation perspective
      temporalNeutrality: 0.6,
      selectionBiasResistance: 0.5,
      quantificationBias: 0.7,
    },
    flags: [{ type: "caution", category: "incentive", message: "May reflect creditor nation and institutional biases" }],
  },

  // ============================================
  // HIGH-QUALITY RESEARCH ORGANIZATIONS
  // ============================================
  "ourworldindata.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.95,
    statisticalVerifiability: 0.9,
    crossReferenceability: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "nonprofit" },
    antiBias: {
      independenceScore: 0.85,
      ideologicalTransparency: 0.9,   // Very transparent about methods
      fundingTransparency: 0.95,
      conflictDisclosure: 0.9,
      perspectiveDiversity: 0.75,
      geographicNeutrality: 0.8,      // Good global coverage
      temporalNeutrality: 0.85,       // Historical data emphasis
      selectionBiasResistance: 0.8,
      quantificationBias: 0.7,        // Acknowledges data limitations
    },
  },
  "gapminder.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.9,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "nonprofit" },
    antiBias: {
      independenceScore: 0.85,
      ideologicalTransparency: 0.9,
      fundingTransparency: 0.9,
      conflictDisclosure: 0.85,
      perspectiveDiversity: 0.7,
      geographicNeutrality: 0.85,     // Explicitly global focus
      temporalNeutrality: 0.9,        // Strong historical emphasis
      selectionBiasResistance: 0.75,
      quantificationBias: 0.65,       // Some positivist bias acknowledged
    },
  },
  "pewresearch.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.9,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.85,
    independenceScore: 0.8,
    incentiveProfile: { type: "nonprofit" },
    antiBias: {
      independenceScore: 0.8,
      ideologicalTransparency: 0.85,
      fundingTransparency: 0.9,
      conflictDisclosure: 0.85,
      perspectiveDiversity: 0.7,
      geographicNeutrality: 0.45,     // US-focused
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.75,
      quantificationBias: 0.75,
    },
  },
  "rand.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.9,
    methodologyTransparency: 0.85,
    independenceScore: 0.65,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["government/defense contracts"] },
    antiBias: {
      independenceScore: 0.65,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.7,
      conflictDisclosure: 0.5,
      perspectiveDiversity: 0.45,     // Defense establishment perspective
      geographicNeutrality: 0.35,     // US national interest
      temporalNeutrality: 0.6,
      selectionBiasResistance: 0.55,
      quantificationBias: 0.65,
    },
    flags: [{ type: "caution", category: "incentive", message: "Significant government/defense funding may influence focus" }],
  },

  // ============================================
  // THINK TANKS - Varying credibility
  // ============================================
  "brookings.edu": {
    factualAccuracy: 0.8,
    sourceCitation: 0.85,
    methodologyTransparency: 0.75,
    independenceScore: 0.6,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["center-left policy advocacy"] },
    antiBias: {
      independenceScore: 0.6,
      ideologicalTransparency: 0.65,  // Somewhat disclosed
      fundingTransparency: 0.7,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.4,      // Center-left perspective
      geographicNeutrality: 0.35,
      temporalNeutrality: 0.6,
      selectionBiasResistance: 0.4,   // Topic selection reflects ideology
      quantificationBias: 0.6,
    },
    flags: [{ type: "caution", category: "incentive", message: "Think tank with policy advocacy goals" }],
  },
  "aei.org": {
    factualAccuracy: 0.75,
    sourceCitation: 0.8,
    independenceScore: 0.5,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["conservative/free-market advocacy"] },
    antiBias: {
      independenceScore: 0.5,
      ideologicalTransparency: 0.7,   // Fairly open about ideology
      fundingTransparency: 0.55,
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.25,
      geographicNeutrality: 0.3,
      temporalNeutrality: 0.5,
      selectionBiasResistance: 0.3,
      quantificationBias: 0.5,
    },
    flags: [{ type: "caution", category: "incentive", message: "Conservative think tank - ideological framing" }],
  },
  "heritage.org": {
    factualAccuracy: 0.7,
    sourceCitation: 0.75,
    independenceScore: 0.5,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["conservative policy advocacy"] },
    antiBias: {
      independenceScore: 0.5,
      ideologicalTransparency: 0.75,  // Very open about ideology
      fundingTransparency: 0.5,
      conflictDisclosure: 0.4,
      perspectiveDiversity: 0.15,     // Strongly conservative
      geographicNeutrality: 0.25,
      temporalNeutrality: 0.4,
      selectionBiasResistance: 0.2,
      quantificationBias: 0.45,
    },
    flags: [{ type: "warning", category: "incentive", message: "Strong ideological orientation may bias analysis" }],
  },
  "cato.org": {
    factualAccuracy: 0.75,
    sourceCitation: 0.8,
    independenceScore: 0.55,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["libertarian ideology"] },
    antiBias: {
      independenceScore: 0.55,
      ideologicalTransparency: 0.8,   // Very explicit about libertarian stance
      fundingTransparency: 0.6,
      conflictDisclosure: 0.5,
      perspectiveDiversity: 0.2,
      geographicNeutrality: 0.35,
      temporalNeutrality: 0.55,
      selectionBiasResistance: 0.3,
      quantificationBias: 0.55,
    },
    flags: [{ type: "caution", category: "incentive", message: "Libertarian think tank - consistent ideological lens" }],
  },
  "urban.org": {
    factualAccuracy: 0.8,
    sourceCitation: 0.85,
    methodologyTransparency: 0.8,
    independenceScore: 0.7,
    incentiveProfile: { type: "nonprofit" },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.7,
      fundingTransparency: 0.75,
      conflictDisclosure: 0.65,
      perspectiveDiversity: 0.5,
      geographicNeutrality: 0.35,     // US urban focus
      temporalNeutrality: 0.65,
      selectionBiasResistance: 0.55,
      quantificationBias: 0.7,
    },
  },

  // ============================================
  // WIRE SERVICES - Generally factual
  // ============================================
  "reuters.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    correctionPolicy: 0.85,
    independenceScore: 0.75,
    incentiveProfile: { type: "commercial", advertisingModel: true },
    antiBias: {
      independenceScore: 0.75,
      ideologicalTransparency: 0.7,
      fundingTransparency: 0.65,
      conflictDisclosure: 0.6,
      perspectiveDiversity: 0.7,      // Wire service - multiple perspectives
      geographicNeutrality: 0.7,      // Global reach
      temporalNeutrality: 0.5,        // Breaking news focus
      selectionBiasResistance: 0.65,
      quantificationBias: 0.65,
    },
  },
  "apnews.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    correctionPolicy: 0.85,
    independenceScore: 0.8,
    incentiveProfile: { type: "nonprofit" },
    antiBias: {
      independenceScore: 0.8,
      ideologicalTransparency: 0.75,
      fundingTransparency: 0.8,
      conflictDisclosure: 0.7,
      perspectiveDiversity: 0.75,     // Cooperative model
      geographicNeutrality: 0.6,      // US-headquartered but global
      temporalNeutrality: 0.5,
      selectionBiasResistance: 0.7,
      quantificationBias: 0.6,
    },
  },
  "afp.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },  // French government affiliated
    antiBias: {
      independenceScore: 0.75,
      ideologicalTransparency: 0.6,
      fundingTransparency: 0.75,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.65,
      geographicNeutrality: 0.65,     // European/Francophone perspective
      temporalNeutrality: 0.5,
      selectionBiasResistance: 0.6,
      quantificationBias: 0.6,
    },
  },

  // ============================================
  // QUALITY NEWSPAPERS - Good but watch for bias
  // ============================================
  "nytimes.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    correctionPolicy: 0.85,
    independenceScore: 0.65,
    incentiveProfile: { type: "commercial", advertisingModel: true, potentialConflicts: ["center-left editorial stance"] },
    antiBias: {
      independenceScore: 0.65,
      ideologicalTransparency: 0.55,  // Editorial stance not always clear
      fundingTransparency: 0.6,
      conflictDisclosure: 0.5,
      perspectiveDiversity: 0.45,
      geographicNeutrality: 0.4,      // US East Coast perspective
      temporalNeutrality: 0.45,       // News cycle driven
      selectionBiasResistance: 0.4,
      quantificationBias: 0.55,
    },
    flags: [{ type: "info", category: "incentive", message: "Editorial stance may influence story selection and framing" }],
  },
  "washingtonpost.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    correctionPolicy: 0.8,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", advertisingModel: true, potentialConflicts: ["owner: Jeff Bezos/Amazon"] },
    antiBias: {
      independenceScore: 0.6,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.5,       // Ownership conflict
      conflictDisclosure: 0.4,
      perspectiveDiversity: 0.45,
      geographicNeutrality: 0.35,     // DC-centric
      temporalNeutrality: 0.4,
      selectionBiasResistance: 0.4,
      quantificationBias: 0.5,
    },
    flags: [{ type: "caution", category: "incentive", message: "Owned by Amazon founder - potential conflicts on tech coverage" }],
  },
  "wsj.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", advertisingModel: true, potentialConflicts: ["conservative editorial, business focus"] },
    antiBias: {
      independenceScore: 0.6,
      ideologicalTransparency: 0.6,   // Opinion section clearly labeled
      fundingTransparency: 0.55,
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.4,
      geographicNeutrality: 0.4,
      temporalNeutrality: 0.5,
      selectionBiasResistance: 0.4,
      quantificationBias: 0.6,        // Good business data
    },
  },
  "economist.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    independenceScore: 0.7,
    incentiveProfile: { type: "commercial", potentialConflicts: ["liberal/free-market ideology"] },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.75,  // Explicit about classical liberal stance
      fundingTransparency: 0.6,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.35,     // Single ideological framework
      geographicNeutrality: 0.6,      // Global but Western
      temporalNeutrality: 0.6,
      selectionBiasResistance: 0.45,
      quantificationBias: 0.65,
    },
    flags: [{ type: "info", category: "incentive", message: "Consistent liberal/free-market ideological perspective" }],
  },
  "ft.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    independenceScore: 0.7,
    incentiveProfile: { type: "commercial", potentialConflicts: ["financial industry focus"] },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.65,
      fundingTransparency: 0.6,
      conflictDisclosure: 0.55,
      perspectiveDiversity: 0.45,     // Financial/business perspective
      geographicNeutrality: 0.55,     // UK/Europe focus
      temporalNeutrality: 0.55,
      selectionBiasResistance: 0.5,
      quantificationBias: 0.7,
    },
  },
  "bbc.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    correctionPolicy: 0.8,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental" },  // UK government funded
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.55,
      fundingTransparency: 0.8,       // Public funding transparent
      conflictDisclosure: 0.5,
      perspectiveDiversity: 0.55,
      geographicNeutrality: 0.5,      // UK perspective
      temporalNeutrality: 0.5,
      selectionBiasResistance: 0.55,
      quantificationBias: 0.55,
    },
    flags: [{ type: "info", category: "incentive", message: "Government-funded - may reflect UK perspectives" }],
  },

  // ============================================
  // TECH NEWS - Caution for industry influence
  // ============================================
  "techcrunch.com": {
    factualAccuracy: 0.7,
    sourceCitation: 0.6,
    independenceScore: 0.5,
    incentiveProfile: {
      type: "commercial",
      advertisingModel: true,
      engagementOptimized: true,
      potentialConflicts: ["VC/startup ecosystem relationships"]
    },
    antiBias: {
      independenceScore: 0.5,
      ideologicalTransparency: 0.35,
      fundingTransparency: 0.4,
      conflictDisclosure: 0.3,
      perspectiveDiversity: 0.3,      // Pro-startup/VC perspective
      geographicNeutrality: 0.3,      // Silicon Valley centric
      temporalNeutrality: 0.3,        // Hype cycle driven
      selectionBiasResistance: 0.25,
      quantificationBias: 0.4,
    },
    flags: [{ type: "warning", category: "incentive", message: "Tech industry relationships may bias coverage" }],
  },
  "theverge.com": {
    factualAccuracy: 0.7,
    sourceCitation: 0.6,
    independenceScore: 0.55,
    incentiveProfile: { type: "commercial", advertisingModel: true, engagementOptimized: true },
    antiBias: {
      independenceScore: 0.55,
      ideologicalTransparency: 0.45,
      fundingTransparency: 0.45,
      conflictDisclosure: 0.4,
      perspectiveDiversity: 0.4,
      geographicNeutrality: 0.35,
      temporalNeutrality: 0.35,
      selectionBiasResistance: 0.35,
      quantificationBias: 0.45,
    },
  },
  "arstechnica.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    independenceScore: 0.65,
    incentiveProfile: { type: "commercial", advertisingModel: true },
    antiBias: {
      independenceScore: 0.65,
      ideologicalTransparency: 0.55,
      fundingTransparency: 0.5,
      conflictDisclosure: 0.5,
      perspectiveDiversity: 0.5,
      geographicNeutrality: 0.4,
      temporalNeutrality: 0.5,
      selectionBiasResistance: 0.5,
      quantificationBias: 0.6,
    },
  },
  "wired.com": {
    factualAccuracy: 0.75,
    sourceCitation: 0.7,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", advertisingModel: true, engagementOptimized: true },
    antiBias: {
      independenceScore: 0.6,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.45,
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.45,
      geographicNeutrality: 0.35,
      temporalNeutrality: 0.4,
      selectionBiasResistance: 0.4,
      quantificationBias: 0.5,
    },
  },
  "news.ycombinator.com": {
    factualAccuracy: 0.6,
    sourceCitation: 0.5,
    independenceScore: 0.7,
    incentiveProfile: { type: "commercial", engagementOptimized: true },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.5,
      fundingTransparency: 0.6,
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.35,     // Tech libertarian bubble
      geographicNeutrality: 0.3,      // SF/Silicon Valley centric
      temporalNeutrality: 0.35,
      selectionBiasResistance: 0.4,   // Community voting bias
      quantificationBias: 0.5,
    },
    flags: [
      { type: "caution", category: "accuracy", message: "Aggregator - verify original sources" },
      { type: "info", category: "incentive", message: "Tech community bias toward certain viewpoints" }
    ],
  },

  // ============================================
  // LOW CREDIBILITY SOURCES
  // ============================================
  "medium.com": {
    factualAccuracy: 0.5,
    sourceCitation: 0.4,
    methodologyTransparency: 0.3,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", engagementOptimized: true },
    antiBias: {
      independenceScore: 0.6,
      ideologicalTransparency: 0.4,
      fundingTransparency: 0.3,
      conflictDisclosure: 0.25,
      perspectiveDiversity: 0.7,      // Many voices but no curation
      geographicNeutrality: 0.5,
      temporalNeutrality: 0.35,
      selectionBiasResistance: 0.3,   // Engagement algorithm selects
      quantificationBias: 0.35,
    },
    flags: [{ type: "warning", category: "accuracy", message: "User-generated content - verify claims independently" }],
  },
  "substack.com": {
    factualAccuracy: 0.5,
    sourceCitation: 0.5,
    independenceScore: 0.7,
    incentiveProfile: { type: "independent", engagementOptimized: true },
    antiBias: {
      independenceScore: 0.7,
      ideologicalTransparency: 0.6,   // Individual authors often explicit
      fundingTransparency: 0.65,      // Subscription model transparent
      conflictDisclosure: 0.45,
      perspectiveDiversity: 0.75,     // Wide range of voices
      geographicNeutrality: 0.5,
      temporalNeutrality: 0.45,
      selectionBiasResistance: 0.5,
      quantificationBias: 0.4,
    },
    flags: [{ type: "warning", category: "accuracy", message: "Individual authors - quality varies widely" }],
  },
  "wikipedia.org": {
    factualAccuracy: 0.75,
    sourceCitation: 0.85,
    independenceScore: 0.8,
    incentiveProfile: { type: "nonprofit" },
    antiBias: {
      independenceScore: 0.8,
      ideologicalTransparency: 0.7,
      fundingTransparency: 0.9,       // Transparent donation model
      conflictDisclosure: 0.65,
      perspectiveDiversity: 0.6,      // Neutral point of view policy
      geographicNeutrality: 0.55,     // English Wikipedia has Western bias
      temporalNeutrality: 0.7,
      selectionBiasResistance: 0.6,   // Notability requirements
      quantificationBias: 0.65,
    },
    flags: [{ type: "caution", category: "accuracy", message: "Crowdsourced - check citations for controversial topics" }],
  },
};

export function assessSourceCredibility(url: string): SourceCredibility {
  const domain = extractDomain(url);
  const profile = SOURCE_PROFILES[domain];

  if (profile) {
    return computeCredibility(profile, domain);
  }

  // Unknown source - apply conservative defaults
  return computeCredibility({
    factualAccuracy: 0.5,
    sourceCitation: 0.5,
    methodologyTransparency: 0.5,
    correctionPolicy: 0.5,
    independenceScore: 0.5,
    statisticalVerifiability: 0.5,
    crossReferenceability: 0.5,
    incentiveProfile: { type: "independent" },
    flags: [{ type: "warning", category: "verification", message: "Unknown source - verify claims independently" }],
  }, domain);
}

export function hasKnownProfile(url: string): boolean {
  const domain = extractDomain(url);
  return domain in SOURCE_PROFILES;
}

/**
 * Compute anti-bias metrics from profile or defaults
 */
function computeAntiBiasMetrics(
  profile: Partial<SourceCredibility>,
  independenceScore: number
): AntiBiasMetrics {
  const incentiveType = profile.incentiveProfile?.type ?? "independent";
  const defaults = ANTI_BIAS_DEFAULTS[incentiveType];

  // Use profile anti-bias values if provided, otherwise use type defaults
  const antiBias: Partial<AntiBiasMetrics> = profile.antiBias ?? {};

  return {
    independenceScore: antiBias.independenceScore ?? independenceScore,
    ideologicalTransparency: antiBias.ideologicalTransparency ?? defaults.ideologicalTransparency ?? 0.5,
    fundingTransparency: antiBias.fundingTransparency ?? defaults.fundingTransparency ?? 0.5,
    conflictDisclosure: antiBias.conflictDisclosure ?? defaults.conflictDisclosure ?? 0.5,
    perspectiveDiversity: antiBias.perspectiveDiversity ?? defaults.perspectiveDiversity ?? 0.5,
    geographicNeutrality: antiBias.geographicNeutrality ?? defaults.geographicNeutrality ?? 0.5,
    temporalNeutrality: antiBias.temporalNeutrality ?? defaults.temporalNeutrality ?? 0.5,
    selectionBiasResistance: antiBias.selectionBiasResistance ?? defaults.selectionBiasResistance ?? 0.5,
    quantificationBias: antiBias.quantificationBias ?? defaults.quantificationBias ?? 0.5,
  };
}

/**
 * Calculate the debiased score using anti-bias weighted formula
 *
 * This score prioritizes sources that:
 * 1. Are independent from commercial/political pressure (30%)
 * 2. Are transparent about their biases (25%)
 * 3. Represent diverse perspectives (20%)
 * 4. Resist selection bias (15%)
 * 5. Have geographic/temporal neutrality (10%)
 */
function computeDebiasedScore(antiBias: AntiBiasMetrics): number {
  return (
    // Independence (most important for debiasing)
    antiBias.independenceScore * 0.30 +

    // Transparency cluster (knowing biases helps correct for them)
    antiBias.ideologicalTransparency * 0.10 +
    antiBias.fundingTransparency * 0.08 +
    antiBias.conflictDisclosure * 0.07 +

    // Perspective diversity (multiple viewpoints reduce bias)
    antiBias.perspectiveDiversity * 0.15 +
    antiBias.geographicNeutrality * 0.05 +

    // Selection and coverage bias resistance
    antiBias.selectionBiasResistance * 0.10 +
    antiBias.temporalNeutrality * 0.05 +

    // Acknowledging unmeasurable factors
    antiBias.quantificationBias * 0.10
  );
}

function computeCredibility(profile: Partial<SourceCredibility>, domain: string): SourceCredibility {
  const factualAccuracy = profile.factualAccuracy ?? 0.5;
  const sourceCitation = profile.sourceCitation ?? 0.5;
  const methodologyTransparency = profile.methodologyTransparency ?? 0.5;
  const correctionPolicy = profile.correctionPolicy ?? 0.5;
  const independenceScore = profile.independenceScore ?? 0.5;
  const statisticalVerifiability = profile.statisticalVerifiability ?? 0.5;
  const crossReferenceability = profile.crossReferenceability ?? 0.5;

  // Compute anti-bias metrics
  const antiBias = computeAntiBiasMetrics(profile, independenceScore);

  // Traditional weighted composite score (unchanged for backwards compatibility)
  const overallCredibility = (
    factualAccuracy * 0.25 +
    sourceCitation * 0.15 +
    methodologyTransparency * 0.15 +
    correctionPolicy * 0.1 +
    independenceScore * 0.2 +
    statisticalVerifiability * 0.1 +
    crossReferenceability * 0.05
  );

  // NEW: Anti-bias weighted score for true utility
  const debiasedScore = computeDebiasedScore(antiBias);

  // Confidence based on how much we know about this source
  const knownFields = [
    profile.factualAccuracy,
    profile.sourceCitation,
    profile.methodologyTransparency,
    profile.independenceScore,
  ].filter(f => f !== undefined).length;

  // Increase confidence if we have anti-bias data
  const hasAntiBiasData = profile.antiBias !== undefined;
  const confidenceInAssessment = hasAntiBiasData
    ? Math.min(1, (knownFields / 4) + 0.25)  // Bonus for anti-bias data
    : knownFields / 4;

  return {
    factualAccuracy,
    sourceCitation,
    methodologyTransparency,
    correctionPolicy,
    independenceScore,
    antiBias,
    statisticalVerifiability,
    crossReferenceability,
    incentiveProfile: profile.incentiveProfile ?? { type: "independent" },
    overallCredibility,
    debiasedScore,
    confidenceInAssessment,
    flags: profile.flags ?? [],
  };
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Filter sources by minimum credibility threshold
export function filterByCredibility(
  sources: Array<{ url: string; [key: string]: unknown }>,
  minCredibility: number = 0.6
): Array<{ url: string; credibility: SourceCredibility; [key: string]: unknown }> {
  return sources
    .map(source => ({
      ...source,
      credibility: assessSourceCredibility(source.url),
    }))
    .filter(source => source.credibility.overallCredibility >= minCredibility);
}

// Filter sources by minimum debiased score threshold
export function filterByDebiasedScore(
  sources: Array<{ url: string; [key: string]: unknown }>,
  minDebiasedScore: number = 0.6
): Array<{ url: string; credibility: SourceCredibility; [key: string]: unknown }> {
  return sources
    .map(source => ({
      ...source,
      credibility: assessSourceCredibility(source.url),
    }))
    .filter(source => source.credibility.debiasedScore >= minDebiasedScore)
    .sort((a, b) => b.credibility.debiasedScore - a.credibility.debiasedScore);
}

// Get the most debiased sources from known profiles
export function getMostDebiasedSources(
  topN: number = 10
): Array<{ domain: string; credibility: SourceCredibility }> {
  const allSources = Object.keys(SOURCE_PROFILES).map(domain => ({
    domain,
    credibility: assessSourceCredibility(`https://${domain}`),
  }));

  return allSources
    .sort((a, b) => b.credibility.debiasedScore - a.credibility.debiasedScore)
    .slice(0, topN);
}

// Get sources ranked by debiased score with detailed breakdown
export function getDebiasedSourceRanking(): Array<{
  domain: string;
  debiasedScore: number;
  overallCredibility: number;
  independenceScore: number;
  perspectiveDiversity: number;
  geographicNeutrality: number;
  incentiveType: string;
  flags: string[];
}> {
  return Object.keys(SOURCE_PROFILES)
    .map(domain => {
      const cred = assessSourceCredibility(`https://${domain}`);
      return {
        domain,
        debiasedScore: cred.debiasedScore,
        overallCredibility: cred.overallCredibility,
        independenceScore: cred.antiBias.independenceScore,
        perspectiveDiversity: cred.antiBias.perspectiveDiversity,
        geographicNeutrality: cred.antiBias.geographicNeutrality,
        incentiveType: cred.incentiveProfile.type,
        flags: cred.flags.map(f => f.message),
      };
    })
    .sort((a, b) => b.debiasedScore - a.debiasedScore);
}

// Get credibility report for a source (enhanced with anti-bias metrics)
export function getCredibilityReport(url: string): string {
  const cred = assessSourceCredibility(url);
  const domain = extractDomain(url);

  const lines = [
    `Source: ${domain}`,
    ``,
    `=== SCORES ===`,
    `Overall Credibility: ${(cred.overallCredibility * 100).toFixed(0)}%`,
    `Debiased Score:      ${(cred.debiasedScore * 100).toFixed(0)}%  ← Use this for true utility`,
    `Confidence:          ${(cred.confidenceInAssessment * 100).toFixed(0)}%`,
    ``,
    `=== TRADITIONAL METRICS ===`,
    `  Factual Accuracy:        ${(cred.factualAccuracy * 100).toFixed(0)}%`,
    `  Source Citation:         ${(cred.sourceCitation * 100).toFixed(0)}%`,
    `  Methodology Transparency: ${(cred.methodologyTransparency * 100).toFixed(0)}%`,
    `  Independence:            ${(cred.independenceScore * 100).toFixed(0)}%`,
    ``,
    `=== ANTI-BIAS METRICS ===`,
    `  Independence Score:      ${(cred.antiBias.independenceScore * 100).toFixed(0)}%`,
    `  Ideological Transparency: ${(cred.antiBias.ideologicalTransparency * 100).toFixed(0)}%`,
    `  Funding Transparency:    ${(cred.antiBias.fundingTransparency * 100).toFixed(0)}%`,
    `  Conflict Disclosure:     ${(cred.antiBias.conflictDisclosure * 100).toFixed(0)}%`,
    `  Perspective Diversity:   ${(cred.antiBias.perspectiveDiversity * 100).toFixed(0)}%`,
    `  Geographic Neutrality:   ${(cred.antiBias.geographicNeutrality * 100).toFixed(0)}%`,
    `  Temporal Neutrality:     ${(cred.antiBias.temporalNeutrality * 100).toFixed(0)}%`,
    `  Selection Bias Resist:   ${(cred.antiBias.selectionBiasResistance * 100).toFixed(0)}%`,
    `  Quantification Aware:    ${(cred.antiBias.quantificationBias * 100).toFixed(0)}%`,
    ``,
    `Incentive Profile: ${cred.incentiveProfile.type}`,
  ];

  if (cred.incentiveProfile.potentialConflicts?.length) {
    lines.push(`Potential Conflicts: ${cred.incentiveProfile.potentialConflicts.join(", ")}`);
  }

  if (cred.flags.length > 0) {
    lines.push(``, `Flags:`);
    for (const flag of cred.flags) {
      const icon = flag.type === "warning" ? "⚠️" : flag.type === "caution" ? "⚡" : "ℹ️";
      lines.push(`  ${icon} [${flag.category}] ${flag.message}`);
    }
  }

  return lines.join("\n");
}

export interface DynamicCredibilityResult {
  baseCredibility: SourceCredibility;
  dynamicReliability: number | null;
  blendedScore: number;
  healthStatus: string | null;
  fetchSuccessRate: number | null;
  confidenceInDynamic: number;
}

/**
 * Get credibility that combines static profiles with dynamic health data
 *
 * @param url - The source URL to assess
 * @param db - Database connection for health lookups
 * @returns Combined credibility assessment
 */
export async function getDynamicCredibility(
  url: string,
  db: Database
): Promise<DynamicCredibilityResult> {
  const domain = extractDomain(url);
  const baseCredibility = assessSourceCredibility(url);

  const healthRepo = new SourceHealthRepository(db);
  const health = await healthRepo.findByDomain(domain);

  if (!health || health.dynamicReliability === null) {
    // No dynamic data available, use base credibility only
    return {
      baseCredibility,
      dynamicReliability: null,
      blendedScore: baseCredibility.overallCredibility,
      healthStatus: health?.healthStatus ?? null,
      fetchSuccessRate: health?.successRate ?? null,
      confidenceInDynamic: 0,
    };
  }

  // Blend scores: 70% base (editorial quality) + 30% dynamic (fetch reliability)
  const baseWeight = 0.7;
  const dynamicWeight = 0.3;

  // Weight the dynamic component by our confidence in it
  const effectiveDynamicWeight = dynamicWeight * (health.reliabilityConfidence ?? 0);
  const effectiveBaseWeight = 1 - effectiveDynamicWeight;

  const blendedScore =
    baseCredibility.overallCredibility * effectiveBaseWeight +
    health.dynamicReliability * effectiveDynamicWeight;

  return {
    baseCredibility,
    dynamicReliability: health.dynamicReliability,
    blendedScore,
    healthStatus: health.healthStatus,
    fetchSuccessRate: health.successRate,
    confidenceInDynamic: health.reliabilityConfidence ?? 0,
  };
}

/**
 * Filter sources by minimum dynamic credibility threshold
 */
export async function filterByDynamicCredibility(
  sources: Array<{ url: string; [key: string]: unknown }>,
  db: Database,
  minCredibility: number = 0.6
): Promise<Array<{ url: string; credibility: DynamicCredibilityResult; [key: string]: unknown }>> {
  const results = await Promise.all(
    sources.map(async (source) => ({
      ...source,
      credibility: await getDynamicCredibility(source.url, db),
    }))
  );

  return results.filter((source) => source.credibility.blendedScore >= minCredibility);
}
