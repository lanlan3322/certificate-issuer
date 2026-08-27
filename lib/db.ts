import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export class DatabaseConfigurationError extends Error {}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function isLocalConnection(connectionString: string) {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function buildSslConfig(connectionString: string) {
  if (isLocalConnection(connectionString)) return undefined;
  // Supabase and other managed providers require TLS on every connection,
  // including from local development.
  const ca = process.env.DATABASE_SSL_CA;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseConfigurationError("DATABASE_URL is required for database operations.");
  if (!pool) {
    pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: buildSslConfig(connectionString) });
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