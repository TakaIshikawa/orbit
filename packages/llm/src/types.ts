import { z } from "zod";

export type Provider = "anthropic" | "openai" | "groq";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMCallMetrics {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
  provider: Provider;
}

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

export interface CompletionResult {
  content: string;
  metrics: LLMCallMetrics;
  finishReason: "stop" | "length" | "tool_use" | "error";
}

export interface StructuredCompletionOptions<T extends z.ZodType> extends CompletionOptions {
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
}

export interface StructuredCompletionResult<T> extends Omit<CompletionResult, "content"> {
  data: T;
  rawContent: string;
}

export interface LLMProvider {
  readonly provider: Provider;

  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;

  completeStructured<T extends z.ZodType>(
    messages: Message[],
    options: StructuredCompletionOptions<T>
  ): Promise<StructuredCompletionResult<z.infer<T>>>;
}
