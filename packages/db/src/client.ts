import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDatabase>;

export const createDatabase = (connectionString: string) => {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
};

// Default database instance (uses DATABASE_URL env var)
let _db: Database | null = null;

export const getDatabase = (): Database => {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _db = createDatabase(connectionString);
  }
  return _db;
};

// For testing or custom connections
export const setDatabase = (db: Database): void => {
  _db = db;
};
