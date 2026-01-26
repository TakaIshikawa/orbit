import { z } from "zod";
import { BaseAgent } from "../base.js";
import type { AgentDefinition, AgentInput } from "../types.js";

const PlannerInputSchema = z.object({
  situationModel: z.object({
    id: z.string(),
    systemBoundary: z.string(),
    actors: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        role: z.string(),
      })
    ),
    leveragePoints: z.array(
      z.object({
        element: z.string(),
        leverageType: z.string(),
        potentialImpact: z.string(),
        feasibility: z.string(),
      })
    ),
    feedbackLoops: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
      })
    ),
  }),
  problemBrief: z.object({
    summary: z.string(),
    rootCauses: z.array(z.string()),
    keyQuestions: z.array(z.string()),
  }),
  constraints: z
    .object({
      maxComplexity: z.enum(["low", "medium", "high"]).optional(),
      timeHorizon: z.enum(["immediate", "short_term", "medium_term", "long_term"]).optional(),
      resourceLevel: z.enum(["minimal", "moderate", "substantial"]).optional(),
      preferredSolutionTypes: z.array(z.string()).optional(),
    })
    .optional(),
});

const ComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  complexity: z.enum(["low", "medium", "high"]),
  dependencies: z.array(z.string()),
});

const RiskSchema = z.object({
  description: z.string(),
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string(),
});

const ExecutionStepSchema = z.object({
  phase: z.number(),
  name: z.string(),
  description: z.string(),
  owner: z.enum(["human", "agent", "hybrid"]),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
  deliverables: z.array(z.string()),
  dependencies: z.array(z.number()),
});

const SolutionProposalSchema = z.object({
  title: z.string(),
  summary: z.string(),
  solutionType: z.enum(["tool", "platform", "system", "automation", "research", "model", "other"]),
  mechanism: z.string().describe("How this solution addresses the root causes"),
  targetLeveragePoints: z.array(z.string()),
  components: z.array(ComponentSchema),
  risks: z.array(RiskSchema),
  executionPlan: z.array(ExecutionStepSchema),
  successMetrics: z.array(
    z.object({
      metric: z.string(),
      target: z.string(),
      measurementMethod: z.string(),
    })
  ),
  estimatedImpact: z.object({
    scope: z.enum(["local", "regional", "national", "global"]),
    magnitude: z.enum(["incremental", "moderate", "significant", "transformative"]),
    timeToImpact: z.enum(["immediate", "months", "years", "decade"]),
  }),
  confidence: z.number().min(0).max(1),
});

const PlannerOutputSchema = z.object({
  solutions: z.array(SolutionProposalSchema),
  tradeoffAnalysis: z.string(),
  recommendation: z.object({
    primarySolution: z.number().describe("Index of recommended solution"),
    reasoning: z.string(),
    alternativeConsiderations: z.array(z.string()),
  }),
  openQuestions: z.array(z.string()),
});

type PlannerInput = z.infer<typeof PlannerInputSchema>;
type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export class PlannerAgent extends BaseAgent {
  definition: AgentDefinition = {
    type: "planner",
    name: "Planner",
    description:
      "Designs solution proposals based on situation models. Identifies leverage points, creates execution plans, and assesses risks.",
    inputSchema: PlannerInputSchema,
    outputSchema: PlannerOutputSchema,
  };

  async execute(input: AgentInput): Promise<Record<string, unknown>> {
    const data = PlannerInputSchema.parse(input.payload);

    this.recordDecision(
      `Designing solutions for situation model with ${data.situationModel.leveragePoints.length} leverage points`,
      "analyze_leverage_points",
      0.9
    );

    const output = await this.designSolutions(data);

    this.recordDecision(
      `Generated ${output.solutions.length} solution proposals, recommending solution ${output.recommendation.primarySolution + 1}`,
      "recommend_solution",
      0.85
    );

    return output;
  }

  private async designSolutions(data: PlannerInput): Promise<PlannerOutput> {
    const systemPrompt = `You are an expert solution architect who designs interventions for complex systemic problems.

Your approach:
1. **Analyze Leverage Points**: Focus on high-impact, feasible intervention points
2. **Design Multiple Solutions**: Propose 2-3 distinct approaches with different tradeoffs
3. **Consider System Dynamics**: Account for feedback loops and unintended consequences
4. **Plan Execution**: Break down into concrete, actionable phases
5. **Assess Risks**: Identify potential failures and mitigations

Solution Types:
- **Tool**: Software or hardware that enables new capabilities
- **Platform**: Infrastructure that enables others to build solutions
- **System**: Integrated set of components working together
- **Automation**: Reducing manual effort in existing processes
- **Research**: Generating new knowledge or insights
- **Model**: Analytical framework or simulation

Design Principles:
- Build, don't advocate (focus on concrete artifacts)
- Start small, iterate fast
- Design for measurability
- Consider who will maintain/operate the solution
- Account for adoption barriers`;

    const leverageContext = data.situationModel.leveragePoints
      .map((lp) => `- ${lp.element} (${lp.leverageType}): impact=${lp.potentialImpact}, feasibility=${lp.feasibility}`)
      .join("\n");

    const actorsContext = data.situationModel.actors
      .map((a) => `- ${a.name} (${a.type}): ${a.role}`)
      .join("\n");

    const loopsContext = data.situationModel.feedbackLoops
      .map((fl) => `- ${fl.name} (${fl.type}): ${fl.description}`)
      .join("\n");

    const constraintsContext = data.constraints
      ? `\nConstraints:
- Max Complexity: ${data.constraints.maxComplexity ?? "any"}
- Time Horizon: ${data.constraints.timeHorizon ?? "any"}
- Resource Level: ${data.constraints.resourceLevel ?? "any"}
- Preferred Types: ${data.constraints.preferredSolutionTypes?.join(", ") ?? "any"}`
      : "";

    const userPrompt = `Design solution proposals for the following situation:

## Problem Summary
${data.problemBrief.summary}

## Root Causes
${data.problemBrief.rootCauses.map((rc) => `- ${rc}`).join("\n")}

## System Boundary
${data.situationModel.systemBoundary}

## Key Actors
${actorsContext}

## Leverage Points
${leverageContext}

## Feedback Loops
${loopsContext}

## Key Questions
${data.problemBrief.keyQuestions.map((q) => `- ${q}`).join("\n")}
${constraintsContext}

Design 2-3 distinct solution proposals that address the root causes through identified leverage points. For each solution, provide:
1. Clear mechanism of action
2. Component breakdown
3. Execution plan with phases
4. Risk assessment
5. Success metrics
6. Impact estimate

Then analyze tradeoffs and make a recommendation.`;

    return this.completeStructured([{ role: "user", content: userPrompt }], PlannerOutputSchema, {
      systemPrompt,
      schemaName: "planner_output",
      schemaDescription: "Solution proposals with execution plans",
    });
  }
}
