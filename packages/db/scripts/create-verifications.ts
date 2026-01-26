import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Create enum types (ignore if already exists)
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE verification_status AS ENUM ('pending', 'corroborated', 'contested', 'partially_supported', 'unverified');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE claim_category AS ENUM ('factual', 'statistical', 'causal', 'predictive', 'definitional');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create verifications table
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        claim_statement TEXT NOT NULL,
        claim_category claim_category NOT NULL,
        original_confidence REAL NOT NULL,
        status verification_status NOT NULL,
        adjusted_confidence REAL NOT NULL,
        verification_notes TEXT,
        corroborating_sources_count INTEGER NOT NULL DEFAULT 0,
        conflicting_sources_count INTEGER NOT NULL DEFAULT 0,
        source_assessments JSONB NOT NULL DEFAULT '[]'::jsonb,
        conflicts JSONB NOT NULL DEFAULT '[]'::jsonb
      );
    `);

    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_verifications_source ON verifications(source_type, source_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status)`);

    console.log("✅ Verifications table created successfully");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
