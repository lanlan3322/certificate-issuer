"use client";

import { getCertificateTextDensity } from "./text-density";
import { formatDate } from "../../lib/certificate";
import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function ModernTemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "dark";
  const { compact, dense, veryDense, extremelyDense } = getCertificateTextDensity(
    certificate.recipientName, certificate.certificateType, certificate.description, certificate.issuerName
  );
  const titleSize = veryDense ? "text-sm" : dense ? "text-lg" : "text-2xl";
  const nameSize = extremelyDense ? "text-xs" : veryDense ? "text-sm" : dense ? "text-lg" : compact ? "text-2xl" : "text-3xl";
  const descriptionSize = extremelyDense ? "text-[10px] leading-tight" : veryDense ? "text-xs" : "text-sm";

  let bg: string;
  let textColor: string;
  if (t === "light") {
    bg = "rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 shadow-xl";
    textColor = "text-gray-900";
  } else if (t === "sepia") {
    bg = "rounded-lg border border-[#a08040] bg-gradient-to-br from-[#f5e6c8] via-[#dcb87a] to-[#b8860b] text-white shadow-xl";
    textColor = "text-white";
  } else {
    bg = "rounded-lg border border-sky-200 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-700 text-white shadow-xl";
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
    <div className={`${bg} ${extremelyDense ? "px-5 py-4" : "px-6 py-8"} break-words text-center`}>
      <div className="flex items-start justify-between gap-4">
        <p className={`text-xs uppercase tracking-[0.25em] ${subtitleColor}`}>Digital Credential</p>
        <span className={`${badgeBg} shrink-0`}>W3C VC</span>
      </div>
      <h3 className={`mt-4 font-semibold ${titleSize} ${textColor}`}>{certificate.certificateType}</h3>
      <p className={`mt-5 text-sm ${subtitleColor}`}>Awarded to</p>
      <p className={`mt-1 font-bold ${nameSize} ${textColor}`}>{certificate.recipientName}</p>
      <p className={`mx-auto ${extremelyDense ? "mt-2" : "mt-5"} max-w-xl ${descriptionSize} ${subtitleColor}`}>{certificate.description}</p>
      <div className={`${extremelyDense ? "mt-3 pt-2" : "mt-6 pt-3"} border-t text-xs ${subtitleColor === "text-blue-600" ? "border-gray-200 text-gray-600" : "border-white/20 text-sky-100"}`}>
        Issued by {certificate.issuerName}
        <p className="mt-1">{formatDate(certificate.issueDate)}</p>
      </div>
    </div>
  );
}
