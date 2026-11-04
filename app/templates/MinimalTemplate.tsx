"use client";

import { getCertificateTextDensity } from "./text-density";
import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function MinimalTemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "sepia";
  const { compact, dense, veryDense, extremelyDense } = getCertificateTextDensity(
    certificate.recipientName, certificate.certificateType, certificate.description, certificate.id
  );
  const nameSize = extremelyDense ? "text-xs" : veryDense ? "text-sm" : dense ? "text-lg" : compact ? "text-2xl" : "text-4xl";
  const descriptionSize = extremelyDense ? "text-[10px] leading-tight" : veryDense ? "text-xs" : dense ? "text-base" : compact ? "text-xl" : "text-3xl";
  const typeSize = veryDense ? "text-xs" : dense ? "text-base" : "text-xl";
  const padding = dense
    ? "px-8 py-5"
    : "px-14 py-16";

  const bg = t === "dark"
    ? "box-border flex w-full flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-slate-900 to-gray-900 text-center shadow-xl"
    : t === "light"
      ? "box-border flex w-full flex-col items-center justify-center bg-white text-center shadow-lg"
      : "box-border flex w-full flex-col items-center justify-center bg-white text-center shadow-sm";

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
    <div className={`${bg} ${padding} break-words`}>
      {/* Top accent line */}
      <div className={`${topAccent} ${dense ? "mb-4" : "mb-8"} w-full`} />

      {/* Content */}
      <p className={`mb-2 text-sm uppercase tracking-[0.3em] ${subtextColor}`}>Certificate of Completion</p>
      <h1 className={`${dense ? "mb-4" : "mb-8"} max-w-full font-extralight leading-tight tracking-wide ${nameSize} ${mainTextColor}`}>{certificate.recipientName}</h1>

      <div className={`max-w-full ${dense ? "space-y-3" : "space-y-6"}`}>
        <p className={`${subtextColor}`}>Successfully completed the program</p>
        <h2 className={`font-light tracking-wide ${descriptionSize} ${mainTextColor}`}>{certificate.description}</h2>
        <p className={`mt-4 font-medium ${typeSize} ${t === "dark" ? "text-gray-300" : "text-gray-700"}`}>({certificate.certificateType})</p>
        <p className={`${subtextColor} break-all ${dense ? "text-sm" : "text-lg"}`}>ID: {certificate.id}</p>
      </div>

      {/* Bottom accent line */}
      <div className={`${dense ? "mt-4" : "mt-8"} w-full ${bottomAccent}`} />
    </div>
  );
}
