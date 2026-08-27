import { NextResponse } from "next/server";
import { getCurrentIssuerUser } from "../../../../lib/auth";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { AgentAnalyticsService } from "../../../../services/AgentAnalyticsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentIssuerUser();
    if (!user) return NextResponse.json({ error: "Issuer login required." }, { status: 401 });

    const body = (await request.json()) as {
      action?: string;
      organizationId?: string;
      userId?: string;
      metadata?: Record<string, unknown>;
    };

    // Ownership is taken from the session, not the request body.
    await AgentAnalyticsService.track({
      action: String(body.action ?? "agent.action"),
      issuerId: user.issuerId,
      userId: user.id,
      metadata: body.metadata,
    });

    return NextResponse.json({ tracked: true }, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Agent analytics tracking failed", error);
    return NextResponse.json({ error: "Unable to record analytics." }, { status: 400 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentIssuerUser();
    if (!user) return NextResponse.json({ error: "Issuer login required." }, { status: 401 });
    return NextResponse.json({ summary: await AgentAnalyticsService.summary() });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Agent analytics summary failed", error);
    return NextResponse.json({ error: "Unable to load analytics." }, { status: 500 });
  }
}
