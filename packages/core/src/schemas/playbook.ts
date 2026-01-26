import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const ApplicabilitySchema = z.object({
  patternTypes: z.array(z.string()),
  domains: z.array(z.string()),
  issueCharacteristics: z.record(z.string(), z.unknown()),
});

export const SolutionPatternSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  template: z.record(z.string(), z.unknown()),
});

export const PlaybookStatusSchema = z.enum(["draft", "active", "deprecated"]);

export const PlaybookSchema = BaseRecordSchema.extend({
  type: z.literal("Playbook"),

  name: z.string().min(1).max(100),
  description: z.string().min(1),

  applicableTo: ApplicabilitySchema,

  problemBriefTemplate: z.record(z.string(), z.unknown()),
  investigationSteps: z.array(z.string()),
  solutionPatterns: z.array(SolutionPatternSchema),

  timesUsed: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  avgTimeToResolution: z.number().int().nonnegative().nullable(),

  forkedFrom: z.string().nullable(),

  playbookStatus: PlaybookStatusSchema,
});

export type Applicability = z.infer<typeof ApplicabilitySchema>;
export type SolutionPattern = z.infer<typeof SolutionPatternSchema>;
export type PlaybookStatus = z.infer<typeof PlaybookStatusSchema>;
export type Playbook = z.infer<typeof PlaybookSchema>;

const FlexibleApplicabilitySchema = z.object({
  patternTypes: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  issueCharacteristics: z.record(z.string(), z.unknown()).optional().default({}),
}).optional().default({ patternTypes: [], domains: [], issueCharacteristics: {} });

export const CreatePlaybookInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  applicableTo: FlexibleApplicabilitySchema,
  problemBriefTemplate: z.record(z.string(), z.unknown()).optional().default({}),
  investigationSteps: z.array(z.string()).optional().default([]),
  solutionPatterns: z.array(SolutionPatternSchema).optional().default([]),
  forkedFrom: z.string().nullable().optional().default(null),
  playbookStatus: PlaybookStatusSchema.optional().default("draft"),
  steps: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    action: z.object({
      type: z.string(),
      config: z.record(z.string(), z.unknown()).optional().default({}),
    }),
    continueOnError: z.boolean().optional().default(false),
  })).optional().default([]),
  triggers: z.array(z.object({
    type: z.string(),
    schedule: z.string().optional(),
    conditions: z.record(z.string(), z.unknown()).optional(),
  })).optional().default([{ type: "manual" }]),
});

export type CreatePlaybookInput = z.infer<typeof CreatePlaybookInputSchema>;
