import type { Handler } from "@netlify/functions";
import { VerificationService } from "../../services/VerificationService";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try { const body = JSON.parse(event.body ?? "{}"); const externalId = typeof body.externalId === "string" ? body.externalId : undefined; const credential = externalId ? await VerificationService.findByExternalId(externalId) : null; const forwardedFor = event.headers["x-forwarded-for"]; const sourceIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : undefined; const log = await VerificationService.log({ credentialId: typeof credential?.id === "string" ? credential.id : undefined, externalId, verified: Boolean(credential), result: { found: Boolean(credential) }, sourceIp }); return { statusCode: 200, body: JSON.stringify({ credential, log }) }; }
  catch (error) { return { statusCode: 400, body: JSON.stringify({ error: error instanceof Error ? error.message : "Unable to verify credential." }) }; }
};