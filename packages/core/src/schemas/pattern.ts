import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const PatternTypeSchema = z.enum([
  "policy_gap",
  "structural_inefficiency",
  "feedback_loop",
  "information_asymmetry",
  "coordination_failure",
  "other",
]);

export const ObservationFrequencySchema = z.enum(["one_time", "recurring", "continuous"]);

export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  retrievedAt: z.string().datetime(),
  reliability: z.number().min(0).max(1),
  quoteSpans: z.array(z.string()),
});

export const PatternSchema = BaseRecordSchema.extend({
  type: z.literal("Pattern"),

  // What
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  patternType: PatternTypeSchema,

  // Where
  domains: z.array(z.string()).min(1),
  geographies: z.array(z.string()),

  // Evidence
  sources: z.array(SourceSchema).min(1),

  // Time
  firstObserved: z.string().datetime(),
  observationFrequency: ObservationFrequencySchema,

  // Clustering
  clusterId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type PatternType = z.infer<typeof PatternTypeSchema>;
export type ObservationFrequency = z.infer<typeof ObservationFrequencySchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

// Input schema for creating patterns (without computed fields)
export const CreatePatternInputSchema = PatternSchema.omit({
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

export type CreatePatternInput = z.infer<typeof CreatePatternInputSchema>;
