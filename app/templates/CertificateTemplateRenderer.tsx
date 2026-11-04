"use client";

import { QRCodeSVG } from "qrcode.react";
import CertificatePaper from "./CertificatePaper";
import ClassicTemplate from "./ClassicTemplate";
import FTATemplate from "./FTATemplate";
import MinimalTemplate from "./MinimalTemplate";
import ModernTemplate from "./ModernTemplate";
import { resolveTemplateId, resolveTemplateIssuer } from "./registry";
import { getCertificateTextDensity } from "./text-density";
import { CertificateTemplateData, Theme } from "./types";

interface RendererProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
  footerIssuerName?: string;
  verificationFooterUrl?: string;
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
  verificationFooterUrl,
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
  const footerIsDense = getCertificateTextDensity(
    certificate.recipientName, certificate.issuerName, certificate.id, verificationFooterUrl
  ).dense;

  return (
    <CertificatePaper
      className={templateId === "fta"
        ? "fta-certificate-paper flex flex-col p-[8mm]"
        : "grid grid-rows-[minmax(min-content,1fr)_auto_minmax(min-content,1fr)] p-[14mm] text-gray-900"}
    >
      {templateId === "fta" ? (
        <div className="flex flex-1 flex-col">{content}</div>
      ) : (
        <>
          <div className="certificate-main col-start-1 row-start-2 min-w-0 text-center">{content}</div>
          <div className="certificate-footer col-start-1 row-start-3 min-w-0 self-end">
            <div className={`flex items-end gap-8 border-t border-gray-200 ${verificationFooterUrl === undefined ? "mt-8 pt-5" : "mt-4 pt-3"}`}>
              <div className="ml-auto break-words text-xs text-gray-400">Certificate Issued By: {footerIssuerName}</div>
            </div>
            {verificationFooterUrl !== undefined && (
              <div className="mt-3 flex items-end gap-6">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <QRCodeSVG
                    value={verificationFooterUrl}
                    size={86}
                    level="M"
                    includeMargin
                    role="img"
                    aria-label="Certificate verification QR code"
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Scan to verify</span>
                </div>
                <div className={`min-w-0 flex-1 break-words text-gray-500 ${footerIsDense ? "text-[9px] leading-tight" : "text-xs"}`}>
                  <p className="font-semibold text-gray-700">Digital signature and verification</p>
                  <div className={`max-w-xs border-b border-gray-500 pb-1 italic text-gray-800 ${footerIsDense ? "mt-2 text-sm" : "mt-5 text-base"}`}>
                    {certificate.issuerName}
                  </div>
                  <p className={`${footerIsDense ? "" : "mt-1"} font-medium text-gray-700`}>{certificate.issuerName}</p>
                  <p className={footerIsDense ? "" : "mt-1"}>Issued to {certificate.recipientName}</p>
                  <p className={`${footerIsDense ? "" : "mt-1"} break-all`}>ID: {certificate.id || "N/A"}</p>
                  <p className={`${footerIsDense ? "" : "mt-1"} break-all`}>{verificationFooterUrl}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </CertificatePaper>
  );
}
