#!/usr/bin/env npx tsx
/**
 * Show Debiased Source Rankings
 *
 * Displays sources ranked by their anti-bias score for identifying true systemic issues.
 */

import { getDebiasedSourceRanking, getCredibilityReport } from "../sources/credibility.js";

console.log("=== MOST DEBIASED SOURCES FOR TRUE UTILITY ===\n");
console.log("These sources are ranked by anti-bias metrics, prioritizing:");
console.log("  - Independence from commercial/political pressure (30%)");
console.log("  - Transparency about biases (25%)");
console.log("  - Perspective diversity (20%)");
console.log("  - Selection bias resistance (15%)");
console.log("  - Geographic/temporal neutrality (10%)\n");

const ranking = getDebiasedSourceRanking();

console.log("Rank | Domain                    | Debiased | Overall | Independence | Diversity | Geo Neutral | Type");
console.log("-----|---------------------------|----------|---------|--------------|-----------|-------------|----------");

ranking.forEach((s, i) => {
  const rank = String(i + 1).padStart(2);
  const domain = s.domain.padEnd(25);
  const debiased = (s.debiasedScore * 100).toFixed(0).padStart(5) + "%";
  const overall = (s.overallCredibility * 100).toFixed(0).padStart(5) + "%";
  const independence = (s.independenceScore * 100).toFixed(0).padStart(5) + "%";
  const diversity = (s.perspectiveDiversity * 100).toFixed(0).padStart(5) + "%";
  const geoNeutral = (s.geographicNeutrality * 100).toFixed(0).padStart(5) + "%";
  const type = s.incentiveType.padEnd(10);
  console.log(`  ${rank} | ${domain} | ${debiased}  | ${overall}  | ${independence}     | ${diversity}    | ${geoNeutral}      | ${type}`);
});

console.log("\n\n=== TOP 3 DETAILED REPORTS ===\n");

const top3 = ranking.slice(0, 3);
for (const source of top3) {
  console.log("-".repeat(60));
  console.log(getCredibilityReport(`https://${source.domain}`));
  console.log();
}

console.log("\n=== RECOMMENDATIONS FOR TRUE UTILITY ===\n");
console.log("For maximum accuracy in identifying systemic issues:");
console.log("1. PRIMARY: Use Tier 1 sources (debiased score > 70%) for fact discovery");
console.log("2. TRIANGULATE: Cross-reference claims across 3+ sources with different incentive types");
console.log("3. DISCLOSE: Always note source limitations when reporting findings");
console.log("4. DIVERSIFY: Balance Western academic sources with global data repositories");
console.log("5. TEMPORAL: Use historical archives to avoid recency bias\n");

const tier1 = ranking.filter(s => s.debiasedScore >= 0.70);
const tier2 = ranking.filter(s => s.debiasedScore >= 0.60 && s.debiasedScore < 0.70);
const tier3 = ranking.filter(s => s.debiasedScore >= 0.50 && s.debiasedScore < 0.60);

console.log(`Tier 1 (70%+): ${tier1.length} sources - ${tier1.map(s => s.domain).join(", ")}`);
console.log(`Tier 2 (60-70%): ${tier2.length} sources - ${tier2.map(s => s.domain).join(", ")}`);
console.log(`Tier 3 (50-60%): ${tier3.length} sources - use with awareness of specific biases`);
