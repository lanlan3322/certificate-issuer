"use client";

import ClassicTemplate from "./ClassicTemplate";
import FTATemplate from "./FTATemplate";
import MinimalTemplate from "./MinimalTemplate";
import ModernTemplate from "./ModernTemplate";
import { resolveTemplateId, resolveTemplateIssuer } from "./registry";
import { CertificateTemplateData, Theme } from "./types";

interface RendererProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
  footerIssuerName?: string;
}

const DEFAULT_THEME: Theme = "light";

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? candidate as Record<string, unknown>
    : undefined;
}

/** Attempt to resolve a human-readable issuer display name from the certificate payload. */
function resolveIssuerDisplayName(cert: CertificateTemplateData): string | undefined {
  // A — direct issuerName on the mapped cert entry (most common path)
  if (cert.issuerName && cert.issuerName.trim()) {
    const n = cert.issuerName.trim();
    if (!n.startsWith("did:") && n !== "Unknown Issuer" && n !== "Certificate Issuer") return n;
  }

  // B — credentialSubject-level display identity and legacy issuer labels
  const rawCredential = cert as unknown as Record<string, unknown>;
  const subject = firstRecord(rawCredential.credentialSubject);
  if (subject) {
    for (const key of ["issuerDisplayName", "issuerName", "issuer_name", "academy_name"]) {
      const val = String(subject[key] ?? "");
      if (val.trim() && val !== "Unknown Issuer") return val.trim();
    }
  }

  // C — issuer object on the cert entry (if raw payload survived through)
  const issuer = firstRecord(rawCredential.issuer);
  if (issuer) {
    for (const key of ["displayName", "name"]) {
      const val = String(issuer[key] ?? "");
      if (val.trim() && val !== "Unknown Issuer") return val.trim();
    }
    const issuerId = issuer.id;
    if (typeof issuerId === "string" && issuerId.startsWith("did:")) return issuerId;
  }

  // D — preserve the issuer identifier when no human-readable name is available.
  if (cert.issuerName) {
    const didStr = cert.issuerName.trim();
    if (didStr.startsWith("did:")) return didStr;
  }

  return undefined;
}

export default function CertificateTemplateRenderer({
  certificate,
  theme,
  footerIssuerName: footerIssuerNameOverride,
}: RendererProps) {
  const templateId = resolveTemplateId(certificate.templateId);
  const t = theme ?? DEFAULT_THEME;

  let content: React.ReactNode;

  if (templateId === "modern") {
    content = <ModernTemplate certificate={certificate} theme={t} />;
  } else if (templateId === "fta") {
    content = <FTATemplate certificate={certificate} theme={t} />;
  } else if (templateId === "minimal") {
    content = <MinimalTemplate certificate={certificate} theme={t} />;
  } else {
    content = <ClassicTemplate certificate={certificate} theme={t} />;
  }

  // ---- Footer issuer name resolution (presentation only) ----
  const rawCredential = certificate as unknown as Record<string, unknown>;
  const subjectRecord = firstRecord(rawCredential.credentialSubject);
  const footerIssuerName = footerIssuerNameOverride ??
    resolveIssuerDisplayName(certificate) ??
    resolveTemplateIssuer(certificate.templateId);

  return (
    <div className="flex min-h-[297mm] w-full flex-col">
      <div className="flex-1">{content}</div>
      <div className="mt-8 flex items-end gap-6 border-t border-gray-200 pt-5 sm:gap-8">
        <div className="ml-auto text-xs text-gray-400">Certificate Owner: {footerIssuerName}</div>
      </div>
    </div>
  );
}
