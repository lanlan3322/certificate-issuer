"use client";

import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function ModernTemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "dark";

  let bg: string;
  let textColor: string;
  if (t === "light") {
    bg = "rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 px-6 py-8 shadow-xl";
    textColor = "text-gray-900";
  } else if (t === "sepia") {
    bg = "rounded-lg border border-[#a08040] bg-gradient-to-br from-[#f5e6c8] via-[#dcb87a] to-[#b8860b] px-6 py-8 text-white shadow-xl";
    textColor = "text-white";
  } else {
    bg = "rounded-lg border border-sky-200 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-700 px-6 py-8 text-white shadow-xl";
    textColor = "text-white";
  }

  let badgeBg: string;
  if (t === "light") {
    badgeBg = "rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700";
  } else {
    badgeBg = "rounded-full bg-white/20 px-2 py-1 text-xs text-white";
  }

  let subtitleColor: string;
  if (t === "light") {
    subtitleColor = "text-blue-600";
  } else {
    subtitleColor = "text-sky-100";
  }

  return (
    <div className={bg}>
      <div className="flex items-start justify-between">
        <p className={`text-xs uppercase tracking-[0.25em] ${subtitleColor}`}>Digital Credential</p>
        <span className={badgeBg}>W3C VC</span>
      </div>
      <h3 className={`mt-4 text-2xl font-semibold ${textColor}`}>{certificate.certificateType}</h3>
      <p className={`mt-5 text-sm ${subtitleColor}`}>Awarded to</p>
      <p className={`mt-1 text-3xl font-bold ${textColor}`}>{certificate.recipientName}</p>
      <p className={`mt-5 max-w-xl text-sm ${subtitleColor}`}>{certificate.description}</p>
      <div className={`mt-6 border-t pt-3 text-xs ${subtitleColor === "text-blue-600" ? "border-gray-200 text-gray-600" : "border-white/20 text-sky-100"}`}>
        Issued by {certificate.issuerName}
      </div>
    </div>
  );
}
