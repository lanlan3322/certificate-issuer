import type { Handler } from "@netlify/functions";
import { RevocationService } from "../../services/RevocationService";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try { const body = JSON.parse(event.body ?? "{}"); const record = await RevocationService.create(body); return { statusCode: 200, body: JSON.stringify({ record }) }; }
  catch (error) { return { statusCode: 400, body: JSON.stringify({ error: error instanceof Error ? error.message : "Unable to revoke credential." }) }; }
};