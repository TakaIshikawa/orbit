import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Create enum types
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE execution_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE step_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create playbook_executions table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS playbook_executions (
        id TEXT PRIMARY KEY,
        playbook_id TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        trigger_ref TEXT,
        status execution_status NOT NULL DEFAULT 'pending',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        context JSONB NOT NULL DEFAULT '{}',
        current_step INTEGER NOT NULL DEFAULT 0,
        total_steps INTEGER NOT NULL DEFAULT 0,
        output JSONB DEFAULT '{}',
        error TEXT,
        logs JSONB DEFAULT '[]'
      );
    `);

    // Create playbook_step_executions table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS playbook_step_executions (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES playbook_executions(id),
        step_index INTEGER NOT NULL,
        step_name TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status step_status NOT NULL DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        config JSONB DEFAULT '{}',
        output JSONB DEFAULT '{}',
        error TEXT,
        condition_result BOOLEAN,
        skip_reason TEXT
      );
    `);

    // Add columns to playbooks table if they don't exist
    await sql.unsafe(`
      ALTER TABLE playbooks
      ADD COLUMN IF NOT EXISTS triggers JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT false;
    `);

    // Create indexes
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_playbook_executions_playbook_id ON playbook_executions(playbook_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_playbook_executions_status ON playbook_executions(status)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_playbook_step_executions_execution_id ON playbook_step_executions(execution_id)`);

    console.log("✅ Playbook execution tables created successfully");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
