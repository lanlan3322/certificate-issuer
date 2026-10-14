import { NextResponse } from "next/server";
import { getCurrentIssuerUser } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/apiAuth";
import { AgentMemoryService } from "../../../../services/AgentMemoryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId || !UUID.test(sessionId)) {
      return NextResponse.json({ error: "A valid sessionId is required." }, { status: 400 });
    }

    const user = await getCurrentIssuerUser();
    const userId = user?.id ?? null;

    // Ownership is part of the query predicate, so an unowned session is
    // indistinguishable from a nonexistent one.
    if (!(await AgentMemoryService.ownsSession(sessionId, userId))) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const [session, messages] = await Promise.all([
      AgentMemoryService.loadWorkflowState(sessionId, userId),
      AgentMemoryService.loadConversation(sessionId, userId),
    ]);
    return NextResponse.json({ session, messages });
  } catch (error) {
    return errorResponse(error, "Unable to load agent session.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { currentPage?: string; workflow?: string; state?: Record<string, unknown> };
    const user = await getCurrentIssuerUser();

    // Anonymous visitors keep their conversation in browser storage. Database
    // sessions are RLS-scoped to an authenticated application user.
    if (!user) {
      return NextResponse.json({ session: null });
    }

    // Attribution comes from the session, never the request body.
    const session = await AgentMemoryService.createSession({
      issuerId: user.issuerId,
      userId: user.id,
      currentPage: body.currentPage,
      workflow: body.workflow,
      state: body.state,
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create agent session.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId || !UUID.test(sessionId)) {
      return NextResponse.json({ error: "A valid sessionId is required." }, { status: 400 });
    }
    const user = await getCurrentIssuerUser();
    const cleared = await AgentMemoryService.clearSession(sessionId, user?.id ?? null);
    if (!cleared) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    return NextResponse.json({ cleared: true });
  } catch (error) {
    return errorResponse(error, "Unable to clear agent session.", 500);
  }
}
