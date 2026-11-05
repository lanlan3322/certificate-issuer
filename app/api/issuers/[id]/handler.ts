import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { canAccessIssuer } from "../../../../lib/permissions";
import { IssuerService } from "../../../../services/IssuerService";
import { updateIssuer } from "../handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestId = (request: Request) => new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const issuer = await IssuerService.getById(requestId(request));
    if (!issuer || !canAccessIssuer(user, issuer)) return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    return NextResponse.json({ issuer });
  } catch (error) { return errorResponse(error, "Unable to load issuer.", 500); }
}

export async function PATCH(request: Request) {
  return updateIssuer(request, requestId(request));
}

export async function DELETE(request: Request) {
  const { user, response } = await authorize("organizations.manage");
  if (response) return response;
  try {
    const issuer = await IssuerService.getById(requestId(request));
    if (!issuer) return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    const result = await IssuerService.updateStatus(issuer.id, "deleted", issuer.organizationId);
    return NextResponse.json({ issuer: result });
  } catch (error) { return errorResponse(error, "Unable to delete issuer.", 500); }
}
