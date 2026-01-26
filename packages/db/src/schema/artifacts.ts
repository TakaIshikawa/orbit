import { jsonb, pgEnum, pgTable, text, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { recordStatusEnum } from "./patterns.js";

export const artifactTypeEnum = pgEnum("artifact_type", [
  "document",
  "code",
  "tool",
  "dataset",
  "analysis",
  "deployment",
  "other",
]);

export const artifactStatusEnum = pgEnum("artifact_status", ["draft", "final", "superseded"]);

export const artifacts = pgTable("artifacts", {
  // Base record fields
  id: text("id").primaryKey(),
  contentHash: text("content_hash").notNull(),
  parentHash: text("parent_hash"),
  author: text("author").notNull(),
  authorSignature: text("author_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  status: recordStatusEnum("status").notNull().default("active"),

  // Artifact-specific fields
  solutionId: text("solution_id").notNull(),
  runId: text("run_id").notNull(),
  title: text("title").notNull(),
  artifactType: artifactTypeEnum("artifact_type").notNull(),
  contentRef: jsonb("content_ref").notNull(),
  format: text("format").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  derivedFrom: jsonb("derived_from").$type<string[]>().notNull().default([]),
  artifactStatus: artifactStatusEnum("artifact_status").notNull().default("draft"),
});

export type ArtifactRow = typeof artifacts.$inferSelect;
export type NewArtifactRow = typeof artifacts.$inferInsert;
