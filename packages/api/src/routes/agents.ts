import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eventBus } from "../events/index.js";

export const agentsRoutes = new Hono();

// In-memory agent registry for v1
// In production, this would be stored in the database
interface RegisteredAgent {
  id: string;
  name: string;
  agentType: string;
  description: string;
  status: "active" | "stopped" | "error";
  config: Record<string, unknown>;
  createdAt: string;
  lastInvokedAt: string | null;
  invocationCount: number;
}

const agents = new Map<string, RegisteredAgent>();

// Seed with available agent types
const availableAgentTypes = [
  { type: "scout", name: "Scout", description: "Discovers patterns from sources" },
  { type: "triage", name: "Triage", description: "Scores issues using IUTLN framework" },
  { type: "analyst", name: "Analyst", description: "Builds situation models and problem briefs" },
  { type: "planner", name: "Planner", description: "Designs solutions for issues" },
  { type: "operator", name: "Operator", description: "Executes solutions and produces artifacts" },
];

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  agentType: z.string().optional(),
  status: z.string().optional(),
});

agentsRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { limit, offset, agentType, status } = c.req.valid("query");

  let data = Array.from(agents.values());

  if (agentType) {
    data = data.filter((a) => a.agentType === agentType);
  }
  if (status) {
    data = data.filter((a) => a.status === status);
  }

  const total = data.length;
  data = data.slice(offset, offset + limit);

  return c.json({
    data,
    meta: { total, limit, offset },
  });
});

// List available agent types
agentsRoutes.get("/types", async (c) => {
  return c.json({ data: availableAgentTypes });
});

agentsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const agent = agents.get(id);

  if (!agent) {
    return c.json({ error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  return c.json({ data: agent });
});

const registerAgentSchema = z.object({
  name: z.string().min(1).max(100),
  agentType: z.enum(["scout", "triage", "analyst", "planner", "operator"]),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

agentsRoutes.post("/", zValidator("json", registerAgentSchema), async (c) => {
  const input = c.req.valid("json");

  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const typeInfo = availableAgentTypes.find((t) => t.type === input.agentType);

  const agent: RegisteredAgent = {
    id,
    name: input.name,
    agentType: input.agentType,
    description: input.description || typeInfo?.description || "",
    status: "active",
    config: input.config || {},
    createdAt: now,
    lastInvokedAt: null,
    invocationCount: 0,
  };

  agents.set(id, agent);

  return c.json({ data: agent }, 201);
});

const invokeAgentSchema = z.object({
  input: z.record(z.unknown()),
  async: z.boolean().optional().default(false),
});

agentsRoutes.post("/:id/invoke", zValidator("json", invokeAgentSchema), async (c) => {
  const id = c.req.param("id");
  const { input, async: isAsync } = c.req.valid("json");

  const agent = agents.get(id);

  if (!agent) {
    return c.json({ error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  if (agent.status !== "active") {
    return c.json({ error: { code: "BAD_REQUEST", message: "Agent is not active" } }, 400);
  }

  // Update agent stats
  agent.lastInvokedAt = new Date().toISOString();
  agent.invocationCount++;

  // Create a run ID for this invocation
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  eventBus.publish("run.started", {
    runId,
    agentId: id,
    agentType: agent.agentType,
    input,
  });

  if (isAsync) {
    // Return immediately for async invocations
    return c.json({
      data: {
        runId,
        status: "started",
        message: "Agent invocation started. Use /runs/:id to track progress.",
      },
    }, 202);
  }

  // For sync invocations, we would run the agent here
  // For now, return a placeholder indicating sync execution is not yet implemented
  return c.json({
    data: {
      runId,
      status: "pending",
      message: "Synchronous agent execution not yet implemented. Use async: true.",
    },
  });
});

agentsRoutes.post("/:id/stop", async (c) => {
  const id = c.req.param("id");

  const agent = agents.get(id);

  if (!agent) {
    return c.json({ error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  agent.status = "stopped";

  return c.json({ data: agent });
});

agentsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  if (!agents.has(id)) {
    return c.json({ error: { code: "NOT_FOUND", message: "Agent not found" } }, 404);
  }

  agents.delete(id);

  return c.json({ data: { deleted: true } });
});
