/**
 * LLM-Based Source Credibility Assessor
 *
 * Uses LLM to dynamically assess credibility of unknown sources by analyzing:
 * - About page / mission statement
 * - Funding and ownership information
 * - Content patterns and citation practices
 * - Potential conflicts of interest
 */

import { z } from "zod";
import { LLMClient, getLLMClient } from "@orbit/llm";
import { fetchSource } from "./fetcher.js";
import type { SourceCredibility, IncentiveProfile, CredibilityFlag } from "./credibility.js";

const CredibilityAssessmentSchema = z.object({
  // Core scores (0-1)
  factualAccuracy: z.number().min(0).max(1)
    .describe("Estimated track record of factual reporting based on content analysis"),
  sourceCitation: z.number().min(0).max(1)
    .describe("How well does the source cite primary sources and data?"),
  methodologyTransparency: z.number().min(0).max(1)
    .describe("Are methods, data sources, and reasoning explained?"),
  independenceScore: z.number().min(0).max(1)
    .describe("Freedom from commercial, political, or ideological pressure"),

  // Incentive analysis
  incentiveType: z.enum(["commercial", "political", "ideological", "academic", "governmental", "nonprofit", "independent"]),
  fundingSources: z.array(z.string()).describe("Identified or likely funding sources"),
  potentialConflicts: z.array(z.string()).describe("Potential conflicts of interest"),
  advertisingModel: z.boolean().describe("Does the site rely on advertising revenue?"),
  engagementOptimized: z.boolean().describe("Is content optimized for engagement/clicks?"),

  // Flags
  warnings: z.array(z.string()).describe("Serious credibility concerns"),
  cautions: z.array(z.string()).describe("Moderate concerns to be aware of"),
  notes: z.array(z.string()).describe("Neutral observations about the source"),

  // Confidence
  confidenceInAssessment: z.number().min(0).max(1)
    .describe("How confident are you in this assessment? (0=guessing, 1=highly confident)"),

  // Reasoning
  reasoning: z.string().describe("Brief explanation of your assessment"),
});

type CredibilityAssessment = z.infer<typeof CredibilityAssessmentSchema>;

export class LLMCredibilityAssessor {
  private llmClient: LLMClient;
  private cache: Map<string, { assessment: SourceCredibility; timestamp: number }> = new Map();
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient ?? getLLMClient();
  }

  async assessSource(url: string, pageContent?: string): Promise<SourceCredibility> {
    const domain = this.extractDomain(url);

    // Check cache
    const cached = this.cache.get(domain);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.assessment;
    }

    // Fetch content if not provided
    let content = pageContent;
    if (!content) {
      try {
        // Try to fetch about page for better context
        const aboutUrls = [
          `https://${domain}/about`,
          `https://${domain}/about-us`,
          `https://${domain}/who-we-are`,
          url,
        ];

        for (const aboutUrl of aboutUrls) {
          try {
            content = await fetchSource({ url: aboutUrl, type: "observation" });
            if (content && content.length > 500) break;
          } catch {
            continue;
          }
        }

        if (!content) {
          content = await fetchSource({ url, type: "observation" });
        }
      } catch (error) {
        // If we can't fetch, return unknown assessment
        return this.createUnknownAssessment(domain);
      }
    }

    // Analyze with LLM
    const assessment = await this.analyzeWithLLM(domain, url, content);

    // Cache result
    this.cache.set(domain, { assessment, timestamp: Date.now() });

    return assessment;
  }

  private async analyzeWithLLM(domain: string, url: string, content: string): Promise<SourceCredibility> {
    const systemPrompt = `You are an expert media analyst specializing in source credibility assessment.
Your task is to evaluate the credibility and potential biases of information sources.

Evaluation criteria:
1. **Factual Accuracy**: Does the source have a track record of accurate reporting? Look for citations, corrections policies, fact-checking.
2. **Source Citation**: Does it cite primary sources, data, and evidence? Or make unsupported claims?
3. **Methodology Transparency**: Are methods, data collection, and reasoning explained?
4. **Independence**: Is it free from commercial, political, or ideological pressure?

Incentive analysis:
- Identify the likely business model (advertising, subscriptions, grants, government funding)
- Look for potential conflicts of interest (corporate ownership, donor influence, political ties)
- Check if content is optimized for engagement/clicks vs accuracy

Be objective and evidence-based. Assign lower scores when you identify clear bias indicators.
Assign higher confidence when you have clear evidence; lower when speculating.`;

    const userPrompt = `Assess the credibility of this source:

Domain: ${domain}
URL: ${url}

Page content (truncated):
${content.slice(0, 15000)}

Analyze this source for:
1. Factual accuracy indicators
2. Citation and methodology practices
3. Independence from commercial/political influence
4. Potential conflicts of interest
5. Business model and engagement optimization

Provide a credibility assessment with scores from 0 to 1.`;

    try {
      const result = await this.llmClient.completeStructured(
        [{ role: "user", content: userPrompt }],
        {
          schema: CredibilityAssessmentSchema,
          systemPrompt,
          schemaName: "credibility_assessment",
          schemaDescription: "Source credibility assessment",
        }
      );

      return this.convertToSourceCredibility(result.data, domain);
    } catch (error) {
      console.error(`LLM assessment failed for ${domain}:`, error);
      return this.createUnknownAssessment(domain);
    }
  }

  private convertToSourceCredibility(assessment: CredibilityAssessment, domain: string): SourceCredibility {
    const flags: CredibilityFlag[] = [];

    for (const warning of assessment.warnings) {
      flags.push({ type: "warning", category: "accuracy", message: warning });
    }
    for (const caution of assessment.cautions) {
      flags.push({ type: "caution", category: "incentive", message: caution });
    }
    for (const note of assessment.notes) {
      flags.push({ type: "info", category: "transparency", message: note });
    }

    const incentiveProfile: IncentiveProfile = {
      type: assessment.incentiveType,
      fundingSources: assessment.fundingSources,
      potentialConflicts: assessment.potentialConflicts,
      advertisingModel: assessment.advertisingModel,
      engagementOptimized: assessment.engagementOptimized,
    };

    // Compute overall credibility (weighted average)
    const overallCredibility = (
      assessment.factualAccuracy * 0.3 +
      assessment.sourceCitation * 0.2 +
      assessment.methodologyTransparency * 0.2 +
      assessment.independenceScore * 0.3
    );

    return {
      factualAccuracy: assessment.factualAccuracy,
      sourceCitation: assessment.sourceCitation,
      methodologyTransparency: assessment.methodologyTransparency,
      correctionPolicy: 0.5, // Not assessed by LLM
      independenceScore: assessment.independenceScore,
      statisticalVerifiability: 0.5, // Not assessed by LLM
      crossReferenceability: 0.5, // Not assessed by LLM
      incentiveProfile,
      overallCredibility,
      confidenceInAssessment: assessment.confidenceInAssessment,
      flags,
    };
  }

  private createUnknownAssessment(domain: string): SourceCredibility {
    return {
      factualAccuracy: 0.5,
      sourceCitation: 0.5,
      methodologyTransparency: 0.5,
      correctionPolicy: 0.5,
      independenceScore: 0.5,
      statisticalVerifiability: 0.5,
      crossReferenceability: 0.5,
      incentiveProfile: { type: "independent" },
      overallCredibility: 0.5,
      confidenceInAssessment: 0.1,
      flags: [
        { type: "warning", category: "verification", message: `Could not assess ${domain} - verify claims independently` }
      ],
    };
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let assessorInstance: LLMCredibilityAssessor | null = null;

export function getLLMCredibilityAssessor(): LLMCredibilityAssessor {
  if (!assessorInstance) {
    assessorInstance = new LLMCredibilityAssessor();
  }
  return assessorInstance;
}

export async function assessUnknownSource(url: string): Promise<SourceCredibility> {
  const assessor = getLLMCredibilityAssessor();
  return assessor.assessSource(url);
}
