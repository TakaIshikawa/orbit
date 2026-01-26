/**
 * Source Credibility Framework
 *
 * Evaluates sources for:
 * - Factual reliability
 * - Incentive structures that may bias reporting
 * - Statistical verifiability
 * - Independence from manipulative interests
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

export interface SourceCredibility {
  // Core reliability scores (0-1)
  factualAccuracy: number;        // Track record of accurate reporting
  sourceCitation: number;         // Does it cite primary sources?
  methodologyTransparency: number; // Are methods/data collection explained?
  correctionPolicy: number;       // Does it issue corrections?

  // Incentive analysis
  incentiveProfile: IncentiveProfile;
  independenceScore: number;      // Freedom from commercial/political pressure

  // Verification potential
  statisticalVerifiability: number; // Can claims be verified with data?
  crossReferenceability: number;    // Can it be checked against other sources?

  // Composite
  overallCredibility: number;
  confidenceInAssessment: number;

  // Flags
  flags: CredibilityFlag[];
}

export interface CredibilityFlag {
  type: "warning" | "caution" | "info";
  category: "incentive" | "accuracy" | "methodology" | "transparency" | "verification";
  message: string;
}

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
    flags: [{ type: "info", category: "methodology", message: "Preprints - not peer reviewed" }],
  },
  "nature.com": {
    factualAccuracy: 0.95,
    sourceCitation: 0.95,
    methodologyTransparency: 0.95,
    correctionPolicy: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "academic", advertisingModel: false },
  },
  "sciencedirect.com": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "academic" },
  },
  "nber.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.9,
    independenceScore: 0.8,
    incentiveProfile: { type: "academic" },
    flags: [{ type: "info", category: "methodology", message: "Working papers - not peer reviewed but high quality" }],
  },
  "ssrn.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.9,
    methodologyTransparency: 0.8,
    independenceScore: 0.85,
    incentiveProfile: { type: "academic" },
    flags: [{ type: "info", category: "methodology", message: "Preprints - quality varies by paper" }],
  },
  "scholar.google.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.95,
    independenceScore: 0.9,
    incentiveProfile: { type: "academic" },
    flags: [{ type: "info", category: "accuracy", message: "Aggregator - quality depends on source papers" }],
  },
  "pubmed.ncbi.nlm.nih.gov": {
    factualAccuracy: 0.95,
    sourceCitation: 0.95,
    methodologyTransparency: 0.9,
    independenceScore: 0.9,
    incentiveProfile: { type: "academic" },
  },
  "jstor.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.95,
    methodologyTransparency: 0.85,
    independenceScore: 0.9,
    incentiveProfile: { type: "academic" },
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
    flags: [{ type: "info", category: "incentive", message: "Government source - may reflect policy priorities" }],
  },
  "bls.gov": {
    factualAccuracy: 0.95,
    statisticalVerifiability: 0.95,
    methodologyTransparency: 0.95,
    independenceScore: 0.8,
    incentiveProfile: { type: "governmental" },
  },
  "fred.stlouisfed.org": {
    factualAccuracy: 0.95,
    sourceCitation: 0.9,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.95,
    independenceScore: 0.8,
    incentiveProfile: { type: "governmental" },
  },
  "data.gov": {
    factualAccuracy: 0.9,
    methodologyTransparency: 0.85,
    statisticalVerifiability: 0.9,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },
  },
  "cdc.gov": {
    factualAccuracy: 0.9,
    sourceCitation: 0.85,
    methodologyTransparency: 0.85,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental" },
    flags: [{ type: "info", category: "incentive", message: "Public health agency - may prioritize messaging over nuance" }],
  },
  "who.int": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    methodologyTransparency: 0.8,
    independenceScore: 0.65,
    incentiveProfile: { type: "governmental", potentialConflicts: ["member state politics", "funding pressures"] },
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
  },
  "worldbank.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    methodologyTransparency: 0.8,
    independenceScore: 0.65,
    incentiveProfile: { type: "governmental", potentialConflicts: ["development lending priorities"] },
  },
  "data.oecd.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.85,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.9,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },
  },
  "oecd.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.85,
    methodologyTransparency: 0.85,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental", potentialConflicts: ["member country interests"] },
  },
  "imf.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    methodologyTransparency: 0.8,
    independenceScore: 0.6,
    incentiveProfile: { type: "governmental", potentialConflicts: ["creditor nation priorities", "austerity ideology"] },
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
  },
  "gapminder.org": {
    factualAccuracy: 0.9,
    sourceCitation: 0.9,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.9,
    independenceScore: 0.85,
    incentiveProfile: { type: "nonprofit" },
  },
  "pewresearch.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.9,
    methodologyTransparency: 0.9,
    statisticalVerifiability: 0.85,
    independenceScore: 0.8,
    incentiveProfile: { type: "nonprofit" },
  },
  "rand.org": {
    factualAccuracy: 0.85,
    sourceCitation: 0.9,
    methodologyTransparency: 0.85,
    independenceScore: 0.65,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["government/defense contracts"] },
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
    flags: [{ type: "caution", category: "incentive", message: "Think tank with policy advocacy goals" }],
  },
  "aei.org": {
    factualAccuracy: 0.75,
    sourceCitation: 0.8,
    independenceScore: 0.5,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["conservative/free-market advocacy"] },
    flags: [{ type: "caution", category: "incentive", message: "Conservative think tank - ideological framing" }],
  },
  "heritage.org": {
    factualAccuracy: 0.7,
    sourceCitation: 0.75,
    independenceScore: 0.5,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["conservative policy advocacy"] },
    flags: [{ type: "warning", category: "incentive", message: "Strong ideological orientation may bias analysis" }],
  },
  "cato.org": {
    factualAccuracy: 0.75,
    sourceCitation: 0.8,
    independenceScore: 0.55,
    incentiveProfile: { type: "nonprofit", potentialConflicts: ["libertarian ideology"] },
    flags: [{ type: "caution", category: "incentive", message: "Libertarian think tank - consistent ideological lens" }],
  },
  "urban.org": {
    factualAccuracy: 0.8,
    sourceCitation: 0.85,
    methodologyTransparency: 0.8,
    independenceScore: 0.7,
    incentiveProfile: { type: "nonprofit" },
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
  },
  "apnews.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    correctionPolicy: 0.85,
    independenceScore: 0.8,
    incentiveProfile: { type: "nonprofit" },
  },
  "afp.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    independenceScore: 0.75,
    incentiveProfile: { type: "governmental" },  // French government affiliated
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
    flags: [{ type: "info", category: "incentive", message: "Editorial stance may influence story selection and framing" }],
  },
  "washingtonpost.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    correctionPolicy: 0.8,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", advertisingModel: true, potentialConflicts: ["owner: Jeff Bezos/Amazon"] },
    flags: [{ type: "caution", category: "incentive", message: "Owned by Amazon founder - potential conflicts on tech coverage" }],
  },
  "wsj.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", advertisingModel: true, potentialConflicts: ["conservative editorial, business focus"] },
  },
  "economist.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    independenceScore: 0.7,
    incentiveProfile: { type: "commercial", potentialConflicts: ["liberal/free-market ideology"] },
    flags: [{ type: "info", category: "incentive", message: "Consistent liberal/free-market ideological perspective" }],
  },
  "ft.com": {
    factualAccuracy: 0.85,
    sourceCitation: 0.8,
    independenceScore: 0.7,
    incentiveProfile: { type: "commercial", potentialConflicts: ["financial industry focus"] },
  },
  "bbc.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    correctionPolicy: 0.8,
    independenceScore: 0.7,
    incentiveProfile: { type: "governmental" },  // UK government funded
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
    flags: [{ type: "warning", category: "incentive", message: "Tech industry relationships may bias coverage" }],
  },
  "theverge.com": {
    factualAccuracy: 0.7,
    sourceCitation: 0.6,
    independenceScore: 0.55,
    incentiveProfile: { type: "commercial", advertisingModel: true, engagementOptimized: true },
  },
  "arstechnica.com": {
    factualAccuracy: 0.8,
    sourceCitation: 0.75,
    independenceScore: 0.65,
    incentiveProfile: { type: "commercial", advertisingModel: true },
  },
  "wired.com": {
    factualAccuracy: 0.75,
    sourceCitation: 0.7,
    independenceScore: 0.6,
    incentiveProfile: { type: "commercial", advertisingModel: true, engagementOptimized: true },
  },
  "news.ycombinator.com": {
    factualAccuracy: 0.6,
    sourceCitation: 0.5,
    independenceScore: 0.7,
    incentiveProfile: { type: "commercial", engagementOptimized: true },
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
    flags: [{ type: "warning", category: "accuracy", message: "User-generated content - verify claims independently" }],
  },
  "substack.com": {
    factualAccuracy: 0.5,
    sourceCitation: 0.5,
    independenceScore: 0.7,
    incentiveProfile: { type: "independent", engagementOptimized: true },
    flags: [{ type: "warning", category: "accuracy", message: "Individual authors - quality varies widely" }],
  },
  "wikipedia.org": {
    factualAccuracy: 0.75,
    sourceCitation: 0.85,
    independenceScore: 0.8,
    incentiveProfile: { type: "nonprofit" },
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

function computeCredibility(profile: Partial<SourceCredibility>, domain: string): SourceCredibility {
  const factualAccuracy = profile.factualAccuracy ?? 0.5;
  const sourceCitation = profile.sourceCitation ?? 0.5;
  const methodologyTransparency = profile.methodologyTransparency ?? 0.5;
  const correctionPolicy = profile.correctionPolicy ?? 0.5;
  const independenceScore = profile.independenceScore ?? 0.5;
  const statisticalVerifiability = profile.statisticalVerifiability ?? 0.5;
  const crossReferenceability = profile.crossReferenceability ?? 0.5;

  // Weighted composite score
  const overallCredibility = (
    factualAccuracy * 0.25 +
    sourceCitation * 0.15 +
    methodologyTransparency * 0.15 +
    correctionPolicy * 0.1 +
    independenceScore * 0.2 +
    statisticalVerifiability * 0.1 +
    crossReferenceability * 0.05
  );

  // Confidence based on how much we know about this source
  const knownFields = [
    profile.factualAccuracy,
    profile.sourceCitation,
    profile.methodologyTransparency,
    profile.independenceScore,
  ].filter(f => f !== undefined).length;
  const confidenceInAssessment = knownFields / 4;

  return {
    factualAccuracy,
    sourceCitation,
    methodologyTransparency,
    correctionPolicy,
    independenceScore,
    statisticalVerifiability,
    crossReferenceability,
    incentiveProfile: profile.incentiveProfile ?? { type: "independent" },
    overallCredibility,
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

// Get credibility report for a source
export function getCredibilityReport(url: string): string {
  const cred = assessSourceCredibility(url);
  const domain = extractDomain(url);

  const lines = [
    `Source: ${domain}`,
    `Overall Credibility: ${(cred.overallCredibility * 100).toFixed(0)}%`,
    `Confidence in Assessment: ${(cred.confidenceInAssessment * 100).toFixed(0)}%`,
    ``,
    `Scores:`,
    `  Factual Accuracy: ${(cred.factualAccuracy * 100).toFixed(0)}%`,
    `  Source Citation: ${(cred.sourceCitation * 100).toFixed(0)}%`,
    `  Methodology Transparency: ${(cred.methodologyTransparency * 100).toFixed(0)}%`,
    `  Independence: ${(cred.independenceScore * 100).toFixed(0)}%`,
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
