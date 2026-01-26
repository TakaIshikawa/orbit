import { z } from "zod";
import { BaseTool, type ToolDefinition, type ToolResult } from "./base.js";

const DocumentInputSchema = z.object({
  type: z
    .enum(["report", "brief", "memo", "analysis", "summary", "proposal"])
    .describe("Type of document to generate"),
  title: z.string().describe("Document title"),
  context: z.string().describe("Background context and requirements"),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        requirements: z.string(),
      })
    )
    .optional()
    .describe("Specific sections to include"),
  style: z
    .object({
      tone: z.enum(["formal", "technical", "accessible", "executive"]).optional(),
      length: z.enum(["brief", "standard", "comprehensive"]).optional(),
      audience: z.string().optional(),
    })
    .optional()
    .describe("Style preferences"),
  data: z.record(z.unknown()).optional().describe("Data to incorporate"),
});

const DocumentOutputSchema = z.object({
  title: z.string(),
  documentType: z.string(),
  content: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      content: z.string(),
    })
  ),
  metadata: z.object({
    wordCount: z.number(),
    generatedAt: z.string(),
    tone: z.string(),
    audience: z.string(),
  }),
  suggestions: z.array(z.string()).optional(),
});

type DocumentInput = z.infer<typeof DocumentInputSchema>;
type DocumentOutput = z.infer<typeof DocumentOutputSchema>;

export class DocumentTool extends BaseTool {
  definition: ToolDefinition = {
    name: "document",
    description: "Generates structured documents: reports, briefs, memos, analyses, and proposals",
    inputSchema: DocumentInputSchema,
    outputSchema: DocumentOutputSchema,
  };

  async execute<T>(input: unknown): Promise<ToolResult<T>> {
    try {
      const data = this.validateInput(input, DocumentInputSchema);
      const result = await this.generateDocument(data);

      return {
        success: true,
        data: result as T,
        metadata: {
          documentType: data.type,
          wordCount: result.metadata.wordCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async generateDocument(input: DocumentInput): Promise<DocumentOutput> {
    const styleGuide = this.buildStyleGuide(input);
    const sectionsGuide = this.buildSectionsGuide(input);
    const dataContext = input.data ? `\n\nData to incorporate:\n${JSON.stringify(input.data, null, 2)}` : "";

    const systemPrompt = `You are an expert document writer specializing in ${input.type} documents.

${styleGuide}

Guidelines:
- Write clear, well-structured content
- Use appropriate formatting for the document type
- Ensure logical flow between sections
- Support claims with evidence when available
- Include actionable recommendations where appropriate`;

    const userPrompt = `Generate a ${input.type} document with the following specifications:

Title: ${input.title}

Context and Requirements:
${input.context}
${sectionsGuide}${dataContext}

Create a complete, professional document that addresses all requirements.`;

    const result = await this.llmClient.completeStructured(
      [{ role: "user", content: userPrompt }],
      {
        schema: DocumentOutputSchema,
        systemPrompt,
        schemaName: "document_output",
        schemaDescription: `Generated ${input.type} document`,
      }
    );

    return {
      ...result.data,
      metadata: {
        ...result.data.metadata,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private buildStyleGuide(input: DocumentInput): string {
    const style = input.style || {};
    const parts: string[] = [];

    if (style.tone) {
      const toneGuides: Record<string, string> = {
        formal: "Use formal language, avoid contractions, maintain professional distance",
        technical: "Use precise technical terminology, include detailed specifications",
        accessible: "Use clear, simple language, explain technical terms, use examples",
        executive: "Be concise, lead with conclusions, focus on business impact",
      };
      parts.push(`Tone: ${toneGuides[style.tone]}`);
    }

    if (style.length) {
      const lengthGuides: Record<string, string> = {
        brief: "Keep content concise, 1-2 paragraphs per section maximum",
        standard: "Provide adequate detail, 2-4 paragraphs per section",
        comprehensive: "Include thorough analysis, detailed explanations, extensive evidence",
      };
      parts.push(`Length: ${lengthGuides[style.length]}`);
    }

    if (style.audience) {
      parts.push(`Target Audience: ${style.audience}`);
    }

    return parts.length > 0 ? `Style Requirements:\n${parts.join("\n")}` : "";
  }

  private buildSectionsGuide(input: DocumentInput): string {
    if (!input.sections?.length) {
      return "";
    }

    const sectionsText = input.sections
      .map((s, i) => `${i + 1}. ${s.heading}: ${s.requirements}`)
      .join("\n");

    return `\n\nRequired Sections:\n${sectionsText}`;
  }
}

export const documentTool = new DocumentTool();
