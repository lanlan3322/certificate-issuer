import type { CertEntry } from "@/app/gallery/page";

/** Check if an object looks like a flat CertificateData row (snake_case keys). */
function isFlatCredential(obj: unknown): obj is Record<string, string | number | boolean | null> {
  return (
    obj != null &&
    typeof obj === "object" &&
    "recipient_name" in obj &&
    "certificate_type" in obj
  );
}

/** Check if an object looks like a nested JSON-LD VC */
function isNestedVc(obj: unknown): boolean {
  return (
    obj != null &&
    typeof obj === "object" &&
    "credentialSubject" in obj
  );
}
/** Extract a string value from a possibly-nested path, with fallback chain. */
function extractString(
  sources: Array<string | undefined>,
): string | undefined {
  for (const src of sources) {
    if (typeof src === "string" && src.trim().length > 0) return src;
  }
  return undefined;
}

/** Map a single VC credential payload to the gallery's CertEntry format. */
export function mapVcToCertEntry(credential: unknown): CertEntry | null {
  if (!credential || typeof credential !== "object") return null;
  const vc = credential as Record<string, unknown>;

  // --- Subject (flat or nested) ---
  const subject =
    (vc.credentialSubject as unknown as Record<string, unknown>) ??
    (vc.subject as unknown as Record<string, unknown>);

  // Flat CertificateData row from Supabase (camelCase keys)
  const flatCamel = vc as Record<string, string>;
  if (
    typeof flatCamel.recipientName === "string" &&
    typeof flatCamel.certificateType === "string"
  ) {
    return {
      id: String(flatCamel.id ?? ""),
      recipientName: flatCamel.recipientName,
      recipientEmail: flatCamel.recipientEmail || "",
      certificateType: flatCamel.certificateType,
      issuerName:
        typeof vc.issuer === "string"
          ? vc.issuer
          : extractString([
            (vc.issuer as unknown as Record<string, unknown>)?.name as string,
            (vc.issuer as unknown as Record<string, unknown>)?.did as string,
          ]) ?? "Unknown Issuer",
      issueDate: flatCamel.issueDate || flatCamel.created_at || "",
      description: flatCamel.description || "",
      validFrom: flatCamel.validFrom || "",
      validUntil: flatCamel.validUntil || undefined,
      templateId: (flatCamel.templateId as string) ?? "default",
      status: flatCamel.status || "valid",
    };
  }

  // Flat CertificateData row from Supabase (snake_case keys)
  if (isFlatCredential(vc)) {
    const f = vc as Record<string, string | number | boolean | null>;
    return {
      id: String(f.id ?? ""),
      recipientName: String(f.recipient_name ?? ""),
      recipientEmail: String(f.recipient_email ?? ""),
      certificateType: String(f.certificate_type ?? ""),
      issuerName:
        typeof vc.issuer === "string"
          ? vc.issuer
          : extractString([
            (vc.issuer as unknown as Record<string, unknown>)?.name as string,
            (vc.issuer as unknown as Record<string, unknown>)?.did as string,
          ]) ?? "Unknown Issuer",
      issueDate: String(f.created_at ?? f.issue_date ?? ""),
      description: String(f.description ?? ""),
      validFrom: String(f.valid_from ?? ""),
      validUntil: f.valid_until ? String(f.valid_until) : undefined,
      templateId: String((f.template_id as number) ?? "default"),
      status: String((f.status as string) || "valid"),
    };
  }


  // Nested JSON-LD VC format
  if (isNestedVc(vc)) {
    const s = subject ?? {};
    const recipientName = extractString([
      (s.name as string),
      (s.recipient_name as string),
      typeof s === "object" && s !== null && typeof (s as Record<string, unknown>).holder === "object"
        ? ((s.holder as Record<string, unknown>)?.name as string)
        : undefined,
    ]);
    const recipientEmail = extractString([
      (s.email as string),
      (s.recipient_email as string),
    ]);
    const certificateType = extractString([
      (s.certificate_type as string),
      (s.type as string),
    ]);
    const description = (s.description as string) ?? "";
    const validFrom = extractString([
      (s.valid_from as string),
      vc.validFrom as string,
      vc.issuanceDate as string,
    ]);
    const validUntil = extractString([
      (s.valid_until as string),
      vc.validUntil as string,
    ]);

    // Extract issuer
    const issuerObj = vc.issuer;
    let issuerName = "Unknown Issuer";
    if (typeof issuerObj === "string") {
      issuerName = issuerObj;
    } else if (issuerObj && typeof issuerObj === "object") {
      const i = issuerObj as Record<string, unknown>;
      issuerName = extractString([
        i.name as string,
        i.did as string,
      ]) ?? "Unknown Issuer";
    }

    return {
      id: String(
        (s.certificate_id as string) ||
        (vc.id as string) ||
        "",
      ),
      recipientName: recipientName ?? "Unknown Recipient",
      recipientEmail: recipientEmail ?? "",
      certificateType: certificateType ?? "Certificate",
      issuerName,
      issueDate: validFrom ?? new Date().toISOString(),
      description,
      validFrom: validFrom ?? new Date().toISOString(),
      validUntil,
      templateId: String((s.template_id as string) ?? "default"),
      status: "valid",
    };
  }

  // Generic fallback — try camelCase fields directly on the object
  const c = vc as Record<string, unknown>;
  return {
    id: String(c.id ?? ""),
    recipientName: (c.recipientName as string) ?? "Unknown Recipient",
    recipientEmail: (c.recipientEmail as string) ?? "",
    certificateType: (c.certificateType as string) ?? "Certificate",
    issuerName:
      typeof c.issuer === "string"
        ? c.issuer
        : extractString([
          (c.issuer as unknown as Record<string, unknown>)?.name as string,
          (c.issuer as unknown as Record<string, unknown>)?.did as string,
        ]) ?? "Unknown Issuer",
    issueDate: (c.issueDate as string) ?? "",
    description: (c.description as string) ?? "",
    validFrom: (c.validFrom as string) ?? new Date().toISOString(),
    validUntil: c.validUntil ? String(c.validUntil) : undefined,
    templateId: (c.templateId as string) ?? "default",
    status: (c.status as string) || "valid",
  };
}

/** Map an array of VC credential payloads to the gallery's CertEntry format. */
export function mapVcsToCertEntries(
  credentials: unknown[],
): CertEntry[] {
  const entries: CertEntry[] = [];
  for (const cred of credentials) {
    const entry = mapVcToCertEntry(cred);
    if (entry) entries.push(entry);
  }
  return entries;
}
