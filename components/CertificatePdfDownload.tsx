"use client";

import { useState, type RefObject } from "react";
import { Download, Loader2 } from "lucide-react";

export async function downloadCertificatePdf(element: HTMLElement, recipientName: string) {
  await document.fonts.ready;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const paper = element.matches(".certificate-a4-paper")
    ? element
    : element.querySelector<HTMLElement>(".certificate-a4-paper");
  const canvas = await html2canvas(paper ?? element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    ...(paper ? { windowWidth: Math.ceil((210 / 25.4) * 96) } : {}),
    onclone: (clonedDocument, clonedElement) => {
      clonedDocument.documentElement.classList.remove("dark");
      if (paper) {
        clonedElement.style.width = "210mm";
        clonedElement.style.maxWidth = "none";
        clonedElement.style.position = "static";
        clonedElement.style.transform = "none";
        const viewport = clonedElement.closest<HTMLElement>(".certificate-a4-viewport");
        if (viewport) {
          viewport.style.width = "210mm";
          viewport.style.maxWidth = "none";
          viewport.style.height = "auto";
          viewport.style.overflow = "visible";
        }
      }
    },
  });
  if (!canvas.width || !canvas.height) {
    throw new Error("Certificate preview has no printable content.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG",
    (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  const fileName = recipientName.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "recipient";
  pdf.save(`certificate-${fileName}.pdf`);
}

interface CertificatePdfDownloadProps {
  certificateRef: RefObject<HTMLElement>;
  recipientName: string;
}

export default function CertificatePdfDownload({ certificateRef, recipientName }: CertificatePdfDownloadProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (downloading) return;
    setError(null);
    setDownloading(true);
    try {
      if (!certificateRef.current) throw new Error("Certificate preview is not available.");
      await downloadCertificatePdf(certificateRef.current, recipientName);
    } catch (cause) {
      setError(`Unable to download PDF: ${cause instanceof Error ? cause.message : "Unknown error"}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {downloading ? "Preparing..." : "Download PDF"}
      </button>
      {error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-600">{error}</p>}
    </div>
  );
}
