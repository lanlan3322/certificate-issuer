import { NextResponse } from "next/server";
import { guardAgentInput, guardAgentOutput } from "../../../lib/agent/guardrails";
import { createLocalAgentResponse } from "../../../lib/agent/local";
import { getAgentProvider } from "../../../lib/agent/providers";
import type { AgentContext } from "../../../lib/agent/types";
import { isDatabaseConfigured } from "../../../lib/db";
import { AgentMemoryService } from "../../../services/AgentMemoryService";
import { AgentAnalyticsService } from "../../../services/AgentAnalyticsService";

export async function POST(request: Request) {
  const body = await request.json() as { message?: string; context?: AgentContext; sessionId?: string };
  const message = body.message?.trim() ?? "";
  const context = body.context ?? { currentPage: "/" };
  const guarded = guardAgentInput(message);
  if (guarded) return NextResponse.json({ message: guarded });
  try {
    const provider = getAgentProvider();
    const response = provider ? await provider.respond(message, context) : createLocalAgentResponse(message, context);
    const safeResponse = { ...response, message: guardAgentOutput(response.message) };
    if (body.sessionId && isDatabaseConfigured()) {
      await AgentMemoryService.saveConversation(body.sessionId, "user", message, { page: context.currentPage });
      await AgentMemoryService.saveConversation(body.sessionId, "assistant", safeResponse.message, { actions: safeResponse.actions ?? [] });
      await AgentMemoryService.saveWorkflowState(body.sessionId, safeResponse.workflowState ?? context.workflowState ?? {}, context.currentPage, safeResponse.workflowState?.step);
      await AgentAnalyticsService.track({ action: "agent.question", metadata: { page: context.currentPage } });
    }
    return NextResponse.json(safeResponse);
  } catch {
    return NextResponse.json(createLocalAgentResponse(message, context));
  }
}