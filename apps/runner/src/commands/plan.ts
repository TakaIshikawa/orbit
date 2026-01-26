#!/usr/bin/env npx tsx
/**
 * Plan Command
 *
 * Generates solution proposals for identified issues.
 * Uses the Analyst and Planner agents to create comprehensive solutions.
 */

import { program } from "commander";
import { z } from "zod";
import { getDatabase, PatternRepository, IssueRepository, SolutionRepository, ProblemBriefRepository, SituationModelRepository } from "@orbit/db";
import { getLLMClient } from "@orbit/llm";
import crypto from "crypto";

const SolutionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  solutionType: z.enum(["tool", "platform", "system", "automation", "research", "model", "policy", "other"]),
  mechanism: z.string().describe("How this solution addresses the root causes"),
  targetLeveragePoints: z.array(z.string()),
  components: z.array(z.object({
    name: z.string(),
    description: z.string(),
    complexity: z.enum(["low", "medium", "high"]),
  })),
  risks: z.array(z.object({
    description: z.string(),
    likelihood: z.enum(["low", "medium", "high"]),
    impact: z.enum(["low", "medium", "high"]),
    mitigation: z.string(),
  })),
  executionSteps: z.array(z.object({
    phase: z.number(),
    name: z.string(),
    description: z.string(),
    deliverables: z.array(z.string()),
  })),
  successMetrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    measurementMethod: z.string(),
  })),
  estimatedImpact: z.object({
    scope: z.enum(["local", "regional", "national", "global"]),
    magnitude: z.enum(["incremental", "moderate", "significant", "transformative"]),
    timeToImpact: z.enum(["immediate", "months", "years", "decade"]),
  }),
  confidence: z.number().min(0).max(1),
  feasibilityScore: z.number().min(0).max(1),
  impactScore: z.number().min(0).max(1),
});

const PlanOutputSchema = z.object({
  issueId: z.string(),
  issueTitle: z.string(),
  solutions: z.array(SolutionSchema),
  recommendation: z.object({
    primarySolutionIndex: z.number(),
    reasoning: z.string(),
  }),
  openQuestions: z.array(z.string()),
});

type SolutionData = z.infer<typeof SolutionSchema>;

program
  .name("plan")
  .description("Generate solution proposals for identified issues")
  .option("-i, --issue <id>", "Plan solutions for a specific issue ID")
  .option("-n, --max-solutions <count>", "Maximum solutions per issue", "3")
  .option("--all", "Generate solutions for all issues without solutions")
  .option("--dry-run", "Preview solutions without saving to database")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options) => {
    console.log("🎯 Starting Solution Planning...\n");

    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const issueRepo = new IssueRepository(db);
    const solutionRepo = new SolutionRepository(db);
    const briefRepo = new ProblemBriefRepository(db);
    const situationRepo = new SituationModelRepository(db);
    const llm = getLLMClient();

    // Get issues to plan for
    let issuesToPlan: Array<{
      id: string;
      title: string;
      summary: string;
      rootCauses: string[];
      affectedDomains: string[];
      leveragePoints: string[];
      patternIds: string[];
      scoreImpact: number;
      scoreUrgency: number;
      scoreTractability: number;
    }> = [];

    if (options.issue) {
      const issue = await issueRepo.findById(options.issue);
      if (!issue) {
        console.error(`❌ Issue not found: ${options.issue}`);
        process.exit(1);
      }
      issuesToPlan = [issue];
    } else if (options.all) {
      // Get issues that don't have solutions yet
      const { data: allIssues } = await issueRepo.findByFilters({}, { limit: 50 });
      const { data: allSolutions } = await solutionRepo.findMany({ limit: 100 });

      const issuesWithSolutions = new Set(allSolutions.map(s => s.issueId));
      issuesToPlan = allIssues.filter(i => !issuesWithSolutions.has(i.id));

      if (issuesToPlan.length === 0) {
        console.log("✅ All issues already have solutions.");
        process.exit(0);
      }
    } else {
      // Default: get highest priority issue without solution
      const { data: allIssues } = await issueRepo.findByFilters({}, { limit: 10, sortBy: "compositeScore" });
      const { data: allSolutions } = await solutionRepo.findMany({ limit: 100 });

      const issuesWithSolutions = new Set(allSolutions.map(s => s.issueId));
      const topIssue = allIssues.find(i => !issuesWithSolutions.has(i.id));

      if (!topIssue) {
        console.log("✅ All issues already have solutions. Use --issue <id> to regenerate.");
        process.exit(0);
      }
      issuesToPlan = [topIssue];
    }

    console.log(`📋 Planning solutions for ${issuesToPlan.length} issue(s)\n`);

    for (const issue of issuesToPlan) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎯 Issue: ${issue.title}`);
      console.log(`   ID: ${issue.id}`);
      console.log(`${"=".repeat(60)}\n`);

      // Get related patterns for context
      const patterns = await Promise.all(
        issue.patternIds.map(id => patternRepo.findById(id))
      );
      const validPatterns = patterns.filter(Boolean);

      const patternsContext = validPatterns.length > 0
        ? validPatterns.map(p => `- ${p!.title}: ${p!.description.slice(0, 150)}...`).join("\n")
        : "No linked patterns";

      // Get problem brief for this issue (provides goals, constraints, action space)
      const brief = await briefRepo.findByIssueId(issue.id);

      // Get situation model if brief exists
      const situation = brief ? await situationRepo.findByProblemBriefId(brief.id) : null;

      if (options.verbose) {
        console.log(`   Brief: ${brief ? "Available" : "Not generated"}`);
        console.log(`   Situation Model: ${situation ? "Available" : "Not generated"}`);
      }

      console.log("🤖 Generating solution proposals...\n");

      const systemPrompt = `You are an expert solution architect who designs practical interventions for complex systemic problems.

**Design Philosophy**:
- Build, don't just advocate (focus on concrete artifacts)
- Start small, iterate fast
- Design for measurability
- Consider who will maintain/operate the solution
- Account for adoption barriers

**Solution Types**:
- **Tool**: Software/hardware that enables new capabilities
- **Platform**: Infrastructure enabling others to build
- **System**: Integrated set of components
- **Automation**: Reducing manual effort
- **Research**: Generating new knowledge
- **Model**: Analytical framework or simulation
- **Policy**: Regulatory or governance intervention

**Scoring**:
- Feasibility: How achievable with current resources/knowledge (0-1)
- Impact: Expected positive change if successful (0-1)
- Confidence: How certain you are in the proposal (0-1)`;

      // Build brief context if available
      let briefContext = "";
      if (brief) {
        const mustGoals = brief.goals.filter((g: { priority: string }) => g.priority === "must");
        const shouldGoals = brief.goals.filter((g: { priority: string }) => g.priority === "should");
        const hardConstraints = brief.constraints.filter((c: { hard: boolean }) => c.hard);
        const softConstraints = brief.constraints.filter((c: { hard: boolean }) => !c.hard);

        briefContext = `
## Problem Brief Analysis

**Goals (Must Have)**:
${mustGoals.map((g: { description: string }) => `- ${g.description}`).join("\n") || "None specified"}

**Goals (Should Have)**:
${shouldGoals.map((g: { description: string }) => `- ${g.description}`).join("\n") || "None specified"}

**Hard Constraints** (cannot be violated):
${hardConstraints.map((c: { type: string; description: string }) => `- [${c.type}] ${c.description}`).join("\n") || "None specified"}

**Soft Constraints** (prefer to satisfy):
${softConstraints.map((c: { type: string; description: string }) => `- [${c.type}] ${c.description}`).join("\n") || "None specified"}

**Key Uncertainties**:
${brief.uncertainties.map((u: { area: string; description: string; impact: string }) => `- [${u.impact} impact] ${u.area}: ${u.description}`).join("\n") || "None identified"}

**Suggested Action Categories**:
${brief.actionSpace.map((a: { category: string; feasibility: string; timeframe: string; actions: string[] }) => `- ${a.category} (${a.feasibility} feasibility, ${a.timeframe}): ${a.actions.slice(0, 2).join("; ")}`).join("\n") || "None suggested"}
`;
      }

      // Build situation model context if available
      let situationContext = "";
      if (situation) {
        situationContext = `
## Situation Model Insights

**Key Insights**:
${situation.keyInsights.map((i: string) => `- ${i}`).join("\n") || "None"}

**Recommended Leverage Points**:
${situation.recommendedLeveragePoints.map((lp: string) => `- ${lp}`).join("\n") || "None"}
`;
        if (situation.systemMap) {
          const actors = situation.systemMap.actors || [];
          const loops = situation.systemMap.feedbackLoops || [];
          if (actors.length > 0) {
            situationContext += `
**Key System Actors**:
${actors.slice(0, 5).map((a: { name: string; type: string; influence: string }) => `- ${a.name} (${a.type}, ${a.influence} influence)`).join("\n")}
`;
          }
          if (loops.length > 0) {
            situationContext += `
**Feedback Loops to Consider**:
${loops.map((l: { name: string; type: string; description: string }) => `- [${l.type}] ${l.name}: ${l.description}`).join("\n")}
`;
          }
        }
      }

      const userPrompt = `Design ${options.maxSolutions} distinct solution proposals for this issue:

## Issue: ${issue.title}

**Summary**: ${issue.summary}

**Root Causes**:
${issue.rootCauses.map(rc => `- ${rc}`).join("\n")}

**Affected Domains**: ${issue.affectedDomains.join(", ")}

**Leverage Points**:
${issue.leveragePoints.map(lp => `- ${lp}`).join("\n")}

**Related Patterns**:
${patternsContext}

**IUTLN Scores**:
- Impact: ${(issue.scoreImpact * 100).toFixed(0)}%
- Urgency: ${(issue.scoreUrgency * 100).toFixed(0)}%
- Tractability: ${(issue.scoreTractability * 100).toFixed(0)}%
${briefContext}${situationContext}
**Instructions**:
${brief ? "Use the problem brief goals, constraints, and action space to guide solution design." : "No problem brief available - focus on root causes and leverage points."}
${situation ? "Incorporate the situation model insights and leverage points into your solutions." : ""}

For each solution:
1. Clear title and concise summary
2. Solution type and mechanism of action
3. Target leverage points (align with ${situation ? "situation model recommendations" : "issue leverage points"})
4. Components with complexity estimates
5. Key risks and mitigations${brief ? " (consider the uncertainties from the brief)" : ""}
6. Phased execution plan${brief ? " (respect the timeframes from action space)" : ""}
7. Success metrics${brief ? " (align with goal success criteria)" : ""}
8. Impact estimate
9. Feasibility and confidence scores${brief ? " (account for hard constraints)" : ""}

Then recommend the best solution with reasoning.`;

      try {
        const result = await llm.completeStructured(
          [{ role: "user", content: userPrompt }],
          {
            schema: PlanOutputSchema.omit({ issueId: true, issueTitle: true }),
            systemPrompt,
            schemaName: "plan_output",
            schemaDescription: "Solution proposals for the issue",
          }
        );

        const { solutions, recommendation, openQuestions } = result.data;

        console.log(`✨ Generated ${solutions.length} solution proposals\n`);

        // Display solutions
        for (let i = 0; i < solutions.length; i++) {
          const sol = solutions[i];
          const isRecommended = i === recommendation.primarySolutionIndex;
          const marker = isRecommended ? "⭐" : "  ";

          console.log(`${marker} Solution ${i + 1}: ${sol.title}`);
          console.log(`   Type: ${sol.solutionType}`);
          console.log(`   ${sol.summary.slice(0, 120)}...`);
          console.log(`   Mechanism: ${sol.mechanism.slice(0, 100)}...`);
          console.log(`   Components: ${sol.components.length} | Phases: ${sol.executionSteps.length}`);
          console.log(`   Feasibility: ${(sol.feasibilityScore * 100).toFixed(0)}% | Impact: ${(sol.impactScore * 100).toFixed(0)}% | Confidence: ${(sol.confidence * 100).toFixed(0)}%`);
          console.log(`   Scope: ${sol.estimatedImpact.scope} | Magnitude: ${sol.estimatedImpact.magnitude} | Time: ${sol.estimatedImpact.timeToImpact}`);
          console.log();
        }

        console.log(`📌 Recommendation: Solution ${recommendation.primarySolutionIndex + 1}`);
        console.log(`   ${recommendation.reasoning.slice(0, 200)}...`);

        if (options.verbose && openQuestions.length > 0) {
          console.log("\n❓ Open Questions:");
          for (const q of openQuestions) {
            console.log(`   - ${q}`);
          }
        }

        // Save solutions to database
        if (!options.dryRun) {
          console.log("\n💾 Saving solutions to database...");

          for (let i = 0; i < solutions.length; i++) {
            const sol = solutions[i];
            const isRecommended = i === recommendation.primarySolutionIndex;

            const id = `solution_${crypto.randomBytes(8).toString("hex")}`;
            const contentHash = crypto
              .createHash("sha256")
              .update(JSON.stringify(sol))
              .digest("hex");

            await solutionRepo.create({
              id,
              contentHash,
              author: "system:plan",
              authorSignature: "auto-generated",
              issueId: issue.id,
              title: sol.title,
              summary: sol.summary,
              solutionType: sol.solutionType,
              mechanism: sol.mechanism,
              targetLeveragePoints: sol.targetLeveragePoints,
              components: sol.components,
              risks: sol.risks,
              executionPlan: {
                steps: sol.executionSteps,
                totalPhases: sol.executionSteps.length,
              },
              successMetrics: sol.successMetrics,
              estimatedImpact: sol.estimatedImpact,
              feasibilityScore: sol.feasibilityScore,
              impactScore: sol.impactScore,
              confidence: sol.confidence,
              solutionStatus: "proposed",
            });

            console.log(`  ✓ Saved: ${sol.title}${isRecommended ? " (recommended)" : ""}`);
          }
        } else {
          console.log("\n🔍 Dry run - no changes saved");
        }

        console.log(`\n📊 LLM Usage: ${result.usage?.totalTokens ?? "unknown"} tokens`);

      } catch (error) {
        console.error(`❌ Planning failed for ${issue.title}:`, error);
      }
    }

    console.log("\n✅ Planning complete!");
    process.exit(0);
  });

program.parse();
