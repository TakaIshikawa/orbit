import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const ClaimTypeSchema = z.enum(["fact", "causal", "prediction", "opinion"]);

export const ClaimSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  sources: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  contradictedBy: z.array(z.string()),
  supports: z.array(z.string()),
  claimType: ClaimTypeSchema,
});

export const EvidenceTypeSchema = z.enum(["document", "data", "testimony", "analysis"]);

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  type: EvidenceTypeSchema,
  source: z.string().min(1),
  summary: z.string().min(1),
  supportsClaims: z.array(z.string()),
  reliability: z.number().min(0).max(1),
});

export const ActorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  interests: z.array(z.string()),
  influence: z.number().min(0).max(1),
});

export const RelationshipTypeSchema = z.enum([
  "influences",
  "opposes",
  "depends_on",
  "funds",
  "regulates",
]);

export const RelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: RelationshipTypeSchema,
});

export const FeedbackLoopSchema = z.object({
  description: z.string().min(1),
  reinforcing: z.boolean(),
  nodes: z.array(z.string()),
});

export const SystemMapSchema = z.object({
  actors: z.array(ActorSchema),
  relationships: z.array(RelationshipSchema),
  feedbackLoops: z.array(FeedbackLoopSchema),
});

export const UncertaintyLevelSchema = z.enum(["low", "medium", "high"]);

export const UncertaintyAreaSchema = z.object({
  area: z.string().min(1),
  level: UncertaintyLevelSchema,
  reducible: z.boolean(),
  howToReduce: z.string().nullable(),
});

export const SituationModelSchema = BaseRecordSchema.extend({
  type: z.literal("SituationModel"),

  problemBriefId: z.string().min(1),

  claims: z.array(ClaimSchema),
  evidence: z.array(EvidenceSchema),
  systemMap: SystemMapSchema,
  uncertaintyMap: z.array(UncertaintyAreaSchema),

  keyInsights: z.array(z.string()),
  recommendedLeveragePoints: z.array(z.string()),
});

export type ClaimType = z.infer<typeof ClaimTypeSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type FeedbackLoop = z.infer<typeof FeedbackLoopSchema>;
export type SystemMap = z.infer<typeof SystemMapSchema>;
export type UncertaintyLevel = z.infer<typeof UncertaintyLevelSchema>;
export type UncertaintyArea = z.infer<typeof UncertaintyAreaSchema>;
export type SituationModel = z.infer<typeof SituationModelSchema>;

export const CreateSituationModelInputSchema = SituationModelSchema.omit({
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

export type CreateSituationModelInput = z.infer<typeof CreateSituationModelInputSchema>;
