import { NextResponse } from "next/server";
import { authorize } from "../../../lib/apiAuth";
import { isPlatformAdmin, normalizeRoles } from "../../../lib/permissions";
import { SelfManagedDIDService } from "../../../services/SelfManagedDIDService";
import { ManagedDIDError } from "../../../services/ManagedDIDService";
import { enforceRateLimit, RateLimitError } from "../../../lib/auth";

const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  if (error instanceof ManagedDIDError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof RateLimitError) return NextResponse.json({ error: "DID validation rate limit exceeded. Try again later." }, { status: 429, headers });
  console.error("Self-managed DID operation failed.", { code: "SELF_MANAGED_DID_FAILURE" });
  return NextResponse.json({ error: "Self-managed DID operation failed." }, { status: 503, headers });
}
export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const org = new URL(request.url).searchParams.get("organizationId") || user.organizationId;
    if (org !== user.organizationId && !isPlatformAdmin(user)) throw new ManagedDIDError("Organization access denied.", 403);
    return NextResponse.json({ configuration: await SelfManagedDIDService.get(org) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ManagedDIDError("Same-origin authorization is required for DID management.", 403);
    }
    if (!isPlatformAdmin(user) && !normalizeRoles(user.roles).includes("organization_admin")) {
      throw new ManagedDIDError("An organization administrator is required.", 403);
    }
    const org = new URL(request.url).searchParams.get("organizationId") || user.organizationId;
    if (org !== user.organizationId && !isPlatformAdmin(user)) throw new ManagedDIDError("Organization access denied.", 403);
    const reader = request.body?.getReader();
    if (!reader) throw new ManagedDIDError("A DID action is required.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) { await reader.cancel(); throw new ManagedDIDError("DID request is too large.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { throw new ManagedDIDError("A valid DID action is required.", 400); }
    switch (body?.action) {
      case "configure":
        if (typeof body.domain !== "string") throw new ManagedDIDError("Domain is required.", 400);
        await SelfManagedDIDService.configure(org, user.id, body.domain);
        break;
      case "files":
        return NextResponse.json(await SelfManagedDIDService.files(org, user.id), { headers });
      case "validate":
      case "self-managed":
        await enforceRateLimit("did-validation:organization", org, 10, 5);
        if (body.action === "validate") await SelfManagedDIDService.validate(org, user.id);
        else await SelfManagedDIDService.select(org, user.id, "self-managed");
        break;
      case "managed":
        await SelfManagedDIDService.select(org, user.id, "managed");
        break;
      default: throw new ManagedDIDError("Unsupported DID action.", 400);
    }
    return NextResponse.json({ configuration: await SelfManagedDIDService.get(org) }, { headers });
  } catch (error) { return failure(error); }
}
