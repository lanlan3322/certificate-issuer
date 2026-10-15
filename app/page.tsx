"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Download,
  Copy,
  CheckCircle,
  AlertCircle,
  Shield,
  ShieldCheck,
  Wallet,
  LogOut,
  ExternalLink,
  Loader2,
  Check,
  Layers,
  ArrowRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import BatchIssuePanel, {
  BatchIssuedCertificatesPanel,
  IssuedCertificateItem,
} from "../components/BatchIssuePanel";
import IssuingMethodSelector from "../components/IssuingMethodSelector";
import CertificatePreviewModal from "../components/CertificatePreviewModal";
import { useWalletConnection } from "../hooks/useWalletConnection";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CertificateData,
  generateCertificateId,
  buildVCPayload,
  issueCertificateToEthereum,
  signCredentialWithEthereum,
  type DIDIssuanceResult,
  type EthereumIssuanceResult,
} from "../lib/trustvc";
import {
  formatDate,
  getISODateString,
  validateCertificateData,
  downloadCertificatesZip,
  sanitizeCertificateFileNameForZip,
  copyToClipboard,
  validateIssuingMethods,
} from "../lib/certificate";
import {
  CERTIFICATE_TEMPLATES,
  DEFAULT_ISSUING_METHODS,
  DOCUMENT_STORE_CONFIG,
  formatIssuingMethodLabels,
  IssuingMethod,
} from "../lib/constants";
import { buildVerificationUrl, withBasePath } from "../lib/site";
import { mapVcToCertEntry } from "../lib/credential-mapper";
import { CertificateTemplateRenderer, DEFAULT_TEMPLATE_ID, TEMPLATE_OPTIONS } from "./templates";
import type { CertEntry } from "../lib/certificate-types";

const MAX_VISIBLE_FAILED_FILES = 5;
const MAX_FAILED_FILE_NAME_LENGTH = 40;
const ETHEREUM_REVOCATION_PREREQUISITES = [
  "Issue with Ethereum enabled so the credential includes a revocation store reference.",
  `Use the deployed Sepolia document store at ${DOCUMENT_STORE_CONFIG.address}.`,
  "Keep the issuer DID document published and reachable for verification.",
  "Revoke from the same network and wallet that has document-store permissions.",
];
const DID_REVOCATION_PREREQUISITES = [
  "Issue with DID enabled so the credential includes an OCSP revocation reference.",
  "Keep the issuer DID document public and resolvable over did:web.",
  "Point the revocation location at a reachable OCSP responder.",
  "Make sure the OCSP responder understands the credential hash you want to revoke.",
];

interface IssueFormState {
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  templateId: string;
  description: string;
  hasValidity: boolean;
  validFrom: string;
  validUntil: string | null;
  certificateFormat: "standard" | "opencerts";
}

interface AuthUser { issuerId: string; email: string; displayName: string; issuerName: string }
interface CredentialItem { id: string; externalId: string; recipientName: string; recipientEmail: string; status: string; issuedAt: string; credential: Record<string, unknown>; templateId: string | null }

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextYearSameDateInputValue(fromDate: string): string {
  const [year, month, day] = fromDate.split("-").map(Number);
  if (!year || !month || !day) {
    return fromDate;
  }

  const nextYearDate = new Date(year + 1, month - 1, day);
  const nextYear = nextYearDate.getFullYear();
  const nextMonth = String(nextYearDate.getMonth() + 1).padStart(2, "0");
  const nextDay = String(nextYearDate.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function dateInputToISO(dateInput: string, endOfDay = false): string | null {
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(
    Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export default function HomePage() {
  const router = useRouter();
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
            <p className="mt-1 text-slate-600 dark:text-slate-300">{user.issuerName} · {user.email}</p>
          </div>
          <div className="flex gap-2">
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

  /* ─── End dashboard (unauthenticated page follows) ─────────────── */

  const {
    connected,
    connecting,
    address,
    balance,
    network,
    error: walletError,
    connect,
    disconnect,
    getSigner,
    switchToSepolia,
    isMetaMaskInstalled,
  } = useWalletConnection();

  const [formData, setFormData] = useState<IssueFormState>(() => {
    const validFrom = getTodayDateInputValue();
    return {
      recipientName: "",
      recipientEmail: "",
      certificateType: Object.keys(CERTIFICATE_TEMPLATES)[0],
      templateId: DEFAULT_TEMPLATE_ID,
      description: "",
      hasValidity: true,
      validFrom,
      validUntil: getNextYearSameDateInputValue(validFrom),
      certificateFormat: "standard",
    };
  });
  const [issuedCert, setIssuedCert] = useState<CertificateData | null>(null);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [issuedTxHash, setIssuedTxHash] = useState<string | null>(null);
  const [didResult, setDIDResult] = useState<DIDIssuanceResult | null>(null);
  const [ethereumResult, setEthereumResult] =
    useState<EthereumIssuanceResult | null>(null);
  const [walletWarningDismissed, setWalletWarningDismissed] = useState(false);
  const [issueMode, setIssueMode] = useState<"single" | "batch">("single");
  const [issuingMethods, setIssuingMethods] = useState<IssuingMethod[]>(
    DEFAULT_ISSUING_METHODS
  );
  const [batchIssuedCertificates, setBatchIssuedCertificates] = useState<
    IssuedCertificateItem[]
  >([]);
  const [batchIssuing, setBatchIssuing] = useState(false);
  const [downloadingBatchZip, setDownloadingBatchZip] = useState(false);
  const [batchDownloadError, setBatchDownloadError] = useState<string | null>(null);
  // Prefer the signed DID credential; fall back to the unsigned DID draft or
  // the plain unsigned payload so the preview always shows something useful.
  const currentCredential = useMemo(() => {
    if (didResult?.credential && (didResult.signed || didResult.walletSignature)) {
      return didResult.credential;
    }
    if (issuedCert) return buildVCPayload(issuedCert) as Record<string, unknown>;
    return null;
  }, [didResult, issuedCert]);
  const currentCredentialHasProof = useMemo(
    () => Boolean(didResult?.signed || didResult?.walletSignature),
    [didResult]
  );

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "hasValidity") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({
        ...prev,
        hasValidity: checked,
        validUntil: checked
          ? prev.validUntil ?? getNextYearSameDateInputValue(prev.validFrom)
          : null,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "validFrom" && prev.hasValidity
        ? {
            validUntil:
              prev.validUntil && prev.validUntil >= value
                ? prev.validUntil
                : getNextYearSameDateInputValue(value),
          }
        : {}),
    }));
  };

  const handleConnectWallet = async () => {
    await connect();
    if (connected && network !== "sepolia") {
      await switchToSepolia();
    }
  };

  const handleToggleIssuingMethod = (method: IssuingMethod) => {
    setIssuingMethods((prev) =>
      prev.includes(method)
        ? prev.filter((selectedMethod) => selectedMethod !== method)
        : [...prev, method]
    );
  };

  const handleIssue = async () => {
    const validation = validateCertificateData({
      ...formData,
      validUntil: formData.validUntil ?? undefined,
    });
    const issuingMethodValidation = validateIssuingMethods(issuingMethods);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    if (!issuingMethodValidation.valid) {
      setErrors(issuingMethodValidation.errors);
      return;
    }

    if (formData.hasValidity) {
      if (!formData.validFrom || !formData.validUntil) {
        setErrors(["Valid from and valid until dates are required."]);
        return;
      }

      if (formData.validUntil < formData.validFrom) {
        setErrors(["Valid until date must be on or after valid from date."]);
        return;
      }
    }

    setErrors([]);

    // Ethereum issuance requires a connected wallet
    if (issuingMethods.includes("ethereum") && !connected) {
      setErrors(["Please connect your wallet to issue an Ethereum certificate."]);
      return;
    }

    setIssuing(true);
    setIssuedCert(null);
    setIssuedTxHash(null);
    setDIDResult(null);
    setEthereumResult(null);

    try {
      const now = getISODateString();
      const validFromIso = formData.hasValidity
        ? dateInputToISO(formData.validFrom)
        : now;
      const validUntilIsoRaw = formData.hasValidity && formData.validUntil
        ? dateInputToISO(formData.validUntil, true)
        : undefined;
      const validUntilIso = validUntilIsoRaw ?? undefined;

      if (formData.hasValidity && (!validFromIso || !validUntilIso)) {
        setErrors(["Valid from and valid until must be valid dates."]);
        setIssuing(false);
        return;
      }

      const certData: CertificateData = {
        id: generateCertificateId(),
        recipientName: formData.recipientName,
        recipientEmail: formData.recipientEmail,
        certificateType: formData.certificateType,
        templateId: formData.templateId,
        issuerName: "Certificate Issuer",
        issueDate: now,
        description: formData.description,
        validFrom: validFromIso ?? now,
        validUntil: validUntilIso,
        issuingMethods,
      };

      // --- DID issuance ---
      if (issuingMethods.includes("did")) {
        // Signing and persistence both happen server-side; there is no browser
        // fallback because the signing key is never sent to the client.
        const response = await fetch("/api/issue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: certData,
            type: "did",
            templateId: formData.templateId,
          }),
        });

        const resultPayload = (await response.json().catch(() => ({}))) as {
          signed?: boolean;
          credential?: Record<string, unknown>;
          error?: string;
        };

        if (!response.ok || resultPayload.error) {
          if (response.status === 401) {
            setErrors(["Log in as an issuer to issue certificates."]);
          } else {
            setErrors([resultPayload.error ?? `Issuance failed (HTTP ${response.status}).`]);
          }
          setIssuing(false);
          return;
        }

        setDIDResult({
          credential: (resultPayload.credential ?? buildVCPayload(certData)) as Record<string, unknown>,
          signed: Boolean(resultPayload.signed),
        });
      }

      // --- Ethereum issuance ---
      if (issuingMethods.includes("ethereum")) {
        try {
          // Switch to Sepolia if needed
          if (network !== "sepolia") {
            await switchToSepolia();
          }
          const signer = await getSigner();
          const unsignedCredential = buildVCPayload(certData) as Record<
            string,
            unknown
          >;
          const walletSigned = await signCredentialWithEthereum(unsignedCredential, signer);
          const result = await issueCertificateToEthereum(
            walletSigned.credential,
            DOCUMENT_STORE_CONFIG.address,
            signer
          );
          setEthereumResult({ ...result, ...walletSigned });
          if (result.txHash) {
            setIssuedTxHash(result.txHash);
          }
          if (result.documentHash) {
            await fetch("/api/credentials", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ externalId: certData.id, documentHash: result.documentHash }),
            }).catch(() => undefined);
          }
        } catch (err) {
          setEthereumResult({
            error: `Ethereum issuance failed: ${(err as Error).message}`,
          });
        }
      }

      setIssuedCert(certData);
    } catch (err) {
      setErrors([`Failed to issue certificate: ${(err as Error).message}`]);
    } finally {
      setIssuing(false);
    }
  };

  const handleDownload = () => {
    if (!issuedCert || !currentCredential) return;

    const blob = new Blob([JSON.stringify(currentCredential, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const uuid = issuedCert.id.split(":")[2] ?? "credential";
    a.download = currentCredentialHasProof
      ? `certificate-${uuid}.json`
      : `certificate-${uuid}-unsigned.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCredential = async () => {
    if (currentCredential) {
      try {
        await copyToClipboard(JSON.stringify(currentCredential, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        setErrors([`Unable to copy credential: ${(error as Error).message}`]);
      }
    }
  };

  const handleDownloadBatchCertificate = (item: IssuedCertificateItem) => {
    const blob = new Blob([JSON.stringify(item.certificate, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchIssuedCertificatesChange = (certificates: IssuedCertificateItem[]) => {
    setBatchIssuedCertificates(certificates);
    setBatchDownloadError(null);
  };

  const handleDownloadAllBatchCertificates = async () => {
    if (batchIssuedCertificates.length === 0 || downloadingBatchZip) return;

    setBatchDownloadError(null);
    setDownloadingBatchZip(true);

    try {
      const result = await downloadCertificatesZip(
        batchIssuedCertificates,
        "batch-issued-certificates.zip"
      );

      if (result.failedFiles.length > 0) {
        const visibleFailedFiles = result.failedFiles
          .slice(0, MAX_VISIBLE_FAILED_FILES)
          .map((file) => {
            const safeName = sanitizeCertificateFileNameForZip(file);
            return safeName.length <= MAX_FAILED_FILE_NAME_LENGTH
              ? safeName
              : `${safeName.slice(0, MAX_FAILED_FILE_NAME_LENGTH - 3)}...`;
          });
        const hiddenFailedCount = result.failedFiles.length - visibleFailedFiles.length;
        const failedSummary =
          hiddenFailedCount > 0
            ? `${visibleFailedFiles.join(", ")}, and ${hiddenFailedCount} more`
            : visibleFailedFiles.join(", ");

        setBatchDownloadError(
          `Downloaded ${result.added}/${result.total} certificates. Failed: ${failedSummary}`
        );
      }
    } catch (error) {
      setBatchDownloadError(
        `Unable to download ZIP: ${(error as Error).message}`
      );
    } finally {
      setDownloadingBatchZip(false);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_35%),linear-gradient(135deg,#0f172a_0%,#111827_18%,#0f172a_100%)] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <div className="grid items-center gap-8 sm:gap-10 md:gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                <Shield className="h-3.5 w-3.5" />
                TrustVC platform
              </div>
              <h1 className="max-w-xl text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Trusted credentials.<br />One connected workflow.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base md:text-lg">
                Issue, verify, and manage verifiable credentials with enterprise controls,
                DID-backed identity, and secure wallet-ready delivery workflows.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/insurance"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 min-h-[48px]"
                >
                  Issue Certificate
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href="/verify"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Verify Certificate
                </a>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300 sm:text-base">
                <div><span className="font-semibold text-white">W3C</span> native</div>
                <div><span className="font-semibold text-white">DID</span> ready</div>
                <div><span className="font-semibold text-white">Multi-issuer</span> support</div>
              </div>
            </div>
            <aside aria-labelledby="workflow-heading" className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">From issuance to verification</p>
              <h2 id="workflow-heading" className="mt-2 text-xl font-bold text-white">Your credential workflow</h2>
              <ol className="mt-5 space-y-4">
                {[
                  ["01", "Create & sign", "Choose a template and issue a signed credential."],
                  ["02", "Share & deliver", "Download certificates or deliver them to recipients."],
                  ["03", "Verify & manage", "Check authenticity and manage credential status."],
                ].map(([step, title, description]) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-xs font-bold text-cyan-200">{step}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-300">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
            
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-10 lg:px-8">
        <section aria-labelledby="quick-actions-heading">
          <div className="mb-4">
            <h2 id="quick-actions-heading" className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">What would you like to do?</h2>
            <p className="mt-1 text-sm text-slate-600">Go straight to the tools you need.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { href: "/insurance", title: "Issue certificates", description: "Create a single certificate or issue a batch from Excel or CSV.", icon: FileText, action: "Start issuing" },
              { href: "/verify", title: "Verify a credential", description: "Check a certificate's signature, authenticity, and revocation status.", icon: ShieldCheck, action: "Open verification" },
            ].map(({ href, title, description, icon: Icon, action }) => (
              <a key={href} href={href} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-600 sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700">{action}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
              </a>
            ))}
          </div>
        </section>

        <section aria-labelledby="standards-heading" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 id="standards-heading" className="text-lg font-bold text-slate-900">Built on open standards</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {[
              { title: "W3C credentials", description: "Verifiable Credentials following international W3C standards.", icon: ShieldCheck },
              { title: "Ethereum anchoring", description: "Optional on-chain document hashes for tamper-proof verification.", icon: CheckCircle },
              { title: "TradeTrust compatibility", description: "OpenAttestation-compatible workflows for credential verification.", icon: FileText },
            ].map(({ title, description, icon: Icon }) => (
              <div key={title} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" aria-hidden="true" />
                <div><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 sm:text-sm">FAQ</p>
          <h2 id="faq-heading" className="mt-2 text-xl font-bold text-slate-900">Common questions</h2>
          <div className="mt-4 grid gap-3 sm:gap-4 md:grid-cols-2">
            {[
              ["What is TrustVC?", "A verifiable credentials platform for issuing and validating trusted digital certificates across multiple institutional scenarios."],
              ["Can it support multiple issuers?", "Yes. The platform is designed to support multi-issuer operations with role-based governance and controlled issuance flows."],
              ["Does it support verification?", "Yes. Recipients and institutions can inspect credential authenticity and revocation status using a public verification experience."],
              ["Can it integrate with wallets?", "Yes. The platform is designed for wallet-ready delivery and compatibility with modern verifiable credential ecosystems."],
            ].map(([question, answer]) => (
              <div key={question} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                <h3 className="text-sm font-semibold text-slate-900 sm:text-base">{question}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Need an institutional workflow?</h2>
            <p className="mt-1 text-sm text-slate-300">Explore enterprise controls and multi-issuer operations.</p>
          </div>
          <a href="/enterprise" className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">Talk to sales<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></a>
        </section>

      </div>
    </div>
  );
}
