import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Create enum types
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE job_type AS ENUM ('scout', 'analyze', 'brief', 'verify', 'plan', 'pipeline');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create scheduled_jobs table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        job_type job_type NOT NULL,
        cron_expression TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_run_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ
      );
    `);

    // Create job_runs table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES scheduled_jobs(id),
        status job_status NOT NULL DEFAULT 'pending',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        output TEXT,
        error TEXT,
        stats JSONB DEFAULT '{}'
      );
    `);

    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs(job_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled)`);

    console.log("✅ Scheduled jobs tables created successfully");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
