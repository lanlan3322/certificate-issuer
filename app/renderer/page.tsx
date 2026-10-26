"use client";

import { connectToParent } from "penpal";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import CertificateTemplateRenderer from "../templates/CertificateTemplateRenderer";
import { resolveTemplateIssuer } from "../templates/registry";
import { buildVerificationUrl, withBasePath } from "../../lib/site";
import { getRendererTemplates, toCertificateTemplateData } from "./certificateView";

type FrameAction = { type: string; payload?: unknown };
type HostConnection = { dispatch?: (action: FrameAction) => unknown };

declare global {
  interface Window {
    openAttestation?: (action: FrameAction) => unknown;
  }
}

/**
 * Embedded renderer for TradeTrust and OpenCerts. Hosts load this page in an
 * iframe (selected by the credential's signed renderMethod) and drive it via
 * the decentralized-renderer penpal protocol.
 */
export default function EmbeddedRendererPage() {
  const [document, setDocument] = useState<unknown>();
  const [origin, setOrigin] = useState("");
  const [embedded, setEmbedded] = useState(true);
  const host = useRef<HostConnection>({});
  const container = useRef<HTMLDivElement>(null);

  const toHost = useCallback((action: FrameAction) => {
    void host.current.dispatch?.(action);
  }, []);

  const dispatch = useCallback((action: FrameAction) => {
    if (action.type === "RENDER_DOCUMENT") {
      const payload = (action.payload ?? {}) as { document?: unknown };
      setDocument(payload.document);
      toHost({ type: "UPDATE_TEMPLATES", payload: getRendererTemplates(payload.document) });
      return undefined;
    }
    if (action.type === "GET_TEMPLATES") {
      const templates = getRendererTemplates(action.payload);
      toHost({ type: "UPDATE_TEMPLATES", payload: templates });
      return templates;
    }
    if (action.type === "PRINT") {
      window.print();
      return undefined;
    }
    // Only one template exists per certificate, so SELECT_TEMPLATE needs no state change.
    if (action.type === "SELECT_TEMPLATE") return undefined;
    throw new Error(`Action ${action.type} is not handled`);
  }, [toHost]);

  useEffect(() => {
    setOrigin(window.location.origin);
    window.openAttestation = dispatch;
    const inFrame = window.parent !== window;
    setEmbedded(inFrame);
    if (!inFrame) return () => { delete window.openAttestation; };

    const connection = connectToParent<HostConnection>({ methods: { dispatch }, timeout: 5000 });
    connection.promise
      .then((parent) => { host.current = parent as HostConnection; })
      .catch(() => { host.current = {}; });
    return () => {
      connection.destroy();
      delete window.openAttestation;
    };
  }, [dispatch]);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      toHost({ type: "UPDATE_HEIGHT", payload: Math.ceil(element.getBoundingClientRect().height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [toHost]);

  const certificate = document ? toCertificateTemplateData(document, origin) : null;
  const verificationUrl = certificate?.verificationUrl ?? buildVerificationUrl(origin);

  return (
    <div ref={container} className="bg-white text-gray-900" id="rendered-certificate">
      {certificate ? (
        <div className="certificate-paper mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white p-[14mm]">
          <div className="flex-1">
            <CertificateTemplateRenderer
              certificate={certificate}
              footerIssuerName={resolveTemplateIssuer(certificate.templateId)}
            />
          </div>
          {certificate.templateId !== "fta" && (
            <div className="mt-8 flex items-end gap-6 border-t border-gray-200 pt-5">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <QRCodeSVG value={verificationUrl} size={86} level="M" includeMargin />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Scan to verify
                </span>
              </div>
              <div className="min-w-0 flex-1 text-xs text-gray-500">
                <p className="font-semibold text-gray-700">Digital signature and verification</p>
                <div className="mt-5 max-w-xs border-b border-gray-500 pb-1 text-base italic text-gray-800">
                  {certificate.issuerName}
                </div>
                <p className="mt-1 font-medium text-gray-700">{certificate.issuerName}</p>
                <p className="mt-1">Issued to {certificate.recipientName}</p>
                <p className="mt-1 break-all">ID: {certificate.id}</p>
                <p className="mt-1 break-all">{verificationUrl}</p>
              </div>
            </div>
          )}
        </div>
      ) : !embedded ? (
        <p className="p-8 text-sm text-gray-600">
          This page renders Verifiable certificates inside TradeTrust and OpenCerts. Open a certificate
          in a compatible viewer, or use the <a className="underline" href={withBasePath("/verify/")}>verify page</a>.
        </p>
      ) : null}
    </div>
  );
}
