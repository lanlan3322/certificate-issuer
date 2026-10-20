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
}

const DEFAULT_THEME: Theme = "light";

/** Attempt to resolve a human-readable issuer display name from the certificate payload. */
function resolveIssuerDisplayName(cert: CertificateTemplateData): string {
  // A — direct issuerName on the mapped cert entry (most common path)
  if (cert.issuerName && cert.issuerName.trim()) {
    const n = cert.issuerName.trim();
    if (!n.startsWith("did:") && n !== "Unknown Issuer") return n;
  }

  // B — credentialSubject-level issuerName / academy_name
  const cs = (cert as unknown as Record<string, unknown>).credentialSubject;
  if (cs && typeof cs === "object") {
    const obj = cs as Record<string, unknown>;
    for (const key of ["issuerName", "issuer_name", "academy_name"]) {
      const val = String(obj[key] ?? "");
      if (val && val !== "Unknown Issuer") return val;
    }
  }

  // C — issuer object on the cert entry (if raw payload survived through)
  const issuerObj = (cert as unknown as Record<string, unknown>).issuer;
  if (issuerObj && typeof issuerObj === "object") {
    const i = issuerObj as Record<string, unknown>;
    for (const key of ["displayName", "name", "displayName"]) {
      const val = String((i as Record<string, unknown>)[key] ?? "");
      if (val && val !== "Unknown Issuer") return val;
    }
  }

  // D — organization name fallback
  const orgCerts = cert as unknown as Record<string, unknown>;
  const org = orgCerts.organization as Record<string, unknown> | undefined;
  const orgName = String(org?.name ?? "");
  if (orgName && orgName !== "Unknown Issuer") return orgName;

  // E — resolve DID metadata display name (best-effort)
  if (cert.issuerName) {
    const didStr = cert.issuerName.trim();
    if (didStr.startsWith("did:")) {
      try {
        const parts = didStr.replace("did:", "").split(":");
        if (parts.length >= 2 && parts[1] === "web") {
          const hostParts = parts.slice(2).join(":").split("/");
          const hostname = hostParts[0]?.replace(/\.$/, "");
          if (hostname) {
            const display = hostname.replace(/[-.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return display;
          }
        }
      } catch {
        // ignore malformed DIDs
      }
    }
  }

  // F — final fallback
  return "Verifiable.sg";
}

export default function CertificateTemplateRenderer({ certificate, theme }: RendererProps) {
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
  const footerIssuerName = resolveTemplateIssuer(certificate.templateId);

  return (
    <div className="flex min-h-[297mm] w-full flex-col">
      <div className="flex-1">{content}</div>
      <div className="mt-8 flex items-end gap-6 border-t border-gray-200 pt-5 sm:gap-8">
        <div className="ml-auto text-xs text-gray-400">Certificate Issuer: {footerIssuerName}</div>
      </div>
    </div>
  );
}
