"use client";

import { QRCodeSVG } from "qrcode.react";
import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function FTATemplate({ certificate }: TemplateProps) {
  return (
    <div className="box-border flex h-full min-h-0 flex-col border-2 border-[#d9c46a] bg-white px-8 py-10 text-center shadow-sm sm:px-14 sm:py-12">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <div className="mb-12 grid h-24 shrink-0 grid-cols-[auto_2px_auto] items-center justify-center gap-8">
          <p className="relative -top-2 flex h-full items-center font-sans text-8xl font-extrabold leading-[0.82] tracking-[-0.06em] text-[#d71920]">
            FTA
          </p>
          <div className="h-[5.25rem] w-0.5 self-center bg-[#c9c9c9]" />
          <div className="flex h-full flex-col justify-center text-left font-sans uppercase leading-[1.02]">
            <p className="text-4xl font-medium tracking-[0.24em] text-[#d71920]">
              FINTECH
            </p>
            <p className="mt-2 text-4xl font-light tracking-[0.24em] text-[#929292]">
              ACADEMY
            </p>
          </div>
        </div>

        <p className="text-2xl italic text-gray-700">This is to certify that</p>
        <p className="mt-4 text-5xl font-bold italic leading-tight text-gray-900">{certificate.recipientName}</p>

        <p className="mt-10 text-2xl text-gray-700">has successfully completed the course</p>
        <p className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight text-gray-900">
          {certificate.description}
        </p>

        <p className="mt-6 text-2xl font-medium text-gray-700">({certificate.certificateType})</p>
        <p className="mt-3 text-xl text-gray-600">Accredited by IBF</p>
        <p className="mt-6 text-lg font-semibold text-gray-700">({certificate.id})</p>
        <p className="mt-4 text-lg text-gray-500">{certificate.issueDate}</p>

        <div className="mt-10 grid shrink-0 grid-cols-[auto_1fr_auto] items-end gap-8 border-t-2 border-gray-200 pt-8 sm:gap-12">
          <div className="flex flex-col items-center gap-3">
            {certificate.verificationUrl ? (
              <QRCodeSVG value={certificate.verificationUrl} size={128} level="M" includeMargin />
            ) : (
              <div className="h-[128px] w-[128px]" />
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scan to verify</p>
          </div>

          <div className="text-center">
            <p className="font-signature text-6xl leading-none text-blue-700">L. Koh</p>
            <div className="mx-auto mt-1 h-0.5 w-48 bg-gray-400" />
            <p className="mt-3 text-lg font-medium leading-tight text-gray-800">Dr. Lillian Koh, Ph.D</p>
            <p className="text-base text-gray-600">CEO, Fintech Academy</p>
            <p className="mt-2 text-base text-gray-700">{certificate.issueDate}</p>
          </div>

          <div className="flex h-40 w-40 items-center justify-center rounded-full border-[12px] border-red-700 bg-red-600/90 text-center text-xs font-semibold uppercase tracking-widest text-red-100 shadow-inner">
            Certificate
          </div>
        </div>
      </div>
    </div>
  );
}
