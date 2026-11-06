import { NextResponse } from "next/server";
import { authorize } from "../../../lib/apiAuth";
import { hasPermission, isPlatformAdmin } from "../../../lib/permissions";
import { isPlanId, usageWarnings } from "../../../lib/billing";
import { parseAssignment, SubscriptionError, SubscriptionService } from "../../../services/SubscriptionService";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  if (error instanceof SubscriptionError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("[subscriptions] Request failed.", { code: "SUBSCRIPTION_FAILURE" });
  return NextResponse.json({ error: "Billing information is unavailable." }, { status: 503, headers });
}
function organization(request: Request, user: { organizationId: string; roles: readonly string[] }) {
  const id = new URL(request.url).searchParams.get("organizationId") || user.organizationId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new SubscriptionError("A valid organization is required.", 400);
  if (id !== user.organizationId && !isPlatformAdmin(user)) throw new SubscriptionError("Organization access denied.", 403);
  return id;
}
export async function GET(request: Request) {
  const { user, response } = await authorize("billing.read"); if (response) return response;
  try {
    if (new URL(request.url).searchParams.get("scope") === "directory") {
      if (!hasPermission(user, "billing.manage")) throw new SubscriptionError("Platform administration is required.", 403);
      const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new SubscriptionError("Invalid directory offset.", 400);
      return NextResponse.json(await SubscriptionService.directory(offset), { headers });
    }
    if (new URL(request.url).searchParams.get("scope") === "platform") {
      if (!hasPermission(user, "billing.manage")) throw new SubscriptionError("Platform administration is required.", 403);
      return NextResponse.json({ metrics: await SubscriptionService.metrics() }, { headers });
    }
    const snapshot = await SubscriptionService.snapshot(organization(request, user));
    return NextResponse.json({ ...snapshot, warnings: usageWarnings(snapshot) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const { user, response } = await authorize("billing.read"); if (response) return response;
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new SubscriptionError("Same-origin authorization is required.", 403);
    }
    const org = organization(request, user), reader = request.body?.getReader();
    if (!reader) throw new SubscriptionError("A subscription action is required.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); throw new SubscriptionError("Request is too large.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { throw new SubscriptionError("Valid JSON is required.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new SubscriptionError("A subscription action is required.", 400);
    if (body.action === "request") {
      if (!isPlanId(body.plan)) throw new SubscriptionError("Select a valid plan.", 400);
      await SubscriptionService.action(org, user.id, "request", { plan: body.plan });
    } else if (body.action === "assign") {
      if (!hasPermission(user, "billing.manage")) throw new SubscriptionError("Platform administration is required.", 403);
      const payload = parseAssignment(body);
      await SubscriptionService.action(org, user.id, "assign", { ...payload });
    } else throw new SubscriptionError("Unknown subscription action.", 400);
    const snapshot = await SubscriptionService.snapshot(org);
    return NextResponse.json({ ...snapshot, warnings: usageWarnings(snapshot) }, { headers });
  } catch (error) { return failure(error); }
}
