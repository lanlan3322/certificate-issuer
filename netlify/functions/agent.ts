import type { Handler } from "@netlify/functions";
import { createLocalAgentResponse } from "../../lib/agent/local";
import { guardAgentInput, guardAgentOutput } from "../../lib/agent/guardrails";
import { getAgentProvider } from "../../lib/agent/providers";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try { const body = JSON.parse(event.body ?? "{}"); const message = String(body.message ?? ""); const context = body.context ?? { currentPage: "/" }; const guarded = guardAgentInput(message); if (guarded) return { statusCode: 200, body: JSON.stringify({ message: guarded }) }; const provider = getAgentProvider(); const response = provider ? await provider.respond(message, context) : createLocalAgentResponse(message, context); return { statusCode: 200, body: JSON.stringify({ ...response, message: guardAgentOutput(response.message) }) }; }
  catch (error) { return { statusCode: 500, body: JSON.stringify({ error: error instanceof Error ? error.message : "Agent unavailable." }) }; }
};