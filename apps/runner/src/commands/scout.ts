#!/usr/bin/env node
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../../.env");
dotenv.config({ path: envPath });

import { Command } from "commander";
import { ScoutAgent } from "@orbit/agent";
import { getDatabase, PatternRepository, SourceHealthRepository } from "@orbit/db";
import { generateId, computeContentHash } from "@orbit/core";
import { fetchSource, fetchSourceWithLogging, type SourceConfig } from "../sources/fetcher.js";
import { loadSourcesConfig } from "../sources/config.js";
import { assessSourceCredibility, getCredibilityReport, hasKnownProfile, type SourceCredibility } from "../sources/credibility.js";
import {
  isLowCredibilitySource,
  RECOMMENDED_SOURCES,
  PUBLIC_HIGH_CREDIBILITY_SOURCES,
  FREEMIUM_SOURCES,
  ALL_ACCESSIBLE_SOURCES,
} from "../sources/recommended.js";
import { getAccessibility, isPubliclyAccessible } from "../sources/accessibility.js";
import { getLLMCredibilityAssessor } from "../sources/llm-assessor.js";

const program = new Command();

program
  .name("scout")
  .description("Run the Scout agent to discover patterns from sources")
  .option("-q, --query <query>", "Search query to focus on")
  .option("-d, --domains <domains>", "Comma-separated domains to focus on")
  .option("-s, --sources <file>", "Path to sources config file", "sources.json")
  .option("-u, --url <url>", "Single URL to analyze")
  .option("--dry-run", "Don't save patterns to database")
  .option("-v, --verbose", "Verbose output")
  .option("--min-credibility <score>", "Minimum source credibility (0-1)", "0.6")
  .option("--show-credibility", "Show credibility report for sources")
  .option("--recommended", "Use public high-credibility sources (default tier)")
  .option("--include-freemium", "Also include freemium sources (may have limited access)")
  .option("--public-only", "Only use fully public sources, skip any with paywalls")
  .option("--skip-low-credibility", "Skip sources flagged as low credibility")
  .option("--llm-assess", "Use LLM to assess unknown sources (uses API credits)")
  .action(async (options) => {
    console.log("🔭 Starting Scout Agent...\n");

    const verbose = options.verbose;
    const dryRun = options.dryRun;
    const minCredibility = parseFloat(options.minCredibility);
    const showCredibility = options.showCredibility;
    const skipLowCredibility = options.skipLowCredibility;

    // Load sources
    let sources: SourceConfig[] = [];

    if (options.recommended) {
      // Use curated high-credibility sources
      if (options.includeFreemium) {
        sources = ALL_ACCESSIBLE_SOURCES;
        console.log(`Using ${sources.length} accessible sources (public + freemium)`);
      } else {
        sources = PUBLIC_HIGH_CREDIBILITY_SOURCES;
        console.log(`Using ${sources.length} public high-credibility sources`);
      }
    } else if (options.url) {
      // Single URL mode
      sources = [{ url: options.url, type: "observation" as const, name: "CLI Input" }];
    } else {
      // Load from config
      try {
        const config = loadSourcesConfig(options.sources);
        sources = config.sources;
        console.log(`Loaded ${sources.length} sources from ${options.sources}`);
      } catch (error) {
        console.error("No sources config found. Use --url, --recommended, or create sources.json");
        console.log("\nExample sources.json:");
        console.log(JSON.stringify({
          sources: [
            { name: "AI News", url: "https://example.com/ai-news", type: "news", domains: ["technology", "ai"] },
            { name: "Policy Report", url: "https://example.com/report.pdf", type: "report", domains: ["policy"] }
          ]
        }, null, 2));
        process.exit(1);
      }
    }

    // Assess source credibility
    console.log("\n📊 Assessing source credibility...");
    const sourcesWithCredibility: Array<{ source: SourceConfig; credibility: SourceCredibility; skip: boolean }> = [];
    const llmAssessor = options.llmAssess ? getLLMCredibilityAssessor() : null;

    for (const source of sources) {
      let credibility: SourceCredibility;
      let assessmentMethod = "known";

      // Check if we have a known profile
      if (hasKnownProfile(source.url)) {
        credibility = assessSourceCredibility(source.url);
      } else if (llmAssessor) {
        // Use LLM to assess unknown sources
        console.log(`  🔍 Analyzing ${source.name || source.url} with LLM...`);
        try {
          credibility = await llmAssessor.assessSource(source.url);
          assessmentMethod = "llm";
        } catch (error) {
          console.log(`    ⚠️ LLM assessment failed, using defaults`);
          credibility = assessSourceCredibility(source.url);
        }
      } else {
        credibility = assessSourceCredibility(source.url);
      }

      const isLowCred = isLowCredibilitySource(source.url);
      const belowThreshold = credibility.overallCredibility < minCredibility;
      const notPublic = options.publicOnly && !isPubliclyAccessible(source.url);
      const skip = skipLowCredibility && (isLowCred || belowThreshold) || notPublic;

      sourcesWithCredibility.push({ source, credibility, skip });

      // Get accessibility info
      const accessibility = getAccessibility(source.url);

      if (showCredibility || verbose) {
        const methodNote = assessmentMethod === "llm" ? " (LLM assessed)" : "";
        console.log(`\n  ${source.name || source.url}:${methodNote}`);
        console.log(`    Credibility: ${(credibility.overallCredibility * 100).toFixed(0)}%`);
        console.log(`    Independence: ${(credibility.independenceScore * 100).toFixed(0)}%`);
        console.log(`    Access: ${accessibility.access}${accessibility.notes ? ` (${accessibility.notes})` : ""}`);
        console.log(`    Incentive Type: ${credibility.incentiveProfile.type}`);
        console.log(`    Confidence: ${((credibility.confidenceInAssessment ?? 1) * 100).toFixed(0)}%`);
        if (credibility.flags.length > 0) {
          for (const flag of credibility.flags) {
            const icon = flag.type === "warning" ? "⚠️ " : flag.type === "caution" ? "⚡" : "ℹ️ ";
            console.log(`    ${icon} ${flag.message}`);
          }
        }
        if (skip) {
          const reason = notPublic ? "not publicly accessible" : "below credibility threshold";
          console.log(`    ❌ SKIPPING (${reason})`);
        }
      } else {
        const icon = credibility.overallCredibility >= 0.7 ? "✓" :
                     credibility.overallCredibility >= 0.5 ? "⚡" : "⚠️";
        const skipNote = skip ? (notPublic ? " [PAYWALL]" : " [SKIPPED]") : "";
        const methodNote = assessmentMethod === "llm" ? " (LLM)" : "";
        const accessNote = accessibility.access !== "public" ? ` [${accessibility.access}]` : "";
        console.log(`  ${icon} ${source.name || source.url}: ${(credibility.overallCredibility * 100).toFixed(0)}%${accessNote}${methodNote}${skipNote}`);
      }
    }

    // Filter to non-skipped sources
    const activeSources = sourcesWithCredibility.filter(s => !s.skip);
    if (activeSources.length === 0) {
      console.error("\n❌ No sources passed credibility threshold. Try --min-credibility 0.5 or different sources.");
      process.exit(1);
    }

    sources = activeSources.map(s => s.source);

    // Get database connection for fetch logging
    const db = getDatabase();

    // Fetch content from sources (with logging for source health tracking)
    console.log("\n📥 Fetching sources...");
    const fetchedSources = [];

    for (const source of sources) {
      if (verbose) console.log(`  Fetching: ${source.url}`);
      try {
        const { content, responseTimeMs } = await fetchSourceWithLogging(source, db, { jobId: "scout-cli" });
        fetchedSources.push({
          type: source.type,
          content,
          url: source.url,
          title: source.name,
        });
        const timeNote = verbose ? ` (${responseTimeMs}ms)` : "";
        console.log(`  ✓ ${source.name || source.url}${timeNote}`);
      } catch (error) {
        console.error(`  ✗ ${source.name || source.url}: ${error instanceof Error ? error.message : "Failed"}`);
      }
    }

    if (fetchedSources.length === 0) {
      console.error("\nNo sources fetched successfully. Exiting.");
      process.exit(1);
    }

    // Recalculate source health for fetched domains
    if (verbose) console.log("\n📊 Updating source health...");
    const healthRepo = new SourceHealthRepository(db);
    const fetchedDomains = new Set(sources.map(s => {
      try {
        return new URL(s.url).hostname.replace(/^www\./, "");
      } catch {
        return s.url;
      }
    }));
    for (const domain of fetchedDomains) {
      try {
        await healthRepo.recalculateHealth(domain);
        if (verbose) console.log(`  ✓ ${domain}`);
      } catch (error) {
        if (verbose) console.log(`  ✗ ${domain}: ${error instanceof Error ? error.message : "Failed"}`);
      }
    }

    // Get existing patterns to avoid duplicates
    const patternRepo = new PatternRepository(db);
    const existingPatterns = await patternRepo.findByFilters({}, { limit: 100 });

    const existingPatternsInput = existingPatterns.data.map(p => ({
      id: p.id,
      title: p.title,
      patternType: p.patternType,
    }));

    // Run Scout Agent
    console.log("\n🤖 Running Scout Agent...");
    const scout = new ScoutAgent();

    const query = options.query || "systemic issues, structural problems, coordination failures";
    const domains = options.domains?.split(",").map((d: string) => d.trim()) || [];

    const result = await scout.run({
      payload: {
        query,
        domains: domains.length > 0 ? domains : undefined,
        sources: fetchedSources,
        existingPatterns: existingPatternsInput,
      },
    });

    if (!result.success) {
      console.error("\n❌ Scout agent failed:", result.error);
      process.exit(1);
    }

    const output = result.result as {
      patterns: Array<{
        title: string;
        description: string;
        patternType: string;
        domains: string[];
        geographies: string[];
        severity: string;
        confidence: number;
        supportingEvidence: string[];
        sourceUrls: string[];
        relatedPatterns: string[];
      }>;
      gaps: string[];
      suggestedQueries: string[];
    };

    console.log(`\n✨ Discovered ${output.patterns.length} patterns`);

    // Display results
    for (const pattern of output.patterns) {
      console.log(`\n  📌 ${pattern.title}`);
      console.log(`     Type: ${pattern.patternType}`);
      console.log(`     Severity: ${pattern.severity}`);
      console.log(`     Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
      console.log(`     Domains: ${pattern.domains.join(", ")}`);
      if (verbose) {
        console.log(`     Description: ${pattern.description.slice(0, 200)}...`);
      }
    }

    if (output.gaps.length > 0) {
      console.log("\n📋 Information gaps identified:");
      output.gaps.forEach((gap, i) => console.log(`  ${i + 1}. ${gap}`));
    }

    if (output.suggestedQueries.length > 0) {
      console.log("\n🔍 Suggested follow-up queries:");
      output.suggestedQueries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
    }

    // Save to database
    if (!dryRun && output.patterns.length > 0) {
      console.log("\n💾 Saving patterns to database...");

      // Create a map of URLs to source metadata for quick lookup
      const sourcesByUrl = new Map(
        fetchedSources.map(s => [s.url, s])
      );

      for (const pattern of output.patterns) {
        const id = generateId("pat");
        const payload = { ...pattern, type: "Pattern" as const };
        const contentHash = await computeContentHash(payload);

        // Filter to only sources that the LLM identified as contributing to this pattern
        const patternSourceUrls = pattern.sourceUrls || [];
        let patternSources = patternSourceUrls
          .map(url => sourcesByUrl.get(url))
          .filter((s): s is NonNullable<typeof s> => s !== undefined)
          .map(s => ({
            type: s.type,
            url: s.url || "",
            title: s.title || "",
            reliability: 0.7,
          }));

        // Fallback: if no sources matched (e.g., LLM returned slightly different URLs),
        // try partial URL matching
        if (patternSources.length === 0 && patternSourceUrls.length > 0) {
          patternSources = fetchedSources
            .filter(s => patternSourceUrls.some(url =>
              s.url?.includes(url) || url.includes(s.url || "---never-match---")
            ))
            .map(s => ({
              type: s.type,
              url: s.url || "",
              title: s.title || "",
              reliability: 0.7,
            }));
        }

        // Final fallback: if still no matches, use all sources (legacy behavior)
        if (patternSources.length === 0) {
          if (verbose) {
            console.log(`  ⚠️ No source matches for "${pattern.title}", using all sources`);
          }
          patternSources = fetchedSources.map(s => ({
            type: s.type,
            url: s.url || "",
            title: s.title || "",
            reliability: 0.7,
          }));
        }

        await patternRepo.create({
          id,
          contentHash,
          parentHash: null,
          author: "agent:scout",
          authorSignature: `sig:scout-${Date.now()}`,
          createdAt: new Date(),
          version: 1,
          status: "draft",
          title: pattern.title,
          description: pattern.description,
          patternType: pattern.patternType as "policy_gap" | "structural_inefficiency" | "feedback_loop" | "information_asymmetry" | "coordination_failure" | "other",
          domains: pattern.domains,
          geographies: pattern.geographies,
          sources: patternSources,
          firstObserved: new Date(),
          observationFrequency: "recurring",
          clusterId: null,
          confidence: pattern.confidence,
        });

        console.log(`  ✓ Saved: ${pattern.title} (${patternSources.length} sources)`);
      }
    } else if (dryRun) {
      console.log("\n(Dry run - patterns not saved)");
    }

    // Display LLM usage
    console.log("\n📊 LLM Usage:");
    const totalTokens = result.llmCalls.reduce((sum, c) => sum + c.tokens.input + c.tokens.output, 0);
    console.log(`  Calls: ${result.llmCalls.length}`);
    console.log(`  Total tokens: ${totalTokens.toLocaleString()}`);

    console.log("\n✅ Scout run complete!");
  });

program.parse();
