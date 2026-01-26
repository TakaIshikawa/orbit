import { z } from "zod";
import { BaseAgent } from "../base.js";
import type { AgentDefinition, AgentInput } from "../types.js";

const TriageInputSchema = z.object({
  issue: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    domains: z.array(z.string()),
    patterns: z.array(z.string()).describe("Pattern IDs linked to this issue"),
  }),
  context: z
    .object({
      relatedIssues: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            compositeScore: z.number(),
          })
        )
        .optional(),
      recentEvents: z.array(z.string()).optional(),
    })
    .optional(),
});

const IUTLNScoreSchema = z.object({
  impact: z.object({
    score: z.number().min(0).max(1),
    reasoning: z.string(),
    affectedPopulation: z.string(),
    magnitudeOfHarm: z.enum(["minimal", "moderate", "significant", "severe", "catastrophic"]),
  }),
  urgency: z.object({
    score: z.number().min(0).max(1),
    reasoning: z.string(),
    timeframe: z.enum(["years", "months", "weeks", "days", "immediate"]),
    tippingPoints: z.array(z.string()),
  }),
  tractability: z.object({
    score: z.number().min(0).max(1),
    reasoning: z.string(),
    existingSolutions: z.array(z.string()),
    barriers: z.array(z.string()),
    feasibility: z.enum(["very_difficult", "difficult", "moderate", "achievable", "straightforward"]),
  }),
  legitimacy: z.object({
    score: z.number().min(0).max(1),
    reasoning: z.string(),
    stakeholderSupport: z.enum(["opposed", "mixed", "neutral", "supportive", "strong_consensus"]),
    ethicalConsiderations: z.array(z.string()),
  }),
  neglectedness: z.object({
    score: z.number().min(0).max(1),
    reasoning: z.string(),
    existingEfforts: z.array(z.string()),
    fundingLevel: z.enum(["overfunded", "adequate", "underfunded", "severely_underfunded", "ignored"]),
    attentionGap: z.string(),
  }),
});

const TriageOutputSchema = z.object({
  scores: IUTLNScoreSchema,
  compositeScore: z.number().min(0).max(1),
  priorityTier: z.enum(["critical", "high", "medium", "low"]),
  recommendation: z.string(),
  suggestedActions: z.array(z.string()),
  connectionToOtherIssues: z.array(
    z.object({
      issueId: z.string(),
      relationship: z.enum(["upstream", "downstream", "parallel", "conflicting"]),
      strength: z.enum(["weak", "moderate", "strong"]),
    })
  ),
});

type TriageInput = z.infer<typeof TriageInputSchema>;
type TriageOutput = z.infer<typeof TriageOutputSchema>;

export class TriageAgent extends BaseAgent {
  definition: AgentDefinition = {
    type: "triage",
    name: "Triage",
    description:
      "Evaluates issues using IUTLN framework (Impact, Urgency, Tractability, Legitimacy, Neglectedness) and assigns priority scores.",
    inputSchema: TriageInputSchema,
    outputSchema: TriageOutputSchema,
  };

  async execute(input: AgentInput): Promise<Record<string, unknown>> {
    const data = TriageInputSchema.parse(input.payload);

    this.recordDecision(
      `Evaluating issue: "${data.issue.title}" using IUTLN framework`,
      "evaluate_iutln",
      0.9
    );

    const output = await this.evaluateIssue(data);

    this.recordDecision(
      `Assigned priority tier: ${output.priorityTier} (composite: ${output.compositeScore.toFixed(2)})`,
      "assign_priority",
      0.85
    );

    return output;
  }

  private async evaluateIssue(data: TriageInput): Promise<TriageOutput> {
    const systemPrompt = `You are an expert issue evaluator using the IUTLN framework to assess and prioritize systemic issues.

## IUTLN Framework

**Impact (I)**: How significant is the harm caused by this issue?
- Consider: population affected, severity of harm, reversibility, cascading effects
- Score 0-1: 0 = minimal impact, 1 = catastrophic global impact

**Urgency (U)**: How time-sensitive is addressing this issue?
- Consider: rate of deterioration, tipping points, windows of opportunity
- Score 0-1: 0 = can wait years, 1 = immediate action required

**Tractability (T)**: How solvable is this issue?
- Consider: existing solutions, technical feasibility, required resources
- Score 0-1: 0 = essentially unsolvable, 1 = straightforward to solve

**Legitimacy (L)**: Is intervention appropriate and supported?
- Consider: stakeholder consensus, ethical alignment, political feasibility
- Score 0-1: 0 = highly contested, 1 = universal support

**Neglectedness (N)**: How much attention is this issue getting?
- Consider: funding levels, research activity, media coverage
- Score 0-1: 0 = oversaturated with attention, 1 = completely ignored

## Composite Score Calculation
Composite = (I × 0.25) + (U × 0.20) + (T × 0.20) + (L × 0.15) + (N × 0.20)

## Priority Tiers
- Critical: composite ≥ 0.75
- High: composite ≥ 0.55
- Medium: composite ≥ 0.35
- Low: composite < 0.35

Be rigorous and evidence-based in your assessments.`;

    const relatedContext = data.context?.relatedIssues?.length
      ? `\nRelated Issues:\n${data.context.relatedIssues.map((i) => `- ${i.title} (score: ${i.compositeScore.toFixed(2)})`).join("\n")}`
      : "";

    const eventsContext = data.context?.recentEvents?.length
      ? `\nRecent Events:\n${data.context.recentEvents.map((e) => `- ${e}`).join("\n")}`
      : "";

    const userPrompt = `Evaluate the following issue using the IUTLN framework:

**Issue**: ${data.issue.title}
**Description**: ${data.issue.description}
**Domains**: ${data.issue.domains.join(", ")}
**Linked Patterns**: ${data.issue.patterns.length} patterns
${relatedContext}
${eventsContext}

Provide detailed IUTLN scores with reasoning, calculate the composite score, assign a priority tier, and recommend next actions.`;

    return this.completeStructured([{ role: "user", content: userPrompt }], TriageOutputSchema, {
      systemPrompt,
      schemaName: "triage_output",
      schemaDescription: "IUTLN evaluation and priority assignment",
    });
  }
}
