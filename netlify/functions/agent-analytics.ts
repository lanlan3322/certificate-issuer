import type { Handler } from "@netlify/functions";
import { AgentAnalyticsService } from "../../services/AgentAnalyticsService";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try { const body = JSON.parse(event.body ?? "{}"); await AgentAnalyticsService.track({ action: String(body.action ?? "agent.action"), issuerId: body.issuerId, organizationId: body.organizationId, userId: body.userId, metadata: body.metadata }); return { statusCode: 201, body: JSON.stringify({ tracked: true }) }; }
  catch (error) { return { statusCode: 400, body: JSON.stringify({ error: error instanceof Error ? error.message : "Unable to record analytics." }) }; }
};