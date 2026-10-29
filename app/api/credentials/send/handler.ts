import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { enforceRateLimit, RateLimitError } from "../../../../lib/auth";
import { CredentialService } from "../../../../services/CredentialService";
import { AuditService } from "../../../../services/AuditService";
import { randomUUID } from "node:crypto";
import { createTransport } from "nodemailer";

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  if (!user.roles.some((role) => ["platform-admin", "issuer-admin", "issuer-operator"].includes(role))) {
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
    const credential = await CredentialService.get(body.credentialId, user.issuerId);
    if (!credential) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    if (credential.status !== "issued" ||
        (credential.validUntil && Date.parse(credential.validUntil) <= Date.now())) {
      return NextResponse.json({ error: "Only issued, unexpired certificates can be sent." }, { status: 409 });
    }
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(credential.recipientEmail)) {
      return NextResponse.json({ error: "The stored recipient email is invalid. Contact your administrator." }, { status: 422 });
    }
    const host = process.env.SMTP_HOST;
    const portText = process.env.SMTP_PORT;
    const port = Number(portText);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;
    if (!host || !portText || !/^\d+$/.test(portText) || !Number.isInteger(port) ||
        port < 1 || port > 65535 || !smtpUser || !smtpPassword || !from) {
      return NextResponse.json({ error: "Certificate email delivery is not configured. Contact your administrator." }, { status: 503 });
    }
    const content = Buffer.from(JSON.stringify(credential.credential, null, 2));
    if (content.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "The certificate exceeds the email attachment size limit." }, { status: 413 });
    }
    const filename = `${(credential.externalId || credential.id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}.json`;
    const transport = createTransport({
      host, port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: smtpUser, pass: smtpPassword },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
    const delivery = await transport.sendMail({
        from,
        to: [credential.recipientEmail],
        messageId: `<certificate-${credential.id}-${body.requestId}@verifiable.sg>`,
        subject: "Your digital certificate from Verifiable.sg",
        text: `Your issued digital certificate is attached as a JSON file. Keep this file unchanged to preserve its signature and use it with a compatible credential verifier.\n\nFor assistance, contact support@verifiable.sg.\n\n----------------------------------------\nThis email was sent by Verifiable.sg\nPrivacy Policy: https://verifiable.sg/privacy\nTerms of Service: https://verifiable.sg/terms\n----------------------------------------`,
        attachments: [{ filename, content, contentType: "application/json" }],
    });
    if (delivery.rejected.length || !delivery.accepted.length || !delivery.messageId) {
      console.error("Certificate SMTP server did not confirm recipient acceptance.");
      return NextResponse.json({ error: "The email provider did not accept the request. Please try again later." }, { status: 502 });
    }
    await AuditService.record({
      organizationId: user.organizationId, issuerId: user.issuerId, userId: user.id,
      action: "credential.email.accepted", entityType: "credential", entityId: credential.id,
      metadata: { messageId: delivery.messageId, requestId: body.requestId },
    });
    return NextResponse.json({ message: "Email accepted for delivery. Inbox delivery is not yet confirmed." });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(error, "Email rate limit reached.", 429);
    // Keep unexpected transport/provider details out of application logs.
    const incidentId = randomUUID();
    console.error("Certificate email request failed", { incidentId });
    return NextResponse.json({
      error: `Unable to confirm email acceptance. Check with the recipient or your administrator before retrying to avoid duplicate emails (reference ${incidentId}).`,
    }, { status: 502 });
  }
}
