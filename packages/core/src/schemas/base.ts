import { z } from "zod";

// Base record that all objects inherit
export const BaseRecordSchema = z.object({
  id: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  parentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  author: z.string().min(1),
  authorSignature: z.string().min(1),
  createdAt: z.string().datetime(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "active", "superseded", "archived"]),
});

export type BaseRecord = z.infer<typeof BaseRecordSchema>;

// Common enums
export const RecordStatusSchema = z.enum(["draft", "active", "superseded", "archived"]);
export type RecordStatus = z.infer<typeof RecordStatusSchema>;

// ID generators
export const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}${random}`;
};
