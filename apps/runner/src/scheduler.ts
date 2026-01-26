#!/usr/bin/env node
/**
 * Orbit Scheduler
 *
 * Runs scheduled jobs for monitoring sources, analyzing patterns,
 * generating briefs, and verifying claims.
 */

import cron from "node-cron";
import { spawn } from "child_process";
import { program } from "commander";
import { getDatabase, ScheduledJobRepository, JobRunRepository } from "@orbit/db";

import { runSourceHealthJob } from "./jobs/source-health.js";
import { runFeedbackProcessor } from "./jobs/feedback-processor.js";
import { runSystemEvaluation } from "./jobs/evaluate-system.js";

type JobType = "scout" | "analyze" | "brief" | "verify" | "plan" | "pipeline" | "source_health" | "feedback" | "evaluate";

interface JobConfig {
  sources?: string[];
  patternIds?: string[];
  issueIds?: string[];
  maxItems?: number;
  dryRun?: boolean;
}

const JOB_COMMANDS: Record<JobType, { command: string; buildArgs: (config: JobConfig) => string[] }> = {
  scout: {
    command: "src/commands/scout.ts",
    buildArgs: (config) => {
      const args = ["--recommended"];
      if (config.maxItems) args.push("--max", config.maxItems.toString());
      return args;
    },
  },
  analyze: {
    command: "src/commands/analyze.ts",
    buildArgs: (config) => {
      const args: string[] = [];
      if (config.maxItems) args.push("--max-patterns", config.maxItems.toString());
      return args;
    },
  },
  brief: {
    command: "src/commands/brief.ts",
    buildArgs: (config) => {
      const args: string[] = [];
      if (config.issueIds?.length) {
        args.push("--issue", config.issueIds[0]);
      }
      return args;
    },
  },
  verify: {
    command: "src/commands/verify.ts",
    buildArgs: (config) => {
      const args: string[] = [];
      if (config.patternIds?.length) {
        args.push("--pattern", config.patternIds[0]);
      } else {
        args.push("--all-patterns");
      }
      if (config.maxItems) args.push("--max-claims", config.maxItems.toString());
      return args;
    },
  },
  plan: {
    command: "src/commands/plan.ts",
    buildArgs: (config) => {
      const args = ["--all"];
      if (config.maxItems) args.push("--max-solutions", config.maxItems.toString());
      return args;
    },
  },
  pipeline: {
    command: "", // Special case: runs multiple commands
    buildArgs: () => [],
  },
  source_health: {
    command: "", // Special case: runs inline
    buildArgs: () => [],
  },
  feedback: {
    command: "", // Special case: runs inline
    buildArgs: () => [],
  },
  evaluate: {
    command: "", // Special case: runs inline
    buildArgs: () => [],
  },
};

// Calculate next run time from cron expression
function getNextRunTime(cronExpression: string): Date {
  const interval = cron.schedule(cronExpression, () => {}, { scheduled: false });
  // node-cron doesn't expose next run time directly, so we'll estimate
  const now = new Date();
  // Simple heuristic: add 1 hour as default (will be overwritten on actual run)
  return new Date(now.getTime() + 60 * 60 * 1000);
}

async function runJob(
  jobType: JobType,
  config: JobConfig,
  runId: string,
  runRepo: JobRunRepository
): Promise<{ success: boolean; output: string; stats: Record<string, number> }> {
  return new Promise((resolve) => {
    const jobDef = JOB_COMMANDS[jobType];
    let output = "";
    const stats: Record<string, number> = {};

    if (jobType === "pipeline") {
      // Run pipeline: scout -> analyze -> plan
      runPipeline(config, runId, runRepo).then(resolve);
      return;
    }

    if (jobType === "source_health") {
      // Run source health job inline
      runSourceHealthJobInline().then(resolve);
      return;
    }

    if (jobType === "feedback") {
      // Run feedback processor job inline
      runFeedbackJobInline().then(resolve);
      return;
    }

    if (jobType === "evaluate") {
      // Run system evaluation job inline
      runEvaluateJobInline().then(resolve);
      return;
    }

    const args = ["tsx", jobDef.command, ...jobDef.buildArgs(config)];

    console.log(`[${new Date().toISOString()}] Running: npx ${args.join(" ")}`);

    const child = spawn("npx", args, {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
    });

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);

      // Parse stats from output
      const patternsMatch = text.match(/(\d+) patterns? (?:created|discovered)/i);
      if (patternsMatch) stats.patternsCreated = parseInt(patternsMatch[1]);

      const issuesMatch = text.match(/(\d+) issues? created/i);
      if (issuesMatch) stats.issuesCreated = parseInt(issuesMatch[1]);

      const solutionsMatch = text.match(/(\d+) solutions? (?:created|generated)/i);
      if (solutionsMatch) stats.solutionsCreated = parseInt(solutionsMatch[1]);

      const verificationsMatch = text.match(/(\d+) (?:claims? verified|verifications?)/i);
      if (verificationsMatch) stats.verificationsCreated = parseInt(verificationsMatch[1]);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: output.slice(-10000), // Keep last 10KB
        stats,
      });
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        output: `Error: ${err.message}`,
        stats,
      });
    });
  });
}

async function runFeedbackJobInline(): Promise<{ success: boolean; output: string; stats: Record<string, number> }> {
  try {
    const db = getDatabase();
    const result = await runFeedbackProcessor(db);

    const output = [
      "=== Feedback Processor Job ===",
      "",
      `Events processed: ${result.eventsProcessed}`,
      `Adjustments made: ${result.adjustmentsMade}`,
      `Learnings updated: ${result.learningsUpdated}`,
      `Errors: ${result.errors}`,
    ].join("\n");

    return {
      success: result.errors === 0,
      output,
      stats: {
        eventsProcessed: result.eventsProcessed,
        adjustmentsMade: result.adjustmentsMade,
        learningsUpdated: result.learningsUpdated,
      },
    };
  } catch (error) {
    return {
      success: false,
      output: `Error: ${error instanceof Error ? error.message : String(error)}`,
      stats: {},
    };
  }
}

function formatChange(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

async function runEvaluateJobInline(): Promise<{ success: boolean; output: string; stats: Record<string, number> }> {
  try {
    const db = getDatabase();
    const result = await runSystemEvaluation(db);

    const criticalAlerts = result.alerts.filter(a => a.type === "critical").length;
    const warnings = result.alerts.filter(a => a.type === "warning").length;

    const trendIcon = (trend: "improving" | "stable" | "declining") =>
      trend === "improving" ? "📈" : trend === "declining" ? "📉" : "➡️";

    const output = [
      "=== System Evaluation Job ===",
      "",
      `Evaluation ID: ${result.evaluationId}`,
      "",
      "Metrics:",
      `  Patterns: ${result.metrics.patterns.totalPatterns} (avg confidence: ${(result.metrics.patterns.avgConfidence * 100).toFixed(1)}%) ${trendIcon(result.trends.patterns.trend)}`,
      `  Sources: ${result.metrics.sources.healthySources}/${result.metrics.sources.totalSources} healthy ${trendIcon(result.trends.sources.trend)}`,
      `  Solutions: ${result.metrics.solutions.totalSolutions} (avg effectiveness: ${(result.metrics.solutions.avgEffectiveness * 100).toFixed(1)}%) ${trendIcon(result.trends.solutions.trend)}`,
      `  Feedback: ${result.metrics.feedbackLoop.pendingEvents} pending, ${result.metrics.feedbackLoop.processedLast24h} processed (24h) ${trendIcon(result.trends.feedbackLoop.trend)}`,
      "",
      result.trends.hasPreviousData
        ? `Trends (compared to ${result.trends.comparedTo}):`
        : "Trends: (first evaluation - no comparison available)",
      ...(result.trends.hasPreviousData ? [
        `  Patterns: ${formatChange(result.trends.patterns.confidenceChange * 100)}% confidence`,
        `  Sources: ${formatChange(result.trends.sources.healthChange * 100)}% health`,
        `  Solutions: ${formatChange(result.trends.solutions.effectivenessChange * 100)}% effectiveness`,
        `  Feedback: ${result.trends.feedbackLoop.throughputChange >= 0 ? "+" : ""}${result.trends.feedbackLoop.throughputChange} throughput`,
      ] : []),
      "",
      `Alerts: ${criticalAlerts} critical, ${warnings} warnings`,
      "",
      "Recommendations:",
      ...result.recommendations.map(r => `  - [${r.priority}] ${r.recommendation}`),
    ].join("\n");

    return {
      success: criticalAlerts === 0,
      output,
      stats: {
        totalPatterns: result.metrics.patterns.totalPatterns,
        totalSources: result.metrics.sources.totalSources,
        criticalAlerts,
        warnings,
      },
    };
  } catch (error) {
    return {
      success: false,
      output: `Error: ${error instanceof Error ? error.message : String(error)}`,
      stats: {},
    };
  }
}

async function runSourceHealthJobInline(): Promise<{ success: boolean; output: string; stats: Record<string, number> }> {
  try {
    const db = getDatabase();
    const result = await runSourceHealthJob(db);

    const output = [
      "=== Source Health Job ===",
      "",
      `Domains processed: ${result.domainsProcessed}`,
      `Health status: ${result.healthySources} healthy, ${result.degradedSources} degraded, ${result.unhealthySources} unhealthy`,
      `Alerts: ${result.alertsGenerated} generated, ${result.alertsCleared} cleared`,
    ].join("\n");

    return {
      success: true,
      output,
      stats: {
        domainsProcessed: result.domainsProcessed,
        alertsGenerated: result.alertsGenerated,
      },
    };
  } catch (error) {
    return {
      success: false,
      output: `Error: ${error instanceof Error ? error.message : String(error)}`,
      stats: {},
    };
  }
}

async function runPipeline(
  config: JobConfig,
  runId: string,
  runRepo: JobRunRepository
): Promise<{ success: boolean; output: string; stats: Record<string, number> }> {
  let output = "=== Running Pipeline ===\n\n";
  const combinedStats: Record<string, number> = {};

  const steps: JobType[] = ["scout", "analyze", "plan"];

  for (const step of steps) {
    output += `\n--- ${step.toUpperCase()} ---\n`;
    console.log(`\n--- Running ${step} ---`);

    const result = await runJob(step, config, runId, runRepo);
    output += result.output;
    Object.assign(combinedStats, result.stats);

    if (!result.success) {
      output += `\n\n❌ Pipeline failed at ${step} step`;
      return { success: false, output, stats: combinedStats };
    }
  }

  output += "\n\n✅ Pipeline completed successfully";
  return { success: true, output, stats: combinedStats };
}

async function startScheduler(options: { runNow?: boolean }) {
  console.log("🕐 Orbit Scheduler Starting...\n");

  const db = getDatabase();
  const jobRepo = new ScheduledJobRepository(db);
  const runRepo = new JobRunRepository(db);

  // Load enabled jobs
  const jobs = await jobRepo.findEnabled();

  if (jobs.length === 0) {
    console.log("No scheduled jobs found. Creating default jobs...\n");
    await createDefaultJobs(jobRepo);
    jobs.push(...(await jobRepo.findEnabled()));
  }

  console.log(`Found ${jobs.length} scheduled jobs:\n`);

  for (const job of jobs) {
    console.log(`  📋 ${job.name}`);
    console.log(`     Type: ${job.jobType}`);
    console.log(`     Schedule: ${job.cronExpression}`);
    console.log(`     Enabled: ${job.enabled}`);
    console.log();

    if (!cron.validate(job.cronExpression)) {
      console.error(`     ⚠️ Invalid cron expression, skipping`);
      continue;
    }

    // Schedule the job
    cron.schedule(job.cronExpression, async () => {
      await executeJob(job.id, job.name, job.jobType as JobType, job.config as JobConfig || {}, jobRepo, runRepo);
    });

    // Update next run time
    const nextRun = getNextRunTime(job.cronExpression);
    await jobRepo.updateNextRun(job.id, nextRun);
  }

  console.log("Scheduler running. Press Ctrl+C to stop.\n");

  // Run immediately if requested
  if (options.runNow && jobs.length > 0) {
    console.log("Running all jobs now...\n");
    for (const job of jobs) {
      await executeJob(job.id, job.name, job.jobType as JobType, job.config as JobConfig || {}, jobRepo, runRepo);
    }
  }

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\nScheduler stopped.");
    process.exit(0);
  });
}

async function executeJob(
  jobId: string,
  jobName: string,
  jobType: JobType,
  config: JobConfig,
  jobRepo: ScheduledJobRepository,
  runRepo: JobRunRepository
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${new Date().toISOString()}] Starting: ${jobName}`);
  console.log(`${"=".repeat(60)}\n`);

  // Create run record
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await runRepo.create({
    id: runId,
    jobId,
    status: "running",
    startedAt: new Date(),
  });

  try {
    const result = await runJob(jobType, config, runId, runRepo);

    if (result.success) {
      await runRepo.markCompleted(runId, result.output, result.stats);
      console.log(`\n✅ ${jobName} completed successfully`);
    } else {
      await runRepo.markFailed(runId, result.output);
      console.log(`\n❌ ${jobName} failed`);
    }

    // Update job's last run time
    await jobRepo.updateLastRun(jobId, new Date());

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await runRepo.markFailed(runId, errorMsg);
    console.error(`\n❌ ${jobName} error:`, errorMsg);
  }
}

async function createDefaultJobs(jobRepo: ScheduledJobRepository) {
  const defaultJobs = [
    {
      id: "job_scout_daily",
      name: "Daily Scout",
      jobType: "scout" as const,
      cronExpression: "0 6 * * *", // 6 AM daily
      config: { maxItems: 10 },
    },
    {
      id: "job_analyze_daily",
      name: "Daily Analysis",
      jobType: "analyze" as const,
      cronExpression: "0 7 * * *", // 7 AM daily
      config: {},
    },
    {
      id: "job_verify_weekly",
      name: "Weekly Verification",
      jobType: "verify" as const,
      cronExpression: "0 8 * * 1", // 8 AM every Monday
      config: { maxItems: 5 },
    },
    {
      id: "job_pipeline_weekly",
      name: "Weekly Full Pipeline",
      jobType: "pipeline" as const,
      cronExpression: "0 5 * * 0", // 5 AM every Sunday
      config: {},
    },
    {
      id: "job_feedback_hourly",
      name: "Hourly Feedback Processing",
      jobType: "feedback" as const,
      cronExpression: "0 * * * *", // Every hour
      config: {},
    },
    {
      id: "job_source_health_daily",
      name: "Daily Source Health Check",
      jobType: "source_health" as const,
      cronExpression: "0 4 * * *", // 4 AM daily
      config: {},
    },
    {
      id: "job_evaluate_daily",
      name: "Daily System Evaluation",
      jobType: "evaluate" as const,
      cronExpression: "0 23 * * *", // 11 PM daily
      config: {},
    },
  ];

  for (const job of defaultJobs) {
    try {
      await jobRepo.create({
        ...job,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`  Created: ${job.name}`);
    } catch (e) {
      // Job might already exist
    }
  }
}

async function listJobs() {
  const db = getDatabase();
  const jobRepo = new ScheduledJobRepository(db);
  const runRepo = new JobRunRepository(db);

  const jobs = await jobRepo.findMany({ limit: 50 });

  console.log("\n📋 Scheduled Jobs\n");
  console.log("─".repeat(80));

  for (const job of jobs.data) {
    const runs = await runRepo.findByJob(job.id, { limit: 1 });
    const lastRun = runs.data[0];

    console.log(`\n${job.enabled ? "✓" : "○"} ${job.name} (${job.id})`);
    console.log(`  Type: ${job.jobType}`);
    console.log(`  Schedule: ${job.cronExpression}`);
    if (lastRun) {
      console.log(`  Last run: ${new Date(lastRun.startedAt).toLocaleString()} - ${lastRun.status}`);
    }
    if (job.nextRunAt) {
      console.log(`  Next run: ${new Date(job.nextRunAt).toLocaleString()}`);
    }
  }

  console.log("\n");
}

async function runJobNow(jobId: string) {
  const db = getDatabase();
  const jobRepo = new ScheduledJobRepository(db);
  const runRepo = new JobRunRepository(db);

  const job = await jobRepo.findById(jobId);
  if (!job) {
    console.error(`Job not found: ${jobId}`);
    process.exit(1);
  }

  await executeJob(job.id, job.name, job.jobType as JobType, job.config as JobConfig || {}, jobRepo, runRepo);
}

async function addJob(options: {
  name: string;
  type: JobType;
  cron: string;
  config?: string;
}) {
  const db = getDatabase();
  const jobRepo = new ScheduledJobRepository(db);

  if (!cron.validate(options.cron)) {
    console.error(`Invalid cron expression: ${options.cron}`);
    process.exit(1);
  }

  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const config = options.config ? JSON.parse(options.config) : {};

  await jobRepo.create({
    id,
    name: options.name,
    jobType: options.type,
    cronExpression: options.cron,
    config,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`✅ Created job: ${options.name} (${id})`);
}

// CLI
program
  .name("scheduler")
  .description("Orbit job scheduler");

program
  .command("start")
  .description("Start the scheduler daemon")
  .option("--run-now", "Run all jobs immediately on start")
  .action(startScheduler);

program
  .command("list")
  .description("List all scheduled jobs")
  .action(listJobs);

program
  .command("run <jobId>")
  .description("Run a specific job immediately")
  .action(runJobNow);

program
  .command("add")
  .description("Add a new scheduled job")
  .requiredOption("-n, --name <name>", "Job name")
  .requiredOption("-t, --type <type>", "Job type (scout, analyze, brief, verify, plan, pipeline)")
  .requiredOption("-c, --cron <expression>", "Cron expression")
  .option("--config <json>", "Job config as JSON string")
  .action(addJob);

program
  .command("enable <jobId>")
  .description("Enable a job")
  .action(async (jobId) => {
    const db = getDatabase();
    const repo = new ScheduledJobRepository(db);
    await repo.setEnabled(jobId, true);
    console.log(`✅ Job ${jobId} enabled`);
  });

program
  .command("disable <jobId>")
  .description("Disable a job")
  .action(async (jobId) => {
    const db = getDatabase();
    const repo = new ScheduledJobRepository(db);
    await repo.setEnabled(jobId, false);
    console.log(`✅ Job ${jobId} disabled`);
  });

program.parse();
