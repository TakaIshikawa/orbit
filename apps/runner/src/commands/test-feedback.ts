#!/usr/bin/env npx tsx
/**
 * Test Feedback Loops
 *
 * This script tests the feedback loop system by:
 * 1. Creating test patterns with known confidence
 * 2. Creating test verifications
 * 3. Generating feedback events
 * 4. Running the feedback processor
 * 5. Verifying adjustments were applied correctly
 *
 * Usage:
 *   npx tsx src/commands/test-feedback.ts
 *   npx tsx src/commands/test-feedback.ts --loop verification
 *   npx tsx src/commands/test-feedback.ts --loop source
 *   npx tsx src/commands/test-feedback.ts --loop solution
 *   npx tsx src/commands/test-feedback.ts --dry-run
 */

import { program } from "commander";
import {
  getDatabase,
  PatternRepository,
  VerificationRepository,
  SourceHealthRepository,
  FeedbackEventRepository,
  ConfidenceAdjustmentRepository,
  SystemLearningRepository,
  SolutionRepository,
  SolutionOutcomeRepository,
  SolutionEffectivenessRepository,
} from "@orbit/db";
import {
  runFeedbackProcessor,
  generateVerificationFeedback,
  generateSolutionOutcomeFeedback,
} from "../jobs/feedback-processor.js";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown> | object;
}

async function testVerificationLoop(db: ReturnType<typeof getDatabase>, dryRun: boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const patternRepo = new PatternRepository(db);
  const verificationRepo = new VerificationRepository(db);
  const feedbackRepo = new FeedbackEventRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);

  console.log("\n=== Testing Verification → Pattern Confidence Loop ===\n");

  // Step 1: Create a test pattern
  const testPatternId = `test_pattern_${Date.now()}`;
  const initialConfidence = 0.7;

  console.log(`1. Creating test pattern with confidence: ${(initialConfidence * 100).toFixed(1)}%`);

  const pattern = await patternRepo.create({
    id: testPatternId,
    contentHash: `hash_${testPatternId}`,
    parentHash: null,
    author: "test-system",
    authorSignature: "test-sig",
    createdAt: new Date(),
    version: 1,
    status: "active",
    title: "Test Pattern for Feedback Loop",
    description: "This is a test pattern to verify the feedback loop works",
    patternType: "policy_gap",
    domains: ["test"],
    geographies: [],
    sources: [],
    firstObserved: new Date(),
    observationFrequency: "one_time",
    clusterId: null,
    confidence: initialConfidence,
  });

  results.push({
    name: "Create test pattern",
    passed: pattern.id === testPatternId,
    message: `Pattern created with ID: ${pattern.id}`,
    details: { patternId: pattern.id, confidence: pattern.confidence },
  });

  // Step 2: Create a verification that corroborates
  const testVerificationId = `test_ver_${Date.now()}`;
  console.log(`2. Creating corroborating verification...`);

  const verification = await verificationRepo.create({
    id: testVerificationId,
    createdAt: new Date(),
    sourceType: "pattern",
    sourceId: testPatternId,
    claimStatement: "Test claim that was verified",
    claimCategory: "factual",
    originalConfidence: 0.7,
    status: "corroborated",
    adjustedConfidence: 0.85,
    verificationNotes: "Test verification - corroborated by multiple sources",
    corroboratingSourcesCount: 3,
    conflictingSourcesCount: 0,
    sourceAssessments: [
      {
        url: "https://reuters.com/test-article",
        name: "Reuters",
        credibility: 0.85,
        alignment: "supports",
        relevance: "high",
        relevantExcerpt: "Test excerpt supporting the claim",
        confidence: 0.9,
      },
    ],
    conflicts: [],
  });

  results.push({
    name: "Create verification",
    passed: verification.id === testVerificationId,
    message: `Verification created with status: ${verification.status}`,
    details: { verificationId: verification.id, status: verification.status },
  });

  // Step 3: Generate feedback event
  console.log(`3. Generating feedback event...`);
  const feedbackCount = await generateVerificationFeedback(db, [testVerificationId]);

  results.push({
    name: "Generate feedback events",
    passed: feedbackCount > 0,
    message: `Generated ${feedbackCount} feedback events`,
    details: { eventsGenerated: feedbackCount },
  });

  // Step 4: Check pending feedback
  const pendingBefore = await feedbackRepo.findPending(10);
  const testFeedback = pendingBefore.find(f => f.targetEntityId === testPatternId);

  results.push({
    name: "Feedback event created",
    passed: testFeedback !== undefined,
    message: testFeedback ? "Found pending feedback for test pattern" : "No pending feedback found",
    details: { feedbackId: testFeedback?.id, feedbackType: testFeedback?.feedbackType },
  });

  // Step 5: Run feedback processor
  console.log(`4. Running feedback processor${dryRun ? " (dry run)" : ""}...`);
  const processorResult = await runFeedbackProcessor(db, { dryRun });

  results.push({
    name: "Feedback processor ran",
    passed: processorResult.eventsProcessed > 0,
    message: `Processed ${processorResult.eventsProcessed} events, ${processorResult.adjustmentsMade} adjustments`,
    details: processorResult,
  });

  // Step 6: Verify pattern confidence was adjusted
  if (!dryRun) {
    const updatedPattern = await patternRepo.findById(testPatternId);
    const expectedConfidence = initialConfidence * 1.05; // corroborated = +5%

    results.push({
      name: "Pattern confidence adjusted",
      passed: updatedPattern !== null && Math.abs(updatedPattern.confidence - expectedConfidence) < 0.01,
      message: updatedPattern
        ? `Confidence: ${(initialConfidence * 100).toFixed(1)}% → ${(updatedPattern.confidence * 100).toFixed(1)}% (expected: ${(expectedConfidence * 100).toFixed(1)}%)`
        : "Pattern not found",
      details: {
        initial: initialConfidence,
        expected: expectedConfidence,
        actual: updatedPattern?.confidence,
      },
    });

    // Step 7: Check adjustment was recorded
    const adjustments = await adjustmentRepo.findByEntity("pattern", testPatternId);

    results.push({
      name: "Adjustment recorded",
      passed: adjustments.total > 0,
      message: `Found ${adjustments.total} adjustment records`,
      details: adjustments.data[0],
    });
  }

  // Cleanup
  console.log(`5. Cleaning up test data...`);
  await verificationRepo.delete(testVerificationId);
  await patternRepo.delete(testPatternId);

  return results;
}

async function testSourceAccuracyLoop(db: ReturnType<typeof getDatabase>, dryRun: boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const healthRepo = new SourceHealthRepository(db);
  const verificationRepo = new VerificationRepository(db);
  const feedbackRepo = new FeedbackEventRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  console.log("\n=== Testing Source Verification → Credibility Loop ===\n");

  const testDomain = `test-source-${Date.now()}.com`;

  // Step 1: Create test source health record
  console.log(`1. Creating test source health for: ${testDomain}`);

  const healthId = `health_${testDomain.replace(/[^a-zA-Z0-9]/g, "_")}`;
  await healthRepo.create({
    id: healthId,
    domain: testDomain,
    healthStatus: "healthy",
    successRate: 0.95,
    totalFetches: 100,
    failedFetches: 5,
    successfulFetches: 95,
    avgResponseTimeMs: 500,
    p95ResponseTimeMs: 1200,
    minResponseTimeMs: 100,
    maxResponseTimeMs: 2000,
    errorsByType: {},
    baseReliability: 0.8,
    dynamicReliability: 0.75,
    reliabilityConfidence: 0.5,
    totalVerifications: 0,
    corroboratedCount: 0,
    contestedCount: 0,
    alertActive: false,
    alertReason: null,
    alertSince: null,
    windowStartAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    windowDays: 7,
    lastFetchAt: new Date(),
    lastCalculatedAt: new Date(),
    createdAt: new Date(),
  });

  results.push({
    name: "Create source health",
    passed: true,
    message: `Source health created for ${testDomain}`,
    details: { domain: testDomain, initialReliability: 0.75 },
  });

  // Step 2: Create source accuracy feedback directly
  console.log(`2. Creating source accuracy feedback...`);

  await feedbackRepo.createSourceAccuracyFeedback(
    "test_verification_id",
    testDomain,
    {
      accuracyScore: 0.9, // High accuracy - should increase reliability
      verificationCount: 1,
      alignment: "supports",
    }
  );

  const pending = await feedbackRepo.findPending(10);
  const sourceFeedback = pending.find(f => f.targetEntityId === testDomain);

  results.push({
    name: "Create source feedback",
    passed: sourceFeedback !== undefined,
    message: sourceFeedback ? "Source accuracy feedback created" : "Feedback not found",
  });

  // Step 3: Run processor
  console.log(`3. Running feedback processor${dryRun ? " (dry run)" : ""}...`);
  const processorResult = await runFeedbackProcessor(db, { dryRun });

  results.push({
    name: "Process feedback",
    passed: processorResult.eventsProcessed > 0,
    message: `Processed ${processorResult.eventsProcessed} events`,
    details: processorResult,
  });

  // Step 4: Verify source reliability updated
  if (!dryRun) {
    const updatedHealth = await healthRepo.findByDomain(testDomain);

    results.push({
      name: "Source reliability updated",
      passed: updatedHealth !== null && updatedHealth.totalVerifications > 0,
      message: updatedHealth
        ? `Verifications: ${updatedHealth.totalVerifications}, Reliability: ${((updatedHealth.dynamicReliability ?? 0) * 100).toFixed(1)}%`
        : "Source health not found",
      details: {
        totalVerifications: updatedHealth?.totalVerifications,
        corroboratedCount: updatedHealth?.corroboratedCount,
        dynamicReliability: updatedHealth?.dynamicReliability,
      },
    });

    // Check learning was recorded
    const learning = await learningRepo.findByKey("source_reliability", `domain:${testDomain}`);

    results.push({
      name: "Learning recorded",
      passed: learning !== null,
      message: learning ? `Learning sample size: ${learning.sampleSize}` : "No learning found",
    });
  }

  // Cleanup
  console.log(`4. Cleaning up...`);
  await healthRepo.delete(healthId);

  return results;
}

async function testSolutionOutcomeLoop(db: ReturnType<typeof getDatabase>, dryRun: boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const feedbackRepo = new FeedbackEventRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  console.log("\n=== Testing Solution Outcomes → Learning Loop ===\n");

  // Step 1: Create solution outcome feedback directly
  const testSolutionId = `test_solution_${Date.now()}`;
  console.log(`1. Creating solution outcome feedback...`);

  await feedbackRepo.createSolutionOutcomeFeedback(
    `outcome_${Date.now()}`,
    testSolutionId,
    `issue_${Date.now()}`,
    {
      effectivenessScore: 0.8, // Good effectiveness
      metricsAchieved: 3,
      metricsMissed: 1,
      impactVariance: 0.1, // Slightly exceeded estimate
    }
  );

  const pending = await feedbackRepo.findPending(10);
  const outcomeFeedback = pending.find(f => f.targetEntityId === testSolutionId);

  results.push({
    name: "Create outcome feedback",
    passed: outcomeFeedback !== undefined,
    message: outcomeFeedback ? "Solution outcome feedback created" : "Feedback not found",
  });

  // Step 2: Run processor
  console.log(`2. Running feedback processor${dryRun ? " (dry run)" : ""}...`);
  const processorResult = await runFeedbackProcessor(db, { dryRun });

  results.push({
    name: "Process feedback",
    passed: processorResult.eventsProcessed > 0 && processorResult.learningsUpdated > 0,
    message: `Processed ${processorResult.eventsProcessed} events, ${processorResult.learningsUpdated} learnings updated`,
    details: processorResult,
  });

  // Step 3: Verify learning was updated
  if (!dryRun) {
    const learning = await learningRepo.findByKey("solution_effectiveness", "overall");

    results.push({
      name: "Learning updated",
      passed: learning !== null && learning.sampleSize > 0,
      message: learning
        ? `Effectiveness learning: ${learning.sampleSize} samples, ${((learning.avgEffectiveness ?? 0) * 100).toFixed(1)}% avg effectiveness`
        : "No learning found",
      details: {
        sampleSize: learning?.sampleSize,
        successCount: learning?.successCount,
        avgEffectiveness: learning?.avgEffectiveness,
      },
    });
  }

  return results;
}

async function runAllTests(dryRun: boolean, specificLoop?: string) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║             FEEDBACK LOOP SYSTEM TEST                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No actual changes will be made\n");
  }

  const db = getDatabase();
  let allResults: TestResult[] = [];

  try {
    if (!specificLoop || specificLoop === "verification") {
      const results = await testVerificationLoop(db, dryRun);
      allResults = allResults.concat(results);
    }

    if (!specificLoop || specificLoop === "source") {
      const results = await testSourceAccuracyLoop(db, dryRun);
      allResults = allResults.concat(results);
    }

    if (!specificLoop || specificLoop === "solution") {
      const results = await testSolutionOutcomeLoop(db, dryRun);
      allResults = allResults.concat(results);
    }

    // Print summary
    console.log("\n" + "═".repeat(60));
    console.log("TEST RESULTS SUMMARY");
    console.log("═".repeat(60) + "\n");

    const passed = allResults.filter(r => r.passed).length;
    const failed = allResults.filter(r => !r.passed).length;

    for (const result of allResults) {
      const icon = result.passed ? "✓" : "✗";
      const color = result.passed ? "\x1b[32m" : "\x1b[31m";
      console.log(`${color}${icon}\x1b[0m ${result.name}: ${result.message}`);
      if (!result.passed && result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    }

    console.log("\n" + "─".repeat(60));
    console.log(`Total: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
      console.log("\n✅ All tests passed! Feedback loops are working correctly.\n");
    } else {
      console.log("\n❌ Some tests failed. Check the details above.\n");
      process.exit(1);
    }

  } catch (error) {
    console.error("\n❌ Test error:", error);
    process.exit(1);
  }
}

// CLI
program
  .name("test-feedback")
  .description("Test the feedback loop system")
  .option("--dry-run", "Run without making actual changes")
  .option("--loop <type>", "Test specific loop: verification, source, or solution")
  .action((options) => {
    runAllTests(options.dryRun ?? false, options.loop);
  });

program.parse();
