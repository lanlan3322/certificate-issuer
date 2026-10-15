"use client";

import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function ClassicTemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "light";

  let bg: string;
  if (t === "dark") {
    bg = "rounded-lg border border-slate-600 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-center shadow-inner";
  } else if (t === "sepia") {
    bg = "rounded-lg border-4 border-[#c9a84c] bg-gradient-to-b from-[#fdf5e6] via-[#f5eed6] to-[#e8d5a3] px-6 py-8 text-center shadow-inner";
  } else {
    bg = "rounded-lg border-4 border-amber-300 bg-gradient-to-b from-amber-50 via-white to-amber-100 px-6 py-8 text-center shadow-inner";
  }

  let titleColor: string;
  if (t === "dark") {
    titleColor = "text-slate-200";
  } else if (t === "sepia") {
    titleColor = "text-[#5c4a1e]";
  } else {
    titleColor = "text-amber-900";
  }

  let bodyColor: string;
  if (t === "dark") {
    bodyColor = "text-slate-300";
  } else if (t === "sepia") {
    bodyColor = "text-[#6b5a2f]";
  } else {
    bodyColor = "text-amber-900";
  }

  let accentColor: string;
  if (t === "dark") {
    accentColor = "text-slate-400";
  } else if (t === "sepia") {
    accentColor = "text-[#8b7332]";
  } else {
    accentColor = "text-amber-700";
  }

  let nameColor: string;
  if (t === "dark") {
    nameColor = "text-slate-100";
  } else if (t === "sepia") {
    nameColor = "text-[#4a3a0e]";
  } else {
    nameColor = "text-amber-800";
  }

  return (
    <div className={bg}>
      <p className={`text-xs uppercase tracking-[0.25em] ${accentColor}`}>Certificate Issuer</p>
      <h3 className={`mt-3 text-2xl font-bold ${titleColor}`}>{certificate.certificateType}</h3>
      <p className={`mt-4 text-sm ${bodyColor}`}>Presented to</p>
      <p className={`mt-2 text-3xl font-semibold ${nameColor}`}>{certificate.recipientName}</p>
      {certificate.description && (
        <p className={`mt-4 text-sm italic ${bodyColor}`}>"{certificate.description}"</p>
      )}
      <p className={`mt-6 text-xs ${accentColor}`}>Issued by {certificate.issuerName}</p>
    </div>
  );
}
