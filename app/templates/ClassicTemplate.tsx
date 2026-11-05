"use client";

import { getCertificateTextDensity } from "./text-density";
import { formatDate } from "../../lib/certificate";
import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function ClassicTemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "light";
  const { compact, dense, veryDense, extremelyDense } = getCertificateTextDensity(
    certificate.recipientName, certificate.certificateType, certificate.description, certificate.issuerName
  );
  const titleSize = veryDense ? "text-sm" : dense ? "text-lg" : "text-2xl";
  const nameSize = extremelyDense ? "text-xs" : veryDense ? "text-sm" : dense ? "text-lg" : compact ? "text-2xl" : "text-3xl";
  const descriptionSize = extremelyDense ? "text-[10px] leading-tight" : veryDense ? "text-xs" : "text-sm";

  let bg: string;
  if (t === "dark") {
    bg = "rounded-lg border border-slate-600 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-center shadow-inner";
  } else if (t === "sepia") {
    bg = "rounded-lg border-4 border-[#c9a84c] bg-gradient-to-b from-[#fdf5e6] via-[#f5eed6] to-[#e8d5a3] text-center shadow-inner";
  } else {
    bg = "rounded-lg border-4 border-amber-300 bg-gradient-to-b from-amber-50 via-white to-amber-100 text-center shadow-inner";
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
    <div className={`${bg} ${extremelyDense ? "px-5 py-4" : "px-6 py-8"} break-words`}>
      <p className={`text-xs uppercase tracking-[0.25em] ${accentColor}`}>Certificate Issuer</p>
      <h3 className={`mt-3 font-bold ${titleSize} ${titleColor}`}>{certificate.certificateType}</h3>
      <p className={`mt-4 text-sm ${bodyColor}`}>Presented to</p>
      <p className={`mt-2 font-semibold ${nameSize} ${nameColor}`}>{certificate.recipientName}</p>
      {certificate.description && (
        <p className={`${extremelyDense ? "mt-2" : "mt-4"} italic ${descriptionSize} ${bodyColor}`}>"{certificate.description}"</p>
      )}
      <p className={`${extremelyDense ? "mt-3" : "mt-6"} text-xs ${accentColor}`}>Issued by {certificate.issuerName}</p>
      <p className="mt-1 text-xs">{formatDate(certificate.issueDate)}</p>
    </div>
  );
}
