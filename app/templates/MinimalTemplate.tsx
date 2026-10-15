"use client";

import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function MinimalTemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "sepia";

  const bg = t === "dark"
    ? "box-border flex h-full min-h-0 flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-slate-900 to-gray-900 px-8 py-12 text-center shadow-xl sm:px-14 sm:py-16"
    : t === "light"
      ? "box-border flex h-full min-h-0 flex-col items-center justify-center bg-white px-8 py-12 text-center shadow-lg sm:px-14 sm:py-16"
      : "box-border flex h-full min-h-0 flex-col items-center justify-center bg-white px-8 py-12 text-center shadow-sm sm:px-14 sm:py-16";

  const topAccent = t === "dark"
    ? "h-[1px] w-60 bg-gradient-to-r from-transparent via-amber-500 to-transparent"
    : t === "sepia"
      ? "h-[1px] w-60 bg-gradient-to-r from-transparent via-gray-200 to-transparent"
      : "h-[1px] w-60 bg-gradient-to-r from-transparent via-gray-300 to-transparent";

  const bottomAccent = t === "dark"
    ? "h-[1px] w-96 bg-gradient-to-r from-transparent via-slate-700 to-transparent"
      : t === "sepia"
        ? "h-[1px] w-96 bg-gray-200"
        : "h-[1px] w-96 bg-gray-300";

  const mainTextColor = t === "dark" ? "text-white" : "text-gray-900";
  const subtextColor = t === "dark" ? "text-gray-400" : "text-gray-500";

  return (
    <div className={bg}>
      {/* Top accent line */}
      <div className={`${topAccent} mb-8 w-full`} />

      {/* Content */}
      <p className={`mb-2 text-sm uppercase tracking-[0.3em] ${subtextColor}`}>Certificate of Completion</p>
      <h1 className={`mb-8 text-4xl font-extralight leading-tight tracking-wide ${mainTextColor}`}>{certificate.recipientName}</h1>

      <div className="space-y-6">
        <p className={`${subtextColor}`}>Successfully completed the program</p>
        <h2 className={`text-3xl font-light tracking-wide ${mainTextColor}`}>{certificate.description}</h2>
        <p className={`mt-4 text-xl font-medium ${t === "dark" ? "text-gray-300" : "text-gray-700"}`}>({certificate.certificateType})</p>
        <p className={`${subtextColor} text-lg`}>ID: {certificate.id}</p>
      </div>

      {/* Bottom accent line */}
      <div className={`mt-8 w-full ${bottomAccent}`} />
    </div>
  );
}
