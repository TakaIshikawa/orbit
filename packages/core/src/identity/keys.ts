import { webcrypto } from "node:crypto";
import { generateId } from "../schemas/base.js";
import type { ActorIdentity, ActorType, ActorKeyPair } from "./types.js";

const subtle = webcrypto.subtle;

interface WebCryptoKeyPair {
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
}

/**
 * Generate a new Ed25519 key pair
 */
export async function generateKeyPair(): Promise<ActorKeyPair> {
  const keyPair = (await subtle.generateKey("Ed25519", true, ["sign", "verify"])) as WebCryptoKeyPair;

  const publicKeyBuffer = await subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyBuffer = await subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: new Uint8Array(publicKeyBuffer),
    privateKey: new Uint8Array(privateKeyBuffer),
  };
}

/**
 * Create a new actor identity with a fresh key pair
 */
export async function createActorIdentity(
  type: ActorType,
  metadata?: Record<string, unknown>
): Promise<{ identity: ActorIdentity; privateKey: Uint8Array }> {
  const keyPair = await generateKeyPair();

  const identity: ActorIdentity = {
    id: generateId("actor"),
    type,
    publicKey: uint8ArrayToBase64(keyPair.publicKey),
    createdAt: new Date().toISOString(),
    metadata,
  };

  return { identity, privateKey: keyPair.privateKey };
}

/**
 * Sign data with a private key
 */
export async function sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  const key = await subtle.importKey("pkcs8", privateKey, "Ed25519", false, ["sign"]);

  const signature = await subtle.sign("Ed25519", key, data);
  return new Uint8Array(signature);
}

/**
 * Verify a signature with a public key
 */
export async function verify(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    const key = await subtle.importKey("raw", publicKey, "Ed25519", false, ["verify"]);

    return subtle.verify("Ed25519", key, signature, data);
  } catch {
    return false;
  }
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ArrayToBase64(arr: Uint8Array): string {
  return Buffer.from(arr).toString("base64");
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Derive actor ID from public key (first 16 chars of hex-encoded key)
 */
export function deriveActorIdFromPublicKey(publicKey: Uint8Array): string {
  const hex = Buffer.from(publicKey).toString("hex");
  return `actor_${hex.slice(0, 16)}`;
}
