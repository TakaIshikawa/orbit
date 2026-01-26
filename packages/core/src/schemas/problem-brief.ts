import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const GoalPrioritySchema = z.enum(["must", "should", "could"]);

export const GoalSchema = z.object({
  description: z.string().min(1),
  successCriteria: z.string().min(1),
  priority: GoalPrioritySchema,
});

export const ConstraintTypeSchema = z.enum([
  "legal",
  "ethical",
  "technical",
  "resource",
  "time",
  "other",
]);

export const ConstraintSchema = z.object({
  type: ConstraintTypeSchema,
  description: z.string().min(1),
  hard: z.boolean(),
});

export const UncertaintyImpactSchema = z.enum(["low", "medium", "high"]);

export const UncertaintySchema = z.object({
  question: z.string().min(1),
  impactIfWrong: UncertaintyImpactSchema,
  resolved: z.boolean(),
  resolution: z.string().nullable(),
});

export const ActionSpaceSchema = z.object({
  allowed: z.array(z.string()),
  forbidden: z.array(z.string()),
  requiresApproval: z.array(z.string()),
});

export const RequiredEvidenceSchema = z.object({
  description: z.string().min(1),
  gathered: z.boolean(),
  source: z.string().nullable(),
});

export const ProblemBriefSchema = BaseRecordSchema.extend({
  type: z.literal("ProblemBrief"),

  issueId: z.string().min(1),

  goals: z.array(GoalSchema).min(1),
  constraints: z.array(ConstraintSchema),
  uncertainties: z.array(UncertaintySchema),
  actionSpace: ActionSpaceSchema,
  requiredEvidence: z.array(RequiredEvidenceSchema),
});

export type GoalPriority = z.infer<typeof GoalPrioritySchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type UncertaintyImpact = z.infer<typeof UncertaintyImpactSchema>;
export type Uncertainty = z.infer<typeof UncertaintySchema>;
export type ActionSpace = z.infer<typeof ActionSpaceSchema>;
export type RequiredEvidence = z.infer<typeof RequiredEvidenceSchema>;
export type ProblemBrief = z.infer<typeof ProblemBriefSchema>;

export const CreateProblemBriefInputSchema = ProblemBriefSchema.omit({
  id: true,
  contentHash: true,
  parentHash: true,
  authorSignature: true,
  createdAt: true,
  version: true,
  status: true,
}).extend({
  status: z.enum(["draft", "active"]).optional().default("draft"),
});

export type CreateProblemBriefInput = z.infer<typeof CreateProblemBriefInputSchema>;
