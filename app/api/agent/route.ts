import { NextResponse } from "next/server";
import { guardAgentInput, guardAgentOutput } from "../../../lib/agent/guardrails";
import { createLocalAgentResponse } from "../../../lib/agent/local";
import { getAgentProvider } from "../../../lib/agent/providers";
import type { AgentContext } from "../../../lib/agent/types";

export async function POST(request: Request) {
  const body = await request.json() as { message?: string; context?: AgentContext };
  const message = body.message?.trim() ?? "";
  const context = body.context ?? { currentPage: "/" };
  const guarded = guardAgentInput(message);
  if (guarded) return NextResponse.json({ message: guarded });
  try {
    const provider = getAgentProvider();
    const response = provider ? await provider.respond(message, context) : createLocalAgentResponse(message, context);
    return NextResponse.json({ ...response, message: guardAgentOutput(response.message) });
  } catch {
    return NextResponse.json(createLocalAgentResponse(message, context));
  }
}