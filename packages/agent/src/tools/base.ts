import { z } from "zod";
import { LLMClient, getLLMClient } from "@orbit/llm";

export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
}

export abstract class BaseTool {
  abstract definition: ToolDefinition;

  protected llmClient: LLMClient;

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient ?? getLLMClient();
  }

  abstract execute<T>(input: unknown): Promise<ToolResult<T>>;

  validateInput<T extends z.ZodType>(input: unknown, schema: T): z.infer<T> {
    return schema.parse(input);
  }
}
