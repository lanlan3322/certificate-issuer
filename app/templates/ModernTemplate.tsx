"use client";

import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function ModernTemplate({ certificate }: TemplateProps) {
  return (
    <div className="rounded-lg border border-sky-200 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-700 px-6 py-8 text-white shadow-xl">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-[0.25em] text-sky-100">Digital Credential</p>
        <span className="rounded-full bg-white/20 px-2 py-1 text-xs">W3C VC</span>
      </div>
      <h3 className="mt-4 text-2xl font-semibold">{certificate.certificateType}</h3>
      <p className="mt-5 text-sm text-sky-100">Awarded to</p>
      <p className="mt-1 text-3xl font-bold">{certificate.recipientName}</p>
      <p className="mt-5 max-w-xl text-sm text-sky-100">{certificate.description}</p>
      <div className="mt-6 border-t border-white/20 pt-3 text-xs text-sky-100">
        Issued by {certificate.issuerName}
      </div>
    </div>
  );
}
