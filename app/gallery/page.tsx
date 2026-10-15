"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Shield, FileText, CheckCircle, ExternalLink, X as XIcon, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { DEMO_CERTIFICATES } from "../../lib/constants";
import { mapVcsToCertEntries } from "../../lib/credential-mapper";
import CertificatePreviewModal from "../../components/CertificatePreviewModal";
import { withBasePath } from "../../lib/site";
import {
  CertificateTemplateRenderer,
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_OPTIONS,
  resolveTemplateId,
} from "../templates";

export type CertEntry = {
  id?: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  issuerName: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
  templateId?: string;
  status: string;
};

export default function GalleryPage() {
  const [selectedCert, setSelectedCert] = useState<CertEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revocationError, setRevocationError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Local variable to hold fetched certificate entries (client upload removed)
  let certificatesData: CertEntry[] | null = null;

  // Fetch real credentials from the API on mount (falls back to demo data)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch("/api/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.credentials && Array.isArray(data.credentials)) {
          const unwrapped: unknown[] = [];
          for (const raw of data.credentials) {
            if (!raw || typeof raw !== "object") continue;
            const obj = raw as Record<string, unknown>;
            // CredentialRecord shape — unwrap the inner VC
            const vcData = obj.credential;
            let payload: unknown;
            if (typeof vcData === "string") {
              try { payload = JSON.parse(vcData); } catch { payload = null; }
            } else {
              payload = vcData;
            }
            // Push inner VC; fall back to the raw object itself as fallback
            unwrapped.push(payload ?? obj);
          }
          const entries = unwrapped.filter((c: unknown) => {
            if (!c || typeof c !== "object") return false;
            const o = c as Record<string, unknown>;
            // Accept if it has the core flat fields or nested VC structure
            return (
              typeof o.recipientName === "string" ||
              typeof o.credentialSubject === "object" ||
              typeof o.recipient_name === "string"
            );
          });
          if (entries.length > 0) {
            certificatesData = mapVcsToCertEntries(entries);
          }
        }
      })
      .catch(() => {
        // Silently fall back to demo data if API is unavailable
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const certificates: CertEntry[] = isLoading ? [] : certificatesData ?? DEMO_CERTIFICATES;
  const certTypeCount = useMemo(
    () => new Set(certificates.map((c) => c.certificateType)).size,
    [certificates]
  );

  function isValidCertEntry(obj: unknown): obj is CertEntry {
    if (!obj || typeof obj !== "object") return false;
    const c = obj as Record<string, unknown>;
    return (
      typeof c.recipientName === "string" &&
      typeof c.recipientEmail === "string" &&
      typeof c.certificateType === "string" &&
      typeof c.issuerName === "string" &&
      typeof c.issueDate === "string" &&
      typeof c.description === "string" &&
      typeof c.validFrom === "string" &&
      typeof c.status === "string"
    );
  }

  function mapVcToCertEntry(obj: unknown): CertEntry | null {
    if (!obj || typeof obj !== "object") return null;
    const vc = obj as Record<string, any>;
    const subject = vc.credentialSubject as Record<string, any> | undefined;
const id =
  typeof subject?.certificateId === "string"
    ? subject.certificateId
    : undefined;
    const recipientName = typeof subject?.name === "string" ? subject.name : undefined;
    const recipientEmail = typeof subject?.email === "string" ? subject.email : undefined;
    const certificateType =
      typeof subject?.certificateType === "string" ? subject.certificateType : undefined;
  const issuerName =
  typeof vc.issuer === "string"
    ? vc.issuer
    : typeof vc.issuer?.name === "string"
      ? vc.issuer.name
      : "Unknown Issuer";
          const issueDate =
      typeof subject?.issuedOn === "string"
        ? subject.issuedOn
        : typeof vc.validFrom === "string"
          ? vc.validFrom
          : undefined;
    const description = typeof subject?.description === "string" ? subject.description : "";
    const templateId =
      typeof subject?.templateId === "string" ? subject.templateId : DEFAULT_TEMPLATE_ID;
    const validFrom =
      typeof subject?.validFrom === "string"
        ? subject.validFrom
        : typeof vc.validFrom === "string"
          ? vc.validFrom
          : undefined;
    const validUntil =
      typeof subject?.validUntil === "string"
        ? subject.validUntil
        : typeof vc.validUntil === "string"
          ? vc.validUntil
          : undefined;

    if (
      !recipientName ||
      !recipientEmail ||
      !certificateType ||
      !issueDate ||
      !validFrom
    ) {
      return null;
    }

    return {
      id,
      recipientName,
      recipientEmail,
      certificateType,
      issuerName,
      issueDate,
      description,
      validFrom,
      validUntil,
      templateId,
      status: "valid",
    };
  }


  async function handleRevokeCertificate() {
    setRevoking(true);
    setRevocationError(null);
    try {
      const response = await fetch("/api/revocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId: selectedCert?.id,
          action: "revoke",
          reason: revokeReason.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to revoke certificate.");
      }
      // Update local state to mark the cert as revoked
      if (selectedCert) {
        setSelectedCert({ ...selectedCert, status: "revoked" });
      }
      setShowRevokeModal(false);
      setRevokeReason("");
      setRevocationError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setRevocationError(message);
    } finally {
      setRevoking(false);
    }
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-secondary" />
            <div>
              <h1 className="text-3xl font-bold">Certificate View</h1>
              <p className="text-white/80">
                Browse certificates issued
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <div className="card text-center">
            <p className="text-3xl font-bold text-primary">
              {certificates.length}
            </p>
            <p className="text-sm text-gray-600">Total Certificates</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-green-600">
              {certificates.filter((c) => c.status === "valid").length}
            </p>
            <p className="text-sm text-gray-600">Valid</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-secondary">
              {certTypeCount}
            </p>
            <p className="text-sm text-gray-600">Certificate Types</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-accent">100%</p>
            <p className="text-sm text-gray-600">W3C Compliant</p>
          </div>
        </div>

        {/* Certificates Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificates.map((cert) => (
            <div
              key={cert.recipientEmail}
              className="card hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => setSelectedCert(cert)}
            >
              {/* Certificate Card */}
              <div className="bg-gradient-to-br from-primary to-accent text-white rounded-lg p-6 mb-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-secondary uppercase tracking-wider">
                      {cert.certificateType}
                    </p>
                    <p className="text-xs text-white/60 mt-1">
                      {cert.issueDate}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {(cert.status === "valid" || cert.status === "pending") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCert(cert);
                          setShowRevokeModal(true);
                        }}
                        className="p-1.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
                        title="Revoke Certificate"
                      >
                        <XCircle className="w-4 h-4 text-white" />
                      </button>
                    )}
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        cert.status === "valid"
                          ? "bg-green-500 text-white"
                          : "bg-red-500 text-white"
                      }`}
                    >
                      {cert.status.toUpperCase()}
                    </div>
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2">{cert.recipientName}</h3>
                <p className="text-sm text-white/80">{cert.description}</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Recipient</p>
                  <p className="text-sm font-medium">{cert.recipientEmail}</p>
                </div>
                <div className="flex items-center space-x-1 text-primary text-sm">
                  <span>View</span>
                  <ExternalLink className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal */}
        {selectedCert && (
          <CertificatePreviewModal certificate={selectedCert} onClose={() => setSelectedCert(null)} />
        )}

        {/* Revoke Confirmation Modal */}
        {showRevokeModal && selectedCert && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="flex items-start gap-4 p-6 border-b border-gray-200">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Revoke Certificate</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Are you sure you want to revoke this certificate? This action is irreversible.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRevokeModal(false);
                    setRevokeReason("");
                    setRevocationError(null);
                  }}
                  className="text-gray-400 hover:text-gray-500 transition-colors"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Certificate Info */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <p className="text-sm font-medium text-gray-900">{selectedCert.recipientName}</p>
                <p className="text-sm text-gray-500">
                  {selectedCert.certificateType} &middot; ID: {selectedCert.id || "N/A"}
                </p>
              </div>

              {/* Reason Input */}
              <div className="px-6 py-4 space-y-3">
                <div>
                  <label htmlFor="revoke-reason" className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for Revocation <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    id="revoke-reason"
                    rows={3}
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Enter the reason for revoking this certificate..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  />
                </div>

                {revocationError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                    {revocationError}
                  </p>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => {
                    setShowRevokeModal(false);
                    setRevokeReason("");
                    setRevocationError(null);
                  }}
                  disabled={revoking}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokeCertificate}
                  disabled={revoking}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {revoking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Revoking...
                    </>
                  ) : (
                    "Revoke Certificate"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
