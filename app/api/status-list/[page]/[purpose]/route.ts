import { NextResponse } from "next/server";
import { StatusListService } from "../../../../../services/StatusListService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ page: string; purpose: string }> }
) {
  const { page, purpose } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^(0|[1-9][0-9]{0,9})$/.test(page) || Number(page) > 2147483647 ||
      (purpose !== "revocation" && purpose !== "suspension")) {
    return NextResponse.json({ error: "Invalid status list identifier." }, { status: 400, headers });
  }
  try {
    const document = await StatusListService.publish(Number(page), purpose);
    if (!document) return NextResponse.json({ error: "Status list not found." }, { status: 404, headers });
    return NextResponse.json(document, { headers: { ...headers, "Content-Type": "application/vc+ld+json" } });
  } catch (error) {
    console.error("Public status list publication failed.", error);
    return NextResponse.json({ error: "Status list is unavailable." }, { status: 503, headers });
  }
}
