"use client";

import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { formatDate } from "../../lib/certificate";
import { withBasePath } from "../../lib/site";
import { getCertificateTextDensity } from "./text-density";
import { CertificateTemplateData, Theme } from "./types";

interface TemplateProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

export default function FTATemplate({ certificate }: TemplateProps) {
  const { compact, dense, veryDense, extremelyDense } = getCertificateTextDensity(
    certificate.recipientName, certificate.description, certificate.certificateNo
  );
  const nameSize = extremelyDense ? "text-xs" : veryDense ? "text-sm" : dense ? "text-lg" : compact
    ? "text-3xl"
    : "text-4xl";
  const courseSize = extremelyDense ? "text-[10px]" : veryDense ? "text-xs" : dense ? "text-base" : compact
    ? "text-xl"
    : "text-3xl";
  const footerSpacing = dense ? "pt-4" : compact ? "pt-8" : "pt-16";

  return (
    <div className="box-border flex flex-1 flex-col border-2 border-[#d9c46a] bg-white px-12 py-10 text-center shadow-sm">
      <div className="mx-auto grid w-full max-w-3xl flex-1 grid-rows-[minmax(min-content,0.8fr)_auto_minmax(min-content,1.2fr)]">
        <div className="certificate-header mt-4 flex h-20 items-center justify-center gap-7 self-start">
          <p className="font-sans text-8xl font-extrabold leading-[0.82] tracking-[-0.06em] text-[#c8102e]">
            FTA
          </p>
          <div className="h-14 w-px bg-[#c9c9c9]" />
          <div className="text-left font-sans uppercase leading-[1.02]">
            <p className="text-3xl font-medium tracking-[0.2em] text-[#c8102e]">
              FINTECH
            </p>
            <p className="mt-1 text-3xl font-light tracking-[0.2em] text-[#929292]">
              ACADEMY
            </p>
          </div>
        </div>

        <div className="certificate-main flex min-w-0 flex-col items-center text-[#242424]">
          <p className="text-2xl italic">This is to certify that</p>
          <p className={`mt-0.5 max-w-full break-words font-bold italic leading-tight ${nameSize}`}>
            {certificate.recipientName}
          </p>

          <p className="mt-4 text-2xl italic text-[#4a4a4a]">
            has successfully completed the course
          </p>
          <p className={`mx-auto mt-2 max-w-2xl break-words font-bold ${compact ? "leading-tight" : "leading-[1.17]"} ${courseSize}`}>
            {certificate.description}
          </p>

          {certificate.courseLength != null && (
            <p className="mt-1.5 text-xl">({certificate.courseLength} hours)</p>
          )}
          <p className="mt-0.5 text-2xl">Accredited by <strong className="font-bold">IBF</strong></p>
          {certificate.certificateNo && (
            <p className={`mt-5 max-w-full break-all font-semibold ${extremelyDense ? "text-[10px] leading-tight" : veryDense ? "text-xs" : "text-base"}`}>
              ({certificate.certificateNo})
            </p>
          )}
          <p className="mt-2 text-base">{formatDate(certificate.issueDate)}</p>
        </div>

        <div className={`certificate-footer grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-end gap-4 self-end ${footerSpacing}`}>
          <div className="flex min-w-0 flex-col items-center gap-2">
            {certificate.verificationUrl && (
              <>
                <QRCodeSVG
                  value={certificate.verificationUrl}
                  size={128}
                  level="M"
                  includeMargin
                  role="img"
                  aria-label="Certificate verification QR code"
                  className="h-auto w-full max-w-[128px]"
                />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                  Scan to verify
                </p>
              </>
            )}
          </div>

          <div className="min-w-0 text-center text-[#111827]">
            <Image
              src={withBasePath("/fta-signature.png")}
              alt="Dr. Lillian Koh's signature"
              width={200}
              height={68}
              className="mx-auto h-16 w-48 max-w-full object-contain"
            />
            <div className="mx-auto mt-1 h-0.5 w-48 max-w-full bg-gray-400" />
            <p className="mt-2 text-lg font-medium leading-tight">
              Dr. Lillian Koh, Ph.D
            </p>
            <p className="text-base leading-tight">CEO, Fintech Academy</p>
            <p className="mt-1 text-base font-bold">{formatDate(certificate.signedDate ?? certificate.issueDate)}</p>
          </div>

          <Image
            src={withBasePath("/fta-seal.png")}
            alt="Fintech Academy certificate seal"
            width={170}
            height={172}
            loading="eager"
            className="mx-auto h-auto w-44 max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
