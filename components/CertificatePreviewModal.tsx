"use client";

import { useRef } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { CertEntry } from "../app/gallery/page";
import { CertificateTemplateRenderer, resolveTemplateId, TEMPLATE_OPTIONS } from "../app/templates";
import { formatDate } from "../lib/certificate";
import { buildVerificationUrl } from "../lib/site";
import CertificatePdfDownload from "./CertificatePdfDownload";

export default function CertificatePreviewModal({
  certificate,
  onClose,
}: {
  certificate: CertEntry;
  onClose: () => void;
}) {
  const certificatePreviewRef = useRef<HTMLDivElement>(null);
  const verificationUrl = buildVerificationUrl(
    typeof window === "undefined" ? "" : window.location.origin,
    certificate.id
  );
  const status = certificate.status.toLowerCase();
  const isValid = status === "valid" || status === "issued";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Certificate preview">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[92vh] overflow-auto">
        <div className="bg-gradient-to-r from-primary to-accent text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-secondary text-sm uppercase tracking-wider">{certificate.certificateType}</p>
              <h2 className="text-2xl font-bold mt-1">{certificate.recipientName}</h2>
            </div>
            <div className="flex items-start gap-3">
              <CertificatePdfDownload
                key={certificate.id ?? certificate.recipientName}
                certificateRef={certificatePreviewRef}
                recipientName={certificate.recipientName}
              />
              <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-2xl" aria-label="Close certificate preview">
                ×
              </button>
            </div>
          </div>
        </div>
        <div className="bg-gray-100 p-4 sm:p-8">
          <div className="mb-6 space-y-3">
            <div ref={certificatePreviewRef} className="mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white p-[14mm] text-gray-900 shadow-lg">
              <div className="flex-1">
                <CertificateTemplateRenderer certificate={{ ...certificate, verificationUrl }} />
              </div>
              <div className={`${resolveTemplateId(certificate.templateId) === "fta" ? "hidden" : "mt-8 flex"} items-end gap-6 border-t border-gray-200 pt-5`}>
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <QRCodeSVG value={verificationUrl} size={86} level="M" includeMargin />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Scan to verify</span>
                </div>
                <div className="min-w-0 flex-1 text-xs text-gray-500">
                  <p className="font-semibold text-gray-700">Digital signature and verification</p>
                  <div className="mt-5 max-w-xs border-b border-gray-500 pb-1 text-base italic text-gray-800">{certificate.issuerName}</div>
                  <p className="mt-1 font-medium text-gray-700">{certificate.issuerName}</p>
                  <p className="mt-1">Issued to {certificate.recipientName}</p>
                  <p className="mt-1 break-all">ID: {certificate.id || "N/A"}</p>
                  <p className="mt-1 break-all">{verificationUrl}</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              <p>Issued: {formatDate(certificate.issueDate)}</p>
              <p>Valid: {formatDate(certificate.validFrom)} to {certificate.validUntil ? formatDate(certificate.validUntil) : "N/A"}</p>
              <p>Template: {TEMPLATE_OPTIONS.find((t) => t.id === resolveTemplateId(certificate.templateId))?.label}</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Certificate ID</p>
              <p className="font-mono text-gray-800">{certificate.id || "N/A"}</p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <p className="flex items-center space-x-1">
                {isValid ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                <span className={`${isValid ? "text-green-700" : "text-red-700"} font-medium`}>
                  {isValid ? "Valid" : status.replace(/^\w/, (c) => c.toUpperCase())}
                </span>
              </p>
            </div>
            <div>
              <p className="text-gray-500">Recipient Email</p>
              <p className="text-gray-800">{certificate.recipientEmail}</p>
            </div>
            <div>
              <p className="text-gray-500">Issuer</p>
              <p className="text-gray-800">{certificate.issuerName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
