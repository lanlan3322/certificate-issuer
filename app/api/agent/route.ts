import { NextResponse } from "next/server";
import { guardAgentInput, guardAgentOutput } from "../../../lib/agent/guardrails";
import { createLocalAgentResponse } from "../../../lib/agent/local";
import { getAgentProvider } from "../../../lib/agent/providers";
import type { AgentContext } from "../../../lib/agent/types";
import { getCurrentIssuerUser, enforceRateLimit, RateLimitError } from "../../../lib/auth";
import { clientIp } from "../../../lib/apiAuth";
import { isDatabaseConfigured } from "../../../lib/db";
import { AgentMemoryService } from "../../../services/AgentMemoryService";
import { AuditService } from "../../../services/AuditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 4_000;

export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string; context?: AgentContext; sessionId?: string };
  const message = body.message?.trim().slice(0, MAX_MESSAGE_CHARS) ?? "";
  const context = body.context ?? { currentPage: "/" };

  const guarded = guardAgentInput(message);
  if (guarded) return NextResponse.json({ message: guarded });

  const user = await getCurrentIssuerUser();
  const provider = getAgentProvider();

  // A configured provider costs money per call, so anonymous callers are held
  // to a much tighter budget than signed-in issuers.
  if (isDatabaseConfigured()) {
    try {
      await enforceRateLimit(
        user ? "agent:user" : "agent:anon",
        user ? user.id : clientIp(request),
        user ? 120 : provider ? 10 : 60,
        60
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
    }
  }

  try {
    const response = provider ? await provider.respond(message, context) : createLocalAgentResponse(message, context);
    const safeResponse = { ...response, message: guardAgentOutput(response.message) };

    if (body.sessionId && isDatabaseConfigured()) {
      const owns = await AgentMemoryService.ownsSession(body.sessionId, user?.id ?? null);
      if (owns) {
        await AgentMemoryService.saveConversation(body.sessionId, "user", message, { page: context.currentPage });
        await AgentMemoryService.saveConversation(body.sessionId, "assistant", safeResponse.message, {
          actions: safeResponse.actions ?? [],
        });
        await AgentMemoryService.saveWorkflowState(
          body.sessionId,
          safeResponse.workflowState ?? context.workflowState ?? {},
          context.currentPage,
          safeResponse.workflowState?.step
        );
        await AuditService.record({
          organizationId: user?.organizationId,
          issuerId: user?.issuerId,
          userId: user?.id,
          action: "agent.question",
          entityType: "agent",
          metadata: { page: context.currentPage },
        });
      }
    }
    return NextResponse.json(safeResponse);
  } catch (error) {
    console.error("Agent provider failed; falling back to local assistant", error);
    return NextResponse.json(createLocalAgentResponse(message, context));
  }
}
