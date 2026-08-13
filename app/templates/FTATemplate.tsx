"use client";

import { QRCodeSVG } from "qrcode.react";
import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function FTATemplate({ certificate }: TemplateProps) {
  return (
    <div className="border-2 border-[#d9c46a] bg-white px-6 py-8 text-center shadow-sm sm:px-10 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-12 flex items-center justify-center gap-5 border-b border-gray-200 pb-6">
          <p className="text-5xl font-extrabold tracking-tight text-red-600">FTA</p>
          <div className="h-14 w-px bg-gray-300" />
          <p className="text-left text-xl tracking-[0.2em] text-gray-500 sm:text-2xl">
            FINTECH<br />ACADEMY
          </p>
        </div>

        <p className="text-lg italic text-gray-700">This is to certify that</p>
        <p className="mt-2 text-3xl font-bold italic text-gray-900 sm:text-4xl">{certificate.recipientName}</p>

        <p className="mt-8 text-lg text-gray-700">has successfully completed the course</p>
        <p className="mx-auto mt-3 max-w-xl text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
          {certificate.description}
        </p>

        <p className="mt-4 text-lg font-medium text-gray-700">({certificate.certificateType})</p>
        <p className="mt-2 text-base text-gray-600">Accredited by IBF</p>
        <p className="mt-5 text-sm font-semibold text-gray-700">({certificate.id})</p>
        <p className="mt-3 text-sm text-gray-500">{certificate.issueDate}</p>

        <div className="mt-16 grid grid-cols-[auto_1fr_auto] items-end gap-4 border-t border-gray-200 pt-6 sm:gap-8">
          <div className="flex flex-col items-center gap-2">
            {certificate.verificationUrl ? (
              <QRCodeSVG value={certificate.verificationUrl} size={82} level="M" includeMargin />
            ) : (
              <div className="h-[82px] w-[82px]" />
            )}
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">Verify</p>
          </div>

          <div className="text-center">
            <p className="font-signature text-4xl text-blue-700">L. Koh</p>
            <div className="mt-1 h-px w-44 bg-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-800">Dr. Lillian Koh, Ph.D</p>
            <p className="text-sm text-gray-600">CEO, Fintech Academy</p>
            <p className="mt-1 text-sm text-gray-700">{certificate.issueDate}</p>
          </div>

          <div className="flex h-28 w-28 items-center justify-center rounded-full border-[9px] border-red-700 bg-red-600/90 text-center text-[10px] font-semibold uppercase tracking-widest text-red-100 shadow-inner sm:h-32 sm:w-32">
            Certificate
          </div>
        </div>
      </div>
    </div>
  );
}
