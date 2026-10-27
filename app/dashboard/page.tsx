"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import CertificatePreviewModal from "../../components/CertificatePreviewModal";
import { mapVcToCertEntry } from "../../lib/credential-mapper";
import type { CertEntry } from "../../lib/certificate-types";

interface AuthUser { issuerId: string; email: string; displayName: string; issuerName: string; organization: string }
interface CredentialItem { id: string; externalId: string; recipientName: string; recipientEmail: string; status: string; issuedAt: string; credential: Record<string, unknown>; templateId: string | null }

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
  const [allCredentials, setAllCredentials] = useState<CredentialItem[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<CertEntry | null>(null);

  // Detect auth session and load credentials on mount
  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "POST" });
        const payload = await res.json() as { user?: AuthUser | null };
        if (!cancelled) {
          if (payload.user) {
            setUser(payload.user);
            setCredentialLoading(true);
            try {
              const credRes = await fetch("/api/credentials");
              const credPayload = await credRes.json() as { credentials?: CredentialItem[] };
              setAllCredentials(credPayload.credentials ?? []);
            } catch {
              /* non-critical */
            } finally {
              setCredentialLoading(false);
            }
          }
          setAuthLoading(false);
        }
      } catch {
        if (!cancelled) setAuthLoading(false);
      }
    };
    void checkAuth();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setUser(null);
    setAllCredentials([]);
  };

  const handleRevoke = async (credId: string) => {
    if (allCredentials.find((cred) => cred.id === credId)?.status.toLowerCase() === "revoked") return;
    const reason = prompt("Enter a reason for revoking this certificate:");
    if (!reason) return;
    setRevokeLoading(credId);
    try {
      const response = await fetch("/api/revocation", {
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
      templateId: cred.templateId ?? certificate.templateId,
      status: cred.status,
    });
  };

  const handleCloseModal = () => {
    setSelectedCredential(null);
  };

  if (authLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-cyan-500 border-t-transparent rounded-full" />
      </main>
    );
  }

  /* ─── Authenticated Dashboard ──────────────────────────────────── */
  if (user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome bar */}
        <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Welcome, {user.displayName}</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{user.issuerName} · {user.organization}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/profile/" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">My Profile</Link>
            <Link href="/insurance/" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-slate-600">Issue certificate</Link>
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>

        {/* Issued certificates table */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">Issued certificates</h2>
          {credentialLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-cyan-500 border-t-transparent rounded-full" />
            </div>
          ) : allCredentials.length === 0 ? (
            <p className="text-slate-500">No certificates have been issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-3">Recipient</th>
                    <th scope="col" className="px-3 py-3">Email</th>
                    <th scope="col" className="px-3 py-3">Cert Type</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Issued</th>
                    <th scope="col" className="px-3 py-3 text-center">View</th>
                    <th scope="col" className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allCredentials.map((cred) => {
                    const certType = mapVcToCertEntry(cred.credential)?.certificateType || "Certificate";
                    const isRevoked = cred.status.toLowerCase() === "revoked";
                    return (
                      <tr
                        key={cred.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                        onClick={() => handleViewCredential(cred)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") handleViewCredential(cred); }}
                        style={{ cursor: "pointer" }}
                      >
                        <td className={`px-3 py-3 font-medium ${isRevoked ? "text-gray-400 italic" : "text-slate-800 dark:text-slate-200"}`}>{cred.recipientName}</td>
                        <td className={`px-3 py-3 ${isRevoked ? "text-gray-400 italic" : "text-slate-600 dark:text-slate-400"}`}>{cred.recipientEmail}</td>
                        <td className={`px-3 py-3 font-medium ${isRevoked ? "text-gray-400 italic" : "text-slate-700 dark:text-slate-300"}`}>{certType}</td>
                        <td className={`px-3 py-3 uppercase text-xs ${isRevoked ? "text-gray-400 italic" : ""}`}>{cred.status}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── Certificate Detail Modal ───────────────────────────── */}
        {selectedCredential && (
          <CertificatePreviewModal certificate={selectedCredential} onClose={handleCloseModal} />
        )}
      </main>
    );
  }

  return <Link href="/issuer/">Log in to view your dashboard.</Link>;
}
