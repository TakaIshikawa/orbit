import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const DecisionTypeSchema = z.enum(["approve", "reject", "defer", "modify"]);
export const AutonomyLevelSchema = z.enum(["L0", "L1", "L2", "L3"]);

export const ApprovalSchema = z.object({
  actorId: z.string().min(1),
  approvedAt: z.string().datetime(),
  scope: z.string().min(1),
});

export const GuardrailTypeSchema = z.enum(["budget", "time", "scope", "reversibility"]);
export const EnforcementSchema = z.enum(["hard", "soft"]);

export const GuardrailSchema = z.object({
  type: GuardrailTypeSchema,
  limit: z.string().min(1),
  enforcement: EnforcementSchema,
});

export const DecisionSchema = BaseRecordSchema.extend({
  type: z.literal("Decision"),

  solutionId: z.string().min(1),

  decision: DecisionTypeSchema,
  rationale: z.string().min(1),
  modifications: z.string().nullable(),

  autonomyLevel: AutonomyLevelSchema,

  approvals: z.array(ApprovalSchema),
  guardrails: z.array(GuardrailSchema),

  runId: z.string().nullable(),
});

export type DecisionType = z.infer<typeof DecisionTypeSchema>;
export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type GuardrailType = z.infer<typeof GuardrailTypeSchema>;
export type Enforcement = z.infer<typeof EnforcementSchema>;
export type Guardrail = z.infer<typeof GuardrailSchema>;
export type Decision = z.infer<typeof DecisionSchema>;

export const CreateDecisionInputSchema = DecisionSchema.omit({
  id: true,
  contentHash: true,
  parentHash: true,
  authorSignature: true,
  createdAt: true,
  version: true,
  status: true,
  runId: true,
}).extend({
  status: z.enum(["draft", "active"]).optional().default("active"),
});

export type CreateDecisionInput = z.infer<typeof CreateDecisionInputSchema>;
