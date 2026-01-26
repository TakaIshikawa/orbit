#!/usr/bin/env npx tsx
/**
 * Verify Command
 *
 * Cross-references claims from patterns and briefs against multiple sources.
 * Identifies conflicts, single-source claims, and adjusts confidence based on corroboration.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../../.env");
dotenv.config({ path: envPath });

import { program } from "commander";
import { z } from "zod";
import { getDatabase, PatternRepository, IssueRepository, ProblemBriefRepository, SituationModelRepository, VerificationRepository } from "@orbit/db";
import { getLLMClient } from "@orbit/llm";
import { fetchSource } from "../sources/fetcher.js";
import { assessSourceCredibility, hasKnownProfile } from "../sources/credibility.js";
import { PUBLIC_HIGH_CREDIBILITY_SOURCES } from "../sources/recommended.js";
import { generateVerificationFeedback } from "../jobs/feedback-processor.js";

// Schema for extracted claims
const ClaimSchema = z.object({
  id: z.string(),
  statement: z.string(),
  sourceType: z.enum(["pattern", "brief", "situation_model"]),
  sourceId: z.string(),
  originalConfidence: z.number().min(0).max(1),
  category: z.enum(["factual", "statistical", "causal", "predictive", "definitional"]),
});

// Schema for verification result
const VerificationResultSchema = z.object({
  claimId: z.string(),
  status: z.enum(["corroborated", "contested", "unverified", "partially_supported"]),
  corroboratingSourcesCount: z.number(),
  conflictingSourcesCount: z.number(),
  sources: z.array(z.object({
    url: z.string(),
    name: z.string(),
    credibility: z.number(),
    alignment: z.enum(["supports", "contradicts", "neutral", "partially_supports"]),
    relevantExcerpt: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  adjustedConfidence: z.number().min(0).max(1),
  verificationNotes: z.string(),
  conflicts: z.array(z.object({
    description: z.string(),
    severity: z.enum(["minor", "moderate", "major"]),
    sources: z.array(z.string()),
  })),
});

// Schema for LLM claim extraction
const ClaimExtractionSchema = z.object({
  claims: z.array(z.object({
    statement: z.string().describe("A specific, verifiable claim"),
    category: z.enum(["factual", "statistical", "causal", "predictive", "definitional"]),
    verifiability: z.enum(["high", "medium", "low"]).describe("How easily this claim can be verified"),
    searchQueries: z.array(z.string()).describe("Search queries to find corroborating or contradicting evidence"),
    domains: z.array(z.string()).describe("Relevant domains: health, economics, technology, society, policy, environment, labor, demographics, governance, global, finance"),
  })),
});

// Schema for LLM source assessment
const SourceAssessmentSchema = z.object({
  alignment: z.enum(["supports", "contradicts", "neutral", "partially_supports"]),
  relevance: z.enum(["high", "medium", "low", "none"]).describe("How relevant this source content is to the claim topic"),
  relevantExcerpt: z.string().describe("The most relevant excerpt from the source, or 'N/A' if no relevant content"),
  confidence: z.number().min(0).max(1).describe("How confident you are in this assessment"),
  reasoning: z.string(),
});

// Schema for overall verification
const OverallVerificationSchema = z.object({
  status: z.enum(["corroborated", "contested", "unverified", "partially_supported"]),
  adjustedConfidence: z.number().min(0).max(1),
  verificationNotes: z.string(),
  conflicts: z.array(z.object({
    description: z.string(),
    severity: z.enum(["minor", "moderate", "major"]),
  })),
});

type Claim = z.infer<typeof ClaimSchema>;
type VerificationResult = z.infer<typeof VerificationResultSchema>;

program
  .name("verify")
  .description("Cross-reference claims against multiple sources")
  .option("-p, --pattern <id>", "Verify claims from a specific pattern")
  .option("-b, --brief <id>", "Verify claims from a specific brief")
  .option("-i, --issue <id>", "Verify claims from all patterns linked to an issue")
  .option("--all-patterns", "Verify claims from all patterns")
  .option("-n, --max-claims <count>", "Maximum claims to verify per source", "5")
  .option("-s, --max-sources <count>", "Maximum sources to check per claim", "3")
  .option("--dry-run", "Preview claims without verifying")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options) => {
    console.log("🔍 Starting Cross-Reference Verification...\n");

    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const issueRepo = new IssueRepository(db);
    const briefRepo = new ProblemBriefRepository(db);
    const modelRepo = new SituationModelRepository(db);
    const verificationRepo = new VerificationRepository(db);
    const llm = getLLMClient();

    const maxClaims = parseInt(options.maxClaims);
    const maxSources = parseInt(options.maxSources);

    // Collect items to verify
    let patternsToVerify: Array<{ id: string; title: string; description: string; evidence: string; confidence: number }> = [];
    let briefsToVerify: Array<{ id: string; issueId: string; claims: Array<{ claim: string; confidence: number }> }> = [];

    if (options.pattern) {
      const pattern = await patternRepo.findById(options.pattern);
      if (!pattern) {
        console.error(`❌ Pattern not found: ${options.pattern}`);
        process.exit(1);
      }
      patternsToVerify = [{
        id: pattern.id,
        title: pattern.title,
        description: pattern.description,
        evidence: pattern.evidence || "",
        confidence: pattern.confidence,
      }];
    } else if (options.brief) {
      const brief = await briefRepo.findById(options.brief);
      if (!brief) {
        console.error(`❌ Brief not found: ${options.brief}`);
        process.exit(1);
      }
      // Get situation model for claims
      const model = await modelRepo.findMany({ limit: 100 });
      const briefModel = model.data.find(m => m.problemBriefId === brief.id);
      if (briefModel?.claims) {
        briefsToVerify = [{
          id: brief.id,
          issueId: brief.issueId,
          claims: (briefModel.claims as Array<{ claim: string; confidence: number }>).map(c => ({
            claim: c.claim,
            confidence: c.confidence,
          })),
        }];
      }
    } else if (options.issue) {
      const issue = await issueRepo.findById(options.issue);
      if (!issue) {
        console.error(`❌ Issue not found: ${options.issue}`);
        process.exit(1);
      }
      const patterns = await Promise.all(issue.patternIds.map(id => patternRepo.findById(id)));
      patternsToVerify = patterns.filter(Boolean).map(p => ({
        id: p!.id,
        title: p!.title,
        description: p!.description,
        evidence: p!.evidence || "",
        confidence: p!.confidence,
      }));
    } else if (options.allPatterns) {
      const { data: patterns } = await patternRepo.findMany({ limit: 50 });
      patternsToVerify = patterns.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        evidence: p.evidence || "",
        confidence: p.confidence,
      }));
    } else {
      // Default: verify top 3 patterns by recency
      const { data: patterns } = await patternRepo.findMany({ limit: 3 });
      patternsToVerify = patterns.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        evidence: p.evidence || "",
        confidence: p.confidence,
      }));
    }

    console.log(`📋 Items to verify:`);
    console.log(`   Patterns: ${patternsToVerify.length}`);
    console.log(`   Briefs: ${briefsToVerify.length}`);
    console.log();

    // Extract and verify claims from patterns
    const allResults: VerificationResult[] = [];
    const verificationIds: string[] = []; // Track IDs for feedback loop

    for (const pattern of patternsToVerify) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📌 Pattern: ${pattern.title}`);
      console.log(`   ID: ${pattern.id}`);
      console.log(`   Original Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
      console.log(`${"=".repeat(60)}\n`);

      // Extract verifiable claims using LLM
      console.log("📝 Extracting verifiable claims...");

      const extractionPrompt = `Extract specific, verifiable claims from this pattern:

Title: ${pattern.title}
Description: ${pattern.description}
Evidence: ${pattern.evidence}

Extract up to ${maxClaims} claims that can be verified against external sources. For each claim:
1. State it as a specific, factual assertion
2. Categorize it (factual, statistical, causal, predictive, definitional)
3. Rate its verifiability (high/medium/low)
4. Suggest 2-3 search queries to find corroborating or contradicting evidence

Focus on claims that are:
- Specific enough to verify
- Important to the pattern's validity
- Not just definitions or tautologies

For domains, choose from: health, economics, technology, society, policy, environment, labor, demographics, governance, global, finance, public-health, housing, development, ai, computer-science, politics`;

      try {
        const extractionResult = await llm.completeStructured(
          [{ role: "user", content: extractionPrompt }],
          {
            schema: ClaimExtractionSchema,
            systemPrompt: "You are an expert fact-checker who extracts verifiable claims from text.",
            schemaName: "claim_extraction",
            schemaDescription: "Extracted verifiable claims with search queries",
          }
        );

        const claims = extractionResult.data.claims.slice(0, maxClaims);
        console.log(`   Found ${claims.length} verifiable claims\n`);

        if (options.dryRun) {
          for (const claim of claims) {
            console.log(`   📍 [${claim.category}] ${claim.statement}`);
            console.log(`      Verifiability: ${claim.verifiability}`);
            console.log(`      Search: ${claim.searchQueries[0]}`);
            console.log();
          }
          continue;
        }

        // Verify each claim
        for (let i = 0; i < claims.length; i++) {
          const claim = claims[i];
          console.log(`\n   🔎 Claim ${i + 1}/${claims.length}: ${claim.statement.slice(0, 80)}...`);
          console.log(`      Category: ${claim.category} | Verifiability: ${claim.verifiability}`);

          // Select sources to check - prioritize domain-matched sources
          const claimDomains = (claim as { domains?: string[] }).domains || [];

          // Score and sort sources by domain relevance
          const scoredSources = PUBLIC_HIGH_CREDIBILITY_SOURCES
            .filter(s => s.type === "research" || s.type === "news")
            .map(source => {
              const matchingDomains = (source.domains || []).filter(d =>
                claimDomains.some(cd =>
                  d.toLowerCase().includes(cd.toLowerCase()) ||
                  cd.toLowerCase().includes(d.toLowerCase())
                )
              );
              return { source, score: matchingDomains.length };
            })
            .sort((a, b) => b.score - a.score);

          // Take top domain-matched sources, or fall back to first N if no matches
          const sourcesToCheck = scoredSources
            .filter(s => s.score > 0 || scoredSources.every(ss => ss.score === 0))
            .slice(0, maxSources)
            .map(s => s.source);

          if (options.verbose) {
            console.log(`      Domains: ${claimDomains.join(", ") || "none detected"}`);
            console.log(`      Selected sources: ${sourcesToCheck.map(s => s.name).join(", ")}`)
          }

          const sourceResults: VerificationResult["sources"] = [];

          for (const source of sourcesToCheck) {
            try {
              console.log(`      Checking ${source.name}...`);

              // Fetch source content
              const content = await fetchSource({
                url: source.url,
                type: source.type as "research" | "news" | "observation" | "report",
              });

              if (!content || content.length < 100) {
                console.log(`         ⚠️ No content retrieved`);
                continue;
              }

              // Get source credibility
              const credibility = assessSourceCredibility(source.url);

              // Use LLM to assess alignment
              const assessmentPrompt = `Assess how this source content relates to the following claim:

CLAIM: ${claim.statement}

SOURCE: ${source.name} (${source.url})
CONTENT (excerpt):
${content.slice(0, 8000)}

Determine:
1. RELEVANCE: Does this content discuss the topic of the claim at all?
   - "high": directly addresses the claim's subject matter
   - "medium": discusses related topics
   - "low": tangentially related
   - "none": content is about completely different topics (e.g., homepage navigation, unrelated statistics)
2. ALIGNMENT: If relevant, does this source support, contradict, or remain neutral on the claim?
   - If relevance is "none", set alignment to "neutral"
3. Extract the most relevant excerpt, or "N/A" if no relevant content found
4. How confident are you in this assessment?
5. Brief reasoning

IMPORTANT: If this appears to be a homepage, navigation content, or generic institutional description rather than topic-specific content, mark relevance as "none".`;

              const assessmentResult = await llm.completeStructured(
                [{ role: "user", content: assessmentPrompt }],
                {
                  schema: SourceAssessmentSchema,
                  systemPrompt: "You are an expert fact-checker assessing source alignment with claims.",
                  schemaName: "source_assessment",
                  schemaDescription: "Assessment of source alignment with claim",
                }
              );

              const assessment = assessmentResult.data;
              const alignmentIcon = {
                supports: "✅",
                contradicts: "❌",
                neutral: "➖",
                partially_supports: "⚡",
              }[assessment.alignment];

              const relevanceNote = assessment.relevance === "none" ? " [no relevant content]" :
                                    assessment.relevance === "low" ? " [low relevance]" : "";

              console.log(`         ${alignmentIcon} ${assessment.alignment}${relevanceNote} (${(assessment.confidence * 100).toFixed(0)}% confident)`);

              sourceResults.push({
                url: source.url,
                name: source.name || source.url,
                credibility: credibility.overallCredibility,
                alignment: assessment.alignment,
                relevantExcerpt: assessment.relevantExcerpt.slice(0, 200),
                confidence: assessment.confidence,
                relevance: assessment.relevance,
              } as VerificationResult["sources"][0] & { relevance: string });

            } catch (error) {
              console.log(`         ⚠️ Error checking source: ${error instanceof Error ? error.message : "Unknown"}`);
            }
          }

          // Calculate overall verification status
          const supporting = sourceResults.filter(s => s.alignment === "supports" || s.alignment === "partially_supports");
          const contradicting = sourceResults.filter(s => s.alignment === "contradicts");

          // Determine overall status and adjusted confidence
          // Filter out sources with no relevant content
          const relevantSourceResults = sourceResults.filter(s =>
            (s as unknown as { relevance: string }).relevance !== "none"
          );

          const overallPrompt = `Based on these source assessments, determine the overall verification status for this claim:

CLAIM: ${claim.statement}
ORIGINAL CONFIDENCE: ${(pattern.confidence * 100).toFixed(0)}%

RELEVANT SOURCE ASSESSMENTS (${relevantSourceResults.length} of ${sourceResults.length} sources had relevant content):
${relevantSourceResults.length > 0 ?
  relevantSourceResults.map(s => `- ${s.name}: ${s.alignment} (${(s.confidence * 100).toFixed(0)}% confident, ${(s.credibility * 100).toFixed(0)}% source credibility)
  Excerpt: ${s.relevantExcerpt}`).join("\n") :
  "No sources had directly relevant content for this claim."}

Determine:
1. Overall status:
   - "corroborated": multiple high-quality sources directly support the claim
   - "contested": significant contradictions found between sources
   - "partially_supported": some support with caveats or weak evidence
   - "unverified": insufficient relevant evidence found (this is expected when sources lack specific content)
2. Adjusted confidence (0-1):
   - If corroborated by multiple credible sources: increase from original
   - If contested: decrease significantly
   - If unverified due to lack of relevant sources: slight decrease but preserve most of original confidence
   - If partially supported: slight decrease
3. Notes on the verification explaining what was found or why verification was limited
4. Any significant conflicts between sources`;

          const overallResult = await llm.completeStructured(
            [{ role: "user", content: overallPrompt }],
            {
              schema: OverallVerificationSchema,
              systemPrompt: "You are an expert fact-checker synthesizing verification results.",
              schemaName: "overall_verification",
              schemaDescription: "Overall verification status and adjusted confidence",
            }
          );

          const statusIcon = {
            corroborated: "✅",
            contested: "❌",
            unverified: "❓",
            partially_supported: "⚡",
          }[overallResult.data.status];

          const confidenceChange = overallResult.data.adjustedConfidence - pattern.confidence;
          const changeIcon = confidenceChange > 0 ? "📈" : confidenceChange < 0 ? "📉" : "➖";

          console.log(`\n      ${statusIcon} Status: ${overallResult.data.status}`);
          console.log(`      ${changeIcon} Confidence: ${(pattern.confidence * 100).toFixed(0)}% → ${(overallResult.data.adjustedConfidence * 100).toFixed(0)}%`);
          console.log(`      📝 ${overallResult.data.verificationNotes.slice(0, 150)}...`);

          if (overallResult.data.conflicts.length > 0) {
            console.log(`      ⚠️ Conflicts found:`);
            for (const conflict of overallResult.data.conflicts) {
              console.log(`         [${conflict.severity}] ${conflict.description}`);
            }
          }

          const verificationResult = {
            claimId: `${pattern.id}_claim_${i}`,
            status: overallResult.data.status,
            corroboratingSourcesCount: supporting.length,
            conflictingSourcesCount: contradicting.length,
            sources: sourceResults,
            adjustedConfidence: overallResult.data.adjustedConfidence,
            verificationNotes: overallResult.data.verificationNotes,
            conflicts: overallResult.data.conflicts.map(c => ({ ...c, sources: [] })),
          };

          allResults.push(verificationResult);

          // Save to database
          const verificationId = `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await verificationRepo.create({
            id: verificationId,
            sourceType: "pattern",
            sourceId: pattern.id,
            claimStatement: claim.statement,
            claimCategory: claim.category,
            originalConfidence: pattern.confidence,
            status: overallResult.data.status,
            adjustedConfidence: overallResult.data.adjustedConfidence,
            verificationNotes: overallResult.data.verificationNotes,
            corroboratingSourcesCount: supporting.length,
            conflictingSourcesCount: contradicting.length,
            sourceAssessments: sourceResults.map(s => ({
              url: s.url,
              name: s.name,
              credibility: s.credibility,
              alignment: s.alignment,
              relevance: (s as unknown as { relevance: string }).relevance as "high" | "medium" | "low" | "none",
              relevantExcerpt: s.relevantExcerpt,
              confidence: s.confidence,
            })),
            conflicts: overallResult.data.conflicts.map(c => ({ ...c, sources: [] as string[] })),
          });

          console.log(`      💾 Saved verification: ${verificationId}`);
          verificationIds.push(verificationId);
        }

      } catch (error) {
        console.error(`❌ Error processing pattern ${pattern.id}:`, error);
      }
    }

    // Summary
    if (!options.dryRun && allResults.length > 0) {
      console.log(`\n\n${"=".repeat(60)}`);
      console.log("📊 VERIFICATION SUMMARY");
      console.log(`${"=".repeat(60)}\n`);

      const corroborated = allResults.filter(r => r.status === "corroborated").length;
      const contested = allResults.filter(r => r.status === "contested").length;
      const partial = allResults.filter(r => r.status === "partially_supported").length;
      const unverified = allResults.filter(r => r.status === "unverified").length;

      console.log(`Total claims verified: ${allResults.length}`);
      console.log(`  ✅ Corroborated: ${corroborated}`);
      console.log(`  ⚡ Partially supported: ${partial}`);
      console.log(`  ❌ Contested: ${contested}`);
      console.log(`  ❓ Unverified: ${unverified}`);

      const avgConfidenceChange = allResults.reduce((sum, r) => sum + r.adjustedConfidence, 0) / allResults.length;
      console.log(`\nAverage adjusted confidence: ${(avgConfidenceChange * 100).toFixed(0)}%`);

      const totalConflicts = allResults.reduce((sum, r) => sum + r.conflicts.length, 0);
      if (totalConflicts > 0) {
        console.log(`\n⚠️ Total conflicts identified: ${totalConflicts}`);
      }
    }

    // Generate feedback events for the feedback loop system
    if (!options.dryRun && verificationIds.length > 0) {
      console.log("\n🔄 Generating feedback events for continuous improvement...");
      try {
        const feedbackCount = await generateVerificationFeedback(db, verificationIds);
        console.log(`   Generated ${feedbackCount} feedback events`);
      } catch (error) {
        console.error(`   ⚠️ Error generating feedback:`, error instanceof Error ? error.message : "Unknown");
      }
    }

    console.log("\n✅ Verification complete!");
    process.exit(0);
  });

program.parse();
