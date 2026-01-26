import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  LLMProvider,
  Message,
  CompletionOptions,
  CompletionResult,
  StructuredCompletionOptions,
  StructuredCompletionResult,
} from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const COMPUTER_USE_MODEL = "claude-sonnet-4-20250514";

// Computer-use specific types
export interface ComputerUseOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  displaySize: {
    width: number;
    height: number;
  };
}

export interface ComputerUseMessage {
  role: "user" | "assistant";
  content: ComputerUseContent[];
}

export type ComputerUseContent =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content?: ComputerUseContent[]; is_error?: boolean };

export interface ComputerUseResult {
  content: ComputerUseContent[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  metrics: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    model: string;
  };
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Simple conversion for common Zod types
  // For production, use zod-to-json-schema library
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      // Don't mark as required if it has a default or is optional
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema.options,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap());
    return { ...inner, nullable: true };
  }

  // Handle ZodDefault - unwrap to get the inner schema
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }

  // Handle ZodEffects (preprocess, refine, transform) - unwrap to get the inner schema
  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema._def.schema);
  }

  return { type: "string" };
}

export class AnthropicProvider implements LLMProvider {
  readonly provider = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const {
      model = DEFAULT_MODEL,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt,
      stopSequences,
    } = options;

    const anthropicMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const systemContent = systemPrompt ?? messages.find((m) => m.role === "system")?.content;

    const startTime = Date.now();

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemContent,
      messages: anthropicMessages,
      stop_sequences: stopSequences,
    });

    const latencyMs = Date.now() - startTime;

    const textContent = response.content.find((c) => c.type === "text");
    const content = textContent?.type === "text" ? textContent.text : "";

    return {
      content,
      metrics: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        model,
        provider: "anthropic",
      },
      finishReason: response.stop_reason === "end_turn" ? "stop" : "length",
    };
  }

  async completeStructured<T extends z.ZodType>(
    messages: Message[],
    options: StructuredCompletionOptions<T>
  ): Promise<StructuredCompletionResult<z.infer<T>>> {
    const {
      schema,
      schemaName = "response",
      schemaDescription = "The structured response",
      model = DEFAULT_MODEL,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt,
    } = options;

    const anthropicMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const systemContent = systemPrompt ?? messages.find((m) => m.role === "system")?.content;

    const startTime = Date.now();

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemContent,
      messages: anthropicMessages,
      tools: [
        {
          name: schemaName,
          description: schemaDescription,
          input_schema: zodToJsonSchema(schema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: schemaName },
    });

    const latencyMs = Date.now() - startTime;

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("No tool use in response");
    }

    const rawContent = JSON.stringify(toolUse.input);
    const data = schema.parse(toolUse.input);

    return {
      data,
      rawContent,
      metrics: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        model,
        provider: "anthropic",
      },
      finishReason: "tool_use",
    };
  }

  /**
   * Complete with computer-use tools enabled.
   * Uses the beta API with computer_20241022 tool type.
   */
  async completeWithComputerUse(
    messages: ComputerUseMessage[],
    options: ComputerUseOptions
  ): Promise<ComputerUseResult> {
    const {
      model = COMPUTER_USE_MODEL,
      maxTokens = 4096,
      systemPrompt,
      displaySize,
    } = options;

    const startTime = Date.now();

    // Use the beta API for computer-use
    const response = await this.client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages as Anthropic.Beta.BetaMessageParam[],
      tools: [
        {
          type: "computer_20241022",
          name: "computer",
          display_width_px: displaySize.width,
          display_height_px: displaySize.height,
        },
      ],
      betas: ["computer-use-2024-10-22"],
    });

    const latencyMs = Date.now() - startTime;

    // Convert response content to our format
    const content: ComputerUseContent[] = response.content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
      // Handle other types if needed
      return { type: "text" as const, text: "" };
    });

    return {
      content,
      stopReason: response.stop_reason as ComputerUseResult["stopReason"],
      metrics: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs,
        model,
      },
    };
  }
}
