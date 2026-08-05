"use client";

import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function MinimalTemplate({ certificate }: TemplateProps) {
  return (
    <div className="rounded-lg border border-gray-300 bg-white px-6 py-8 text-gray-900 shadow-sm">
      <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Certificate</p>
      <h3 className="mt-3 text-2xl font-semibold">{certificate.certificateType}</h3>
      <div className="mt-6 h-px w-full bg-gray-200" />
      <p className="mt-5 text-sm text-gray-600">Recipient</p>
      <p className="text-2xl font-semibold">{certificate.recipientName}</p>
      <p className="mt-5 text-sm text-gray-600">Achievement</p>
      <p className="text-sm text-gray-800">{certificate.description}</p>
      <p className="mt-6 text-xs text-gray-500">Issued by {certificate.issuerName}</p>
    </div>
  );
}
