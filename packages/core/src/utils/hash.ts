/**
 * Utility functions for content hashing
 */

/**
 * Compute SHA256 hash of content
 */
export const computeHash = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hashHex}`;
};

/**
 * Compute content hash for a record payload
 * Canonicalizes the JSON before hashing for consistency
 */
export const computeContentHash = async (payload: unknown): Promise<string> => {
  const canonical = JSON.stringify(payload, Object.keys(payload as object).sort());
  return computeHash(canonical);
};

/**
 * Verify that a content hash matches the payload
 */
export const verifyContentHash = async (payload: unknown, hash: string): Promise<boolean> => {
  const computed = await computeContentHash(payload);
  return computed === hash;
};
