import { z } from "zod";
import type { LLMClient } from "@orbit/llm";

type Message = { role: "user" | "assistant" | "system"; content: string };

interface MockResponse {
  pattern: RegExp | string;
  response: unknown;
}

export class MockLLMClient {
  private mockResponses: MockResponse[] = [];
  public calls: Array<{ messages: Message[]; options: unknown }> = [];

  addMockResponse(pattern: RegExp | string, response: unknown): void {
    this.mockResponses.push({ pattern, response });
  }

  clearMocks(): void {
    this.mockResponses = [];
    this.calls = [];
  }

  private findMockResponse(messages: Message[]): unknown | null {
    const content = messages.map((m) => m.content).join("\n");

    for (const mock of this.mockResponses) {
      if (typeof mock.pattern === "string") {
        if (content.includes(mock.pattern)) {
          return mock.response;
        }
      } else if (mock.pattern.test(content)) {
        return mock.response;
      }
    }
    return null;
  }

  async complete(
    messages: Message[],
    options: { systemPrompt?: string; model?: string; maxTokens?: number } = {}
  ): Promise<{ content: string; metrics: { inputTokens: number; outputTokens: number; latencyMs: number; model: string; provider: string }; finishReason: string }> {
    this.calls.push({ messages, options });

    const mockResponse = this.findMockResponse(messages);
    const content = typeof mockResponse === "string" ? mockResponse : "Mock response";

    return {
      content,
      metrics: {
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 100,
        model: options.model || "mock-model",
        provider: "mock",
      },
      finishReason: "stop",
    };
  }

  async completeStructured<T extends z.ZodType>(
    messages: Message[],
    options: {
      schema: T;
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
      schemaName?: string;
      schemaDescription?: string;
    }
  ): Promise<{ data: z.infer<T>; rawContent: string; metrics: { inputTokens: number; outputTokens: number; latencyMs: number; model: string; provider: string }; finishReason: string }> {
    this.calls.push({ messages, options });

    const mockResponse = this.findMockResponse(messages);

    if (mockResponse) {
      const parsed = options.schema.safeParse(mockResponse);
      if (parsed.success) {
        return {
          data: parsed.data,
          rawContent: JSON.stringify(mockResponse),
          metrics: {
            inputTokens: 100,
            outputTokens: 50,
            latencyMs: 100,
            model: options.model || "mock-model",
            provider: "mock",
          },
          finishReason: "stop",
        };
      }
    }

    // Generate a minimal valid response based on schema
    const data = this.generateFromSchema(options.schema);

    return {
      data,
      rawContent: JSON.stringify(data),
      metrics: {
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 100,
        model: options.model || "mock-model",
        provider: "mock",
      },
      finishReason: "stop",
    };
  }

  private generateFromSchema(schema: z.ZodType): unknown {
    // Basic schema generation for testing
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(shape)) {
        result[key] = this.generateFromSchema(value as z.ZodType);
      }
      return result;
    }

    if (schema instanceof z.ZodString) {
      return "mock-string";
    }

    if (schema instanceof z.ZodNumber) {
      return 0.5;
    }

    if (schema instanceof z.ZodBoolean) {
      return true;
    }

    if (schema instanceof z.ZodArray) {
      return [this.generateFromSchema(schema.element)];
    }

    if (schema instanceof z.ZodEnum) {
      const values = schema.options;
      return values[0];
    }

    if (schema instanceof z.ZodLiteral) {
      return schema.value;
    }

    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
      return null;
    }

    if (schema instanceof z.ZodDefault) {
      return schema._def.defaultValue();
    }

    if (schema instanceof z.ZodRecord) {
      return {};
    }

    if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
      const options = schema.options;
      if (options.length > 0) {
        return this.generateFromSchema(options[0]);
      }
    }

    return null;
  }
}

export function createMockLLMClient(): MockLLMClient {
  return new MockLLMClient();
}
