import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath });

import { getDatabase } from "./client.js";
import { sql } from "drizzle-orm";

async function reset() {
  console.log("Resetting database...\n");

  const db = getDatabase();

  // Get all table names from the public schema
  const tables = [
    "feedback_events",
    "confidence_adjustments",
    "system_learnings",
    "evaluation_runs",
    "solution_outcomes",
    "source_fetch_logs",
    "source_health",
    "playbook_step_executions",
    "playbook_executions",
    "computer_use_sessions",
    "job_runs",
    "scheduled_jobs",
    "verifications",
    "artifacts",
    "decisions",
    "solutions",
    "situation_models",
    "problem_briefs",
    "issues",
    "patterns",
    "run_logs",
    "playbooks",
    "agents",
  ];

  console.log("Truncating tables...");

  for (const table of tables) {
    try {
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
      console.log(`  Truncated: ${table}`);
    } catch (error) {
      // Table might not exist, skip silently
      console.log(`  Skipped (not found): ${table}`);
    }
  }

  console.log("\nDatabase reset complete!");
}

reset()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exit(1);
  });
