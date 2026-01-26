#!/usr/bin/env npx tsx
/**
 * Feedback System Status
 *
 * Shows the current state of the feedback loop system:
 * - Pending feedback events
 * - Recent adjustments
 * - System learnings
 * - Statistics
 *
 * Usage:
 *   npx tsx src/commands/feedback-status.ts
 *   npx tsx src/commands/feedback-status.ts --pending
 *   npx tsx src/commands/feedback-status.ts --adjustments
 *   npx tsx src/commands/feedback-status.ts --learnings
 */

import { program } from "commander";
import {
  getDatabase,
  FeedbackEventRepository,
  ConfidenceAdjustmentRepository,
  SystemLearningRepository,
} from "@orbit/db";

async function showPendingEvents() {
  const db = getDatabase();
  const feedbackRepo = new FeedbackEventRepository(db);

  const pending = await feedbackRepo.findPending(50);

  console.log("\n📋 PENDING FEEDBACK EVENTS");
  console.log("─".repeat(60));

  if (pending.length === 0) {
    console.log("No pending feedback events.\n");
    return;
  }

  // Group by type
  const byType = new Map<string, typeof pending>();
  for (const event of pending) {
    const list = byType.get(event.feedbackType) || [];
    list.push(event);
    byType.set(event.feedbackType, list);
  }

  for (const [type, events] of byType) {
    console.log(`\n${type} (${events.length}):`);
    for (const event of events.slice(0, 5)) {
      console.log(`  - ${event.targetEntityType}:${event.targetEntityId.slice(0, 20)}...`);
      console.log(`    Created: ${event.createdAt.toLocaleString()}`);
    }
    if (events.length > 5) {
      console.log(`  ... and ${events.length - 5} more`);
    }
  }

  console.log(`\nTotal pending: ${pending.length}\n`);
}

async function showRecentAdjustments(days: number = 7) {
  const db = getDatabase();
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);

  const stats = await adjustmentRepo.getAdjustmentStats(undefined, days);

  console.log("\n📊 ADJUSTMENT STATISTICS (last " + days + " days)");
  console.log("─".repeat(60));
  console.log(`Total adjustments:     ${stats.totalAdjustments}`);
  console.log(`Positive adjustments:  ${stats.positiveAdjustments} (confidence increased)`);
  console.log(`Negative adjustments:  ${stats.negativeAdjustments} (confidence decreased)`);
  console.log(`Avg magnitude:         ${(stats.avgAdjustmentMagnitude * 100).toFixed(2)}%`);

  // Get recent adjustments
  const recent = await adjustmentRepo.findMany({ limit: 10 });

  if (recent.data.length > 0) {
    console.log("\n📝 RECENT ADJUSTMENTS");
    console.log("─".repeat(60));

    for (const adj of recent.data) {
      const direction = adj.adjustmentDelta > 0 ? "↑" : "↓";
      const color = adj.adjustmentDelta > 0 ? "\x1b[32m" : "\x1b[31m";
      console.log(
        `${color}${direction}\x1b[0m ${adj.entityType}:${adj.entityId.slice(0, 15)}... ` +
        `${adj.field}: ${(adj.previousValue * 100).toFixed(1)}% → ${(adj.newValue * 100).toFixed(1)}%`
      );
      console.log(`  Reason: ${adj.reason}`);
      console.log(`  Time: ${adj.createdAt.toLocaleString()}`);
      console.log();
    }
  }
}

async function showLearnings() {
  const db = getDatabase();
  const learningRepo = new SystemLearningRepository(db);

  console.log("\n🧠 SYSTEM LEARNINGS");
  console.log("─".repeat(60));

  // Get learnings by category
  const categories = [
    "pattern_verification",
    "solution_effectiveness",
    "source_reliability",
  ];

  for (const category of categories) {
    const learnings = await learningRepo.findByCategory(category, { limit: 10 });

    if (learnings.total === 0) continue;

    console.log(`\n${category.replace("_", " ").toUpperCase()} (${learnings.total} entries):`);
    console.log();

    for (const learning of learnings.data) {
      const successRate = learning.successRate !== null
        ? `${(learning.successRate * 100).toFixed(1)}%`
        : "N/A";

      console.log(`  ${learning.learningKey}`);
      console.log(`    Samples: ${learning.sampleSize} | Success rate: ${successRate}`);

      if (learning.avgConfidence !== null) {
        console.log(`    Avg confidence: ${(learning.avgConfidence * 100).toFixed(1)}%`);
      }
      if (learning.avgEffectiveness !== null) {
        console.log(`    Avg effectiveness: ${(learning.avgEffectiveness * 100).toFixed(1)}%`);
      }
      if (learning.avgAccuracy !== null) {
        console.log(`    Avg accuracy: ${(learning.avgAccuracy * 100).toFixed(1)}%`);
      }

      // Show insights if any
      if (learning.insights && learning.insights.length > 0) {
        console.log(`    Insights:`);
        for (const insight of learning.insights.slice(0, 2)) {
          console.log(`      - ${insight.insight} (${(insight.confidence * 100).toFixed(0)}% confident)`);
        }
      }
      console.log();
    }
  }
}

async function showOverview() {
  const db = getDatabase();
  const feedbackRepo = new FeedbackEventRepository(db);
  const adjustmentRepo = new ConfidenceAdjustmentRepository(db);
  const learningRepo = new SystemLearningRepository(db);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║              FEEDBACK SYSTEM STATUS                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Pending events
  const pending = await feedbackRepo.findPending(100);
  console.log(`\n📋 Pending events: ${pending.length}`);

  // Group by type
  const byType = new Map<string, number>();
  for (const event of pending) {
    byType.set(event.feedbackType, (byType.get(event.feedbackType) || 0) + 1);
  }
  for (const [type, count] of byType) {
    console.log(`   - ${type}: ${count}`);
  }

  // Recent adjustments
  const stats = await adjustmentRepo.getAdjustmentStats(undefined, 7);
  console.log(`\n📊 Adjustments (7 days): ${stats.totalAdjustments}`);
  console.log(`   ↑ Positive: ${stats.positiveAdjustments}`);
  console.log(`   ↓ Negative: ${stats.negativeAdjustments}`);

  // Learnings
  const categories = ["pattern_verification", "solution_effectiveness", "source_reliability"];
  console.log(`\n🧠 System learnings:`);

  for (const category of categories) {
    const learnings = await learningRepo.findByCategory(category, { limit: 1 });
    if (learnings.total > 0) {
      console.log(`   - ${category}: ${learnings.total} entries`);
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log("Use --pending, --adjustments, or --learnings for details\n");
}

// CLI
program
  .name("feedback-status")
  .description("Show feedback system status")
  .option("--pending", "Show pending feedback events")
  .option("--adjustments", "Show recent adjustments")
  .option("--learnings", "Show system learnings")
  .option("--days <n>", "Number of days for statistics", "7")
  .action(async (options) => {
    if (options.pending) {
      await showPendingEvents();
    } else if (options.adjustments) {
      await showRecentAdjustments(parseInt(options.days));
    } else if (options.learnings) {
      await showLearnings();
    } else {
      await showOverview();
      await showPendingEvents();
      await showRecentAdjustments(parseInt(options.days));
      await showLearnings();
    }
  });

program.parse();
