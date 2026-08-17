import type { Handler } from "@netlify/functions";
import { PasswordResetService } from "../../services/PasswordResetService";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try { const body = JSON.parse(event.body ?? "{}"); if (body.token) { await PasswordResetService.reset(body.token, body.password); return { statusCode: 200, body: JSON.stringify({ reset: true }) }; } const result = await PasswordResetService.request(body.email); return { statusCode: 200, body: JSON.stringify({ requested: true, developmentToken: result.resetToken }) }; }
  catch (error) { return { statusCode: 400, body: JSON.stringify({ error: error instanceof Error ? error.message : "Unable to process password reset." }) }; }
};