"use client";

import Image from "next/image";
import { formatDate } from "../../lib/certificate";
import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function FTATemplate({ certificate }: TemplateProps) {
  return (
    <div className="box-border flex h-full min-h-0 flex-col border-2 border-[#d9c46a] bg-white px-6 py-8 text-center shadow-sm sm:px-12 sm:py-10">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <div className="mt-4 mb-20 flex h-20 shrink-0 items-center justify-center gap-5 sm:mb-24 sm:gap-7">
          <p className="font-sans text-7xl font-extrabold leading-[0.82] tracking-[-0.06em] text-[#c8102e] sm:text-8xl">
            FTA
          </p>
          <div className="h-14 w-px bg-[#c9c9c9]" />
          <div className="text-left font-sans uppercase leading-[1.02]">
            <p className="text-2xl font-medium tracking-[0.2em] text-[#c8102e] sm:text-3xl">
              FINTECH
            </p>
            <p className="mt-1 text-2xl font-light tracking-[0.2em] text-[#929292] sm:text-3xl">
              ACADEMY
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center text-[#242424]">
          <p className="text-xl italic sm:text-2xl">This is to certify that</p>
          <p className="mt-2 text-3xl font-bold italic leading-tight sm:text-4xl">
            {certificate.recipientName}
          </p>

          <p className="mt-5 text-lg italic text-[#4a4a4a] sm:mt-6 sm:text-2xl">
            has successfully completed the course
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-2xl font-bold leading-tight sm:text-3xl">
            {certificate.description}
          </p>

          {certificate.courseLength != null && (
            <p className="mt-2 text-lg sm:text-xl">({certificate.courseLength} hours)</p>
          )}
          <p className="mt-1 text-lg sm:text-xl">Accredited by IBF</p>
          {certificate.certificateNo && (
            <p className="mt-4 text-sm font-semibold sm:text-base">({certificate.certificateNo})</p>
          )}
          <p className="mt-3 text-sm sm:text-base">{formatDate(certificate.issueDate)}</p>
        </div>

        <div className="mt-auto grid shrink-0 grid-cols-[minmax(0,1.2fr)_minmax(112px,0.8fr)] items-end gap-3 pt-16 sm:gap-6">
          <div className="min-w-0 text-center">
            <Image
              src="/fta-signature.png"
              alt="Dr. Lillian Koh's signature"
              width={200}
              height={68}
              className="mx-auto h-14 w-44 object-contain sm:h-16 sm:w-48"
            />
            <div className="mx-auto mt-1 h-0.5 w-48 max-w-full bg-gray-400" />
            <p className="mt-2 text-base font-medium leading-tight sm:text-lg">
              Dr. Lillian Koh, Ph.D
            </p>
            <p className="text-sm leading-tight sm:text-base">CEO, Fintech Academy</p>
            <p className="mt-1 text-sm font-bold sm:text-base">{formatDate(certificate.issueDate)}</p>
          </div>

          <div className="relative mx-auto flex aspect-square w-28 items-center justify-center rounded-full border-[9px] border-[#a70814] bg-[radial-gradient(circle_at_35%_30%,#ee4142,#c8102e_58%,#a00813)] text-center text-[#f4a1a1] shadow-[inset_0_2px_8px_rgba(80,0,0,0.45)] sm:w-36 sm:border-[11px]">
            <div className="absolute inset-2 rounded-full border border-[#8f0711]/60" />
            <p className="relative px-2 text-[9px] font-semibold uppercase leading-relaxed tracking-[0.12em] sm:text-[10px]">
              Fintech
              <br />
              Academy
              <br />
              Certified
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
