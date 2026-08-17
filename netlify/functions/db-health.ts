import type { Handler } from "@netlify/functions";
import { query } from "../../lib/db";

export const handler: Handler = async () => {
  try { const result = await query<{ ok: number }>("SELECT 1 AS ok"); return { statusCode: 200, body: JSON.stringify({ ok: result.rows[0]?.ok === 1, database: "postgresql" }) }; }
  catch { return { statusCode: 503, body: JSON.stringify({ ok: false, error: "Database unavailable." }) }; }
};