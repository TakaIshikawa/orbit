import { z } from "zod";
import { BaseAgent } from "../base.js";
import type { AgentDefinition, AgentInput } from "../types.js";

const ScoutInputSchema = z.object({
  query: z.string().describe("The topic or domain to investigate"),
  domains: z.array(z.string()).optional().describe("Specific domains to focus on"),
  existingPatterns: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        patternType: z.string(),
      })
    )
    .optional()
    .describe("Existing patterns to avoid duplicating"),
  sources: z
    .array(
      z.object({
        type: z.enum(["research", "news", "report", "observation"]),
        content: z.string(),
        url: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .optional()
    .describe("Source materials to analyze"),
});

const PatternTypeSchema = z.enum([
  "policy_gap",
  "structural_inefficiency",
  "feedback_loop",
  "information_asymmetry",
  "coordination_failure",
  "other",
]);

const DiscoveredPatternSchema = z.object({
  title: z.string().describe("Concise title for the pattern"),
  description: z.string().describe("Detailed description of the pattern"),
  patternType: PatternTypeSchema,
  domains: z.array(z.string()).describe("Domains this pattern affects"),
  geographies: z.array(z.string()).describe("Geographic scope"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1).describe("Confidence in this pattern's validity"),
  supportingEvidence: z.array(z.string()).describe("Evidence supporting this pattern"),
  sourceUrls: z.array(z.string()).describe("URLs of sources that contributed evidence for this pattern"),
  relatedPatterns: z.array(z.string()).describe("IDs of related existing patterns"),
});

const ScoutOutputSchema = z.object({
  patterns: z.array(DiscoveredPatternSchema),
  gaps: z.array(z.string()).describe("Information gaps that need further investigation"),
  suggestedQueries: z.array(z.string()).describe("Follow-up queries for deeper investigation"),
});

type ScoutInput = z.infer<typeof ScoutInputSchema>;
type ScoutOutput = z.infer<typeof ScoutOutputSchema>;

export class ScoutAgent extends BaseAgent {
  definition: AgentDefinition = {
    type: "scout",
    name: "Scout",
    description:
      "Discovers patterns from source materials. Identifies systemic issues, structural inefficiencies, and coordination failures across domains.",
    inputSchema: ScoutInputSchema,
    outputSchema: ScoutOutputSchema,
  };

  async execute(input: AgentInput): Promise<Record<string, unknown>> {
    const data = ScoutInputSchema.parse(input.payload);

    this.recordDecision(
      `Analyzing query: "${data.query}" across ${data.domains?.length ?? "all"} domains`,
      "analyze_sources",
      0.9
    );

    const output = await this.discoverPatterns(data);

    this.recordDecision(
      `Discovered ${output.patterns.length} patterns, identified ${output.gaps.length} gaps`,
      "compile_results",
      0.85
    );

    return output;
  }

  private async discoverPatterns(data: ScoutInput): Promise<ScoutOutput> {
    const systemPrompt = `You are an expert systems analyst specializing in identifying systemic patterns and structural issues.

Your task is to analyze information and discover patterns that represent systemic issues. Focus on:

1. **Policy Gaps**: Missing or inadequate policies that create problems
2. **Structural Inefficiencies**: System designs that waste resources or create friction
3. **Feedback Loops**: Self-reinforcing cycles (positive or negative)
4. **Information Asymmetries**: Unequal access to critical information
5. **Coordination Failures**: Cases where collective action breaks down

Guidelines:
- Look for root causes, not symptoms
- Consider cross-domain effects
- Identify patterns that are actionable (can be addressed through intervention)
- Assign confidence based on evidence quality
- Note related existing patterns to avoid duplication`;

    const existingPatternsContext = data.existingPatterns?.length
      ? `\nExisting patterns (avoid duplicating these):\n${data.existingPatterns.map((p) => `- ${p.title} (${p.patternType})`).join("\n")}`
      : "";

    const sourcesContext = data.sources?.length
      ? `\nSource Materials:\n${data.sources.map((s) => `[SOURCE: ${s.url || "unknown"}]\nType: ${s.type}${s.title ? `\nTitle: ${s.title}` : ""}\nContent:\n${s.content}`).join("\n\n---\n\n")}`
      : "";

    const userPrompt = `Analyze the following topic and discover systemic patterns:

Query: ${data.query}
${data.domains?.length ? `Focus Domains: ${data.domains.join(", ")}` : ""}
${existingPatternsContext}
${sourcesContext}

Discover patterns that represent systemic issues. For each pattern:
- Provide a clear title and detailed description
- Classify the pattern type
- Identify affected domains and geographies
- Assess severity and your confidence level
- List supporting evidence
- Include the URLs of sources that provided evidence for this specific pattern (only include sources that directly support this pattern)
- Note any related existing patterns

Also identify:
- Information gaps that need further investigation
- Suggested follow-up queries for deeper analysis`;

    return this.completeStructured([{ role: "user", content: userPrompt }], ScoutOutputSchema, {
      systemPrompt,
      schemaName: "scout_output",
      schemaDescription: "Discovered patterns and investigation gaps",
    });
  }
}
