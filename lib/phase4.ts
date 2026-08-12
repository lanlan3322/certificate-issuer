export interface VerificationDeliveryInput {
  recipientEmail: string;
  recipientName: string;
  credentialId: string;
  verificationUrl: string;
}

export interface EmailDelivery {
  to: string;
  subject: string;
  body: string;
  verificationUrl: string;
}

export interface VerificationBundle {
  credentialId: string;
  verificationUrl: string;
  qrPayload: string;
  recipientEmail: string;
}

export function buildVerificationLink(baseUrl: string, credentialId: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}/verify?credential=${encodeURIComponent(credentialId)}`;
}

export function createEmailDelivery(input: VerificationDeliveryInput): EmailDelivery {
  return {
    to: input.recipientEmail,
    subject: `Your certificate is ready, ${input.recipientName}`,
    body: [
      `Hello ${input.recipientName},`,
      "",
      "Your credential has been issued successfully.",
      "You can verify it securely using the link below:",
      input.verificationUrl,
      "",
      "Regards,",
      "Certificate Issuer Team",
    ].join("\n"),
    verificationUrl: input.verificationUrl,
  };
}

export function createVerificationBundle(input: {
  credentialId: string;
  verificationUrl: string;
  recipientEmail: string;
}): VerificationBundle {
  return {
    credentialId: input.credentialId,
    verificationUrl: input.verificationUrl,
    qrPayload: JSON.stringify({
      type: "certificate-verification",
      credentialId: input.credentialId,
      verificationUrl: input.verificationUrl,
      recipientEmail: input.recipientEmail,
      issuedAt: new Date().toISOString(),
    }),
    recipientEmail: input.recipientEmail,
  };
}
