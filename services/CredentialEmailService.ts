import { randomUUID } from "node:crypto";
import { createTransport } from "nodemailer";
import type { CredentialRecord } from "./CredentialService";
import { AuditService } from "./AuditService";

export class CredentialEmailError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export const CredentialEmailService = {
  async send(credential: CredentialRecord, userId: string, requestId: string) {
    if (credential.status !== "issued" ||
        (credential.validUntil && Date.parse(credential.validUntil) <= Date.now())) {
      throw new CredentialEmailError("Only issued, unexpired certificates can be sent.", 409);
    }
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(credential.recipientEmail)) {
      throw new CredentialEmailError("The stored recipient email is invalid. Contact your administrator.", 422);
    }
    const host = process.env.SMTP_HOST;
    const portText = process.env.SMTP_PORT;
    const port = Number(portText);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;
    if (!host || !portText || !/^\d+$/.test(portText) || !Number.isInteger(port) ||
        port < 1 || port > 65535 || !smtpUser || !smtpPassword || !from) {
      throw new CredentialEmailError("Certificate email delivery is not configured. Contact your administrator.", 503);
    }
    const content = Buffer.from(JSON.stringify(credential.credential, null, 2));
    if (content.length > 5 * 1024 * 1024) {
      throw new CredentialEmailError("The certificate exceeds the email attachment size limit.", 413);
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
    let delivery;
    try {
      delivery = await transport.sendMail({
        from,
        to: [credential.recipientEmail],
        messageId: `<certificate-${credential.id}-${requestId}@verifiable.sg>`,
        subject: "Your digital certificate from Verifiable.sg",
        text: `Your issued digital certificate is attached as a JSON file. Keep this file unchanged to preserve its signature and use it with a compatible credential verifier.\n\nView your wallet: https://www.verifiable.sg/wallet/access/\nSign in using the email address that received this certificate. Check the credential's verification status before relying on it.\n\nFor assistance, contact support@verifiable.sg.\n\n----------------------------------------\nThis email was sent by Verifiable.sg\nPrivacy Policy: https://verifiable.sg/privacy\nTerms of Service: https://verifiable.sg/terms\n----------------------------------------`,
        attachments: [{ filename, content, contentType: "application/json" }],
      });
    } catch {
      // Transport errors can contain recipient details and SMTP credentials.
      const incidentId = randomUUID();
      console.error("Certificate email request failed", { incidentId });
      throw new CredentialEmailError(
        `Unable to confirm email acceptance. Check with the recipient or your administrator before retrying to avoid duplicate emails (reference ${incidentId}).`,
        502
      );
    } finally {
      transport.close();
    }
    if (delivery.rejected.length || !delivery.accepted.length || !delivery.messageId) {
      console.error("Certificate SMTP server did not confirm recipient acceptance.");
      throw new CredentialEmailError("The email provider did not accept the request. Please try again later.", 502);
    }
    await AuditService.record({
      organizationId: credential.organizationId, issuerId: credential.issuerId, userId,
      action: "credential.email.accepted", entityType: "credential", entityId: credential.id,
      metadata: { messageId: delivery.messageId, requestId },
    });
    return { status: "accepted" as const, message: "Email accepted for delivery. Inbox delivery is not yet confirmed." };
  },
};
