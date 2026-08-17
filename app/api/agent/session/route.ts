import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { AgentMemoryService } from "../../../../services/AgentMemoryService";

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    const [session, messages] = await Promise.all([AgentMemoryService.loadWorkflowState(sessionId), AgentMemoryService.loadConversation(sessionId)]);
    return NextResponse.json({ session, messages });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to load agent session." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { issuerId?: string; userId?: string; currentPage?: string; workflow?: string; state?: Record<string, unknown> };
    const session = await AgentMemoryService.createSession({ issuerId: body.issuerId, userId: body.userId, currentPage: body.currentPage, workflow: body.workflow, state: body.state });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to create agent session." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    await AgentMemoryService.clearSession(sessionId);
    return NextResponse.json({ cleared: true });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to clear agent session." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
}