import { z } from "zod";

export const ActorTypeSchema = z.enum(["user", "agent", "system"]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const ActorIdentitySchema = z.object({
  id: z.string().regex(/^actor_[a-z0-9]{16}$/),
  type: ActorTypeSchema,
  publicKey: z.string(), // base64-encoded Ed25519 public key
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type ActorIdentity = z.infer<typeof ActorIdentitySchema>;

export interface ActorKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SignedPayload<T> {
  payload: T;
  signature: string; // base64-encoded signature
  signedBy: string; // actor ID
  signedAt: string; // ISO datetime
}

export interface VerificationResult {
  valid: boolean;
  actor?: ActorIdentity;
  error?: string;
}
