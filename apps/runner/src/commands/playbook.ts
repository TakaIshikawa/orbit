#!/usr/bin/env npx tsx
/**
 * Playbook Command
 *
 * Create, list, run, and manage playbooks for automated workflows.
 */

import { program } from "commander";
import {
  getDatabase,
  PlaybookRepository,
  PlaybookExecutionRepository,
  PlaybookStepExecutionRepository,
  type PlaybookStep,
  type PlaybookTrigger,
} from "@orbit/db";
import { generateId, computeContentHash } from "@orbit/core";
import { playbookEngine } from "../playbook/engine.js";

const db = getDatabase();
const playbookRepo = new PlaybookRepository(db);
const executionRepo = new PlaybookExecutionRepository(db);
const stepRepo = new PlaybookStepExecutionRepository(db);

program
  .name("playbook")
  .description("Manage and execute playbooks");

// List playbooks
program
  .command("list")
  .description("List all playbooks")
  .option("-s, --status <status>", "Filter by status (draft, active, deprecated)")
  .action(async (options) => {
    const playbooks = await playbookRepo.findByFilters(
      { playbookStatus: options.status },
      { limit: 50 }
    );

    console.log("\n📖 Playbooks\n");
    console.log("─".repeat(80));

    if (playbooks.data.length === 0) {
      console.log("\nNo playbooks found. Create one with: npm run playbook -- create\n");
      return;
    }

    for (const pb of playbooks.data) {
      const steps = (pb.steps || []) as PlaybookStep[];
      const statusIcon = pb.playbookStatus === "active" ? "✓" :
                         pb.playbookStatus === "deprecated" ? "○" : "◐";
      const enabledIcon = pb.isEnabled ? "🟢" : "⚪";

      console.log(`\n${statusIcon} ${pb.name} (${pb.id})`);
      console.log(`  ${enabledIcon} ${pb.playbookStatus} | ${steps.length} steps | Used ${pb.timesUsed}x`);
      if (pb.successRate !== null) {
        console.log(`  Success rate: ${(pb.successRate * 100).toFixed(0)}%`);
      }
      console.log(`  ${pb.description.slice(0, 80)}${pb.description.length > 80 ? "..." : ""}`);
    }

    console.log("\n");
  });

// Show playbook details
program
  .command("show <id>")
  .description("Show playbook details")
  .action(async (id) => {
    const playbook = await playbookRepo.findById(id);

    if (!playbook) {
      console.error(`❌ Playbook not found: ${id}`);
      process.exit(1);
    }

    const steps = (playbook.steps || []) as PlaybookStep[];
    const triggers = (playbook.triggers || []) as PlaybookTrigger[];

    console.log(`\n📖 ${playbook.name}\n`);
    console.log("─".repeat(60));
    console.log(`ID: ${playbook.id}`);
    console.log(`Status: ${playbook.playbookStatus}`);
    console.log(`Enabled: ${playbook.isEnabled ? "Yes" : "No"}`);
    console.log(`Description: ${playbook.description}`);
    console.log(`Used: ${playbook.timesUsed} times`);
    if (playbook.successRate !== null) {
      console.log(`Success Rate: ${(playbook.successRate * 100).toFixed(0)}%`);
    }

    if (triggers.length > 0) {
      console.log(`\nTriggers:`);
      for (const trigger of triggers) {
        console.log(`  - ${trigger.type}${trigger.schedule ? ` (${trigger.schedule})` : ""}`);
      }
    }

    if (steps.length > 0) {
      console.log(`\nSteps (${steps.length}):`);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`  ${i + 1}. [${step.action.type}] ${step.name}`);
        if (step.description) {
          console.log(`     ${step.description}`);
        }
      }
    }

    // Show recent executions
    const executions = await executionRepo.findByPlaybook(playbook.id, { limit: 5 });
    if (executions.data.length > 0) {
      console.log(`\nRecent Executions:`);
      for (const exec of executions.data) {
        const statusIcon = exec.status === "completed" ? "✓" :
                           exec.status === "failed" ? "✗" :
                           exec.status === "running" ? "◐" : "○";
        console.log(`  ${statusIcon} ${exec.id} - ${exec.status} (${new Date(exec.startedAt).toLocaleString()})`);
      }
    }

    console.log("\n");
  });

// Run a playbook
program
  .command("run <id>")
  .description("Execute a playbook")
  .option("-p, --pattern <id>", "Pattern ID for context")
  .option("-i, --issue <id>", "Issue ID for context")
  .option("-b, --brief <id>", "Brief ID for context")
  .action(async (id, options) => {
    const playbook = await playbookRepo.findById(id);

    if (!playbook) {
      console.error(`❌ Playbook not found: ${id}`);
      process.exit(1);
    }

    console.log(`\n🚀 Running playbook: ${playbook.name}\n`);
    console.log("─".repeat(60));

    try {
      const executionId = await playbookEngine.execute(
        id,
        "manual",
        undefined,
        {
          patternId: options.pattern,
          issueId: options.issue,
          briefId: options.brief,
        }
      );

      console.log(`\n✅ Playbook execution complete: ${executionId}\n`);
    } catch (error) {
      console.error(`\n❌ Playbook execution failed:`, error);
      process.exit(1);
    }
  });

// Create a new playbook
program
  .command("create")
  .description("Create a new playbook")
  .requiredOption("-n, --name <name>", "Playbook name")
  .requiredOption("-d, --description <desc>", "Playbook description")
  .option("-t, --template <template>", "Use a template (investigation, full-pipeline, verification)")
  .action(async (options) => {
    let steps: PlaybookStep[] = [];
    let triggers: PlaybookTrigger[] = [{ type: "manual" }];

    // Apply template if specified
    if (options.template) {
      const template = PLAYBOOK_TEMPLATES[options.template as keyof typeof PLAYBOOK_TEMPLATES];
      if (!template) {
        console.error(`❌ Unknown template: ${options.template}`);
        console.log("Available templates: investigation, full-pipeline, verification");
        process.exit(1);
      }
      steps = template.steps;
      triggers = template.triggers;
    }

    const id = generateId("pbk");
    const now = new Date();

    const payload = {
      type: "Playbook" as const,
      name: options.name,
      description: options.description,
    };
    const contentHash = await computeContentHash(payload);

    await playbookRepo.create({
      id,
      contentHash,
      parentHash: null,
      author: "actor_system",
      authorSignature: `sig:placeholder_${Date.now()}`,
      createdAt: now,
      version: 1,
      status: "draft",
      name: options.name,
      description: options.description,
      triggers,
      applicableTo: {},
      steps,
      problemBriefTemplate: {},
      investigationSteps: [],
      solutionPatterns: [],
      timesUsed: 0,
      successRate: null,
      avgTimeToResolution: null,
      forkedFrom: null,
      playbookStatus: "draft",
      isEnabled: false,
    });

    console.log(`\n✅ Created playbook: ${options.name} (${id})`);
    console.log(`\nNext steps:`);
    console.log(`  1. Add steps: npm run playbook -- add-step ${id} --type scout --name "Discover patterns"`);
    console.log(`  2. Activate: npm run playbook -- activate ${id}`);
    console.log(`  3. Run: npm run playbook -- run ${id}\n`);
  });

// Add a step to a playbook
program
  .command("add-step <playbookId>")
  .description("Add a step to a playbook")
  .requiredOption("-t, --type <type>", "Step type (scout, analyze, brief, verify, plan, notify, wait)")
  .requiredOption("-n, --name <name>", "Step name")
  .option("-d, --description <desc>", "Step description")
  .option("-c, --config <json>", "Step configuration as JSON")
  .option("--continue-on-error", "Continue execution if this step fails")
  .action(async (playbookId, options) => {
    const playbook = await playbookRepo.findById(playbookId);

    if (!playbook) {
      console.error(`❌ Playbook not found: ${playbookId}`);
      process.exit(1);
    }

    const steps = [...((playbook.steps || []) as PlaybookStep[])];
    const config = options.config ? JSON.parse(options.config) : {};

    const newStep: PlaybookStep = {
      name: options.name,
      description: options.description,
      action: { type: options.type, config } as PlaybookStep["action"],
      continueOnError: options.continueOnError || false,
    };

    steps.push(newStep);

    await playbookRepo.update(playbookId, { steps });

    console.log(`\n✅ Added step "${options.name}" to playbook`);
    console.log(`   Total steps: ${steps.length}\n`);
  });

// Activate a playbook
program
  .command("activate <id>")
  .description("Activate a playbook")
  .action(async (id) => {
    const playbook = await playbookRepo.findById(id);

    if (!playbook) {
      console.error(`❌ Playbook not found: ${id}`);
      process.exit(1);
    }

    await playbookRepo.update(id, {
      playbookStatus: "active",
      isEnabled: true,
    });

    console.log(`\n✅ Playbook activated: ${playbook.name}\n`);
  });

// Deactivate a playbook
program
  .command("deactivate <id>")
  .description("Deactivate a playbook")
  .action(async (id) => {
    const playbook = await playbookRepo.findById(id);

    if (!playbook) {
      console.error(`❌ Playbook not found: ${id}`);
      process.exit(1);
    }

    await playbookRepo.update(id, {
      playbookStatus: "deprecated",
      isEnabled: false,
    });

    console.log(`\n✅ Playbook deactivated: ${playbook.name}\n`);
  });

// Show execution history
program
  .command("history [playbookId]")
  .description("Show execution history")
  .option("-l, --limit <n>", "Number of executions to show", "10")
  .action(async (playbookId, options) => {
    const limit = parseInt(options.limit);

    let executions;
    if (playbookId) {
      executions = await executionRepo.findByPlaybook(playbookId, { limit });
    } else {
      executions = await executionRepo.findMany({ limit });
    }

    console.log("\n📜 Execution History\n");
    console.log("─".repeat(80));

    if (executions.data.length === 0) {
      console.log("\nNo executions found.\n");
      return;
    }

    for (const exec of executions.data) {
      const statusIcon = exec.status === "completed" ? "✓" :
                         exec.status === "failed" ? "✗" :
                         exec.status === "running" ? "◐" : "○";
      const duration = exec.completedAt
        ? `${Math.round((new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000)}s`
        : "running";

      console.log(`\n${statusIcon} ${exec.id}`);
      console.log(`  Playbook: ${exec.playbookId}`);
      console.log(`  Status: ${exec.status} | Duration: ${duration}`);
      console.log(`  Triggered by: ${exec.triggeredBy}${exec.triggerRef ? ` (${exec.triggerRef})` : ""}`);
      console.log(`  Steps: ${exec.currentStep}/${exec.totalSteps}`);
      console.log(`  Started: ${new Date(exec.startedAt).toLocaleString()}`);

      if (exec.error) {
        console.log(`  Error: ${exec.error.slice(0, 100)}`);
      }
    }

    console.log("\n");
  });

// Show execution details
program
  .command("execution <id>")
  .description("Show execution details")
  .action(async (id) => {
    const execution = await executionRepo.findById(id);

    if (!execution) {
      console.error(`❌ Execution not found: ${id}`);
      process.exit(1);
    }

    const steps = await stepRepo.findByExecution(id);

    console.log(`\n📜 Execution: ${id}\n`);
    console.log("─".repeat(60));
    console.log(`Playbook: ${execution.playbookId}`);
    console.log(`Status: ${execution.status}`);
    console.log(`Triggered by: ${execution.triggeredBy}`);
    console.log(`Started: ${new Date(execution.startedAt).toLocaleString()}`);
    if (execution.completedAt) {
      console.log(`Completed: ${new Date(execution.completedAt).toLocaleString()}`);
    }

    if (execution.error) {
      console.log(`\nError: ${execution.error}`);
    }

    console.log(`\nSteps (${steps.length}):`);
    for (const step of steps) {
      const statusIcon = step.status === "completed" ? "✓" :
                         step.status === "failed" ? "✗" :
                         step.status === "skipped" ? "○" :
                         step.status === "running" ? "◐" : "·";
      const duration = step.durationMs ? `${step.durationMs}ms` : "";

      console.log(`  ${step.stepIndex + 1}. ${statusIcon} [${step.actionType}] ${step.stepName} ${duration}`);
      if (step.error) {
        console.log(`     Error: ${step.error.slice(0, 80)}`);
      }
      if (step.skipReason) {
        console.log(`     Skipped: ${step.skipReason}`);
      }
    }

    if (execution.logs && Array.isArray(execution.logs) && execution.logs.length > 0) {
      console.log(`\nLogs:`);
      for (const log of execution.logs.slice(-10)) {
        const prefix = log.level === "error" ? "❌" :
                       log.level === "warn" ? "⚠️" : "ℹ️";
        console.log(`  ${prefix} ${log.message}`);
      }
    }

    console.log("\n");
  });

// Predefined templates
const PLAYBOOK_TEMPLATES = {
  "investigation": {
    steps: [
      { name: "Scout for patterns", action: { type: "scout", config: { maxPatterns: 10 } } },
      { name: "Analyze patterns", action: { type: "analyze", config: {} } },
      { name: "Verify claims", action: { type: "verify", config: { maxClaims: 5 } } },
    ] as PlaybookStep[],
    triggers: [{ type: "manual" }] as PlaybookTrigger[],
  },
  "full-pipeline": {
    steps: [
      { name: "Discover patterns", action: { type: "scout", config: { maxPatterns: 20 } } },
      { name: "Synthesize issues", action: { type: "analyze", config: {} } },
      { name: "Generate solutions", action: { type: "plan", config: { maxSolutions: 5 } } },
      { name: "Verify key claims", action: { type: "verify", config: { maxClaims: 3 } } },
    ] as PlaybookStep[],
    triggers: [{ type: "manual" }, { type: "schedule", schedule: "0 6 * * 1" }] as PlaybookTrigger[],
  },
  "verification": {
    steps: [
      { name: "Cross-reference all patterns", action: { type: "verify", config: { maxClaims: 10, maxSources: 5 } } },
      { name: "Notify on completion", action: { type: "notify", config: { channel: "console", message: "Verification complete for {{patternId}}" } } },
    ] as PlaybookStep[],
    triggers: [{ type: "pattern_created", conditions: { minConfidence: 0.7 } }] as PlaybookTrigger[],
  },
};

program.parse();
