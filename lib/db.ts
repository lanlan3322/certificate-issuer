import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export class DatabaseConfigurationError extends Error {}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!process.env.DATABASE_URL) throw new DatabaseConfigurationError("DATABASE_URL is required for database operations.");
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 5), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
    pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  try { return await getPool().query<T>(text, values); }
  catch (error) { console.error("Database query failed", { message: error instanceof Error ? error.message : "Unknown database error" }); throw error; }
}

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}