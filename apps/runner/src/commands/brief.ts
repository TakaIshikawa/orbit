#!/usr/bin/env npx tsx
/**
 * Brief Command
 *
 * Generates comprehensive problem briefs for issues, including:
 * - Root cause analysis
 * - Affected populations
 * - System mapping with actors and causal relationships
 * - Leverage points identification
 * - Evidence requirements
 */

import { program } from "commander";
import { z } from "zod";
import { getDatabase, PatternRepository, IssueRepository, ProblemBriefRepository, SituationModelRepository } from "@orbit/db";
import { getLLMClient } from "@orbit/llm";
import crypto from "crypto";

// Schema for Problem Brief output
const GoalSchema = z.object({
  description: z.string(),
  priority: z.enum(["must", "should", "could"]),
  measurable: z.boolean(),
  successCriteria: z.string().optional(),
});

const ConstraintSchema = z.object({
  type: z.enum(["resource", "time", "political", "technical", "ethical", "legal"]),
  description: z.string(),
  hard: z.boolean().describe("True if this is an inviolable constraint"),
  workaround: z.string().optional(),
});

const UncertaintySchema = z.object({
  area: z.string(),
  description: z.string(),
  impact: z.enum(["low", "medium", "high"]),
  resolvable: z.boolean(),
  resolutionApproach: z.string().optional(),
});

const ActionSchema = z.object({
  category: z.string(),
  actions: z.array(z.string()),
  feasibility: z.enum(["low", "medium", "high"]),
  timeframe: z.enum(["immediate", "short_term", "medium_term", "long_term"]),
});

const EvidenceRequirementSchema = z.object({
  question: z.string(),
  evidenceType: z.enum(["quantitative", "qualitative", "mixed"]),
  sources: z.array(z.string()),
  priority: z.enum(["critical", "important", "nice_to_have"]),
});

const ProblemBriefOutputSchema = z.object({
  summary: z.string().describe("Concise problem summary (2-3 sentences)").default(""),
  rootCauses: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(z.object({
      description: z.string(),
      confidence: z.number().min(0).max(1).default(0.5),
      supportingEvidence: z.preprocess(
        (val) => Array.isArray(val) ? val : [],
        z.array(z.string())
      ).default([]),
    }))
  ).default([]),
  affectedPopulations: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(z.object({
      group: z.string(),
      impactDescription: z.string(),
      scale: z.enum(["local", "regional", "national", "global"]).default("national"),
      severity: z.enum(["minor", "moderate", "severe", "critical"]).default("moderate"),
    }))
  ).default([]),
  goals: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(GoalSchema)
  ).default([]),
  constraints: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(ConstraintSchema)
  ).default([]),
  uncertainties: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(UncertaintySchema)
  ).default([]),
  actionSpace: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(ActionSchema)
  ).default([]),
  requiredEvidence: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(EvidenceRequirementSchema)
  ).default([]),
  existingInterventions: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(z.object({
      name: z.string(),
      description: z.string(),
      effectiveness: z.enum(["unknown", "ineffective", "partially_effective", "effective"]).default("unknown"),
      limitations: z.preprocess(
        (val) => Array.isArray(val) ? val : [],
        z.array(z.string())
      ).default([]),
    }))
  ).default([]),
});

// Schema for Situation Model output
const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["individual", "organization", "government", "market", "technology", "community"]),
  role: z.string(),
  interests: z.array(z.string()),
  capabilities: z.array(z.string()),
  influence: z.enum(["low", "medium", "high"]),
});

const CausalRelationshipSchema = z.object({
  from: z.string(),
  to: z.string(),
  relationship: z.enum(["causes", "enables", "prevents", "amplifies", "dampens"]),
  mechanism: z.string(),
  strength: z.enum(["weak", "moderate", "strong"]),
  confidence: z.number().min(0).max(1),
});

const FeedbackLoopSchema = z.object({
  name: z.string(),
  type: z.enum(["reinforcing", "balancing"]),
  elements: z.array(z.string()),
  description: z.string(),
  currentState: z.enum(["accelerating", "stable", "decelerating"]),
});

const LeveragePointSchema = z.object({
  element: z.string(),
  leverageType: z.enum([
    "parameter",      // Constants, numbers
    "buffer",         // Sizes of stabilizing stocks
    "structure",      // Structure of material flows
    "delay",          // Lengths of delays
    "feedback",       // Strength of feedback loops
    "information",    // Structure of information flows
    "rule",           // Rules of the system
    "goal",           // Goals of the system
    "paradigm",       // Mindset out of which the system arises
  ]),
  potentialImpact: z.enum(["low", "medium", "high", "transformative"]),
  feasibility: z.enum(["low", "medium", "high"]),
  description: z.string(),
  interventionIdeas: z.array(z.string()),
});

const SituationModelOutputSchema = z.object({
  systemBoundary: z.object({
    description: z.string().default(""),
    includedDomains: z.preprocess(
      (val) => Array.isArray(val) ? val : [],
      z.array(z.string())
    ).default([]),
    excludedDomains: z.preprocess(
      (val) => Array.isArray(val) ? val : [],
      z.array(z.string())
    ).default([]),
    timeHorizon: z.string().default("unknown"),
  }),
  actors: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(ActorSchema)
  ).default([]),
  causalRelationships: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(CausalRelationshipSchema)
  ).default([]),
  feedbackLoops: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(FeedbackLoopSchema)
  ).default([]),
  leveragePoints: z.preprocess(
    (val) => Array.isArray(val) ? val : [],
    z.array(LeveragePointSchema)
  ).default([]),
  keyInsights: z.preprocess(
    (val) => Array.isArray(val) ? val : (typeof val === 'string' ? [val] : []),
    z.array(z.string())
  ).default([]),
  systemDynamics: z.string().describe("Narrative description of how the system behaves").default("System dynamics not analyzed."),
});

const FullBriefOutputSchema = z.object({
  problemBrief: ProblemBriefOutputSchema,
  situationModel: SituationModelOutputSchema,
});

program
  .name("brief")
  .description("Generate comprehensive problem briefs for issues")
  .option("-i, --issue <id>", "Generate brief for specific issue ID")
  .option("--all", "Generate briefs for all issues without briefs")
  .option("--dry-run", "Preview brief without saving to database")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options) => {
    console.log("📋 Starting Problem Brief Generation...\n");

    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const issueRepo = new IssueRepository(db);
    const briefRepo = new ProblemBriefRepository(db);
    const modelRepo = new SituationModelRepository(db);
    const llm = getLLMClient();

    // Get issues to process
    let issuesToProcess: Array<{
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
      scoreLegitimacy: number;
      scoreNeglectedness: number;
      timeHorizon: string;
      propagationVelocity: string;
      upstreamIssues: string[];
      downstreamIssues: string[];
      relatedIssues: string[];
      issueStatus: string;
    }> = [];

    if (options.issue) {
      const issue = await issueRepo.findById(options.issue);
      if (!issue) {
        console.error(`❌ Issue not found: ${options.issue}`);
        process.exit(1);
      }
      issuesToProcess = [issue];
    } else if (options.all) {
      const { data: allIssues } = await issueRepo.findByFilters({}, { limit: 50 });
      const { data: existingBriefs } = await briefRepo.findMany({ limit: 100 });

      const issuesWithBriefs = new Set(existingBriefs.map(b => b.issueId));
      issuesToProcess = allIssues.filter(i => !issuesWithBriefs.has(i.id));

      if (issuesToProcess.length === 0) {
        console.log("✅ All issues already have briefs.");
        process.exit(0);
      }
    } else {
      // Default: highest priority issue without brief
      const { data: allIssues } = await issueRepo.findByFilters({}, { limit: 10, sortBy: "compositeScore" });
      const { data: existingBriefs } = await briefRepo.findMany({ limit: 100 });

      const issuesWithBriefs = new Set(existingBriefs.map(b => b.issueId));
      const topIssue = allIssues.find(i => !issuesWithBriefs.has(i.id));

      if (!topIssue) {
        console.log("✅ All issues have briefs. Use --issue <id> to regenerate.");
        process.exit(0);
      }
      issuesToProcess = [topIssue];
    }

    console.log(`📊 Generating briefs for ${issuesToProcess.length} issue(s)\n`);

    for (const issue of issuesToProcess) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📋 Issue: ${issue.title}`);
      console.log(`   ID: ${issue.id}`);
      console.log(`${"=".repeat(60)}\n`);

      // Get related patterns
      const patterns = await Promise.all(
        issue.patternIds.map(id => patternRepo.findById(id))
      );
      const validPatterns = patterns.filter(Boolean);

      const patternsContext = validPatterns.length > 0
        ? validPatterns.map(p => {
          const sources = (p!.sources as Array<{ url: string; title?: string; type?: string }>) || [];
          const sourcesList = sources.length > 0
            ? sources.map(s => `  - ${s.title || s.url} (${s.type || "unknown"})`).join("\n")
            : "  - No sources";
          return `
**${p!.title}** (${p!.patternType})
- Confidence: ${(p!.confidence * 100).toFixed(0)}%
- Domains: ${p!.domains.join(", ")}
- Geographies: ${p!.geographies?.join(", ") || "global"}
- Description: ${p!.description}
- Sources:
${sourcesList}
`;
        }).join("\n")
        : "No linked patterns available";

      console.log("🤖 Generating comprehensive brief...\n");

      const systemPrompt = `You are an expert systems analyst specializing in root cause analysis and systemic problem mapping.

Your task is to create a comprehensive Problem Brief and Situation Model for a systemic issue.

**Problem Brief Components:**
1. **Summary**: Concise problem statement
2. **Root Causes**: Underlying drivers (not symptoms), with confidence levels
3. **Affected Populations**: Who is harmed and how
4. **Goals**: What success looks like (must/should/could priorities)
5. **Constraints**: Resource, political, technical, ethical limitations
6. **Uncertainties**: What we don't know and how to resolve it
7. **Action Space**: Categories of possible interventions
8. **Required Evidence**: What data/research is needed
9. **Existing Interventions**: What's been tried and why it hasn't worked

**Situation Model Components:**
1. **System Boundary**: What's in/out of scope
2. **Actors**: Key players, their interests, capabilities, influence
3. **Causal Relationships**: How elements connect and influence each other
4. **Feedback Loops**: Reinforcing and balancing dynamics
5. **Leverage Points**: Where interventions could be most effective (using Meadows' hierarchy)
6. **Key Insights**: Non-obvious conclusions from the analysis

Be rigorous and evidence-based. Acknowledge uncertainty where it exists.`;

      // Get related issues for additional context
      const relatedIssueIds = [
        ...(issue.upstreamIssues || []),
        ...(issue.downstreamIssues || []),
        ...(issue.relatedIssues || []),
      ];
      const relatedIssues = await Promise.all(
        relatedIssueIds.slice(0, 5).map(id => issueRepo.findById(id))
      );
      const validRelatedIssues = relatedIssues.filter(Boolean);

      const relatedIssuesContext = validRelatedIssues.length > 0
        ? `\n**Related Issues**:\n${validRelatedIssues.map(ri => `- ${ri!.title} (${ri!.issueStatus})`).join("\n")}`
        : "";

      const userPrompt = `Create a comprehensive Problem Brief and Situation Model for this issue:

## Issue: ${issue.title}

**Summary**: ${issue.summary}

**Preliminary Root Causes**:
${issue.rootCauses.map(rc => `- ${rc}`).join("\n")}

**Affected Domains**: ${issue.affectedDomains.join(", ")}

**Preliminary Leverage Points**:
${issue.leveragePoints.map(lp => `- ${lp}`).join("\n")}

**Time Horizon**: ${issue.timeHorizon}
**Propagation Velocity**: ${issue.propagationVelocity || "unknown"}

**IUTLN Scores**:
- Impact: ${(issue.scoreImpact * 100).toFixed(0)}%
- Urgency: ${(issue.scoreUrgency * 100).toFixed(0)}%
- Tractability: ${(issue.scoreTractability * 100).toFixed(0)}%
- Legitimacy: ${((issue.scoreLegitimacy || 0) * 100).toFixed(0)}%
- Neglectedness: ${((issue.scoreNeglectedness || 0) * 100).toFixed(0)}%
${relatedIssuesContext}

**Supporting Patterns**:
${patternsContext}

Generate a thorough analysis with:
1. Deep root cause analysis (go beyond symptoms)
2. Detailed actor mapping with interests and influence
3. Causal relationship mapping
4. Feedback loop identification
5. Leverage point analysis using Meadows' hierarchy
6. Specific, actionable goals and evidence requirements`;

      try {
        // Generate Problem Brief first
        console.log("  Step 1/2: Generating problem brief...");
        const briefResult = await llm.completeStructured(
          [{ role: "user", content: userPrompt + "\n\nGenerate the Problem Brief portion only." }],
          {
            schema: ProblemBriefOutputSchema,
            systemPrompt,
            schemaName: "problem_brief",
            schemaDescription: "Problem brief with root causes, goals, and constraints",
          }
        );
        const problemBrief = briefResult.data;

        // Generate Situation Model
        console.log("  Step 2/2: Generating situation model...");
        const modelPrompt = `Based on this problem brief, create a detailed Situation Model:

## Issue: ${issue.title}

## Problem Brief Summary
${problemBrief.summary}

## Root Causes
${problemBrief.rootCauses.map(rc => `- ${rc.description} (${(rc.confidence * 100).toFixed(0)}% confidence)`).join("\n")}

## Affected Populations
${problemBrief.affectedPopulations.map(ap => `- ${ap.group}: ${ap.impactDescription}`).join("\n")}

## Goals
${problemBrief.goals.map(g => `- [${g.priority}] ${g.description}`).join("\n")}

## Constraints
${problemBrief.constraints.map(c => `- [${c.type}] ${c.description}`).join("\n")}

Now create a comprehensive Situation Model with:
1. System boundary definition
2. Key actors with interests and influence levels
3. Causal relationships between elements
4. Feedback loops (reinforcing and balancing)
5. Leverage points using Meadows' hierarchy
6. Key non-obvious insights`;

        const modelResult = await llm.completeStructured(
          [{ role: "user", content: modelPrompt }],
          {
            schema: SituationModelOutputSchema,
            systemPrompt,
            schemaName: "situation_model",
            schemaDescription: "System map with actors, relationships, and leverage points",
          }
        );
        const situationModel = modelResult.data;

        // Display Problem Brief
        console.log("📋 PROBLEM BRIEF\n");
        console.log(`Summary: ${problemBrief.summary}\n`);

        console.log(`Root Causes (${problemBrief.rootCauses.length}):`);
        for (const rc of problemBrief.rootCauses.slice(0, 5)) {
          console.log(`  • ${rc.description} (${(rc.confidence * 100).toFixed(0)}% confidence)`);
        }

        console.log(`\nAffected Populations (${problemBrief.affectedPopulations.length}):`);
        for (const ap of problemBrief.affectedPopulations.slice(0, 4)) {
          console.log(`  • ${ap.group}: ${ap.impactDescription} (${ap.scale}, ${ap.severity})`);
        }

        console.log(`\nGoals (${problemBrief.goals.length}):`);
        for (const g of problemBrief.goals.slice(0, 4)) {
          console.log(`  [${g.priority}] ${g.description}`);
        }

        console.log(`\nConstraints (${problemBrief.constraints.length}):`);
        for (const c of problemBrief.constraints.slice(0, 4)) {
          const hard = c.hard ? "🔒" : "⚡";
          console.log(`  ${hard} [${c.type}] ${c.description}`);
        }

        // Display Situation Model
        console.log("\n\n🗺️  SITUATION MODEL\n");
        console.log(`System Boundary: ${situationModel.systemBoundary.description}`);
        console.log(`  Domains: ${situationModel.systemBoundary.includedDomains.join(", ")}`);

        console.log(`\nActors (${situationModel.actors.length}):`);
        for (const a of situationModel.actors.slice(0, 5)) {
          console.log(`  • ${a.name} (${a.type}, ${a.influence} influence)`);
          console.log(`    Role: ${a.role}`);
        }

        console.log(`\nFeedback Loops (${situationModel.feedbackLoops.length}):`);
        for (const fl of situationModel.feedbackLoops.slice(0, 4)) {
          const icon = fl.type === "reinforcing" ? "🔄" : "⚖️";
          console.log(`  ${icon} ${fl.name} (${fl.type}, ${fl.currentState})`);
          console.log(`    ${fl.description.slice(0, 100)}...`);
        }

        console.log(`\nLeverage Points (${situationModel.leveragePoints.length}):`);
        for (const lp of situationModel.leveragePoints.slice(0, 5)) {
          console.log(`  📍 ${lp.element} [${lp.leverageType}]`);
          console.log(`     Impact: ${lp.potentialImpact} | Feasibility: ${lp.feasibility}`);
          console.log(`     ${lp.description.slice(0, 80)}...`);
        }

        console.log(`\nKey Insights (${situationModel.keyInsights.length}):`);
        for (const insight of situationModel.keyInsights.slice(0, 4)) {
          console.log(`  💡 ${insight}`);
        }

        // Save to database
        if (!options.dryRun) {
          console.log("\n\n💾 Saving to database...");

          // Save Problem Brief
          const briefId = `brief_${crypto.randomBytes(8).toString("hex")}`;
          const briefHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(problemBrief))
            .digest("hex");

          await briefRepo.create({
            id: briefId,
            contentHash: briefHash,
            author: "system:brief",
            authorSignature: "auto-generated",
            issueId: issue.id,
            goals: problemBrief.goals,
            constraints: problemBrief.constraints,
            uncertainties: problemBrief.uncertainties,
            actionSpace: problemBrief.actionSpace,
            requiredEvidence: problemBrief.requiredEvidence,
          });
          console.log(`  ✓ Problem Brief: ${briefId}`);

          // Save Situation Model
          const modelId = `model_${crypto.randomBytes(8).toString("hex")}`;
          const modelHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(situationModel))
            .digest("hex");

          await modelRepo.create({
            id: modelId,
            contentHash: modelHash,
            author: "system:brief",
            authorSignature: "auto-generated",
            problemBriefId: briefId,
            claims: problemBrief.rootCauses.map(rc => ({
              claim: rc.description,
              confidence: rc.confidence,
              evidence: rc.supportingEvidence,
            })),
            evidence: problemBrief.affectedPopulations.map(ap => ({
              type: "population_impact",
              description: `${ap.group}: ${ap.impactDescription}`,
              scale: ap.scale,
            })),
            systemMap: {
              boundary: situationModel.systemBoundary,
              actors: situationModel.actors,
              relationships: situationModel.causalRelationships,
              feedbackLoops: situationModel.feedbackLoops,
            },
            uncertaintyMap: problemBrief.uncertainties,
            keyInsights: situationModel.keyInsights,
            recommendedLeveragePoints: situationModel.leveragePoints.map(lp =>
              `[${lp.leverageType}] ${lp.element}: ${lp.description}`
            ),
          });
          console.log(`  ✓ Situation Model: ${modelId}`);
        } else {
          console.log("\n\n🔍 Dry run - no changes saved");
        }

        const totalTokens = (briefResult.usage?.totalTokens ?? 0) + (modelResult.usage?.totalTokens ?? 0);
        console.log(`\n📊 LLM Usage: ${totalTokens || "unknown"} tokens (2 calls)`);

      } catch (error) {
        console.error(`❌ Brief generation failed for ${issue.title}:`, error);
      }
    }

    console.log("\n✅ Brief generation complete!");
    process.exit(0);
  });

program.parse();
