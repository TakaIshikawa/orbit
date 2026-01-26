import { generateId } from "@orbit/core";
import {
  type Agent,
  type AgentInput,
  type AgentOutput,
  AnalystAgent,
  ScoutAgent,
  TriageAgent,
  PlannerAgent,
} from "@orbit/agent";
import type {
  AgentRegistration,
  InvocationRequest,
  InvocationResult,
  RuntimeLimits,
  Trigger,
} from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";
import { AgentRegistry } from "./registry.js";

export interface ExecutorOptions {
  limits?: Partial<RuntimeLimits>;
  onInvocationStart?: (request: InvocationRequest) => void;
  onInvocationComplete?: (result: InvocationResult) => void;
  onError?: (error: Error, request: InvocationRequest) => void;
}

export class AgentExecutor {
  private registry: AgentRegistry;
  private limits: RuntimeLimits;
  private runningInvocations: Map<string, AbortController> = new Map();
  private options: ExecutorOptions;

  constructor(registry: AgentRegistry, options: ExecutorOptions = {}) {
    this.registry = registry;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.options = options;
  }

  private createAgent(agentType: AgentRegistration["agentType"]): Agent {
    switch (agentType) {
      case "scout":
        return new ScoutAgent();
      case "triage":
        return new TriageAgent();
      case "analyst":
        return new AnalystAgent();
      case "planner":
        return new PlannerAgent();
      default:
        throw new Error(`Agent type "${agentType}" not implemented`);
    }
  }

  async invoke(request: InvocationRequest): Promise<InvocationResult> {
    const registration = this.registry.get(request.registrationId);
    if (!registration) {
      throw new Error(`Agent registration ${request.registrationId} not found`);
    }

    if (registration.status !== "active") {
      throw new Error(`Agent ${request.registrationId} is not active (status: ${registration.status})`);
    }

    const runId = generateId("run");
    const abortController = new AbortController();
    this.runningInvocations.set(runId, abortController);

    this.options.onInvocationStart?.(request);

    const startTime = Date.now();
    let result: InvocationResult;

    try {
      const agent = this.createAgent(registration.agentType);

      const input: AgentInput = {
        context: {
          agentId: registration.id,
          runId,
          decisionId: generateId("dec"),
          triggeredBy: this.normalizeTrigger(request.trigger),
        },
        payload: {
          ...registration.config,
          ...request.payload,
        },
      };

      // Run with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          abortController.abort();
          reject(new Error("Invocation timeout"));
        }, this.limits.invocationTimeoutMs);
      });

      const output = await Promise.race([agent.run(input), timeoutPromise]) as AgentOutput;

      const duration = Date.now() - startTime;
      const tokensUsed = output.llmCalls.reduce(
        (acc, call) => ({
          input: acc.input + call.tokens.input,
          output: acc.output + call.tokens.output,
        }),
        { input: 0, output: 0 }
      );

      result = {
        runId,
        registrationId: request.registrationId,
        success: output.success,
        result: output.result,
        error: output.error,
        duration,
        llmCalls: output.llmCalls.length,
        tokensUsed,
      };

      this.registry.recordInvocation(request.registrationId, output.success ? "success" : "failure");
    } catch (error) {
      const duration = Date.now() - startTime;
      const isTimeout = error instanceof Error && error.message === "Invocation timeout";

      result = {
        runId,
        registrationId: request.registrationId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
        llmCalls: 0,
        tokensUsed: { input: 0, output: 0 },
      };

      this.registry.recordInvocation(request.registrationId, isTimeout ? "timeout" : "failure");
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)), request);
    } finally {
      this.runningInvocations.delete(runId);
    }

    this.options.onInvocationComplete?.(result);
    return result;
  }

  private normalizeTrigger(trigger: Trigger): { type: "manual" | "cron" | "event" | "parent_agent"; ref: string } {
    switch (trigger.type) {
      case "manual":
        return { type: "manual", ref: trigger.invokedBy };
      case "cron":
        return { type: "cron", ref: trigger.schedule };
      case "event":
        return { type: "event", ref: trigger.eventType };
      case "parent_agent":
        return { type: "parent_agent", ref: trigger.parentRunId };
    }
  }

  cancel(runId: string): boolean {
    const controller = this.runningInvocations.get(runId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  getRunningCount(): number {
    return this.runningInvocations.size;
  }

  isRunning(runId: string): boolean {
    return this.runningInvocations.has(runId);
  }
}
