import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { patternsRoutes } from "./routes/patterns.js";
import { issuesRoutes } from "./routes/issues.js";
import { problemBriefsRoutes } from "./routes/problem-briefs.js";
import { situationModelsRoutes } from "./routes/situation-models.js";
import { solutionsRoutes } from "./routes/solutions.js";
import { decisionsRoutes } from "./routes/decisions.js";
import { artifactsRoutes } from "./routes/artifacts.js";
import { runsRoutes } from "./routes/runs.js";
import { playbooksRoutes } from "./routes/playbooks.js";
import { agentsRoutes } from "./routes/agents.js";
import { healthRoutes } from "./routes/health.js";
import { verificationsRoutes } from "./routes/verifications.js";
import { schedulerRoutes } from "./routes/scheduler.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { sourcesRoutes } from "./routes/sources.js";
import { pipelineRoutes } from "./routes/pipeline.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { setupWebSocket } from "./events/index.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Routes
app.route("/health", healthRoutes);
app.route("/patterns", patternsRoutes);
app.route("/issues", issuesRoutes);
app.route("/briefs", problemBriefsRoutes);
app.route("/situations", situationModelsRoutes);
app.route("/solutions", solutionsRoutes);
app.route("/decisions", decisionsRoutes);
app.route("/artifacts", artifactsRoutes);
app.route("/runs", runsRoutes);
app.route("/playbooks", playbooksRoutes);
app.route("/agents", agentsRoutes);
app.route("/verifications", verificationsRoutes);
app.route("/scheduler", schedulerRoutes);
app.route("/feedback", feedbackRoutes);
app.route("/sources", sourcesRoutes);
app.route("/pipeline", pipelineRoutes);
app.route("/dashboard", dashboardRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
      },
    },
    500
  );
});

const port = Number(process.env.PORT) || 3000;

console.log(`Starting Orbit API on port ${port}...`);
console.log(`Environment: DATABASE_URL=${process.env.DATABASE_URL ? "set" : "NOT SET"}, ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Set up WebSocket server on the same HTTP server
// @hono/node-server returns a Node.js http.Server instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setupWebSocket(server as any).catch(console.error);

export { app };
