import Groq from "groq-sdk";
import { z } from "zod";
import type {
  LLMProvider,
  Message,
  CompletionOptions,
  CompletionResult,
  StructuredCompletionOptions,
  StructuredCompletionResult,
} from "../types.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) {
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

  return { type: "string" };
}

export class GroqProvider implements LLMProvider {
  readonly provider = "groq" as const;
  private client: Groq;

  constructor(apiKey?: string) {
    this.client = new Groq({
      apiKey: apiKey ?? process.env.GROQ_API_KEY,
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

    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      groqMessages.push({ role: "system", content: systemPrompt });
    }

    for (const m of messages) {
      groqMessages.push({ role: m.role, content: m.content });
    }

    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: groqMessages,
      stop: stopSequences,
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content ?? "";

    return {
      content,
      metrics: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        latencyMs,
        model,
        provider: "groq",
      },
      finishReason: response.choices[0]?.finish_reason === "stop" ? "stop" : "length",
    };
  }

  async completeStructured<T extends z.ZodType>(
    messages: Message[],
    options: StructuredCompletionOptions<T>
  ): Promise<StructuredCompletionResult<z.infer<T>>> {
    const {
      schema,
      schemaName = "response",
      model = DEFAULT_MODEL,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt,
    } = options;

    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      groqMessages.push({ role: "system", content: systemPrompt });
    }

    for (const m of messages) {
      groqMessages.push({ role: m.role, content: m.content });
    }

    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: groqMessages,
      response_format: {
        type: "json_object",
      },
    });

    const latencyMs = Date.now() - startTime;
    const rawContent = response.choices[0]?.message?.content ?? "{}";
    const data = schema.parse(JSON.parse(rawContent));

    return {
      data,
      rawContent,
      metrics: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        latencyMs,
        model,
        provider: "groq",
      },
      finishReason: "stop",
    };
  }
}
