"use client";

import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function ClassicTemplate({ certificate }: TemplateProps) {
  return (
    <div className="rounded-lg border-4 border-amber-300 bg-gradient-to-b from-amber-50 via-white to-amber-100 px-6 py-8 text-center shadow-inner">
      <p className="text-xs uppercase tracking-[0.25em] text-amber-700">Certificate Issuer</p>
      <h3 className="mt-3 text-2xl font-bold text-amber-900">{certificate.certificateType}</h3>
      <p className="mt-4 text-sm text-amber-900">Presented to</p>
      <p className="mt-2 text-3xl font-semibold text-amber-800">{certificate.recipientName}</p>
      <p className="mt-4 text-sm italic text-amber-900">&quot;{certificate.description}&quot;</p>
      <p className="mt-6 text-xs text-amber-700">Issued by {certificate.issuerName}</p>
    </div>
  );
}
