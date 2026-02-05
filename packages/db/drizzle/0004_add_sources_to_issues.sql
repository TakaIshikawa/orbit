-- Add sources column to issues table
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "sources" jsonb NOT NULL DEFAULT '[]';
