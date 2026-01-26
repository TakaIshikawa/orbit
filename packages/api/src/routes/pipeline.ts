import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { spawn } from "child_process";
import { getDatabase, RunLogRepository } from "@orbit/db";
import { generateId, computeContentHash } from "@orbit/core";

export const pipelineRoutes = new Hono();

// Track running processes
const runningProcesses = new Map<string, { process: ReturnType<typeof spawn>; output: string[] }>();

// Schema for scout command
const scoutInputSchema = z.object({
  query: z.string().optional(),
  domains: z.array(z.string()).optional(),
  url: z.string().optional(),
  recommended: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
});

// Schema for verify command
const verifyInputSchema = z.object({
  patternIds: z.array(z.string()).optional(),
  limit: z.number().optional().default(5),
  dryRun: z.boolean().optional().default(false),
});

// Start scout command
pipelineRoutes.post("/scout", zValidator("json", scoutInputSchema), async (c) => {
  try {
    const input = c.req.valid("json");
    const db = getDatabase();
    const runRepo = new RunLogRepository(db);

  // Create run log
  const runId = generateId("run");
  const now = new Date();

  const payload = { type: "RunLog" as const, agentId: "scout", triggeredBy: "api" };
  const contentHash = await computeContentHash(payload);

  await runRepo.create({
    id: runId,
    contentHash,
    parentHash: null,
    author: "api:pipeline",
    authorSignature: `sig:api_${Date.now()}`,
    createdAt: now,
    version: 1,
    status: "active",
    decisionId: `pipeline_scout_${runId}`,
    agentId: "scout",
    triggeredBy: "api",
    startedAt: now,
    completedAt: null,
    llmCalls: [],
    decisions: [],
    toolCalls: [],
    runStatus: "running",
    error: null,
    artifacts: [],
    stateChanges: [],
  });

  // Build command args - run tsx directly for better arg handling
  const args = ["apps/runner/src/commands/scout.ts"];
  if (input.query) args.push("-q", input.query);
  if (input.domains?.length) args.push("-d", input.domains.join(","));
  if (input.url) args.push("-u", input.url);
  if (input.recommended) args.push("--recommended");
  if (input.dryRun) args.push("--dry-run");

  // Spawn process - use npx tsx directly
  const cwd = process.cwd().replace("/packages/api", "");

  // Ensure required environment variables are passed
  const spawnEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };

  // Check if API key is available
  if (!spawnEnv.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY not set in environment for scout command");
  }

  const proc = spawn("npx", ["tsx", ...args], {
    cwd,
    env: spawnEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output: string[] = [];
  runningProcesses.set(runId, { process: proc, output });

  proc.stdout?.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    output.push(...lines);
  });

  proc.stderr?.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    output.push(...lines.map((l: string) => `[stderr] ${l}`));
  });

  proc.on("close", async (code) => {
    const completedAt = new Date();
    const runStatus = code === 0 ? "success" : "failed";

    await runRepo.update(runId, {
      completedAt,
      runStatus,
      error: code !== 0 ? `Process exited with code ${code}` : null,
      artifacts: [{ type: "output", content: output.join("\n") }],
    });

    runningProcesses.delete(runId);
  });

    return c.json({
      data: {
        runId,
        command: "scout",
        status: "started",
        message: "Scout command started. Check runs for progress.",
      },
    }, 202);
  } catch (error) {
    console.error("Error starting scout:", error);
    return c.json({
      error: {
        code: "SCOUT_ERROR",
        message: error instanceof Error ? error.message : "Failed to start scout",
      },
    }, 500);
  }
});

// Start verify command
pipelineRoutes.post("/verify", zValidator("json", verifyInputSchema), async (c) => {
  try {
    const input = c.req.valid("json");
    const db = getDatabase();
    const runRepo = new RunLogRepository(db);

  // Create run log
  const runId = generateId("run");
  const now = new Date();

  const payload = { type: "RunLog" as const, agentId: "verify", triggeredBy: "api" };
  const contentHash = await computeContentHash(payload);

  await runRepo.create({
    id: runId,
    contentHash,
    parentHash: null,
    author: "api:pipeline",
    authorSignature: `sig:api_${Date.now()}`,
    createdAt: now,
    version: 1,
    status: "active",
    decisionId: `pipeline_verify_${runId}`,
    agentId: "verify",
    triggeredBy: "api",
    startedAt: now,
    completedAt: null,
    llmCalls: [],
    decisions: [],
    toolCalls: [],
    runStatus: "running",
    error: null,
    artifacts: [],
    stateChanges: [],
  });

  // Build command args - run tsx directly for better arg handling
  const args = ["apps/runner/src/commands/verify.ts"];
  if (input.patternIds?.length) args.push("--patterns", input.patternIds.join(","));
  if (input.limit) args.push("--limit", input.limit.toString());
  if (input.dryRun) args.push("--dry-run");

  // Spawn process - use npx tsx directly
  const cwd = process.cwd().replace("/packages/api", "");

  // Ensure required environment variables are passed
  const spawnEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };

  // Check if API key is available
  if (!spawnEnv.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY not set in environment for verify command");
  }

  const proc = spawn("npx", ["tsx", ...args], {
    cwd,
    env: spawnEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output: string[] = [];
  runningProcesses.set(runId, { process: proc, output });

  proc.stdout?.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    output.push(...lines);
  });

  proc.stderr?.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    output.push(...lines.map((l: string) => `[stderr] ${l}`));
  });

  proc.on("close", async (code) => {
    const completedAt = new Date();
    const runStatus = code === 0 ? "success" : "failed";

    await runRepo.update(runId, {
      completedAt,
      runStatus,
      error: code !== 0 ? `Process exited with code ${code}` : null,
      artifacts: [{ type: "output", content: output.join("\n") }],
    });

    runningProcesses.delete(runId);
  });

    return c.json({
      data: {
        runId,
        command: "verify",
        status: "started",
        message: "Verify command started. Check runs for progress.",
      },
    }, 202);
  } catch (error) {
    console.error("Error starting verify:", error);
    return c.json({
      error: {
        code: "VERIFY_ERROR",
        message: error instanceof Error ? error.message : "Failed to start verify",
      },
    }, 500);
  }
});

// Get live output for a running command
pipelineRoutes.get("/runs/:runId/output", async (c) => {
  const runId = c.req.param("runId");

  const running = runningProcesses.get(runId);
  if (running) {
    return c.json({
      data: {
        runId,
        status: "running",
        output: running.output,
        lineCount: running.output.length,
      },
    });
  }

  // Check if completed
  const db = getDatabase();
  const runRepo = new RunLogRepository(db);
  const run = await runRepo.findById(runId);

  if (!run) {
    return c.json({ error: { code: "NOT_FOUND", message: "Run not found" } }, 404);
  }

  const outputArtifact = run.artifacts?.find((a: { type: string }) => a.type === "output");

  return c.json({
    data: {
      runId,
      status: run.runStatus,
      output: outputArtifact?.content?.split("\n") ?? [],
      lineCount: outputArtifact?.content?.split("\n").length ?? 0,
    },
  });
});

// Stop a running command
pipelineRoutes.post("/runs/:runId/stop", async (c) => {
  const runId = c.req.param("runId");

  const running = runningProcesses.get(runId);
  if (!running) {
    return c.json({ error: { code: "NOT_FOUND", message: "No running process found" } }, 404);
  }

  running.process.kill("SIGTERM");

  return c.json({
    data: {
      runId,
      status: "stopping",
      message: "Stop signal sent",
    },
  });
});

// List available pipeline commands
pipelineRoutes.get("/commands", async (c) => {
  return c.json({
    data: [
      {
        id: "scout",
        name: "Scout",
        description: "Discover patterns from sources",
        options: [
          { name: "query", type: "string", description: "Search query to focus on" },
          { name: "domains", type: "string[]", description: "Domains to focus on" },
          { name: "url", type: "string", description: "Single URL to analyze" },
          { name: "recommended", type: "boolean", description: "Use recommended sources", default: true },
          { name: "dryRun", type: "boolean", description: "Don't save to database", default: false },
        ],
      },
      {
        id: "verify",
        name: "Verify",
        description: "Verify pattern claims against external sources",
        options: [
          { name: "patternIds", type: "string[]", description: "Specific patterns to verify" },
          { name: "limit", type: "number", description: "Max patterns to verify", default: 5 },
          { name: "dryRun", type: "boolean", description: "Don't save to database", default: false },
        ],
      },
    ],
  });
});
