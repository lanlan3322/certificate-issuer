"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import CertificatePreviewModal from "./CertificatePreviewModal";
import SendCertificateButton from "./SendCertificateButton";
import { mapVcToCertEntry } from "../lib/credential-mapper";
import { TEMPLATE_OPTIONS } from "../app/templates/registry";
import type { CertEntry } from "../lib/certificate-types";
import { useCredentialVerification } from "../hooks/useCredentialVerification";
import { withBasePath } from "../lib/site";

export interface CredentialItem { id: string; externalId: string; recipientName: string; recipientEmail: string; status: string; issuedAt: string; credential: Record<string, unknown>; templateId: string | null }

interface Props {
  credentials: CredentialItem[];
  onCredentialsChange: Dispatch<SetStateAction<CredentialItem[]>>;
  loading?: boolean;
  error?: string | null;
}

export default function IssuedCertificatesTable({ credentials: allCredentials, onCredentialsChange: setAllCredentials, loading: credentialLoading = false, error }: Props) {
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
  const [selectedCredential, setSelectedCredential] = useState<CertEntry | null>(null);
  const verificationResults = useCredentialVerification(allCredentials);

  const handleRevoke = async (credId: string) => {
    if (allCredentials.find((cred) => cred.id === credId)?.status.toLowerCase() === "revoked") return;
    const reason = prompt("Enter a reason for revoking this certificate:");
    if (!reason) return;
    setRevokeLoading(credId);
    try {
      const response = await fetch(withBasePath("/api/revocation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: credId, action: "revoke", reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to revoke certificate.");
      setAllCredentials((prev) => prev.map((cred) => cred.id === credId ? { ...cred, status: "revoked" } : cred));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to revoke certificate.");
    } finally {
      setRevokeLoading(null);
    }
  };

  const handleViewCredential = (cred: CredentialItem) => {
    const certificate = mapVcToCertEntry(cred.credential);
    if (!certificate) {
      alert("Unable to display this certificate.");
      return;
    }
    setSelectedCredential({
      ...certificate,
      id: cred.externalId || certificate.id || cred.id,
      recipientName: cred.recipientName,
      recipientEmail: cred.recipientEmail,
      issueDate: certificate.issueDate || cred.issuedAt,
      templateId: TEMPLATE_OPTIONS.some((template) => template.id === certificate.templateId)
        ? certificate.templateId
        : TEMPLATE_OPTIONS.some((template) => template.id === cred.templateId)
          ? cred.templateId ?? undefined
          : certificate.templateId,
      status: cred.status,
    });
  };

  const handleCloseModal = () => {
    setSelectedCredential(null);
  };

  return <>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">Issued certificates</h2>
      {credentialLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>
      ) : allCredentials.length === 0 ? (
        <p className="text-slate-500">No certificates have been issued yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
              <tr>
                <th scope="col" className="px-3 py-3">Recipient</th>
                <th scope="col" className="px-3 py-3">Email</th>
                <th scope="col" className="px-3 py-3">Template</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="px-3 py-3">Blockchain verified</th>
                <th scope="col" className="px-3 py-3">DID verified</th>
                <th scope="col" className="px-3 py-3">Issued</th>
                <th scope="col" className="px-3 py-3 text-center">View</th>
                <th scope="col" className="px-3 py-3 text-right">Actions</th>
                <th scope="col" className="px-3 py-3 text-right">Send</th>
              </tr>
            </thead>
            <tbody>
              {allCredentials.map((cred) => {
                const certificate = mapVcToCertEntry(cred.credential);
                const template = TEMPLATE_OPTIONS.find((option) => option.id === certificate?.templateId)
                  ?? TEMPLATE_OPTIONS.find((option) => option.id === cred.templateId);
                const templateLabel = template?.label ?? "Not recorded";
                const isRevoked = cred.status.toLowerCase() === "revoked";
                return (
                  <tr
                    key={cred.id}
                    className="border-b border-slate-100 dark:border-slate-800"
                    onClick={() => handleViewCredential(cred)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === "Enter") handleViewCredential(cred); }}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={`px-3 py-3 font-medium ${isRevoked ? "text-gray-400 italic" : "text-slate-800 dark:text-slate-200"}`}>{cred.recipientName}</td>
                    <td className={`px-3 py-3 ${isRevoked ? "text-gray-400 italic" : "text-slate-600 dark:text-slate-400"}`}>{cred.recipientEmail}</td>
                    <td className={`px-3 py-3 font-medium ${isRevoked ? "text-gray-400 italic" : "text-slate-700 dark:text-slate-300"}`}>{templateLabel}</td>
                    <td className={`px-3 py-3 uppercase text-xs ${isRevoked ? "text-gray-400 italic" : ""}`}>{cred.status}</td>
                    <td className="px-3 py-3" title={verificationResults[cred.id]?.message}>
                      <span role="status">{verificationResults[cred.id]?.blockchain ?? "Checking..."}</span>
                    </td>
                    <td className="px-3 py-3" title={verificationResults[cred.id]?.message}>
                      <span role="status">{verificationResults[cred.id]?.did ?? "Checking..."}</span>
                    </td>
                    <td className={`px-3 py-3 ${isRevoked ? "text-gray-400 italic" : "text-slate-600 dark:text-slate-400"}`}>{new Date(cred.issuedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleViewCredential(cred); }}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-cyan-600 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 dark:text-cyan-400 dark:bg-cyan-900/30 dark:border-cyan-800"
                        title="View certificate details"
                      >
                        View
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!isRevoked && (revokeLoading === cred.id ? (
                        <div className="inline-flex items-center justify-end gap-2">
                          <div className="h-4 w-4 animate-spin border-[2] border-cyan-500 border-t-transparent rounded-full" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRevoke(cred.id); }}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Revoke certificate"
                        >
                          Revoke
                        </button>
                      ))}
                    </td>
                    <td className="px-3 py-3 text-right"><SendCertificateButton credential={cred} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {selectedCredential && (
      <CertificatePreviewModal certificate={selectedCredential} onClose={handleCloseModal} />
    )}
  </>;
}
