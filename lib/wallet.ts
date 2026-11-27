import { parseStoredCredential } from "./stored-credential";
import { toCertificateTemplateData } from "../app/renderer/certificateView";
import { mapVcToCertEntry } from "./credential-mapper";

export type WalletStatus = "active" | "not_yet_valid" | "expired" | "revoked" | "suspended" | "unknown";

export function walletStatus(status: string, validUntil: string | null, now = Date.now(), validFrom: string | null = null): WalletStatus {
  if (status === "revoked" || status === "suspended" || status === "expired") return status;
  if (status !== "issued") return "unknown";
  if (validUntil) {
    const expiry = Date.parse(validUntil);
    if (!Number.isFinite(expiry)) return "unknown";
    if (expiry < now) return "expired";
  }
  if (validFrom) {
    const start = Date.parse(validFrom);
    if (!Number.isFinite(start)) return "unknown";
    if (start > now) return "not_yet_valid";
  }
  return "active";
}

export function walletRecord(row: Record<string, unknown>) {
  const document = parseStoredCredential(row.credential);
  const certificate = mapVcToCertEntry(document) ?? toCertificateTemplateData(document, "");
  const snapshot = row.issuer_snapshot && typeof row.issuer_snapshot === "object" && !Array.isArray(row.issuer_snapshot)
    ? row.issuer_snapshot as Record<string, unknown> : {};
  const validUntil = typeof row.valid_until === "string" ? row.valid_until : null;
  const validFrom = typeof row.valid_from === "string" ? row.valid_from : null;
  return {
    id: String(row.id),
    externalId: String(row.external_id),
    title: certificate.certificateType,
    recipientName: String(row.recipient_name),
    issuer: typeof snapshot.issuerDisplayName === "string" ? snapshot.issuerDisplayName : certificate.issuerName,
    organization: typeof snapshot.organizationDisplayName === "string" ? snapshot.organizationDisplayName : "Not recorded",
    issuedAt: String(row.issued_at),
    validUntil,
    status: walletStatus(String(row.status), validUntil, Date.now(), validFrom),
  };
}

export type WalletRecord = ReturnType<typeof walletRecord>;
