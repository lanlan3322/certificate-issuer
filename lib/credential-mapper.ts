import type { CertEntry } from "@/app/gallery/page";

// --- FTA detection constants ---

/** Pattern-matched FTA credential indicators */
const FTA_PATTERNS = [
  /FTA/i,
  /Trade\s*Trust\s*Academy/i,
  /openattestation.*academy/i,
];

const FTA_CERT_TYPES = [
  "FTACertification",
  "Professional Certificate",
  "Certificate of Completion",
  "Certificate of Achievement",
];

// --- Detection helpers ---

/** Check if issuer identifier matches verifiable.sg / did:web pattern. */
function isDidWebVerifierIssuer(issuer: unknown): boolean {
  if (typeof issuer === "string") {
    const lower = issuer.toLowerCase();
    return (
      lower.startsWith("did:web:") &&
      lower.includes("verifiable")
    );
  }
  if (issuer && typeof issuer === "object") {
    const obj = issuer as Record<string, unknown>;
    const name =
      (typeof obj.name === "string" ? obj.name : "") ||
      (typeof obj.id === "string" ? obj.id : "");
    return /verifiable\.sg/i.test(name);
  }
  return false;
}

/** Check if a credential object looks like an FTA / verifiable.sg VC. */
export function isFtaCredential(vc: Record<string, unknown>): boolean {
  // 1. Issuer-based detection (strongest signal)
  const issuer = vc.issuer;
  if (isDidWebVerifierIssuer(issuer)) return true;

  // 2. certificateType heuristics
  const certType = String(
    vc.certificateType ??
      vc.certificate_type ??
      (vc.credentialSubject as Record<string, unknown>)?.type ??
      "",
  );
  if (FTA_CERT_TYPES.includes(certType)) return true;

  // 3. Description heuristics
  const desc = String(
    vc.description ??
      (vc.credentialSubject as Record<string, unknown>)?.description ??
      "",
  );
  if (FTA_PATTERNS.some((p) => p.test(desc))) return true;

  // 4. Template hint from nested credentialSubject metadata
  const subject = vc.credentialSubject as Record<string, unknown> | undefined;
  if (subject) {
    const meta = subject.academy_name ||
      subject.cert_authority ||
      subject.awarding_body;
    if (meta && typeof meta === "object") {
      const name = String((meta as Record<string, unknown>).name || "");
      if (FTA_PATTERNS.some((p) => p.test(name))) return true;
    }
    // Detect OpenCerts-style template reference
    if (isFtaTemplateId(String(subject.template_id ?? ""))) return true;
  }

  return false;
}

/** Check if a resolved template ID maps to an FTA certificate. */
function isFtaTemplateId(templateId: string): boolean {
  const id = templateId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return id.includes("fta") || id.includes("academy");
}

/** Extract a resolved template ID from credential metadata. */
function extractTemplateId(vc: Record<string, unknown>): string | undefined {
  // Direct field on VC / Supabase row
  const direct = vc.template_id ?? vc.templateId;
  if (direct && typeof direct === "string" && direct.trim()) return direct.trim();

  // Nested credentialSubject.templateId (OpenCerts-style)
  const subject = vc.credentialSubject as Record<string, unknown> | undefined;
  if (subject) {
    const nested = subject.templateId ?? subject.template_id;
    if (nested && typeof nested === "string" && nested.trim()) return nested.trim();
  }

  return undefined;
}

/** Check if an object is a Supabase CredentialData row (camelCase keys). */
function isSupabaseRow(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.recipientName === "string" &&
    typeof o.certificateType === "string"
  );
}

/** Check if an object is a flat CredentialData row (snake_case keys). */
function isFlatCredential(obj: unknown): obj is Record<string, string | number | boolean | null> {
  return (
    obj != null &&
    typeof obj === "object" &&
    "recipient_name" in obj &&
    "certificate_type" in obj
  );
}

/** Check if an object looks like a nested JSON-LD VC. */
function isNestedVc(obj: unknown): boolean {
  return (
    obj != null &&
    typeof obj === "object" &&
    "credentialSubject" in obj
  );
}

/** Resolve the issuer name for a VC, prioritizing an external issuers lookup table. */
function resolveIssuerName(
  vc: Record<string, unknown>,
  issuers?: Array<{ id: number; name: string }>,
): string {
  // Priority 1: provided issuers lookup (numeric FK resolution)
  if (issuers && typeof vc.issuer === "number") {
    const found = issuers.find((i) => i.id === vc.issuer);
    if (found) return found.name;
  }

  // Priority 2: issuer is already a string
  if (typeof vc.issuer === "string" && vc.issuer.trim()) {
    return vc.issuer.trim();
  }

  // Priority 3: issuer is an object with name/did fields
  if (vc.issuer && typeof vc.issuer === "object") {
    const i = vc.issuer as Record<string, unknown>;
    const nameCandidate = String(i.name || "");
    if (nameCandidate) return nameCandidate;
  }

  // Priority 4: check credentialSubject for academy-related issuer metadata (FTA format)
  const subject =
    (vc.credentialSubject as unknown as Record<string, unknown>) ??
    (vc.subject as unknown as Record<string, unknown>);
  if (subject) {
    const metaIssuer =
      (subject.academy_name as unknown as Record<string, unknown>) ||
      (subject.cert_authority as unknown as Record<string, unknown>) ||
      (subject.awarding_body as unknown as Record<string, unknown>);
    if (metaIssuer && typeof metaIssuer === "object") {
      const nameCandidate = String((metaIssuer as Record<string, unknown>).name || "");
      if (nameCandidate) return nameCandidate;
    }
  }

  // Fallback
  return "Unknown Issuer";
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
export function mapVcToCertEntry(
  credential: unknown,
  options?: { issuers?: Array<{ id: number; name: string }> },
): CertEntry | null {
  if (!credential || typeof credential !== "object") return null;
  const vc = credential as Record<string, unknown>;

  // --- Subject (flat or nested) ---
  const subject =
    (vc.credentialSubject as unknown as Record<string, unknown>) ??
    (vc.subject as unknown as Record<string, unknown>);

  // Auto-detect FTA format early so downstream logic knows about it
  let ftaDetected = isFtaCredential(vc);
  let resolvedTemplate = extractTemplateId(vc);

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
      issuerName: resolveIssuerName(vc, options?.issuers),
      issueDate: flatCamel.issueDate || flatCamel.created_at || "",
      description: flatCamel.description || "",
      validFrom: flatCamel.validFrom || "",
      validUntil: flatCamel.validUntil || undefined,
      templateId: resolvedTemplate ?? "default",
      status: flatCamel.status || "valid",
    };
  }

  // Flat CertificateData row from Supabase (snake_case keys)
  if (isFlatCredential(vc)) {
    const f = vc as Record<string, string | number | boolean | null>;
    // Resolve numeric template_id foreign key; use lookup table or FTA auto-detect
    let templateIdForSnake: string | undefined;
    const rawTpl = f.template_id;
    if (typeof rawTpl === "number" && options?.issuers) {
      // No direct name mapping needed for template_id, but resolve from numeric FK
      templateIdForSnake = String(rawTpl);
    } else {
      templateIdForSnake = resolvedTemplate ?? String(rawTpl ?? "default");
    }

    return {
      id: String(f.id ?? ""),
      recipientName: String(f.recipient_name ?? ""),
      recipientEmail: String(f.recipient_email ?? ""),
      certificateType: String(f.certificate_type ?? ""),
      issuerName: resolveIssuerName(vc, options?.issuers),
      issueDate: String(f.created_at ?? f.issue_date ?? ""),
      description: String(f.description ?? ""),
      validFrom: String(f.valid_from ?? ""),
      validUntil: f.valid_until ? String(f.valid_until) : undefined,
      templateId: templateIdForSnake ?? "default",
      status: String((f.status as string) || "valid"),
    };
  }


  // Nested JSON-LD VC format
  if (isNestedVc(vc)) {
    const s = subject ?? {};

    // Use resolved template or auto-detect from credentialSubject fields
    let resolvedTplForNested = extractTemplateId(s as Record<string, unknown>);
    if (!resolvedTplForNested) {
      // Check if FTA detection found a template_id in the subject metadata
      const tplInSubject = String((s.template_id ?? s.templateId ?? ""));
      if (tplInSubject && isFtaTemplateId(tplInSubject)) {
        resolvedTplForNested = tplInSubject;
      } else {
        resolvedTplForNested = resolvedTemplate ?? "default";
      }
    }

    // Try to resolve issuer from the FTA credentialSubject metadata if available
    let issuerResolvedFromSubject: string | undefined;
    if (ftaDetected) {
      const metaIssuer = s.academy_name || s.cert_authority || s.awarding_body;
      if (metaIssuer && typeof metaIssuer === "object") {
        const nameCandidate = String(
          (metaIssuer as Record<string, unknown>).name ?? "",
        );
        if (nameCandidate) issuerResolvedFromSubject = nameCandidate;
      }
    }

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

    // Extract issuer — use subject-level resolution if FTA detected and no name found in vc.issuer
    const issuerObj = vc.issuer;
    let issuerName = "Unknown Issuer";
    if (issuerResolvedFromSubject) {
      issuerName = issuerResolvedFromSubject;
    } else if (typeof issuerObj === "string") {
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
      templateId: resolvedTplForNested ?? "default",
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
    issuerName: resolveIssuerName(vc, options?.issuers),
    issueDate: (c.issueDate as string) ?? "",
    description: (c.description as string) ?? "",
    validFrom: (c.validFrom as string) ?? new Date().toISOString(),
    validUntil: c.validUntil ? String(c.validUntil) : undefined,
    templateId: resolvedTemplate ?? "default",
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
