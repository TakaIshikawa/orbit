import { getDatabase } from "@orbit/db";
import { sql } from "drizzle-orm";

async function main() {
  const execId = process.argv[2] || "exec_mlgoace0_3uoa";

  const db = getDatabase();
  const result = await db.execute(sql`
    UPDATE playbook_executions
    SET status = 'failed', error = 'Cancelled by user', completed_at = NOW()
    WHERE id = ${execId} AND status = 'running'
    RETURNING id, status
  `);

  console.log("Cancelled execution:", result);
  process.exit(0);
}

main().catch(console.error);
