"use client";

import { QRCodeSVG } from "qrcode.react";
import { formatDate } from "../../lib/certificate";
import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function FTATemplate({ certificate, theme }: TemplateProps) {
  const t = theme ?? "sepia";

  const bg = t === "dark"
    ? "box-border flex h-full min-h-0 flex-col border-2 border-[#e8c85a] bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 px-8 py-10 text-center shadow-xl sm:px-14 sm:py-12"
    : t === "light"
      ? "box-border flex h-full min-h-0 flex-col border-2 border-[#a89040] bg-white px-8 py-10 text-center shadow-sm sm:px-14 sm:py-12"
      : "box-border flex h-full min-h-0 flex-col border-2 border-[#d9c46a] bg-white px-8 py-10 text-center shadow-sm sm:px-14 sm:py-12";

  const accentColor = t === "dark" ? "#f0e68c" : "#d71920";
  const dividerLine = t === "dark"
    ? "h-16 w-0.5 self-center bg-slate-600"
    : t === "sepia"
      ? "h-16 w-0.5 self-center bg-[#c9c9c9]"
      : "h-16 w-0.5 self-center bg-gray-300";

  const subtextColor = t === "dark" ? "text-gray-300" : "text-gray-600";
  const darkText = t === "dark" ? "text-white" : "text-gray-900";
  const bodyTextColor = t === "dark" ? "text-white" : subtextColor;

  return (
    <div className={bg}>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <div className="mb-12 grid h-24 shrink-0 grid-cols-[auto_2px_auto] items-center justify-center gap-8">
          <p className="relative -top-2 flex h-full items-center font-sans text-8xl font-extrabold leading-[0.82] tracking-[-0.06em]" style={{ color: accentColor }}>
            FTA
          </p>
          <div className={dividerLine} />
          <div className="relative -top-1 flex h-full flex-col justify-center text-left font-sans uppercase leading-[1.02]">
            <p className="text-4xl font-medium tracking-[0.24em]" style={{ color: accentColor }}>
              FINTECH
            </p>
            <p className={`mt-2 text-4xl font-light tracking-[0.24em] ${t === "dark" ? "text-gray-400" : "text-[#929292]"}`}>
              ACADEMY
            </p>
          </div>
        </div>

        <p className={`text-2xl italic ${subtextColor}`}>This is to certify that</p>
        <p className={`mt-4 text-5xl font-bold italic leading-tight ${darkText}`}>{certificate.recipientName}</p>

        <p className={`mt-10 text-2xl ${subtextColor}`}>has successfully completed the course</p>
        <p className={`mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight ${darkText}`}>
          {certificate.description}
        </p>

        <p className={`mt-6 text-2xl font-medium ${subtextColor}`}>(<span style={{ color: accentColor }}>{certificate.certificateType}</span>)</p>
        <p className="mt-3 text-xl text-gray-600">
          ({certificate.courseLength && <> · {certificate.courseLength}</>} hours)
        </p>
        <p className="mt-3 text-xl text-gray-600">Accredited by IBF</p>
        {certificate.certificateNo && <p className={`mt-2 text-lg ${t === "dark" ? "text-gray-400" : "text-gray-500"}`}>( {certificate.certificateNo} )</p>}
        <p className={`mt-4 text-lg ${t === "dark" ? "text-gray-400" : "text-gray-500"}`}>{formatDate(certificate.issueDate)}</p>

        <div className={`mt-10 grid shrink-0 grid-cols-[128px_minmax(0,1fr)_160px] items-end gap-6 border-t-2 ${t === "dark" ? "border-slate-700" : "border-gray-200"} pt-8 sm:gap-8`}>
          <div className="flex flex-col items-center gap-3">
            {certificate.verificationUrl ? (
              <QRCodeSVG value={certificate.verificationUrl} size={128} level="M" includeMargin />
            ) : (
              <div className="h-[128px] w-[128px]" />
            )}
            <p className={`text-xs font-semibold uppercase tracking-wider ${subtextColor}`}>Scan to verify</p>
          </div>

          <div className="min-w-0 text-center">
            <p className="font-signature text-6xl leading-none text-blue-700">L. Koh</p>
            <div className={`mx-auto mt-4 h-0.5 w-48 ${t === "dark" ? "bg-slate-500" : "bg-gray-400"}`} />
            <p className={`mt-3 text-lg font-medium leading-tight ${darkText}`}>Dr. Lillian Koh, Ph.D</p>
            <p className="text-base text-gray-600">CEO, Fintech Academy</p>
            <p className={`mt-2 whitespace-nowrap text-base ${subtextColor}`}>{formatDate(certificate.issueDate)}</p>
          </div>

          <div className={`flex h-40 w-40 items-center justify-center rounded-full border-[12px] ${t === "dark" ? "border-[#f0e68c] bg-gradient-to-br from-[#d4a730] to-[#b8860b] text-slate-900 shadow-inner]" : "border-red-700 bg-red-600/90 text-red-100 shadow-inner"} text-center text-xs font-semibold uppercase tracking-widest`}>
            Certificate
          </div>
        </div>
      </div>
    </div>
  );
}
