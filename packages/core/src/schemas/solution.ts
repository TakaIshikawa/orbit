import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const SolutionTypeSchema = z.enum([
  "tool",
  "platform",
  "system",
  "automation",
  "research",
  "model",
  "other",
]);

export const ComplexitySchema = z.enum(["low", "medium", "high"]);
export const LikelihoodSchema = z.enum(["low", "medium", "high"]);
export const ImpactLevelSchema = z.enum(["low", "medium", "high"]);
export const OwnerTypeSchema = z.enum(["human", "agent"]);

export const ComponentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  complexity: ComplexitySchema,
});

export const PreconditionSchema = z.object({
  description: z.string().min(1),
  met: z.boolean(),
});

export const RiskSchema = z.object({
  description: z.string().min(1),
  likelihood: LikelihoodSchema,
  impact: ImpactLevelSchema,
  mitigation: z.string().nullable(),
});

export const MetricSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  target: z.string().min(1),
  measurementMethod: z.string().min(1),
});

export const ExecutionStepSchema = z.object({
  step: z.number().int().positive(),
  description: z.string().min(1),
  owner: OwnerTypeSchema,
  toolsRequired: z.array(z.string()),
  estimatedComplexity: ComplexitySchema,
  dependencies: z.array(z.number().int().positive()),
});

export const SolutionStatusSchema = z.enum([
  "proposed",
  "approved",
  "in_progress",
  "completed",
  "abandoned",
]);

export const SolutionSchema = BaseRecordSchema.extend({
  type: z.literal("Solution"),

  situationModelId: z.string().min(1),

  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  solutionType: SolutionTypeSchema,

  mechanism: z.string().min(1),

  components: z.array(ComponentSchema),
  preconditions: z.array(PreconditionSchema),
  risks: z.array(RiskSchema),
  metrics: z.array(MetricSchema),
  executionPlan: z.array(ExecutionStepSchema),

  artifacts: z.array(z.string()),
  addressesIssues: z.array(z.string()),

  solutionStatus: SolutionStatusSchema,
});

export type SolutionType = z.infer<typeof SolutionTypeSchema>;
export type Complexity = z.infer<typeof ComplexitySchema>;
export type Likelihood = z.infer<typeof LikelihoodSchema>;
export type ImpactLevel = z.infer<typeof ImpactLevelSchema>;
export type OwnerType = z.infer<typeof OwnerTypeSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type Precondition = z.infer<typeof PreconditionSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export type SolutionStatus = z.infer<typeof SolutionStatusSchema>;
export type Solution = z.infer<typeof SolutionSchema>;

export const CreateSolutionInputSchema = SolutionSchema.omit({
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

export type CreateSolutionInput = z.infer<typeof CreateSolutionInputSchema>;
