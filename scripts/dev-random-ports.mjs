#!/usr/bin/env node
/**
 * Development server startup script with random ports
 * Avoids port conflicts with other local applications
 */

import { spawn } from "child_process";
import { createServer } from "net";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Find an available port
async function findAvailablePort(startPort = 10000, endPort = 60000) {
  const port = Math.floor(Math.random() * (endPort - startPort)) + startPort;

  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, () => {
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Port in use, try another
      resolve(findAvailablePort(startPort, endPort));
    });
  });
}

async function main() {
  console.log("🔍 Finding available ports...\n");

  const apiPort = await findAvailablePort();
  let dashboardPort = await findAvailablePort();

  // Ensure ports are different
  while (dashboardPort === apiPort) {
    dashboardPort = await findAvailablePort();
  }

  console.log("📡 Starting services with random ports:");
  console.log(`   API:       http://localhost:${apiPort}`);
  console.log(`   Dashboard: http://localhost:${dashboardPort}`);
  console.log("");

  // Base environment with API connection info
  const baseEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
    NEXT_PUBLIC_WS_URL: `ws://localhost:${apiPort}/ws`,
  };

  // Start API server
  const api = spawn("npx", ["tsx", "watch", "src/index.ts"], {
    cwd: join(rootDir, "packages/api"),
    env: { ...baseEnv, PORT: String(apiPort) },
    stdio: "inherit",
    shell: true,
  });

  // Start Dashboard
  const dashboard = spawn("npx", ["next", "dev", "--port", String(dashboardPort)], {
    cwd: join(rootDir, "apps/dashboard"),
    env: baseEnv,
    stdio: "inherit",
    shell: true,
  });

  const cleanup = () => {
    console.log("\n\n👋 Shutting down...");
    api.kill("SIGTERM");
    dashboard.kill("SIGTERM");
    process.exit(0);
  };

  api.on("error", (err) => {
    console.error("API failed to start:", err);
    cleanup();
  });

  dashboard.on("error", (err) => {
    console.error("Dashboard failed to start:", err);
    cleanup();
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch(console.error);
