"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { buildVerificationUrl } from "../../lib/site";
import DeploymentGuide from "../../components/DeploymentGuide";
import CertificatePdfDownload from "../../components/CertificatePdfDownload";
import BatchIssuePanel, {
  BatchIssuedCertificatesPanel,
  IssuedCertificateItem,
} from "../../components/BatchIssuePanel";
import IssuingMethodSelector from "../../components/IssuingMethodSelector";
import { useWalletConnection } from "../../hooks/useWalletConnection";
import {
  CertificateData,
  generateCertificateId,
  buildVCPayload,
  getCredentialDocumentStore,
  issueCertificateToEthereum,
  signCredentialWithEthereum,
  type DIDIssuanceResult,
  type EthereumIssuanceResult,
} from "../../lib/trustvc";
import {
  formatDate,
  getISODateString,
  validateCertificateData,
  downloadCertificatesZip,
  sanitizeCertificateFileNameForZip,
  copyToClipboard,
  validateIssuingMethods,
} from "../../lib/certificate";
import {
  CERTIFICATE_TEMPLATES,
  DEFAULT_ISSUING_METHODS,
  DOCUMENT_STORE_CONFIG,
  DEPLOYMENT_STEPS,
  formatIssuingMethodLabels,
  IssuingMethod,
} from "../../lib/constants";
import {
  CertificateTemplateRenderer,
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_OPTIONS,
} from "../templates";

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

export default function InsurancePage() {
  const certificatePreviewRef = useRef<HTMLDivElement>(null);
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
  const [ethereumResult, setEthereumResult] = useState<EthereumIssuanceResult | null>(null);
  const [walletWarningDismissed, setWalletWarningDismissed] = useState(false);
  const [showDeploymentGuide, setShowDeploymentGuide] = useState(false);
  const [issueMode, setIssueMode] = useState<"single" | "batch">("single");
  const [issuingMethods, setIssuingMethods] = useState<IssuingMethod[]>(DEFAULT_ISSUING_METHODS);
  const [batchIssuedCertificates, setBatchIssuedCertificates] = useState<IssuedCertificateItem[]>([]);
  const [batchIssuing, setBatchIssuing] = useState(false);
  const [downloadingBatchZip, setDownloadingBatchZip] = useState(false);
  const [batchDownloadError, setBatchDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const storedPrefill = window.sessionStorage.getItem("trustvc-agent-prefill");
    if (!storedPrefill) return;
    window.sessionStorage.removeItem("trustvc-agent-prefill");
    try {
      const values = JSON.parse(storedPrefill) as Partial<IssueFormState>;
      setFormData((current) => ({ ...current, ...values }));
    } catch {
      // Ignore invalid assistant prefill state.
    }
  }, []);

  const currentCredential = useMemo(() => {
    if (didResult?.credential && (didResult.signed || didResult.walletSignature)) {
      return didResult.credential;
    }
    if (ethereumResult?.credential) return ethereumResult.credential;
    if (issuedCert) return buildVCPayload(issuedCert) as Record<string, unknown>;
    return null;
  }, [didResult, ethereumResult, issuedCert]);

  const currentCredentialHasProof = useMemo(
    () => Boolean(didResult?.signed || didResult?.walletSignature || ethereumResult?.credential),
    [didResult, ethereumResult]
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

    if (issuingMethods.includes("ethereum") && !issuingMethods.includes("did") && !connected) {
      setErrors(["Please connect MetaMask to sign the selected certificate."]);
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
            certificateFormat: "v1",
            statusProfile: "trustvc",
            renderMethod: "embedded",
          }),
        });

        const resultPayload = (await response.json()) as {
          signed?: boolean;
          credential?: Record<string, unknown>;
          error?: string;
          blockchainRegistration?: "scheduled" | "disabled";
        };

        if (!response.ok || resultPayload.error || !resultPayload.signed || !resultPayload.credential?.proof) {
          setErrors([
            response.status === 401
              ? "Log in as an issuer to issue certificates."
              : resultPayload.error ??
                (response.ok
                  ? "DID signing did not return a signed credential. No certificate was issued."
                  : `Issuance failed (HTTP ${response.status}).`),
          ]);
          setIssuing(false);
          return;
        }

        setDIDResult({
          credential: resultPayload.credential,
          signed: true,
        });
        if (issuingMethods.includes("ethereum")) {
          setEthereumResult(resultPayload.blockchainRegistration === "scheduled"
            ? { registrationScheduled: true }
            : { error: "Certificate issued, but platform blockchain registration is disabled." });
        }
      }

      if (issuingMethods.includes("ethereum") && !issuingMethods.includes("did")) {
        try {
          if (network !== "sepolia") {
            await switchToSepolia();
          }
          const signer = await getSigner();
          const credential = (await signCredentialWithEthereum(
            buildVCPayload(certData, "v1"), signer
          )).credential;
          const store = getCredentialDocumentStore(credential);
          if (store.network !== "sepolia") {
            throw new Error("Wallet issuance currently supports Sepolia Document Stores only.");
          }
          const result = await issueCertificateToEthereum(
            credential,
            store.address,
            signer
          );
          setEthereumResult(result);
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
    const recipientFileName = issuedCert.recipientName
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "recipient";
    a.download = currentCredentialHasProof
      ? `certificate-${recipientFileName}.json`
      : `certificate-${recipientFileName}-unsigned.json`;
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

  const walletControls = (
    <div className="space-y-2">
      {connected ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-gray-800">{truncateAddress(address!)}</span>
          <span className="text-gray-600">{balance}</span>
          <span className={network === "sepolia" ? "text-green-700" : "text-yellow-700"}>
            {network === "sepolia" ? "Sepolia" : network}
          </span>
          <button onClick={disconnect} className="p-2 text-gray-500 hover:text-red-500" title="Disconnect" aria-label="Disconnect wallet">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnectWallet}
          disabled={connecting}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {connecting ? "Connecting..." : "Connect MetaMask"}
        </button>
      )}
      {walletError && <p role="alert" className="text-sm text-red-600">{walletError}</p>}
      {isMetaMaskInstalled() === false && !walletWarningDismissed && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
          <span>MetaMask not detected. <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="underline">Install MetaMask</a></span>
          <button onClick={() => setWalletWarningDismissed(true)} aria-label="Dismiss MetaMask warning">×</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-10 lg:px-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700 sm:text-sm">Issue Certificates</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Issue trusted certificates</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
            Launch a verifiable credential workflow from a dedicated insurance operations console.
          </p>
        </div>

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

        {showDeploymentGuide && (
          <div className="mb-8">
            <DeploymentGuide
              steps={DEPLOYMENT_STEPS}
              documentStoreAddress={DOCUMENT_STORE_CONFIG.address}
              dnsLocation={DOCUMENT_STORE_CONFIG.identityProof.location}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:gap-8">
          <div className="card">
            <div className="flex items-center space-x-3 mb-4 md:mb-6">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-800">
                Issue New Certificate
              </h2>
            </div>

            <div className="mb-4 flex flex-col overflow-hidden rounded-lg border border-gray-200 md:mb-6 sm:flex-row">
              <button
                onClick={() => setIssueMode("single")}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                  issueMode === "single"
                    ? "bg-primary text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Single</span>
              </button>
              <button
                onClick={() => setIssueMode("batch")}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                  issueMode === "batch"
                    ? "bg-primary text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Batch (Excel / CSV)</span>
              </button>
            </div>

            {issueMode === "single" && (
              <>
                <div className="space-y-3 md:space-y-4">
                  <div>
                    <label className="label text-sm md:text-base">Recipient Name</label>
                    <input
                      type="text"
                      name="recipientName"
                      value={formData.recipientName}
                      onChange={handleInputChange}
                      className="input-field text-sm md:text-base"
                      placeholder="e.g., Ahmad bin Rahman"
                    />
                  </div>

                  <div>
                    <label className="label text-sm md:text-base">Recipient Email</label>
                    <input
                      type="email"
                      name="recipientEmail"
                      value={formData.recipientEmail}
                      onChange={handleInputChange}
                      className="input-field text-sm md:text-base"
                      placeholder="e.g., ahmad@company.sg"
                    />
                  </div>

                  <div>
                    <label className="label text-sm md:text-base">Certificate Type</label>
                    <select
                      name="certificateType"
                      value={formData.certificateType}
                      onChange={handleInputChange}
                      className="input-field text-sm md:text-base"
                    >
                      {Object.values(CERTIFICATE_TEMPLATES).map((template) => (
                        <option key={template.name} value={template.name}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label text-sm md:text-base">Template Style</label>
                    <select
                      name="templateId"
                      value={formData.templateId}
                      onChange={handleInputChange}
                      className="input-field text-sm md:text-base"
                    >
                      {TEMPLATE_OPTIONS.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {TEMPLATE_OPTIONS.find((t) => t.id === formData.templateId)?.description}
                    </p>
                  </div>

                  <div>
                    <label className="label text-sm md:text-base">Description / Achievement</label>
                    <input
                      type="text"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      className="input-field text-sm md:text-base"
                      placeholder="e.g., Certified in AI Governance"
                    />
                  </div>

                  <div>
                    <label className="inline-flex items-center gap-2 text-sm md:text-base font-medium text-gray-700">
                      <input
                        type="checkbox"
                        name="hasValidity"
                        checked={formData.hasValidity}
                        onChange={handleInputChange}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span>Has Validity</span>
                    </label>
                  </div>

                  {formData.hasValidity && (
                    <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
                      <div>
                        <label className="label text-sm md:text-base">Valid From</label>
                        <input
                          type="date"
                          name="validFrom"
                          value={formData.validFrom}
                          onChange={handleInputChange}
                          className="input-field text-sm md:text-base"
                        />
                      </div>
                      <div>
                        <label className="label text-sm md:text-base">Valid Until</label>
                        <input
                          type="date"
                          name="validUntil"
                          value={formData.validUntil ?? ""}
                          min={formData.validFrom}
                          onChange={handleInputChange}
                          className="input-field text-sm md:text-base"
                        />
                      </div>
                    </div>
                  )}

                  <IssuingMethodSelector
                    selectedMethods={issuingMethods}
                    onToggle={handleToggleIssuingMethod}
                    headerAction={walletControls}
                  />
                  {issuingMethods.includes("did") && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                      <p className="font-semibold">Revocation prerequisites</p>
                      <p className="mt-1 text-xs text-blue-800">
                        These need to be in place before a credential can be revoked later:
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-blue-800">
                        {(issuingMethods.length === 1 ? [
                          "Enable signed status lists on the server and apply the status-list migration before issuing.",
                          "Keep the published DID assertion key and signing service available.",
                          "Use the revocation controls to revoke, suspend or reinstate; verifiers fetch updated signed lists.",
                        ] : DID_REVOCATION_PREREQUISITES).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {issuingMethods.includes("ethereum") && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                      <p className="font-semibold">Ethereum revocation prerequisites</p>
                      <p className="mt-1 text-xs text-green-800">
                        These need to be in place before a credential can be revoked on-chain:
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-green-800">
                        {ETHEREUM_REVOCATION_PREREQUISITES.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
                    DID credentials are signed by the server. MetaMask is required only for Ethereum issuance; it does not replace the issuer DID proof.
                  </div>

                  <button
                    onClick={handleIssue}
                    disabled={issuing || (issuingMethods.includes("ethereum") && !connected)}
                    className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
                  >
                    {issuing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    <span>{issuing ? "Issuing..." : "Issue Certificate"}</span>
                  </button>

                  {errors.length > 0 && (
                    <div className="mt-3 p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-sm md:text-base">
                            Please fix the following:
                          </p>
                          <ul className="text-xs md:text-sm text-red-600 mt-1 list-disc list-inside">
                            {errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {issueMode === "single" && issuedCert && (didResult || ethereumResult) && (
                  <div className="mt-3 md:mt-4 space-y-2">
                    {didResult && (
                      <div
                        className={`p-3 rounded-lg border ${
                          didResult.signed
                            ? "bg-green-50 border-green-200"
                            : didResult.error
                            ? "bg-amber-50 border-amber-200"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          {didResult.signed ? (
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-medium text-sm ${
                                didResult.signed
                                  ? "text-green-800"
                                  : "text-amber-800"
                              }`}
                            >
                              {didResult.signed
                                ? "DID Credential Signed"
                                : didResult.walletSignature
                                ? "DID Credential Signed by MetaMask"
                                : "DID Credential (Unsigned Draft)"}
                            </p>
                            {didResult.walletAddress && (
                              <p className="mt-1 break-all text-xs text-cyan-700">
                                MetaMask signature: {didResult.walletAddress}
                              </p>
                            )}
                            {didResult.error && (
                              <p className="text-xs text-amber-700 mt-1">
                                {didResult.error}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {ethereumResult?.registrationScheduled && (
                      <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                        Certificate issued. Optional blockchain registration is pending on the platform;
                        its transaction and outcome are recorded in the audit log. TrustVC verification uses the signed status lists.
                      </p>
                    )}
                    {ethereumResult && !ethereumResult.registrationScheduled && (
                      <div
                        className={`p-3 rounded-lg border ${
                          ethereumResult.txHash || ethereumResult.alreadyRegistered
                            ? "bg-green-50 border-green-200"
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          {ethereumResult.txHash || ethereumResult.alreadyRegistered ? (
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            {ethereumResult.txHash || ethereumResult.alreadyRegistered ? (
                              <>
                                <p className="font-medium text-green-800 text-sm">
                                  {ethereumResult.alreadyRegistered
                                    ? "Already registered on Ethereum (Sepolia)"
                                    : "Issued on Ethereum (Sepolia)"}
                                </p>
                                {ethereumResult.walletAddress && (
                                  <p className="mt-1 text-xs text-green-700 break-all">
                                    Signed by MetaMask: {ethereumResult.walletAddress}
                                  </p>
                                )}
                                {ethereumResult.txHash && <p className="text-xs text-green-700 mt-1 font-mono break-all">
                                  Tx:{" "}
                                  <a
                                    href={`https://sepolia.etherscan.io/tx/${ethereumResult.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline inline-flex items-center space-x-1"
                                  >
                                    <span>
                                      {ethereumResult.txHash.slice(0, 18)}…
                                    </span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  </a>
                                </p>}
                                <p className="text-xs text-green-600 mt-0.5">
                                  Store:{" "}
                                  <a
                                    href={`https://sepolia.etherscan.io/address/${DOCUMENT_STORE_CONFIG.address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline inline-flex items-center space-x-1"
                                  >
                                    <span>
                                      {DOCUMENT_STORE_CONFIG.address.slice(0, 12)}…
                                    </span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  </a>
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="font-medium text-red-800 text-sm">
                                  Ethereum Issuance Failed
                                </p>
                                <p className="text-xs text-red-700 mt-1">
                                  {ethereumResult.error}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {issueMode === "batch" && (
              <BatchIssuePanel
                connected={connected}
                issuingMethods={issuingMethods}
                onToggleIssuingMethod={handleToggleIssuingMethod}
                onIssuedCertificatesChange={handleBatchIssuedCertificatesChange}
                onIssuingChange={setBatchIssuing}
                walletControls={walletControls}
              />
            )}
          </div>

          {issueMode === "batch" ? (
            <div>
              <BatchIssuedCertificatesPanel
                issuedCertificates={batchIssuedCertificates}
                issuing={batchIssuing}
                onDownloadCertificate={handleDownloadBatchCertificate}
                onDownloadAllCertificates={handleDownloadAllBatchCertificates}
                downloadingAllCertificates={downloadingBatchZip}
                downloadAllError={batchDownloadError}
              />
            </div>
          ) : (
            <div>
              <h3 className="text-base md:text-lg font-semibold text-gray-700 mb-3 md:mb-4">
                Certificate Preview
              </h3>
              {issuedCert ? (
                <div className="certificate-preview">
                  {!currentCredentialHasProof && (
                    <div className="mb-3 md:mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 md:text-sm">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        This credential is currently an unsigned draft. Downloaded JSON
                        will be saved with a{" "}
                        <span className="font-semibold">-unsigned.json</span> filename
                        and will fail verification until a cryptographic{" "}
                        <span className="font-semibold"> proof</span> is added during
                        signing.
                      </p>
                    </div>
                  )}
                  <div className="space-y-4">
                    <div ref={certificatePreviewRef} className="bg-white">
                      <CertificateTemplateRenderer
                        certificate={{
                          ...issuedCert,
                          verificationUrl: buildVerificationUrl(window.location.origin, issuedCert.id),
                        }}
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs md:text-sm">
                      <div className="space-y-1 text-gray-700">
                        <p>Issued: {formatDate(issuedCert.issueDate)}</p>
                        <p>
                          Valid: {formatDate(issuedCert.validFrom)} to{" "}
                          {issuedCert.validUntil ? formatDate(issuedCert.validUntil) : "N/A"}
                        </p>
                        <p>
                          Methods: {formatIssuingMethodLabels(issuedCert.issuingMethods)}
                        </p>
                        <p>
                          Template:{" "}
                          {TEMPLATE_OPTIONS.find((t) => t.id === issuedCert.templateId)?.label ||
                            TEMPLATE_OPTIONS.find((t) => t.id === DEFAULT_TEMPLATE_ID)?.label}
                        </p>
                      </div>
                      <div className="mt-4 border-t border-gray-200 pt-3 text-center">
                        <p className="text-xs text-gray-500">
                          ID: {issuedCert.id.split(":")[2]}
                        </p>
                        <div className="mt-2 flex justify-center">
                          <QRCodeSVG
                            value={buildVerificationUrl(window.location.origin, issuedCert.id)}
                            size={60}
                            bgColor="#ffffff"
                            fgColor="#1e3a5f"
                          />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">Scan to verify</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 md:gap-4 mt-4 md:mt-6">
                    <CertificatePdfDownload
                      certificateRef={certificatePreviewRef}
                      recipientName={issuedCert.recipientName}
                    />
                    <button
                      onClick={handleDownload}
                      className="flex-1 bg-white text-primary px-3 md:px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 hover:bg-gray-100 text-sm md:text-base"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download JSON</span>
                    </button>
                    <button
                      onClick={handleCopyCredential}
                      className="flex-1 bg-white text-primary px-3 md:px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 hover:bg-gray-100 text-sm md:text-base"
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>{copied ? "Copied!" : "Copy Credential"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card bg-gray-100 flex items-center justify-center h-48 md:h-80">
                  <div className="text-center text-gray-500">
                    <FileText className="w-10 h-10 md:w-16 md:h-16 mx-auto mb-3 md:mb-4 opacity-50" />
                    <p className="text-sm md:text-base">Fill in the form to see preview</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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
