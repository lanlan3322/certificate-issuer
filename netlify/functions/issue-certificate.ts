import type { Handler } from "@netlify/functions";
import { CredentialService } from "../../services/CredentialService";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try { const body = JSON.parse(event.body ?? "{}"); const credential = await CredentialService.create(body); return { statusCode: 201, body: JSON.stringify({ credential }) }; }
  catch (error) { return { statusCode: 400, body: JSON.stringify({ error: error instanceof Error ? error.message : "Unable to persist credential." }) }; }
};