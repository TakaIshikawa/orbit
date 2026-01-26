import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const TriggerTypeSchema = z.enum(["manual", "cron", "event", "parent_agent"]);

export const TriggerSchema = z.object({
  type: TriggerTypeSchema,
  ref: z.string().min(1),
});

export const LLMCallSchema = z.object({
  callId: z.number().int().positive(),
  promptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  responseHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  model: z.string().min(1),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
  latencyMs: z.number().int().nonnegative(),
});

export const DecisionStepSchema = z.object({
  step: z.number().int().positive(),
  reasoning: z.string().min(1),
  actionChosen: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const ToolCallApprovalSchema = z.object({
  gate: z.string().min(1),
  result: z.string().min(1),
});

export const ToolCallSchema = z.object({
  tool: z.string().min(1),
  inputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  outputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  capabilityUsed: z.string().min(1),
  approval: ToolCallApprovalSchema,
  latencyMs: z.number().int().nonnegative(),
});

export const RunStatusSchema = z.enum(["running", "success", "failed", "timeout", "cancelled"]);

export const RunLogSchema = BaseRecordSchema.extend({
  type: z.literal("RunLog"),

  decisionId: z.string().min(1),
  agentId: z.string().min(1),

  triggeredBy: TriggerSchema,

  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),

  llmCalls: z.array(LLMCallSchema),
  decisions: z.array(DecisionStepSchema),
  toolCalls: z.array(ToolCallSchema),

  status: RunStatusSchema,
  error: z.string().nullable(),
  artifacts: z.array(z.string()),
  stateChanges: z.array(z.string()),
});

export type TriggerType = z.infer<typeof TriggerTypeSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type LLMCall = z.infer<typeof LLMCallSchema>;
export type DecisionStep = z.infer<typeof DecisionStepSchema>;
export type ToolCallApproval = z.infer<typeof ToolCallApprovalSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunLog = z.infer<typeof RunLogSchema>;

export const CreateRunLogInputSchema = RunLogSchema.omit({
  id: true,
  contentHash: true,
  parentHash: true,
  authorSignature: true,
  createdAt: true,
  version: true,
  status: true,
  completedAt: true,
  llmCalls: true,
  decisions: true,
  toolCalls: true,
  error: true,
  artifacts: true,
  stateChanges: true,
}).extend({
  status: z.enum(["draft", "active"]).optional().default("active"),
});

export type CreateRunLogInput = z.infer<typeof CreateRunLogInputSchema>;
