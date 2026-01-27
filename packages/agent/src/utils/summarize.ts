import { z } from "zod";
import { getLLMClient, type LLMClient } from "@orbit/llm";
import type { SimpleStatus } from "@orbit/core";

/**
 * Input data for generating issue summaries
 */
export interface IssueSummaryInput {
  title: string;
  summary: string;
  rootCauses: string[];
  affectedDomains: string[];
  // IUTLN scores
  scoreImpact: number;
  scoreUrgency: number;
  scoreTractability: number;
  scoreNeglectedness: number;
  // Related data
  patterns?: Array<{ title: string; description: string }>;
  solutionCount?: number;
  activeSolutionCount?: number;
  // Current status
  issueStatus: string;
}

/**
 * Output summary fields for condensed UI display
 */
export interface IssueSummaryOutput {
  headline: string;
  whyNow: string;
  keyNumber: string;
  simpleStatus: SimpleStatus;
}

const SummaryOutputSchema = z.object({
  headline: z.string().describe("One sentence (max 150 chars) that captures the issue. Be specific: WHO is affected, WHAT is the problem. No jargon. Example: '500K small accounting firms can't adopt AI because staff lack prompt engineering skills'"),
  whyNow: z.string().describe("Why this matters NOW. Time-sensitivity, window of opportunity, or deterioration rate. Max 2 sentences."),
  keyNumber: z.string().describe("The single most important statistic that anchors understanding. Include units. Example: '500K firms', '73% failure rate', '$2B annual loss'"),
});

const SUMMARIZE_SYSTEM_PROMPT = `You are a communication expert who transforms complex systemic analysis into clear, actionable summaries.

Your job is to take detailed issue analysis and produce summaries that:
1. A busy person can understand in 5 seconds (headline)
2. Explain why action is needed now (whyNow)
3. Provide one anchoring number that makes the scale concrete (keyNumber)

Rules:
- BE SPECIFIC: "500K small accounting firms" not "many businesses"
- BE CONCRETE: Observable symptoms, not abstract categories
- NO JARGON: A smart person outside this domain should understand
- NUMBERS MATTER: Always include scale, percentage, or dollar amount
- ACTION-ORIENTED: Frame problems in ways that suggest solutions are possible

If the input lacks specific numbers, make reasonable estimates and note they are estimates.`;

/**
 * Generate condensed summary fields for an issue
 */
export async function generateIssueSummary(
  input: IssueSummaryInput,
  llmClient?: LLMClient
): Promise<IssueSummaryOutput> {
  const client = llmClient ?? getLLMClient();

  const userPrompt = buildSummaryPrompt(input);

  const result = await client.completeStructured(
    [{ role: "user", content: userPrompt }],
    {
      schema: SummaryOutputSchema,
      systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
      schemaName: "IssueSummary",
      schemaDescription: "Condensed summary fields for issue display",
    }
  );

  // Compute simple status from issue state
  const simpleStatus = computeSimpleStatus(input);

  return {
    headline: result.data.headline,
    whyNow: result.data.whyNow,
    keyNumber: result.data.keyNumber,
    simpleStatus,
  };
}

function buildSummaryPrompt(input: IssueSummaryInput): string {
  const parts: string[] = [
    `## Issue to Summarize`,
    ``,
    `**Title:** ${input.title}`,
    ``,
    `**Current Summary:** ${input.summary}`,
    ``,
    `**Root Causes:**`,
    ...input.rootCauses.map(c => `- ${c}`),
    ``,
    `**Affected Domains:** ${input.affectedDomains.join(", ")}`,
    ``,
    `**Scores (0-1 scale):**`,
    `- Impact: ${input.scoreImpact.toFixed(2)}`,
    `- Urgency: ${input.scoreUrgency.toFixed(2)}`,
    `- Tractability: ${input.scoreTractability.toFixed(2)}`,
    `- Neglectedness: ${input.scoreNeglectedness.toFixed(2)}`,
  ];

  if (input.patterns && input.patterns.length > 0) {
    parts.push(``, `**Related Patterns:**`);
    for (const p of input.patterns.slice(0, 5)) {
      parts.push(`- ${p.title}: ${p.description.slice(0, 200)}...`);
    }
  }

  parts.push(
    ``,
    `---`,
    ``,
    `Generate a headline, whyNow explanation, and keyNumber for this issue.`,
    `Remember: Be specific, concrete, and jargon-free.`
  );

  return parts.join("\n");
}

function computeSimpleStatus(input: IssueSummaryInput): SimpleStatus {
  const { issueStatus, activeSolutionCount = 0, scoreUrgency, scoreTractability } = input;

  // If resolved, it's resolved
  if (issueStatus === "resolved") {
    return "resolved";
  }

  // If someone is actively working on it
  if (activeSolutionCount > 0 || issueStatus === "in_progress") {
    return "being_worked";
  }

  // If it's high urgency + tractable but no one working on it
  if (scoreUrgency > 0.6 && scoreTractability > 0.5 && activeSolutionCount === 0) {
    return "needs_attention";
  }

  // If it's being investigated but not urgent
  if (issueStatus === "investigating" || issueStatus === "solution_proposed") {
    return "watching";
  }

  // Default to needs_attention for new/identified issues
  if (issueStatus === "identified") {
    return "needs_attention";
  }

  return "watching";
}

/**
 * Batch summarize multiple issues
 */
export async function generateIssueSummaries(
  issues: IssueSummaryInput[],
  llmClient?: LLMClient
): Promise<Map<string, IssueSummaryOutput>> {
  const client = llmClient ?? getLLMClient();
  const results = new Map<string, IssueSummaryOutput>();

  // Process in parallel with concurrency limit
  const concurrency = 3;
  for (let i = 0; i < issues.length; i += concurrency) {
    const batch = issues.slice(i, i + concurrency);
    const summaries = await Promise.all(
      batch.map(issue => generateIssueSummary(issue, client))
    );
    batch.forEach((issue, idx) => {
      results.set(issue.title, summaries[idx]);
    });
  }

  return results;
}
