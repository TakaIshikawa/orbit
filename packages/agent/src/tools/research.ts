import { z } from "zod";
import { BaseTool, type ToolDefinition, type ToolResult } from "./base.js";

const ResearchInputSchema = z.object({
  query: z.string().describe("Research query or URL to fetch"),
  type: z.enum(["web_search", "fetch_url", "analyze_content"]).describe("Type of research operation"),
  content: z.string().optional().describe("Content to analyze (for analyze_content type)"),
  maxResults: z.number().optional().default(10).describe("Maximum results for web search"),
  extractSchema: z.record(z.string()).optional().describe("Schema for structured extraction"),
});

const WebSearchResultSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      relevance: z.number().min(0).max(1),
    })
  ),
  totalFound: z.number(),
  query: z.string(),
});

const FetchResultSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  content: z.string(),
  contentType: z.string(),
  fetchedAt: z.string(),
  metadata: z
    .object({
      author: z.string().nullable(),
      publishedDate: z.string().nullable(),
      description: z.string().nullable(),
    })
    .optional(),
});

const AnalysisResultSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      relevance: z.number(),
    })
  ),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  topics: z.array(z.string()),
  extractedData: z.record(z.unknown()).optional(),
});

const ResearchOutputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("web_search"),
    result: WebSearchResultSchema,
  }),
  z.object({
    type: z.literal("fetch_url"),
    result: FetchResultSchema,
  }),
  z.object({
    type: z.literal("analyze_content"),
    result: AnalysisResultSchema,
  }),
]);

type ResearchInput = z.infer<typeof ResearchInputSchema>;
type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export class ResearchTool extends BaseTool {
  definition: ToolDefinition = {
    name: "research",
    description: "Performs web research operations: search, fetch URLs, and analyze content",
    inputSchema: ResearchInputSchema,
    outputSchema: ResearchOutputSchema,
  };

  async execute<T>(input: unknown): Promise<ToolResult<T>> {
    try {
      const data = this.validateInput(input, ResearchInputSchema);

      let result: ResearchOutput;

      switch (data.type) {
        case "web_search":
          result = await this.performWebSearch(data);
          break;
        case "fetch_url":
          result = await this.fetchUrl(data);
          break;
        case "analyze_content":
          result = await this.analyzeContent(data);
          break;
      }

      return {
        success: true,
        data: result as T,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async performWebSearch(input: ResearchInput): Promise<ResearchOutput> {
    // In production, this would call an actual search API (e.g., Bing, Google, Brave)
    // For now, simulate search results using LLM
    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Simulate web search results for the query: "${input.query}"

Generate realistic search results that would appear for this query. Include:
- Relevant titles and URLs (use plausible but fictional URLs)
- Informative snippets
- Relevance scores

Maximum results: ${input.maxResults || 10}`,
        },
      ],
      {
        schema: WebSearchResultSchema,
        systemPrompt:
          "You are simulating a web search API. Generate realistic, relevant search results based on the query. All URLs should be plausible but fictional (e.g., example.com, research.org).",
        schemaName: "web_search_results",
      }
    );

    return {
      type: "web_search",
      result: result.data,
    };
  }

  private async fetchUrl(input: ResearchInput): Promise<ResearchOutput> {
    // In production, this would actually fetch the URL
    // For now, simulate content extraction using LLM
    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Simulate fetching content from the URL: "${input.query}"

Based on what this URL likely contains, generate:
- A realistic title
- The main content (summarized)
- Content type
- Metadata (author, date, description if applicable)`,
        },
      ],
      {
        schema: FetchResultSchema,
        systemPrompt:
          "You are simulating a web content fetcher. Based on the URL pattern, generate realistic content that would likely be found at that URL.",
        schemaName: "fetch_result",
      }
    );

    return {
      type: "fetch_url",
      result: {
        ...result.data,
        url: input.query,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  private async analyzeContent(input: ResearchInput): Promise<ResearchOutput> {
    if (!input.content) {
      throw new Error("Content is required for analyze_content type");
    }

    const extractionPrompt = input.extractSchema
      ? `\n\nAlso extract data matching this schema: ${JSON.stringify(input.extractSchema)}`
      : "";

    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Analyze the following content and extract key information:

${input.content}

Provide:
- A concise summary
- Key points and takeaways
- Named entities (people, organizations, places, etc.)
- Overall sentiment
- Main topics${extractionPrompt}`,
        },
      ],
      {
        schema: AnalysisResultSchema,
        systemPrompt:
          "You are an expert content analyst. Analyze the provided content thoroughly and extract structured insights.",
        schemaName: "analysis_result",
      }
    );

    return {
      type: "analyze_content",
      result: result.data,
    };
  }
}

export const researchTool = new ResearchTool();
