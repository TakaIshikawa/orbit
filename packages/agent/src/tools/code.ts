import { z } from "zod";
import { BaseTool, type ToolDefinition, type ToolResult } from "./base.js";

const CodeInputSchema = z.object({
  task: z
    .enum(["generate", "refactor", "review", "explain", "test"])
    .describe("Type of code operation"),
  language: z.string().describe("Programming language"),
  description: z.string().describe("Description of what to generate/analyze"),
  existingCode: z.string().optional().describe("Existing code to refactor/review/explain"),
  requirements: z.array(z.string()).optional().describe("Specific requirements or constraints"),
  context: z
    .object({
      framework: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      codeStyle: z.string().optional(),
    })
    .optional()
    .describe("Project context"),
});

const CodeFileSchema = z.object({
  filename: z.string(),
  content: z.string(),
  language: z.string(),
  description: z.string(),
});

const CodeReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning", "suggestion"]),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
    })
  ),
  metrics: z.object({
    complexity: z.enum(["low", "medium", "high"]),
    maintainability: z.enum(["poor", "fair", "good", "excellent"]),
    testability: z.enum(["poor", "fair", "good", "excellent"]),
  }),
  recommendations: z.array(z.string()),
});

const CodeExplanationSchema = z.object({
  summary: z.string(),
  sections: z.array(
    z.object({
      lines: z.string(),
      explanation: z.string(),
    })
  ),
  concepts: z.array(
    z.object({
      term: z.string(),
      definition: z.string(),
    })
  ),
  flowDescription: z.string(),
});

const TestGenerationSchema = z.object({
  testFramework: z.string(),
  testFiles: z.array(CodeFileSchema),
  coverage: z.object({
    functions: z.array(z.string()),
    edgeCases: z.array(z.string()),
  }),
});

const CodeOutputSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("generate"),
    files: z.array(CodeFileSchema),
    explanation: z.string(),
    usage: z.string().optional(),
  }),
  z.object({
    task: z.literal("refactor"),
    files: z.array(CodeFileSchema),
    changes: z.array(z.string()),
    rationale: z.string(),
  }),
  z.object({
    task: z.literal("review"),
    review: CodeReviewSchema,
  }),
  z.object({
    task: z.literal("explain"),
    explanation: CodeExplanationSchema,
  }),
  z.object({
    task: z.literal("test"),
    tests: TestGenerationSchema,
  }),
]);

type CodeInput = z.infer<typeof CodeInputSchema>;
type CodeOutput = z.infer<typeof CodeOutputSchema>;

export class CodeTool extends BaseTool {
  definition: ToolDefinition = {
    name: "code",
    description: "Generates, refactors, reviews, explains, and tests code",
    inputSchema: CodeInputSchema,
    outputSchema: CodeOutputSchema,
  };

  async execute<T>(input: unknown): Promise<ToolResult<T>> {
    try {
      const data = this.validateInput(input, CodeInputSchema);

      let result: CodeOutput;

      switch (data.task) {
        case "generate":
          result = await this.generateCode(data);
          break;
        case "refactor":
          result = await this.refactorCode(data);
          break;
        case "review":
          result = await this.reviewCode(data);
          break;
        case "explain":
          result = await this.explainCode(data);
          break;
        case "test":
          result = await this.generateTests(data);
          break;
      }

      return {
        success: true,
        data: result as T,
        metadata: {
          task: data.task,
          language: data.language,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildContextPrompt(input: CodeInput): string {
    const parts: string[] = [`Language: ${input.language}`];

    if (input.context?.framework) {
      parts.push(`Framework: ${input.context.framework}`);
    }
    if (input.context?.dependencies?.length) {
      parts.push(`Dependencies: ${input.context.dependencies.join(", ")}`);
    }
    if (input.context?.codeStyle) {
      parts.push(`Code Style: ${input.context.codeStyle}`);
    }
    if (input.requirements?.length) {
      parts.push(`Requirements:\n${input.requirements.map((r) => `- ${r}`).join("\n")}`);
    }

    return parts.join("\n");
  }

  private async generateCode(input: CodeInput): Promise<CodeOutput> {
    const contextPrompt = this.buildContextPrompt(input);

    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Generate code for the following:

${contextPrompt}

Description: ${input.description}

Generate clean, well-documented code that follows best practices for ${input.language}.
Include appropriate error handling and comments.`,
        },
      ],
      {
        schema: z.object({
          task: z.literal("generate"),
          files: z.array(CodeFileSchema),
          explanation: z.string(),
          usage: z.string().optional(),
        }),
        systemPrompt: `You are an expert ${input.language} developer. Generate production-quality code that is clean, efficient, and well-documented.`,
        schemaName: "code_generation_output",
      }
    );

    return result.data;
  }

  private async refactorCode(input: CodeInput): Promise<CodeOutput> {
    if (!input.existingCode) {
      throw new Error("existingCode is required for refactor task");
    }

    const contextPrompt = this.buildContextPrompt(input);

    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Refactor the following code:

${contextPrompt}

Refactoring Goals: ${input.description}

Existing Code:
\`\`\`${input.language}
${input.existingCode}
\`\`\`

Improve the code while maintaining functionality. Focus on:
- Code clarity and readability
- Performance optimizations
- Better error handling
- Adherence to best practices`,
        },
      ],
      {
        schema: z.object({
          task: z.literal("refactor"),
          files: z.array(CodeFileSchema),
          changes: z.array(z.string()),
          rationale: z.string(),
        }),
        systemPrompt: `You are an expert code refactoring specialist. Improve code quality while preserving functionality.`,
        schemaName: "code_refactor_output",
      }
    );

    return result.data;
  }

  private async reviewCode(input: CodeInput): Promise<CodeOutput> {
    if (!input.existingCode) {
      throw new Error("existingCode is required for review task");
    }

    const contextPrompt = this.buildContextPrompt(input);

    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Review the following code:

${contextPrompt}

Review Focus: ${input.description}

Code to Review:
\`\`\`${input.language}
${input.existingCode}
\`\`\`

Provide a thorough code review covering:
- Bugs and potential issues
- Code quality and style
- Performance concerns
- Security considerations
- Maintainability`,
        },
      ],
      {
        schema: z.object({
          task: z.literal("review"),
          review: CodeReviewSchema,
        }),
        systemPrompt: `You are an expert code reviewer. Provide thorough, constructive feedback that helps improve code quality.`,
        schemaName: "code_review_output",
      }
    );

    return result.data;
  }

  private async explainCode(input: CodeInput): Promise<CodeOutput> {
    if (!input.existingCode) {
      throw new Error("existingCode is required for explain task");
    }

    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Explain the following ${input.language} code:

${input.description ? `Focus: ${input.description}\n\n` : ""}Code:
\`\`\`${input.language}
${input.existingCode}
\`\`\`

Provide a clear explanation covering:
- Overall purpose and functionality
- Section-by-section breakdown
- Key concepts and patterns used
- Data flow and control flow`,
        },
      ],
      {
        schema: z.object({
          task: z.literal("explain"),
          explanation: CodeExplanationSchema,
        }),
        systemPrompt: `You are an expert at explaining code. Make complex code accessible and understandable.`,
        schemaName: "code_explanation_output",
      }
    );

    return result.data;
  }

  private async generateTests(input: CodeInput): Promise<CodeOutput> {
    if (!input.existingCode) {
      throw new Error("existingCode is required for test task");
    }

    const contextPrompt = this.buildContextPrompt(input);

    const result = await this.llmClient.completeStructured(
      [
        {
          role: "user",
          content: `Generate tests for the following code:

${contextPrompt}

Testing Requirements: ${input.description}

Code to Test:
\`\`\`${input.language}
${input.existingCode}
\`\`\`

Generate comprehensive tests covering:
- Unit tests for each function/method
- Edge cases and error conditions
- Integration tests if applicable`,
        },
      ],
      {
        schema: z.object({
          task: z.literal("test"),
          tests: TestGenerationSchema,
        }),
        systemPrompt: `You are an expert at writing tests. Generate comprehensive, maintainable tests that ensure code reliability.`,
        schemaName: "test_generation_output",
      }
    );

    return result.data;
  }
}

export const codeTool = new CodeTool();
