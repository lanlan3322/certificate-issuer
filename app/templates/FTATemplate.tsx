"use client";

import { CertificateTemplateData } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
}

export default function FTATemplate({ certificate }: TemplateProps) {
  return (
    <div className="rounded-lg border-2 border-amber-300 bg-white p-6 shadow-sm md:p-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-8 border-b border-gray-200 pb-5">
          <p className="text-4xl font-extrabold tracking-tight text-red-600">FTA</p>
          <p className="mt-1 text-sm tracking-[0.24em] text-gray-500 md:text-base">FINTECH ACADEMY</p>
        </div>

        <p className="text-lg italic text-gray-700">This is to certify that</p>
        <p className="mt-2 text-3xl font-semibold italic text-gray-900">{certificate.recipientName}</p>

        <p className="mt-6 text-lg text-gray-700">has successfully completed the course</p>
        <p className="mx-auto mt-3 max-w-xl text-3xl font-semibold leading-tight text-gray-900 md:text-4xl">
          {certificate.description}
        </p>

        <p className="mt-4 text-xl text-gray-700">({certificate.certificateType})</p>
        <p className="mt-2 text-sm text-gray-500">Issued on {certificate.issueDate}</p>

        <div className="mt-10 grid grid-cols-1 gap-6 border-t border-gray-200 pt-6 md:grid-cols-2 md:items-end">
          <div className="text-left">
            <p className="font-signature text-4xl text-blue-700">L. Koh</p>
            <div className="mt-1 h-px w-44 bg-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-800">Dr. Lillian Koh, Ph.D</p>
            <p className="text-sm text-gray-600">CEO, Fintech Academy</p>
          </div>

          <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-[10px] border-red-700 bg-red-600/90 text-center text-[10px] font-semibold uppercase tracking-widest text-red-100 shadow-inner md:ml-auto md:mr-0">
            Certificate
          </div>
        </div>
      </div>
    </div>
  );
}
