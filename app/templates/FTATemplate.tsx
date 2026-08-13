"use client";

import { QRCodeSVG } from "qrcode.react";
import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function FTATemplate({ certificate }: TemplateProps) {
  return (
    <div className="flex min-h-[250mm] flex-col border-2 border-[#d9c46a] bg-white px-8 py-12 text-center shadow-sm sm:px-14 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="mb-16 flex items-center justify-center gap-7 border-b-2 border-gray-200 pb-8">
          <p className="text-7xl font-extrabold tracking-tight text-red-600 sm:text-8xl">FTA</p>
          <div className="h-20 w-0.5 bg-gray-300" />
          <p className="text-left text-3xl tracking-[0.2em] text-gray-500 sm:text-4xl">
            FINTECH<br />ACADEMY
          </p>
        </div>

        <p className="text-2xl italic text-gray-700">This is to certify that</p>
        <p className="mt-4 text-5xl font-bold italic leading-tight text-gray-900">{certificate.recipientName}</p>

        <p className="mt-14 text-2xl text-gray-700">has successfully completed the course</p>
        <p className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-tight text-gray-900">
          {certificate.description}
        </p>

        <p className="mt-7 text-2xl font-medium text-gray-700">({certificate.certificateType})</p>
        <p className="mt-3 text-xl text-gray-600">Accredited by IBF</p>
        <p className="mt-8 text-lg font-semibold text-gray-700">({certificate.id})</p>
        <p className="mt-4 text-lg text-gray-500">{certificate.issueDate}</p>

        <div className="mt-auto grid grid-cols-[auto_1fr_auto] items-end gap-8 border-t-2 border-gray-200 pt-10 sm:gap-12">
          <div className="flex flex-col items-center gap-3">
            {certificate.verificationUrl ? (
              <QRCodeSVG value={certificate.verificationUrl} size={128} level="M" includeMargin />
            ) : (
              <div className="h-[128px] w-[128px]" />
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scan to verify</p>
          </div>

          <div className="text-center">
            <p className="font-signature text-6xl text-blue-700">L. Koh</p>
            <div className="mx-auto mt-2 h-0.5 w-60 bg-gray-400" />
            <p className="mt-3 text-lg font-medium text-gray-800">Dr. Lillian Koh, Ph.D</p>
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
