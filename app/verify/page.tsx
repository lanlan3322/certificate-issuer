"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle, Upload, FileJson, AlertCircle, ShieldCheck, XCircle, X } from "lucide-react";
import CertificateTemplateRenderer from "../templates/CertificateTemplateRenderer";
import CertificatePdfDownload from "../../components/CertificatePdfDownload";
import { toCertificateTemplateData } from "../renderer/certificateView";
import { CertificateTemplateData } from "../templates/types";
import { DOCUMENT_STORE_CONFIG, TRUSTVC_CONFIG } from "../../lib/constants";
import { withBasePath } from "../../lib/site";
import {
  VerificationResult,
} from "../../lib/trustvc";

export default function VerifyPage() {
  const [credentialJson, setCredentialJson] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifiedDocument, setVerifiedDocument] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCertificateView, setShowCertificateView] = useState(false);
  const [credentialToDownload, setCredentialToDownload] = useState<Record<string, unknown> | null>(null);
  const certificatePreviewRef = useRef<HTMLDivElement>(null);
  const [idLookup, setIdLookup] = useState<IdLookup | null>(null);

  // QR codes on issued certificates link to /verify/?id=<certificate id>, so
  // the issuer's stored copy is verified without the holder uploading the file.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id")?.trim();
    if (id) void handleVerifyById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerifyById = async (id: string) => {
    setLoading(true);
    setVerifiedDocument(null);
    setIdLookup({ id });
    try {
      const response = await fetch(withBasePath("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: id }),
      });
      const body = (await response.json()) as IdVerificationResponse;
      if (!response.ok) {
        throw new Error(body.message || body.error || "Unable to verify certificate.");
      }
      setIdLookup({ id, ...(body.credential ?? {}) });
      setResult({
        valid: Boolean(body.valid),
        message: body.valid
          ? "Certificate verified against the issuer's record."
          : describeIdFailure(body.reason, body.message),
        details: body.details,
      });
    } catch (e) {
      setResult({ valid: false, message: `Verification failed: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!credentialJson.trim()) {
      setResult({ valid: false, message: "Please paste a credential JSON" });
      return;
    }

    setLoading(true);
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(credentialJson) as Record<string, unknown>;
    } catch (e) {
      setResult({
        valid: false,
        message: `Invalid JSON: ${(e as Error).message}`,
      });
      setLoading(false);
      return;
    }

    try {
      setIdLookup(null);
      setVerifiedDocument(doc);
      const response = await fetch(withBasePath("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: doc }),
      });
      const verificationResult = (await response.json()) as VerificationResult & { error?: string };
      if (!response.ok) {
        throw new Error(verificationResult.message || verificationResult.error || "Unable to verify credential.");
      }
      setResult(verificationResult);
    } catch (e) {
      setVerifiedDocument(null);
      setResult({
        valid: false,
        message: `Verification failed: ${(e as Error).message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const certificateForView: CertificateTemplateData | null = verifiedDocument
    ? toCertificateTemplateData(verifiedDocument, typeof window === "undefined" ? "" : window.location.origin)
    : null;
  const verificationUrl = certificateForView?.verificationUrl ?? "";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCredentialJson(ev.target?.result as string ?? "");
      };
      reader.readAsText(file);
    }
  };

  const handleDownloadJson = () => {
    if (!credentialToDownload) return;
    const blob = new Blob([JSON.stringify(credentialToDownload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const subject = credentialToDownload.credentialSubject as Record<string, unknown> | undefined;
    const recipient = typeof subject?.name === "string" ? subject.name : "certificate";
    const nameStr = typeof recipient === "string" ? recipient.replace(/[^a-z0-9]+/gi, "_").toLowerCase() : "certificate";
    link.download = `certificate_${nameStr}_${credentialToDownload.id ?? Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSampleCredential = () => {
    const sample = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://w3id.org/security/data-integrity/v2",
      ],
      "type": ["VerifiableCredential", "OpenCertsCertificate"],
      "id": "urn:uuid:0198e4a3-b601-7117-9d02-8c9a9a54ab5d",
      "credentialSubject": {
        "certificateId": "urn:uuid:0198e4a3-b601-7117-9d02-8c9a9a54ab5d",
        "type": ["Person"],
        "name": "Sample Recipient",
        "certificateType": "Professional Certificate",
      },
      "issuer": "did:web:example.com",
      "validFrom": "2026-01-01T00:00:00Z",
      "proof": {
        "type": "DataIntegrityProof",
        "proofValue": "sample-proof-value",
        "verificationMethod": "did:web:example.com#multikey-1",
        "cryptosuite": "ecdsa-sd-2023",
      },
    };
    setCredentialJson(JSON.stringify(sample, null, 2));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-8 h-8 text-secondary" />
            <div>
              <h1 className="text-3xl font-bold">Verify Certificate</h1>
              <p className="text-white/80">
                Check the authenticity of any W3C Verifiable Credential
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Enter Credential to Verify
          </h2>

          <div className="mb-4">
            <label className="label">Paste JSON Credential</label>
            <textarea
              value={credentialJson}
              onChange={(e) => setCredentialJson(e.target.value)}
              className="input-field font-mono text-sm"
              rows={10}
              placeholder='{"@context": [...], "type": [...], ...}'
            />
          </div>

          <div className="flex items-center space-x-4 mb-6">
            <label className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200">
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleSampleCredential}
              className="flex items-center space-x-2 px-4 py-2 bg-secondary/10 text-primary rounded-lg hover:bg-secondary/20"
            >
              <FileJson className="w-4 h-4" />
              <span>Load Sample</span>
            </button>
          </div>

          <button
            onClick={handleVerify}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Credential</span>
              </>
            )}
          </button>
        </div>

        {/* Result Section */}
        {result && (
          <div
            className={`card ${
              result.valid ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
            }`}
          >
            <div className="flex items-start space-x-4">
              {result.valid ? (
                <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3
                  className={`text-xl font-bold ${
                    result.valid ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.valid ? "Valid Certificate" : "Invalid Certificate"}
                </h3>
                <p
                  className={`mt-1 ${
                    result.valid ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {result.message}
                </p>

                {result.details && (
                  <div className="mt-4 p-4 bg-white rounded-lg">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      Details
                    </h4>
                    <dl className="text-sm space-y-1">
                      {Object.entries(result.details)
                        .filter(
                          ([key]) =>
                            !["blockchainVerification", "transactionHash", "blockNumber"].includes(key)
                        )
                        .map(([key, value]) => (
                        <div key={key} className="grid grid-cols-1 gap-x-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                          <dt className="font-medium text-gray-600 capitalize break-words">
                            {key}:
                          </dt>
                          <dd className="text-gray-800 break-all">
                            {Array.isArray(value) ? value.join(", ") : String(value)}
                          </dd>
                        </div>
                      ))}

                      {/* Show blockchain verification status if available */}
                      {typeof result.details.blockchainVerification === "string" ? (
                        <>
                          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[14rem_minmax(0,1fr)] mt-2 pt-2 border-t">
                            <dt className="font-medium text-gray-600 capitalize break-words">
                              Blockchain Verified:
                            </dt>
                            <dd
                              className={
                                result.details.blockchainVerification === "passed"
                                  ? "text-green-600"
                                  : ["skipped", "not required", "unavailable"].includes(result.details.blockchainVerification)
                                    ? "text-gray-600"
                                    : "text-red-600"
                              }
                            >
                              {result.details.blockchainVerification === "passed"
                                ? "Yes"
                                : result.details.blockchainVerification === "unavailable"
                                  ? "Unavailable"
                                : ["skipped", "not required"].includes(result.details.blockchainVerification)
                                  ? "Not required"
                                  : "No"}
                              {typeof result.details.transactionHash === "string" && result.details.transactionHash ? (
                                <span className="ml-2 text-sm text-blue-600">
                                  (tx: {result.details.transactionHash.substring(0, 8)}...)
                                </span>
                              ) : null}
                            </dd>
                          </div>

                          {typeof result.details.blockNumber === "number" && result.details.blockNumber ? (
                            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[14rem_minmax(0,1fr)] mt-1">
                              <dt className="font-medium text-gray-600 capitalize break-words">
                                Block Number:
                              </dt>
                              <dd className="text-gray-800">
                                {result.details.blockNumber}
                              </dd>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </dl>
                  </div>
                )}

                {idLookup && (
                  <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                    <dt className="font-medium text-gray-600">Certificate ID</dt>
                    <dd className="break-all font-mono text-gray-800">{idLookup.id}</dd>
                    {idLookup.status && (
                      <>
                        <dt className="font-medium text-gray-600">Status</dt>
                        <dd className="capitalize text-gray-800">{idLookup.status}</dd>
                      </>
                    )}
                    {idLookup.validFrom && (
                      <>
                        <dt className="font-medium text-gray-600">Valid from</dt>
                        <dd className="text-gray-800">{new Date(idLookup.validFrom).toLocaleDateString()}</dd>
                      </>
                    )}
                    {idLookup.validUntil && (
                      <>
                        <dt className="font-medium text-gray-600">Valid until</dt>
                        <dd className="text-gray-800">{new Date(idLookup.validUntil).toLocaleDateString()}</dd>
                      </>
                    )}
                  </dl>
                )}

                {result.valid && verifiedDocument && (
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setShowCertificateView(true);
                        if (verifiedDocument) setCredentialToDownload(verifiedDocument);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      View Certificate
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-800">How Verification Works</h4>
              <p className="text-sm text-blue-700 mt-1">
                This tool verifies the structure and signature of W3C Verifiable
                Credentials. For full on-chain verification, the credential&apos;s
                document hash is checked against the Ethereum blockchain document
                store. A valid credential proves it was issued by the stated issuer
                and has not been tampered with.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showCertificateView && certificateForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Certificate Preview</h3>
                <p className="text-xs text-gray-500">Rendered using the credential&apos;s selected template.</p>
              </div>
              <div className="flex items-center gap-2">
                <CertificatePdfDownload
                  certificateRef={certificatePreviewRef}
                  recipientName={certificateForView.recipientName}
                />
                {credentialToDownload && (
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    title="Download credential as JSON"
                  >
                    <FileJson className="h-4 w-4" />
                    <span className="hidden sm:inline">Download JSON</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowCertificateView(false)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Close certificate preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto bg-gray-100 p-4 sm:p-8">
              <div
                ref={certificatePreviewRef}
                className="mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white p-[14mm] text-gray-900 shadow-lg"
              >
                <div className="flex-1">
                  <CertificateTemplateRenderer certificate={certificateForView} />
                </div>
                <div className={`${certificateForView.templateId === "fta" ? "hidden" : "mt-8 flex"} items-end gap-6 border-t border-gray-200 pt-5`}>
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <QRCodeSVG value={verificationUrl} size={86} level="M" includeMargin />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Scan to verify
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-gray-500">
                    <p className="font-semibold text-gray-700">Digital signature and verification</p>
                    <div className="mt-5 max-w-xs border-b border-gray-500 pb-1 text-base italic text-gray-800">
                      {certificateForView.issuerName}
                    </div>
                    <p className="mt-1 font-medium text-gray-700">{certificateForView.issuerName}</p>
                    <p className="mt-1">Issued to {certificateForView.recipientName}</p>
                    <p className="mt-1 break-all">ID: {certificateForView.id}</p>
                    <p className="mt-1 break-all">{verificationUrl}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
interface IdLookup {
  id: string;
  status?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

interface IdVerificationResponse {
  valid?: boolean;
  message?: string;
  error?: string;
  reason?: string | null;
  details?: Record<string, unknown>;
  credential?: Omit<IdLookup, "id"> | null;
}

function describeIdFailure(reason: string | null | undefined, message?: string): string {
  switch (reason) {
    case "not_found":
      return "No certificate with this ID was issued by verifiable.sg.";
    case "revoked":
      return "This certificate has been revoked by the issuer.";
    case "suspended":
      return "This certificate is currently suspended by the issuer.";
    case "expired":
      return "This certificate has expired.";
    case "cryptographic_verification_failed":
      return message || "The certificate's signature or status check failed.";
    default:
      return message || "This certificate could not be verified.";
  }
}
