#!/usr/bin/env npx tsx
/**
 * Analyze Command
 *
 * Synthesizes discovered patterns into systemic issues with IUTLN scoring.
 * Uses LLM to identify clusters of related patterns and create issues.
 */

import { program } from "commander";
import { z } from "zod";
import { getDatabase, PatternRepository, IssueRepository, type PatternRow } from "@orbit/db";
import { getLLMClient } from "@orbit/llm";
import crypto from "crypto";

const IssueSchema = z.object({
  title: z.string(),
  summary: z.string(),
  patternIds: z.array(z.string()),
  rootCauses: z.array(z.string()),
  affectedDomains: z.array(z.string()),
  leveragePoints: z.array(z.string()),
  // IUTLN scores
  scoreImpact: z.number().min(0).max(1),
  scoreUrgency: z.number().min(0).max(1),
  scoreTractability: z.number().min(0).max(1),
  scoreLegitimacy: z.number().min(0).max(1),
  scoreNeglectedness: z.number().min(0).max(1),
  // Time dimension
  timeHorizon: z.enum(["months", "years", "decades"]),
  propagationVelocity: z.enum(["fast", "medium", "slow"]),
  // Relationships
  upstreamIssues: z.array(z.string()),
  downstreamIssues: z.array(z.string()),
  relatedIssues: z.array(z.string()),
});

const AnalysisOutputSchema = z.object({
  issues: z.array(IssueSchema),
  reasoning: z.string(),
});

type IssueData = z.infer<typeof IssueSchema>;

program
  .name("analyze")
  .description("Synthesize patterns into systemic issues with IUTLN scoring")
  .option("-n, --max-issues <count>", "Maximum number of issues to create", "5")
  .option("--min-patterns <count>", "Minimum patterns per issue", "1")
  .option("--dry-run", "Preview issues without saving to database")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options) => {
    console.log("🔬 Starting Pattern Analysis...\n");

    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const issueRepo = new IssueRepository(db);
    const llm = getLLMClient();

    // Fetch all patterns
    const { data: patterns } = await patternRepo.findMany({ limit: 100 });

    if (patterns.length === 0) {
      console.error("❌ No patterns found. Run scout first to discover patterns.");
      process.exit(1);
    }

    console.log(`📋 Found ${patterns.length} patterns to analyze\n`);

    if (options.verbose) {
      for (const p of patterns) {
        console.log(`  - ${p.title} (${p.patternType}, ${p.severity})`);
      }
      console.log();
    }

    // Fetch existing issues to avoid duplicates and enable relationship building
    const { data: existingIssues } = await issueRepo.findByFilters({}, { limit: 100 });
    const existingIssueTitles = new Set(existingIssues.map(i => i.title.toLowerCase()));

    console.log(`📊 ${existingIssues.length} existing issues in database\n`);

    // Use LLM to synthesize issues from patterns
    console.log("🤖 Synthesizing issues from patterns...\n");

    const patternsContext = patterns.map((p, i) => `
Pattern ${i + 1}: ${p.title}
  ID: ${p.id}
  Type: ${p.patternType}
  Severity: ${p.severity}
  Confidence: ${(p.confidence * 100).toFixed(0)}%
  Domains: ${p.domains.join(", ")}
  Description: ${p.description}
  Evidence: ${(p.evidence || "No evidence provided").slice(0, 200)}...
`).join("\n");

    const existingIssuesContext = existingIssues.length > 0
      ? `\nExisting issues (avoid duplicates):\n${existingIssues.map(i => `- ${i.title}`).join("\n")}`
      : "";

    const systemPrompt = `You are an expert systems analyst who identifies systemic issues from observed patterns.

Your task is to synthesize related patterns into coherent systemic issues and score them using the IUTLN framework:

**IUTLN Scoring Framework** (0-1 scale):
- **I (Impact)**: Scale and severity of harm. High = affects many people or causes severe harm.
- **U (Urgency)**: Time sensitivity. High = deteriorating quickly, needs immediate action.
- **T (Tractability)**: Feasibility of progress. High = clear path to improvement exists.
- **L (Legitimacy)**: Public/institutional recognition. High = widely recognized, has stakeholder buy-in.
- **N (Neglectedness)**: How underserved by existing efforts. High = few others working on it, high marginal value.

**Guidelines**:
1. Group related patterns that share root causes or domains
2. Each issue should represent a distinct systemic problem
3. Identify root causes, not just symptoms
4. Be specific about affected domains and leverage points
5. Score conservatively - don't inflate scores
6. Consider time horizons realistically
7. Identify relationships between issues (upstream causes, downstream effects)`;

    const userPrompt = `Analyze these patterns and synthesize them into ${options.maxIssues} distinct systemic issues:

${patternsContext}
${existingIssuesContext}

For each issue:
1. Create a clear, specific title
2. Write a concise summary (2-3 sentences)
3. List which patterns (by ID) support this issue
4. Identify root causes (underlying drivers, not symptoms)
5. List affected domains
6. Identify leverage points (where interventions could be effective)
7. Assign IUTLN scores (0-1) with careful justification
8. Determine time horizon and propagation velocity
9. Note relationships to other issues or existing issues

Output ${options.maxIssues} issues, each supported by at least ${options.minPatterns} patterns.`;

    try {
      const result = await llm.completeStructured(
        [{ role: "user", content: userPrompt }],
        {
          schema: AnalysisOutputSchema,
          systemPrompt,
          schemaName: "analysis_output",
          schemaDescription: "Synthesized issues from patterns",
        }
      );

      const issues = result.data.issues;
      console.log(`✨ Synthesized ${issues.length} issues\n`);

      // Display issues
      for (const issue of issues) {
        const composite = calculateCompositeScore(issue);
        const scoreColor = composite >= 0.7 ? "\x1b[31m" : composite >= 0.4 ? "\x1b[33m" : "\x1b[32m";

        console.log(`  📌 ${issue.title}`);
        console.log(`     ${issue.summary.slice(0, 100)}...`);
        console.log(`     Patterns: ${issue.patternIds.length} | Domains: ${issue.affectedDomains.join(", ")}`);
        console.log(`     IUTLN: I=${(issue.scoreImpact * 100).toFixed(0)}% U=${(issue.scoreUrgency * 100).toFixed(0)}% T=${(issue.scoreTractability * 100).toFixed(0)}% L=${(issue.scoreLegitimacy * 100).toFixed(0)}% N=${(issue.scoreNeglectedness * 100).toFixed(0)}%`);
        console.log(`     ${scoreColor}Composite: ${(composite * 100).toFixed(0)}%\x1b[0m | Time: ${issue.timeHorizon} | Velocity: ${issue.propagationVelocity}`);
        console.log();
      }

      if (options.verbose) {
        console.log("📝 Analysis reasoning:");
        console.log(`   ${result.data.reasoning}\n`);
      }

      // Save to database
      if (!options.dryRun) {
        console.log("💾 Saving issues to database...");

        let saved = 0;
        let skipped = 0;

        // First pass: Create all issues without relationships
        const createdIssues: Array<{ id: string; title: string; issue: IssueData }> = [];

        for (const issue of issues) {
          // Skip duplicates
          if (existingIssueTitles.has(issue.title.toLowerCase())) {
            console.log(`  ⏭️  Skipped (duplicate): ${issue.title}`);
            skipped++;
            continue;
          }

          const id = `issue_${crypto.randomBytes(8).toString("hex")}`;
          const contentHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(issue))
            .digest("hex");

          const composite = calculateCompositeScore(issue);

          // Create issue without relationships first
          await issueRepo.create({
            id,
            contentHash,
            author: "system:analyze",
            authorSignature: "auto-generated",
            title: issue.title,
            summary: issue.summary,
            patternIds: issue.patternIds,
            rootCauses: issue.rootCauses,
            affectedDomains: issue.affectedDomains,
            leveragePoints: issue.leveragePoints,
            scoreImpact: issue.scoreImpact,
            scoreUrgency: issue.scoreUrgency,
            scoreTractability: issue.scoreTractability,
            scoreLegitimacy: issue.scoreLegitimacy,
            scoreNeglectedness: issue.scoreNeglectedness,
            compositeScore: composite,
            timeHorizon: issue.timeHorizon,
            propagationVelocity: issue.propagationVelocity,
            upstreamIssues: [],
            downstreamIssues: [],
            relatedIssues: [],
            issueStatus: "identified",
          });

          createdIssues.push({ id, title: issue.title, issue });
          console.log(`  ✓ Saved: ${issue.title}`);
          saved++;
        }

        // Second pass: Resolve relationship strings to actual issue IDs
        if (createdIssues.length > 0) {
          console.log("\n🔗 Resolving issue relationships...");

          // Build a map of title (lowercase) -> id for all issues (existing + new)
          const titleToId = new Map<string, string>();
          for (const existing of existingIssues) {
            titleToId.set(existing.title.toLowerCase(), existing.id);
          }
          for (const created of createdIssues) {
            titleToId.set(created.title.toLowerCase(), created.id);
          }

          // Helper function to resolve relationship strings to IDs
          const resolveRelationships = (relationships: string[]): string[] => {
            return relationships
              .map(rel => {
                const relLower = rel.toLowerCase();
                // Try exact match first
                if (titleToId.has(relLower)) {
                  return titleToId.get(relLower)!;
                }
                // Try partial match (relationship string contains or is contained by title)
                for (const [title, id] of titleToId.entries()) {
                  if (title.includes(relLower) || relLower.includes(title)) {
                    return id;
                  }
                }
                // No match found - skip this relationship
                return null;
              })
              .filter((id): id is string => id !== null);
          };

          // Update each created issue with resolved relationships
          for (const { id, issue } of createdIssues) {
            const resolvedUpstream = resolveRelationships(issue.upstreamIssues);
            const resolvedDownstream = resolveRelationships(issue.downstreamIssues);
            const resolvedRelated = resolveRelationships(issue.relatedIssues);

            // Only update if there are any resolved relationships
            if (resolvedUpstream.length > 0 || resolvedDownstream.length > 0 || resolvedRelated.length > 0) {
              await issueRepo.update(id, {
                upstreamIssues: resolvedUpstream,
                downstreamIssues: resolvedDownstream,
                relatedIssues: resolvedRelated,
              });

              if (options.verbose) {
                console.log(`  🔗 ${issue.title}: ${resolvedUpstream.length} upstream, ${resolvedDownstream.length} downstream, ${resolvedRelated.length} related`);
              }
            }
          }

          console.log("  ✓ Relationships resolved");
        }

        console.log(`\n✅ Analysis complete: ${saved} issues created, ${skipped} skipped`);
      } else {
        console.log("🔍 Dry run - no changes saved");
      }

      // Show token usage
      console.log(`\n📊 LLM Usage: ${result.usage?.totalTokens ?? "unknown"} tokens`);

    } catch (error) {
      console.error("❌ Analysis failed:", error);
      process.exit(1);
    }

    process.exit(0);
  });

function calculateCompositeScore(issue: IssueData): number {
  // Weighted average of IUTLN scores
  // Impact and Urgency weighted higher for prioritization
  return (
    issue.scoreImpact * 0.25 +
    issue.scoreUrgency * 0.25 +
    issue.scoreTractability * 0.2 +
    issue.scoreLegitimacy * 0.15 +
    issue.scoreNeglectedness * 0.15
  );
}

program.parse();
