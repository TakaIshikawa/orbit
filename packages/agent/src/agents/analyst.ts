import { z } from "zod";
import { BaseAgent } from "../base.js";
import type { AgentDefinition, AgentInput } from "../types.js";

const AnalystInputSchema = z.object({
  issueId: z.string(),
  patterns: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      patternType: z.string(),
      domains: z.array(z.string()),
    })
  ),
  existingBrief: z
    .object({
      id: z.string(),
      summary: z.string(),
      rootCauses: z.array(z.string()),
    })
    .optional(),
});

const ProblemBriefOutputSchema = z.object({
  summary: z.string(),
  rootCauses: z.array(
    z.object({
      description: z.string(),
      confidence: z.number().min(0).max(1),
      supportingPatterns: z.array(z.string()),
    })
  ),
  affectedPopulations: z.array(
    z.object({
      group: z.string(),
      impactDescription: z.string(),
      scale: z.enum(["local", "regional", "national", "global"]),
    })
  ),
  existingInterventions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      effectiveness: z.enum(["unknown", "ineffective", "partially_effective", "effective"]),
      limitations: z.array(z.string()),
    })
  ),
  keyQuestions: z.array(z.string()),
  dataGaps: z.array(z.string()),
});

const SituationModelOutputSchema = z.object({
  systemBoundary: z.object({
    description: z.string(),
    includedDomains: z.array(z.string()),
    excludedDomains: z.array(z.string()),
  }),
  actors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["individual", "organization", "government", "market", "technology"]),
      role: z.string(),
      interests: z.array(z.string()),
      capabilities: z.array(z.string()),
    })
  ),
  causalRelationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relationship: z.enum(["causes", "enables", "prevents", "amplifies", "dampens"]),
      mechanism: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
  feedbackLoops: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["reinforcing", "balancing"]),
      elements: z.array(z.string()),
      description: z.string(),
    })
  ),
  leveragePoints: z.array(
    z.object({
      element: z.string(),
      leverageType: z.enum([
        "parameter",
        "buffer",
        "structure",
        "delay",
        "feedback",
        "information",
        "rule",
        "goal",
        "paradigm",
      ]),
      potentialImpact: z.enum(["low", "medium", "high"]),
      feasibility: z.enum(["low", "medium", "high"]),
      description: z.string(),
    })
  ),
});

type AnalystInput = z.infer<typeof AnalystInputSchema>;
type ProblemBriefOutput = z.infer<typeof ProblemBriefOutputSchema>;
type SituationModelOutput = z.infer<typeof SituationModelOutputSchema>;

export class AnalystAgent extends BaseAgent {
  definition: AgentDefinition = {
    type: "analyst",
    name: "Analyst",
    description:
      "Synthesizes pattern data into problem briefs and situation models. Identifies causal relationships, feedback loops, and leverage points.",
    inputSchema: AnalystInputSchema,
    outputSchema: z.object({
      problemBrief: ProblemBriefOutputSchema,
      situationModel: SituationModelOutputSchema,
    }),
  };

  async execute(input: AgentInput): Promise<Record<string, unknown>> {
    const data = AnalystInputSchema.parse(input.payload);

    this.recordDecision(
      "Starting analysis with available patterns and existing brief",
      "generate_problem_brief",
      0.9
    );

    const problemBrief = await this.generateProblemBrief(data);

    this.recordDecision(
      "Problem brief generated, proceeding to situation model",
      "generate_situation_model",
      0.85
    );

    const situationModel = await this.generateSituationModel(data, problemBrief);

    return {
      problemBrief,
      situationModel,
    };
  }

  private async generateProblemBrief(data: AnalystInput): Promise<ProblemBriefOutput> {
    const patternsContext = data.patterns
      .map(
        (p) =>
          `- ${p.title} (${p.patternType})\n  Domains: ${p.domains.join(", ")}\n  ${p.description}`
      )
      .join("\n\n");

    const existingContext = data.existingBrief
      ? `\nExisting analysis:\n- Summary: ${data.existingBrief.summary}\n- Root causes: ${data.existingBrief.rootCauses.join(", ")}`
      : "";

    const systemPrompt = `You are an expert systems analyst specializing in identifying root causes and systemic patterns in complex problems.

Your task is to analyze patterns related to an issue and produce a comprehensive problem brief.

Focus on:
1. Identifying underlying root causes, not just symptoms
2. Understanding who is affected and how
3. Evaluating existing interventions objectively
4. Identifying knowledge gaps that need addressing`;

    const userPrompt = `Analyze the following patterns related to issue ${data.issueId}:

${patternsContext}
${existingContext}

Generate a comprehensive problem brief that identifies root causes, affected populations, existing interventions, key questions, and data gaps.`;

    return this.completeStructured(
      [{ role: "user", content: userPrompt }],
      ProblemBriefOutputSchema,
      {
        systemPrompt,
        schemaName: "problem_brief",
        schemaDescription: "A structured problem brief analyzing the issue",
      }
    );
  }

  private async generateSituationModel(
    data: AnalystInput,
    brief: ProblemBriefOutput
  ): Promise<SituationModelOutput> {
    const systemPrompt = `You are an expert systems modeler who creates causal loop diagrams and identifies system dynamics.

Your task is to create a situation model that maps the system structure underlying a problem.

Focus on:
1. Defining clear system boundaries
2. Identifying key actors and their relationships
3. Mapping causal relationships with mechanisms
4. Finding reinforcing and balancing feedback loops
5. Identifying leverage points at various system levels (Meadows' hierarchy)`;

    const rootCausesContext = brief.rootCauses
      .map((rc) => `- ${rc.description} (confidence: ${rc.confidence})`)
      .join("\n");

    const userPrompt = `Create a situation model for issue ${data.issueId}.

Problem Summary: ${brief.summary}

Root Causes Identified:
${rootCausesContext}

Affected Populations:
${brief.affectedPopulations.map((ap) => `- ${ap.group}: ${ap.impactDescription} (${ap.scale})`).join("\n")}

Key Questions:
${brief.keyQuestions.map((q) => `- ${q}`).join("\n")}

Generate a comprehensive situation model that maps the system structure, identifies actors, causal relationships, feedback loops, and leverage points.`;

    return this.completeStructured(
      [{ role: "user", content: userPrompt }],
      SituationModelOutputSchema,
      {
        systemPrompt,
        schemaName: "situation_model",
        schemaDescription: "A structured situation model mapping the system",
      }
    );
  }
}
