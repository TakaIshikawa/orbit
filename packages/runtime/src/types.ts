import { z } from "zod";

export const TriggerTypeSchema = z.enum(["manual", "cron", "event", "parent_agent"]);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("manual"),
    invokedBy: z.string(),
  }),
  z.object({
    type: z.literal("cron"),
    schedule: z.string(), // cron expression
    lastRun: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal("event"),
    eventType: z.string(),
    filter: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("parent_agent"),
    parentAgentId: z.string(),
    parentRunId: z.string(),
  }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

export const StopConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("goal_achieved"),
    check: z.string(), // expression to evaluate
  }),
  z.object({
    type: z.literal("max_invocations"),
    limit: z.number(),
  }),
  z.object({
    type: z.literal("expiry"),
    expiresAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal("manual"),
  }),
]);
export type StopCondition = z.infer<typeof StopConditionSchema>;

export const AgentRegistrationSchema = z.object({
  id: z.string(),
  owner: z.string(),
  parentId: z.string().nullable(),

  agentType: z.enum(["scout", "triage", "analyst", "planner", "operator", "critic", "safety"]),
  config: z.record(z.unknown()),

  triggers: z.array(TriggerSchema),
  stopConditions: z.array(StopConditionSchema),

  // Lifecycle
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  status: z.enum(["active", "paused", "stopped", "expired"]),

  // Limits
  maxInvocations: z.number(),
  invocationCount: z.number(),
  maxChildren: z.number(),
  children: z.array(z.string()),

  // Metadata
  lastInvokedAt: z.string().datetime().nullable(),
  lastResult: z.enum(["success", "failure", "timeout"]).nullable(),
});
export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export interface InvocationRequest {
  registrationId: string;
  trigger: Trigger;
  payload: Record<string, unknown>;
}

export interface InvocationResult {
  runId: string;
  registrationId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  duration: number;
  llmCalls: number;
  tokensUsed: { input: number; output: number };
}

export interface RuntimeLimits {
  maxAgentsPerUser: number;
  maxChildrenPerAgent: number;
  maxInvocationsDefault: number;
  maxLifetimeDays: number;
  invocationTimeoutMs: number;
  spawnRateLimitPerHour: number;
}

export const DEFAULT_LIMITS: RuntimeLimits = {
  maxAgentsPerUser: 20,
  maxChildrenPerAgent: 5,
  maxInvocationsDefault: 1000,
  maxLifetimeDays: 30,
  invocationTimeoutMs: 5 * 60 * 1000, // 5 minutes
  spawnRateLimitPerHour: 10,
};
