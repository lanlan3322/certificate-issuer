import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { enforceRateLimit, ForbiddenError, RateLimitError } from "../../../../lib/auth";
import { CredentialService } from "../../../../services/CredentialService";
import { CredentialEmailService, CredentialEmailError } from "../../../../services/CredentialEmailService";
import { randomUUID } from "node:crypto";
import { hasPermission } from "../../../../lib/permissions";
import { requireIssuerAccess } from "../../../../lib/issuer-access";

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  if (!hasPermission(user, "credentials.send")) {
    return NextResponse.json({ error: "Issuer permission required." }, { status: 403 });
  }
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin email requests are not allowed." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request is required." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("credentialId" in body) ||
      typeof body.credentialId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.credentialId) ||
      !("requestId" in body) || typeof body.requestId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.requestId)) {
    return NextResponse.json({ error: "A credentialId and requestId are required." }, { status: 400 });
  }
  try {
    await enforceRateLimit("credential-email", user.id, 20, 15);
    const credential = await CredentialService.get(body.credentialId);
    if (!credential) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    await requireIssuerAccess(user, credential.issuerId, "operate", true);
    const delivery = await CredentialEmailService.send(credential, user.id, body.requestId);
    return NextResponse.json({ message: delivery.message });
  } catch (error) {
    if (error instanceof CredentialEmailError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) return errorResponse(error, "Issuer access denied.", 403);
    if (error instanceof RateLimitError) return errorResponse(error, "Email rate limit reached.", 429);
    // Keep unexpected transport/provider details out of application logs.
    const incidentId = randomUUID();
    console.error("Certificate email request failed", { incidentId });
    return NextResponse.json({
      error: `Unable to confirm email acceptance. Check with the recipient or your administrator before retrying to avoid duplicate emails (reference ${incidentId}).`,
    }, { status: 502 });
  }
}
