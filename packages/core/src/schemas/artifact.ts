import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const ArtifactTypeSchema = z.enum([
  "document",
  "code",
  "tool",
  "dataset",
  "analysis",
  "deployment",
  "other",
]);

export const StorageTypeSchema = z.enum(["inline", "object_store", "git", "external"]);

export const ContentRefSchema = z.object({
  storage: StorageTypeSchema,
  location: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const ArtifactStatusSchema = z.enum(["draft", "final", "superseded"]);

export const ArtifactSchema = BaseRecordSchema.extend({
  type: z.literal("Artifact"),

  solutionId: z.string().min(1),
  runId: z.string().min(1),

  title: z.string().min(1).max(200),
  artifactType: ArtifactTypeSchema,

  contentRef: ContentRefSchema,

  format: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  derivedFrom: z.array(z.string()),

  artifactStatus: ArtifactStatusSchema,
});

export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export type StorageType = z.infer<typeof StorageTypeSchema>;
export type ContentRef = z.infer<typeof ContentRefSchema>;
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;

export const CreateArtifactInputSchema = ArtifactSchema.omit({
  id: true,
  contentHash: true,
  parentHash: true,
  authorSignature: true,
  createdAt: true,
  version: true,
  status: true,
}).extend({
  status: z.enum(["draft", "active"]).optional().default("active"),
});

export type CreateArtifactInput = z.infer<typeof CreateArtifactInputSchema>;
