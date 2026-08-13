"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import NavBar from "../../components/NavBar";
import { CheckCircle, Upload, FileJson, AlertCircle, ShieldCheck, XCircle, FileCheck, Eye, X, Download, Loader2 } from "lucide-react";
import CertificateTemplateRenderer from "../templates/CertificateTemplateRenderer";
import { CertificateTemplateData } from "../templates/types";
import { useWalletConnection } from "../../hooks/useWalletConnection";
import { DOCUMENT_STORE_CONFIG, TRUSTVC_CONFIG } from "../../lib/constants";
import { withBasePath } from "../../lib/site";
import {
  verifyCredential,
  VerificationResult,
  RevocationHashMode,
  revokeCertificateViaOcspResponder,
  revokeCertificateOnEthereum,
} from "../../lib/trustvc";

export default function VerifyPage() {
  const { connected, connect, getSigner, network, switchToSepolia } = useWalletConnection();
  const [credentialJson, setCredentialJson] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifiedDocument, setVerifiedDocument] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showCertificateView, setShowCertificateView] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const certificatePreviewRef = useRef<HTMLDivElement>(null);
  const [showAdvancedRevoke, setShowAdvancedRevoke] = useState(false);
  const [revokeHashMode, setRevokeHashMode] = useState<RevocationHashMode>("auto");
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!credentialJson.trim()) {
      setResult({ valid: false, message: "Please paste a credential JSON" });
      return;
    }

    setLoading(true);
    setRevokeMessage(null);
    setRevokeError(null);
    try {
      const doc = JSON.parse(credentialJson);
      setVerifiedDocument(doc);
      const verificationResult = await verifyCredential(doc);
      setResult(verificationResult);
    } catch (e) {
      setVerifiedDocument(null);
      setResult({
        valid: false,
        message: `Invalid JSON: ${(e as Error).message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!result?.valid || !verifiedDocument) {
      setRevokeError("Verify a valid credential before revoking.");
      return;
    }

    setRevoking(true);
    setRevokeMessage(null);
    setRevokeError(null);

    const issuer = verifiedDocument["issuer"];
    const issuerRevocation =
      issuer && typeof issuer === "object"
        ? (issuer as Record<string, unknown>)["revocation"]
        : null;
    const revocationType =
      issuerRevocation && typeof issuerRevocation === "object"
        ? String((issuerRevocation as Record<string, unknown>)["type"] ?? "")
        : "";
    const revocationLocation =
      issuerRevocation && typeof issuerRevocation === "object"
        ? String((issuerRevocation as Record<string, unknown>)["location"] ?? "")
        : "";

    try {
      const isOcspRevocation = revocationType === "OCSP_RESPONDER";
      const revocationResult = isOcspRevocation
        ? await revokeCertificateViaOcspResponder(verifiedDocument, revocationLocation || TRUSTVC_CONFIG.revocation.location, {
            hashMode: revokeHashMode,
          })
        : await (async () => {
            if (!connected) {
              await connect();
            }

            if (network !== "sepolia") {
              await switchToSepolia();
            }

            const signer = await getSigner();
            return revokeCertificateOnEthereum(
              verifiedDocument,
              DOCUMENT_STORE_CONFIG.address,
              signer,
              { hashMode: revokeHashMode }
            );
          })();

      if (revocationResult.error) {
        setRevokeError(revocationResult.error);
        return;
      }

      const txPreview = revocationResult.txHash
        ? ` (tx: ${revocationResult.txHash.slice(0, 10)}...)`
        : "";
      const submittedPreview = revocationResult.submittedViaBeacon
        ? " (submitted to OCSP responder)"
        : "";

      setRevokeMessage(
        isOcspRevocation
          ? `Credential revoked successfully via OCSP responder${submittedPreview}.`
          : `Credential revoked successfully${txPreview}.`
      );
      setResult({
        valid: false,
        message: isOcspRevocation
          ? revocationResult.submittedViaBeacon
            ? "Credential revocation was submitted to the OCSP responder."
            : "Credential has been revoked via the OCSP responder."
          : "Credential has been revoked on blockchain.",
        details: {
          ...(result.details ?? {}),
          revoked: true,
          blockchainVerification: isOcspRevocation ? "skipped" : "failed",
          transactionHash: revocationResult.txHash,
          revocationSubmission: revocationResult.submittedViaBeacon ? "beacon" : isOcspRevocation ? "fetch" : "transaction",
          revocationType: isOcspRevocation ? "OCSP_RESPONDER" : "REVOCATION_STORE",
          message: isOcspRevocation
            ? "Document hash is marked as revoked in the OCSP responder"
            : "Document hash is marked as revoked on document store",
        },
      });
    } catch (e) {
      setRevokeError(`Revocation failed: ${(e as Error).message}`);
    } finally {
      setRevoking(false);
    }
  };

  const handleOpenRevokeConfirm = () => {
    setRevokeMessage(null);
    setRevokeError(null);
    setShowAdvancedRevoke(false);
    setRevokeHashMode("auto");
    setShowRevokeConfirm(true);
  };

  const handleCloseRevokeConfirm = () => {
    if (revoking) return;
    setShowRevokeConfirm(false);
  };

  const handleConfirmRevoke = async () => {
    await handleRevoke();
    setShowRevokeConfirm(false);
  };

  const signature = verifiedDocument?.["signature"];
  const signatureObj = signature && typeof signature === "object"
    ? (signature as Record<string, unknown>)
    : null;
  const hasTargetHash =
    typeof signatureObj?.targetHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(signatureObj.targetHash);
  const hasMerkleRoot =
    typeof signatureObj?.merkleRoot === "string" && /^0x[a-fA-F0-9]{64}$/.test(signatureObj.merkleRoot);
  const issuer = verifiedDocument?.["issuer"];
  const issuerRevocation =
    issuer && typeof issuer === "object"
      ? (issuer as Record<string, unknown>)["revocation"]
      : null;
  const revocationType =
    issuerRevocation && typeof issuerRevocation === "object"
      ? String((issuerRevocation as Record<string, unknown>)["type"] ?? "")
      : "";
  const revocationLocation =
    issuerRevocation && typeof issuerRevocation === "object"
      ? String((issuerRevocation as Record<string, unknown>)["location"] ?? "")
      : "";
  const revocationLabel =
    revocationType === "OCSP_RESPONDER"
      ? `DID / OCSP responder${revocationLocation ? `: ${revocationLocation}` : ""}`
      : revocationType === "REVOCATION_STORE"
        ? `Ethereum / document store${revocationLocation ? `: ${revocationLocation}` : ""}`
        : null;

  const certificateSubject =
    verifiedDocument?.["credentialSubject"] &&
    typeof verifiedDocument["credentialSubject"] === "object"
      ? (verifiedDocument["credentialSubject"] as Record<string, unknown>)
      : {};
  const certificateIssuer =
    verifiedDocument?.["issuer"] && typeof verifiedDocument["issuer"] === "object"
      ? (verifiedDocument["issuer"] as Record<string, unknown>)
      : {};
  const verificationUrl =
    typeof window === "undefined"
      ? withBasePath("/verify")
      : `${window.location.origin}${withBasePath("/verify")}`;

  const certificateForView: CertificateTemplateData | null = verifiedDocument
    ? {
        id: String(certificateSubject.certificateId ?? verifiedDocument.id ?? ""),
        recipientName: String(certificateSubject.name ?? "Certificate recipient"),
        recipientEmail: String(certificateSubject.email ?? ""),
        certificateType: String(certificateSubject.certificateType ?? "Certificate"),
        issuerName: String(certificateIssuer.name ?? certificateIssuer.id ?? "Certificate Issuer"),
        issueDate: String(verifiedDocument.issuanceDate ?? verifiedDocument.validFrom ?? ""),
        description: String(certificateSubject.description ?? ""),
        validFrom: String(verifiedDocument.validFrom ?? verifiedDocument.issuanceDate ?? ""),
        validUntil: typeof verifiedDocument.validUntil === "string" ? verifiedDocument.validUntil : undefined,
        templateId: typeof certificateSubject.templateId === "string" ? certificateSubject.templateId : undefined,
        verificationUrl,
      }
    : null;

  const handleDownloadPdf = async () => {
    if (!certificatePreviewRef.current || !certificateForView) return;

    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(certificatePreviewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imageData = canvas.toDataURL("image/png");
      pdf.addImage(imageData, "PNG", 0, 0, 210, 297, undefined, "FAST");
      const certificateId = certificateForView.id?.split(":").pop() ?? "certificate";
      pdf.save(`certificate-${certificateId}.pdf`);
    } catch (error) {
      setRevokeError(`Unable to download PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

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
      "issuer": {
        "id": "did:web:example.com",
        "type": "OpenAttestationIssuer",
        "name": "IMDA Training Academy",
      },
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
                        <div key={key} className="flex">
                          <dt className="font-medium text-gray-600 capitalize w-32">
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
                          <div className="flex mt-2 pt-2 border-t">
                            <dt className="font-medium text-gray-600 capitalize w-32">
                              Blockchain Verified:
                            </dt>
                            <dd
                              className={
                                result.details.blockchainVerification === "passed"
                                  ? "text-green-600"
                                  : result.details.blockchainVerification === "skipped"
                                    ? "text-gray-600"
                                    : "text-red-600"
                              }
                            >
                              {result.details.blockchainVerification === "passed"
                                ? "Yes"
                                : result.details.blockchainVerification === "skipped"
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
                            <div className="flex mt-1">
                              <dt className="font-medium text-gray-600 capitalize w-32">
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

                {result.valid && (
                  <div className="mt-4">
                    {revocationLabel && (
                      <div className="mb-3 inline-flex max-w-full items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                        <span className="truncate">{revocationLabel}</span>
                      </div>
                    )}
                    <button
                      onClick={handleOpenRevokeConfirm}
                      disabled={revoking}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {revoking ? "Revoking..." : "Revoke"}
                    </button>
                    <button
                      onClick={() => setShowCertificateView(true)}
                      className="ml-2 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </button>
                  </div>
                )}

                {revokeMessage && (
                  <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    {revokeMessage}
                  </p>
                )}

                {revokeError && (
                  <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {revokeError}
                  </p>
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

      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Revocation</h3>
            </div>
            <div className="px-5 py-4">
              {revocationLabel && (
                <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <span className="font-semibold">Revocation path:</span>{" "}
                  <span className="break-all">{revocationLabel}</span>
                </div>
              )}
              <p className="text-sm text-gray-700">
                Revoking is an on-chain action and cannot be undone. This certificate will fail future blockchain verification checks.
              </p>

              <button
                type="button"
                onClick={() => setShowAdvancedRevoke((prev) => !prev)}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                {showAdvancedRevoke ? "Hide advanced options" : "Show advanced options"}
              </button>

              {showAdvancedRevoke && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Revocation Scope
                  </p>
                  <select
                    value={revokeHashMode}
                    onChange={(e) => setRevokeHashMode(e.target.value as RevocationHashMode)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="auto">Auto (prefer targetHash)</option>
                    <option value="targetHash" disabled={!hasTargetHash}>
                      Document only (targetHash){!hasTargetHash ? " - unavailable" : ""}
                    </option>
                    <option value="merkleRoot" disabled={!hasMerkleRoot}>
                      Batch revoke (merkleRoot){!hasMerkleRoot ? " - unavailable" : ""}
                    </option>
                  </select>
                  <p className="mt-2 text-xs text-gray-600">
                    `targetHash` revokes a single wrapped document. `merkleRoot` revokes all documents in the same wrapped batch.
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
              <button
                onClick={handleCloseRevokeConfirm}
                disabled={revoking}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                disabled={revoking}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {revoking ? "Revoking..." : "Confirm Revoke"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCertificateView && certificateForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Certificate Preview</h3>
                <p className="text-xs text-gray-500">Rendered using the credential&apos;s selected template.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloadingPdf ? "Preparing..." : "Download PDF"}
                </button>
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