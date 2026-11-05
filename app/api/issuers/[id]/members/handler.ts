import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../../lib/apiAuth";
import { canAccessIssuer, type IssuerMemberRole } from "../../../../../lib/permissions";
import { IssuerService } from "../../../../../services/IssuerService";
import { IssuerMemberService } from "../../../../../services/IssuerMemberService";

async function handle(request: Request) {
  const { user, response } = await authorize("issuers.manage");
  if (response) return response;
  try {
    const url = new URL(request.url);
    const issuerId = url.pathname.split("/").filter(Boolean).at(-2) ?? "";
    const issuer = await IssuerService.getById(issuerId);
    if (!issuer || !canAccessIssuer(user, issuer, "manage")) return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    if (request.method === "GET") return NextResponse.json({ members: await IssuerMemberService.list(issuerId) });
    const body = request.method === "DELETE" ? { userId: url.searchParams.get("userId") } : await request.json();
    if (typeof body?.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)) {
      return NextResponse.json({ error: "A valid application userId is required." }, { status: 400 });
    }
    if (request.method === "DELETE") {
      await IssuerMemberService.remove(issuerId, body.userId);
      return NextResponse.json({ removed: true });
    }
    if (!["issuer_admin", "issuer_operator", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be issuer_admin, issuer_operator, or viewer." }, { status: 400 });
    }
    const member = await IssuerMemberService.save(issuerId, body.userId, body.role as IssuerMemberRole);
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) { return errorResponse(error, "Unable to manage issuer members."); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
