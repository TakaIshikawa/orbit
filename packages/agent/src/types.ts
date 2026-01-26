import { z } from "zod";

export type AgentType =
  | "scout"
  | "triage"
  | "analyst"
  | "planner"
  | "operator"
  | "critic"
  | "safety";

export interface AgentContext {
  agentId: string;
  runId: string;
  decisionId: string;
  triggeredBy: {
    type: "manual" | "cron" | "event" | "parent_agent";
    ref: string;
  };
}

export interface AgentInput {
  context: AgentContext;
  payload: Record<string, unknown>;
}

export interface AgentOutput {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  artifacts?: string[];
  stateChanges?: string[];
  llmCalls: LLMCallRecord[];
  decisions: DecisionRecord[];
}

export interface LLMCallRecord {
  callId: number;
  promptHash: string;
  responseHash: string;
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  latencyMs: number;
}

export interface DecisionRecord {
  step: number;
  reasoning: string;
  actionChosen: string;
  confidence: number;
}

export interface AgentDefinition {
  type: AgentType;
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
}

export interface Agent {
  definition: AgentDefinition;
  run(input: AgentInput): Promise<AgentOutput>;
}
