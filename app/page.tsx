"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
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
  Info,
  Layers,
  Palette,
  Send,
  KeyRound,
} from "lucide-react";
import DeploymentGuide from "../components/DeploymentGuide";
import BatchIssuePanel, {
  BatchIssuedCertificatesPanel,
  IssuedCertificateItem,
} from "../components/BatchIssuePanel";
import IssuingMethodSelector from "../components/IssuingMethodSelector";
import { useWalletConnection } from "../hooks/useWalletConnection";
import {
  CertificateData,
  generateCertificateId,
  buildVCPayload,
  issueCertificateToEthereum,
  issueDIDCertificate,
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
  DEPLOYMENT_STEPS,
  formatIssuingMethodLabels,
  IssuingMethod,
} from "../lib/constants";
import {
  CertificateTemplateRenderer,
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_OPTIONS,
} from "./templates";

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
}

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
  const [showDeploymentGuide, setShowDeploymentGuide] = useState(false);
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
  const [issuerAuthenticated, setIssuerAuthenticated] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me", { method: "POST" })
      .then(async (response) => response.ok ? await response.json() as { user?: unknown } : null)
      .then((payload) => setIssuerAuthenticated(Boolean(payload?.user)))
      .catch(() => setIssuerAuthenticated(false));
  }, []);
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
        let didResult: DIDIssuanceResult;

        try {
          const response = await fetch("/api/issue", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: certData,
              type: "did",
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const resultPayload = (await response.json()) as {
            signed?: boolean;
            credential?: Record<string, unknown>;
            error?: string;
          };

          if (resultPayload.error) {
            throw new Error(resultPayload.error);
          }

          didResult = {
            credential: (resultPayload.credential ?? buildVCPayload(certData)) as Record<string, unknown>,
            signed: Boolean(resultPayload.signed),
            error: resultPayload.error,
          };
        } catch {
          didResult = await issueDIDCertificate(certData);
        }

        setDIDResult({
          credential: didResult.credential ?? (buildVCPayload(certData) as Record<string, unknown>),
          signed: Boolean(didResult.signed),
          error: didResult.error,
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
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                <Shield className="h-3.5 w-3.5" />
                TrustVC platform
              </div>
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">
                Trusted digital credentials for institutions that need scale and trust.
              </h1>
              <p className="mt-5 max-w-xl text-base text-slate-200 md:text-lg">
                Issue, verify, and manage verifiable credentials with enterprise controls,
                DID-backed identity, and secure wallet-ready delivery workflows.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/insurance"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Launch Insurance
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-6 text-sm text-slate-200">
                <div><span className="font-semibold text-white">W3C</span> native</div>
                <div><span className="font-semibold text-white">DID</span> ready</div>
                <div><span className="font-semibold text-white">Multi-issuer</span> support</div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-slate-900/20 backdrop-blur-sm">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>Status</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">Operational</span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <div className="text-sm text-slate-400">Credentials issued</div>
                    <div className="mt-2 text-3xl font-bold text-white">12.4K</div>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <div className="text-sm text-slate-400">Revocations</div>
                    <div className="mt-2 text-3xl font-bold text-white">387</div>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4 sm:col-span-2">
                    <div className="text-sm text-slate-400">Verified network</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-lg font-semibold text-white">Sepolia + DID</span>
                      <span className="text-emerald-300">Healthy</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mb-12 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="section-card">
            <p className="pill mb-4">Solutions</p>
            <h3 className="text-2xl font-bold text-slate-900">A platform built for institutional trust</h3>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              TrustVC brings together credential creation, identity management, verification, and wallet delivery in one secure operating layer for modern organizations.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                "Certificates",
                "Templates",
                "Issuers",
                "Recipients",
                "Verification",
                "Revocation",
              ].map((item) => (
                <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Dashboard preview</p>
              <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300">Live</span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["Credential issuance", "1,284"],
                ["Templates active", "18"],
                ["Validation uptime", "99.98%"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-3 py-2">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-base font-bold text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12 grid gap-6 lg:grid-cols-3">
          <div className="section-card">
            <p className="pill mb-4">How it works</p>
            <h3 className="text-xl font-bold text-slate-900">Issue with a trusted workflow</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Create credentials, validate metadata, and publish signed artifacts through a controlled issuance process designed for institutional trust.
            </p>
          </div>
          <div className="section-card">
            <p className="pill mb-4">Why TrustVC</p>
            <h3 className="text-xl font-bold text-slate-900">Built for verification and governance</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Every certificate is anchored to a verifiable identity model, with secure handling for revocation, issuance history, and recipient verification.
            </p>
          </div>
          <div className="section-card">
            <p className="pill mb-4">Platform features</p>
            <h3 className="text-xl font-bold text-slate-900">Operational clarity at scale</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Support multi-issuer operations, template-driven issuance, wallet-ready delivery, and public verification from a unified product experience.
            </p>
          </div>
        </section>

        <section className="mb-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Certificate lifecycle</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">From creation to verification</h2>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Create", "Build an issuer-ready credential using templates, validity rules, and structured field data."],
              ["Issue", "Publish the credential through a secure, auditable issuance flow backed by DID or blockchain verification."],
              ["Deliver", "Share credentials to recipients, wallets, or verification endpoints with a professional user experience."],
              ["Verify", "Allow recipients and institutions to validate authenticity, trust, and revocation state quickly."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  {title}
                </div>
                <p className="text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Issuers we serve</p>
            <h2 className="mt-3 text-3xl font-bold">Education, compliance, and public-sector trust</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Training providers",
                "Certification bodies",
                "Government agencies",
                "Enterprise learning teams",
                "Professional associations",
                "Compliance programs",
              ].map((item) => (
                <div key={item} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="section-card">
            <p className="pill mb-4">Analytics</p>
            <h3 className="text-2xl font-bold text-slate-900">Operational insight across issuance</h3>
            <div className="mt-5 space-y-4">
              {[
                ["Issued", "12.4K"],
                ["Verified", "97.8%"],
                ["Revoked", "387"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-600">{label}</span>
                  <span className="text-xl font-bold text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12 rounded-3xl border border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-slate-50 p-6 shadow-sm md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Pricing</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Simple plans for growing trust programs</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Starter", "$0", "For pilots and early credential programs"],
                ["Professional", "$49/mo", "For active issuance and verification workflows"],
                ["Enterprise", "Custom", "For multi-issuer governance and large-scale deployments"],
              ].map(([plan, price, description]) => (
                <div key={plan} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-600">{plan}</div>
                  <div className="mt-2 text-3xl font-black text-slate-900">{price}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">FAQ</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              ["What is TrustVC?", "A verifiable credentials platform for issuing and validating trusted digital certificates across multiple institutional scenarios."],
              ["Can it support multiple issuers?", "Yes. The platform is designed to support multi-issuer operations with role-based governance and controlled issuance flows."],
              ["Does it support verification?", "Yes. Recipients and institutions can inspect credential authenticity and revocation status using a public verification experience."],
              ["Can it integrate with wallets?", "Yes. The platform is designed for wallet-ready delivery and compatibility with modern verifiable credential ecosystems."],
            ].map(([question, answer]) => (
              <div key={question} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-semibold text-slate-900">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 rounded-3xl bg-slate-900 p-8 text-center text-white shadow-[0_20px_50px_rgba(15,23,42,0.22)]">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Ready to launch</p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">Build trust into every credential.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            TrustVC gives teams a clear path from certificate creation to public verification in a secure, scalable, and enterprise-ready platform.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="/insurance" className="btn-primary bg-white text-slate-900 hover:bg-slate-100">Launch Insurance</a>
            <a href="/enterprise" className="btn-secondary border-slate-700 bg-slate-800 text-white hover:border-slate-600 hover:bg-slate-700">Talk to sales</a>
          </div>
        </section>

        {/* Deployment Guide Toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowDeploymentGuide(!showDeploymentGuide)}
            className="flex items-center space-x-2 text-primary hover:text-primary/80 transition-colors"
          >
            <Info className="w-5 h-5" />
            <span className="font-medium">
              {showDeploymentGuide ? "Hide" : "Show"} Deployment Guide
            </span>
          </button>
        </div>

        {/* Deployment Guide */}
        {showDeploymentGuide && (
          <div className="mb-8">
            <DeploymentGuide
              steps={DEPLOYMENT_STEPS}
              documentStoreAddress={DOCUMENT_STORE_CONFIG.address}
              dnsLocation={DOCUMENT_STORE_CONFIG.identityProof.location}
            />
          </div>
        )}

        {issuerAuthenticated && (
          <section className="mb-12 rounded-3xl border border-cyan-200 bg-cyan-50/70 p-6 shadow-sm dark:border-cyan-900 dark:bg-cyan-950/30 md:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Issuer workspace</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Manage your credential program</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-300">Your issuer tools are ready. Configure identity, branding, delivery, and wallet workflows from one place.</p>
              </div>
              <a href="/issuer" className="text-sm font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200">Open issuer dashboard →</a>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["/branding", "Branding", "Manage issuer identity and visual presentation.", Palette],
                ["/wallet", "Wallet", "Review wallet connection and signing readiness.", Wallet],
                ["/delivery", "Delivery", "Prepare recipient delivery and verification bundles.", Send],
                ["/did", "DID lifecycle", "Create, rotate, and manage issuer DIDs.", KeyRound],
              ].map(([href, title, description, Icon]) => {
                const WorkspaceIcon = Icon as typeof Palette;
                return (
                  <a key={String(href)} href={String(href)} className="group rounded-2xl border border-cyan-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                    <WorkspaceIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                    <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-300">{String(title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{String(description)}</p>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* Info Cards - Responsive Grid */}
        <div className="mt-8 md:mt-12 grid md:grid-cols-3 gap-4 md:gap-6">
          <div className="card text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
              <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-1 md:mb-2 text-sm md:text-base">W3C Standard</h3>
            <p className="text-xs md:text-sm text-gray-600">
              Verifiable Credentials following international W3C standards
            </p>
          </div>
          <div className="card text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
              <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-secondary" />
            </div>
            <h3 className="font-semibold mb-1 md:mb-2 text-sm md:text-base">On-Chain</h3>
            <p className="text-xs md:text-sm text-gray-600">
              Document hashes stored on Ethereum for tamper-proof verification
            </p>
          </div>
          <div className="card text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-accent" />
            </div>
            <h3 className="font-semibold mb-1 md:mb-2 text-sm md:text-base">TradeTrust</h3>
            <p className="text-xs md:text-sm text-gray-600">
              OpenAttestation-compatible for universal verification
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
