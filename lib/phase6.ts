export type VerificationStatus = "valid" | "invalid" | "revoked" | "unknown";

export interface VerificationReportInput {
  incoming: Record<string, unknown>;
  status: VerificationStatus;
  signature: string;
  revocation: string;
  checkedAt?: string;
}

export interface VerificationReport {
  status: VerificationStatus;
  summary: string;
  issuer?: string;
  subject?: string;
  signature: string;
  revocation: string;
  checkedAt: string;
}

export function parseVerificationInput(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Verification input must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function buildVerificationReport(input: VerificationReportInput): VerificationReport {
  const issuer =
    typeof input.incoming.issuer === "object" && input.incoming.issuer
      ? String((input.incoming.issuer as Record<string, unknown>).id ?? "unknown")
      : "unknown";

  const subject =
    typeof input.incoming.credentialSubject === "object" && input.incoming.credentialSubject
      ? String((input.incoming.credentialSubject as Record<string, unknown>).id ?? "unknown")
      : "unknown";

  const checkedAt = input.checkedAt ?? new Date().toISOString();

  return {
    status: input.status,
    summary: `Credential status: ${input.status}; signature=${input.signature}; revocation=${input.revocation}`,
    issuer,
    subject,
    signature: input.signature,
    revocation: input.revocation,
    checkedAt,
  };
}
