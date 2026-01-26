import {
  createActorIdentity,
  signPayload,
  verifyPayload,
  createRecordSignature,
  verifyRecordSignature,
  computeContentHash,
} from "@orbit/core";

async function main() {
  console.log("Testing Actor Identity & Signing\n");

  // 1. Create an actor identity
  console.log("1. Creating actor identity...");
  const { identity, privateKey } = await createActorIdentity("user", {
    name: "Test User",
  });
  console.log(`   Actor ID: ${identity.id}`);
  console.log(`   Type: ${identity.type}`);
  console.log(`   Public Key: ${identity.publicKey.slice(0, 32)}...`);
  console.log("");

  // 2. Sign a payload
  console.log("2. Signing a payload...");
  const testPayload = {
    title: "Test Pattern",
    description: "This is a test pattern for signing verification",
    domains: ["test", "verification"],
  };

  const signedPayload = await signPayload(testPayload, identity.id, privateKey);
  console.log(`   Signed By: ${signedPayload.signedBy}`);
  console.log(`   Signed At: ${signedPayload.signedAt}`);
  console.log(`   Signature: ${signedPayload.signature.slice(0, 32)}...`);
  console.log("");

  // 3. Verify the payload
  console.log("3. Verifying signed payload...");
  const verificationResult = await verifyPayload(signedPayload, identity);
  console.log(`   Valid: ${verificationResult.valid}`);
  if (verificationResult.error) {
    console.log(`   Error: ${verificationResult.error}`);
  }
  console.log("");

  // 4. Test tamper detection
  console.log("4. Testing tamper detection...");
  const tamperedPayload = {
    ...signedPayload,
    payload: { ...testPayload, title: "Tampered Title" },
  };
  const tamperedResult = await verifyPayload(tamperedPayload, identity);
  console.log(`   Tampered payload valid: ${tamperedResult.valid} (should be false)`);
  console.log("");

  // 5. Test record signature (used in database)
  console.log("5. Testing record signature...");
  const contentHash = await computeContentHash(testPayload);
  console.log(`   Content Hash: ${contentHash}`);

  const recordSig = await createRecordSignature(contentHash, identity.id, privateKey);
  console.log(`   Record Signature: ${recordSig.slice(0, 40)}...`);

  const recordValid = await verifyRecordSignature(
    contentHash,
    identity.id,
    recordSig,
    identity.publicKey
  );
  console.log(`   Record signature valid: ${recordValid}`);
  console.log("");

  // 6. Test wrong key verification
  console.log("6. Testing wrong key detection...");
  const { identity: otherIdentity } = await createActorIdentity("user");
  const wrongKeyResult = await verifyPayload(signedPayload, otherIdentity);
  console.log(`   Wrong key verification: ${wrongKeyResult.valid} (should be false)`);
  console.log("");

  console.log("✓ All identity tests completed!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
