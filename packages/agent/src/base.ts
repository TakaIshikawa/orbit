import { z } from "zod";
import { LLMClient, getLLMClient, type Message, type LLMCallMetrics } from "@orbit/llm";
import { computeContentHash } from "@orbit/core";
import type {
  Agent,
  AgentDefinition,
  AgentInput,
  AgentOutput,
  LLMCallRecord,
  DecisionRecord,
} from "./types.js";

export abstract class BaseAgent implements Agent {
  abstract definition: AgentDefinition;

  protected llmClient: LLMClient;
  protected llmCalls: LLMCallRecord[] = [];
  protected decisions: DecisionRecord[] = [];
  protected callCounter = 0;
  protected stepCounter = 0;

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient ?? getLLMClient();
  }

  abstract execute(input: AgentInput): Promise<Record<string, unknown>>;

  async run(input: AgentInput): Promise<AgentOutput> {
    this.llmCalls = [];
    this.decisions = [];
    this.callCounter = 0;
    this.stepCounter = 0;

    try {
      const result = await this.execute(input);

      return {
        success: true,
        result,
        llmCalls: this.llmCalls,
        decisions: this.decisions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        llmCalls: this.llmCalls,
        decisions: this.decisions,
      };
    }
  }

  protected async complete(
    messages: Message[],
    options: { systemPrompt?: string; model?: string; maxTokens?: number } = {}
  ): Promise<string> {
    const result = await this.llmClient.complete(messages, options);
    await this.recordLLMCall(messages, result.content, result.metrics);
    return result.content;
  }

  protected async completeStructured<T extends z.ZodType>(
    messages: Message[],
    schema: T,
    options: {
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
      schemaName?: string;
      schemaDescription?: string;
    } = {}
  ): Promise<z.infer<T>> {
    const result = await this.llmClient.completeStructured(messages, {
      schema,
      ...options,
    });
    await this.recordLLMCall(messages, result.rawContent, result.metrics);
    return result.data;
  }

  private async recordLLMCall(
    messages: Message[],
    response: string,
    metrics: LLMCallMetrics
  ): Promise<void> {
    this.callCounter++;

    const promptHash = await computeContentHash(messages);
    const responseHash = await computeContentHash(response);

    this.llmCalls.push({
      callId: this.callCounter,
      promptHash,
      responseHash,
      model: metrics.model,
      tokens: {
        input: metrics.inputTokens,
        output: metrics.outputTokens,
      },
      latencyMs: metrics.latencyMs,
    });
  }

  protected recordDecision(reasoning: string, actionChosen: string, confidence: number): void {
    this.stepCounter++;
    this.decisions.push({
      step: this.stepCounter,
      reasoning,
      actionChosen,
      confidence,
    });
  }
}
