import { sign, verify, uint8ArrayToBase64, base64ToUint8Array } from "./keys.js";
import type { ActorIdentity, SignedPayload, VerificationResult } from "./types.js";

/**
 * Sign a payload with an actor's private key
 */
export async function signPayload<T>(
  payload: T,
  actorId: string,
  privateKey: Uint8Array
): Promise<SignedPayload<T>> {
  const signedAt = new Date().toISOString();

  // Create canonical representation for signing
  const canonical = JSON.stringify({
    payload,
    signedBy: actorId,
    signedAt,
  });

  const data = new TextEncoder().encode(canonical);
  const signature = await sign(data, privateKey);

  return {
    payload,
    signature: uint8ArrayToBase64(signature),
    signedBy: actorId,
    signedAt,
  };
}

/**
 * Verify a signed payload against an actor's public key
 */
export async function verifyPayload<T>(
  signedPayload: SignedPayload<T>,
  actor: ActorIdentity
): Promise<VerificationResult> {
  if (signedPayload.signedBy !== actor.id) {
    return {
      valid: false,
      error: `Signer mismatch: expected ${actor.id}, got ${signedPayload.signedBy}`,
    };
  }

  const canonical = JSON.stringify({
    payload: signedPayload.payload,
    signedBy: signedPayload.signedBy,
    signedAt: signedPayload.signedAt,
  });

  const data = new TextEncoder().encode(canonical);
  const signature = base64ToUint8Array(signedPayload.signature);
  const publicKey = base64ToUint8Array(actor.publicKey);

  const valid = await verify(data, signature, publicKey);

  return {
    valid,
    actor: valid ? actor : undefined,
    error: valid ? undefined : "Signature verification failed",
  };
}

/**
 * Create a signature for a content-addressed record
 * This is the standard format used in the database
 */
export async function createRecordSignature(
  contentHash: string,
  actorId: string,
  privateKey: Uint8Array
): Promise<string> {
  const data = new TextEncoder().encode(`${contentHash}:${actorId}`);
  const signature = await sign(data, privateKey);
  return `sig:${uint8ArrayToBase64(signature)}`;
}

/**
 * Verify a record signature
 */
export async function verifyRecordSignature(
  contentHash: string,
  actorId: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  if (!signature.startsWith("sig:")) {
    return false;
  }

  const sigBytes = base64ToUint8Array(signature.slice(4));
  const pubKeyBytes = base64ToUint8Array(publicKey);
  const data = new TextEncoder().encode(`${contentHash}:${actorId}`);

  return verify(data, sigBytes, pubKeyBytes);
}
