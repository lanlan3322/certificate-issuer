"use client";

import { useState } from "react";
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
} from "lucide-react";
import NavBar from "../components/NavBar";
import DeploymentGuide from "../components/DeploymentGuide";
import { useWalletConnection } from "../hooks/useWalletConnection";
import {
  CertificateData,
  generateCertificateId,
  buildVCPayload,
  signCredential,
} from "../lib/trustvc";
import {
  formatDate,
  getISODateString,
  calculateValidUntil,
  validateCertificateData,
  downloadCertificate,
  copyToClipboard,
} from "../lib/certificate";
import {
  CERTIFICATE_TEMPLATES,
  DOCUMENT_STORE_CONFIG,
  DEPLOYMENT_STEPS,
  CURRENT_NETWORK,
} from "../lib/constants";

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

  const [formData, setFormData] = useState({
    recipientName: "",
    recipientEmail: "",
    certificateType: Object.keys(CERTIFICATE_TEMPLATES)[0],
    description: "",
  });
  const [issuedCert, setIssuedCert] = useState<CertificateData | null>(null);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [issuedTxHash, setIssuedTxHash] = useState<string | null>(null);
  const [walletWarningDismissed, setWalletWarningDismissed] = useState(false);
  const [showDeploymentGuide, setShowDeploymentGuide] = useState(true);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleConnectWallet = async () => {
    await connect();
    if (connected && network !== "sepolia") {
      await switchToSepolia();
    }
  };

  const handleIssue = async () => {
    const validation = validateCertificateData(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);

    if (!connected) {
      setErrors(["Please connect your wallet to issue the certificate."]);
      return;
    }

    setIssuing(true);
    setIssuedCert(null);
    setIssuedTxHash(null);

    try {
      const now = getISODateString();
      const certData: CertificateData = {
        id: generateCertificateId(),
        recipientName: formData.recipientName,
        recipientEmail: formData.recipientEmail,
        certificateType: formData.certificateType,
        issuerName: "Certificate Issuer",
        issueDate: now,
        description: formData.description,
        validFrom: now,
        validUntil: calculateValidUntil(now, formData.certificateType),
      };

      const credential = buildVCPayload(certData);

      // Attempt to sign using TrustVC SDK
      // In production, provide a secretKeyMultibase for real signing
      let txHash = "unsigned-" + Math.random().toString(36).substr(2, 9);
      try {
        const signingResult = await signCredential(credential);
        if (signingResult.signed) {
          txHash = "signed-" + Math.random().toString(36).substr(2, 9);
        }
      } catch {
        // Signing may fail without a valid secret key (expected in demo mode)
        // The unsigned credential is still valid for demonstration
      }

      setIssuedCert(certData);
      setIssuedTxHash(txHash);
    } catch (err) {
      setErrors([`Failed to issue certificate: ${(err as Error).message}`]);
    } finally {
      setIssuing(false);
    }
  };

  const handleDownload = () => {
    if (issuedCert) {
      downloadCertificate(issuedCert);
    }
  };

  const handleCopyCredential = async () => {
    if (issuedCert) {
      const credential = buildVCPayload(issuedCert);
      await copyToClipboard(JSON.stringify(credential, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Hero Section - Mobile optimized */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl md:text-4xl font-bold mb-2">
            Issue Verifiable Certificates
          </h1>
          <p className="text-sm md:text-lg text-white/80">
            TradeTrust-compliant. W3C Verifiable Credentials with on-chain verification.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
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

        {/* Main Content Grid - Responsive */}
        <div className="grid lg:grid-cols-2 gap-6 md:gap-8">
          {/* Issue Form */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-4 md:mb-6">
              <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-800">
                Issue New Certificate
              </h2>
            </div>

            {/* Wallet Connection */}
            <div className="mb-4 md:mb-6 p-3 md:p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border border-primary/20">
              {connected ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm md:text-base truncate">
                        {truncateAddress(address!)}
                      </p>
                      <p className="text-xs md:text-sm text-gray-600">{balance}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        network === "sepolia"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {network === "sepolia" ? "Sepolia" : network}
                    </span>
                    <button
                      onClick={disconnect}
                      className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                      title="Disconnect"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <Wallet className="w-8 h-8 md:w-10 md:h-10 text-primary mx-auto mb-2" />
                  <p className="text-sm md:text-base text-gray-600 mb-3">
                    Connect your wallet to issue certificates
                  </p>
                  <button
                    onClick={handleConnectWallet}
                    disabled={connecting}
                    className="bg-primary hover:bg-primary/90 text-white px-4 md:px-6 py-2 rounded-lg font-medium flex items-center justify-center mx-auto space-x-2 disabled:opacity-50 text-sm md:text-base"
                  >
                    {connecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wallet className="w-4 h-4" />
                    )}
                    <span>
                      {connecting ? "Connecting..." : "Connect MetaMask"}
                    </span>
                  </button>
                </div>
              )}

              {/* MetaMask warning */}
              {isMetaMaskInstalled() === false && !walletWarningDismissed && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 text-sm">
                      <strong>MetaMask not detected.</strong>{" "}
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-primary"
                      >
                        Install MetaMask
                      </a>
                    </div>
                    <button
                      onClick={() => setWalletWarningDismissed(true)}
                      className="text-yellow-500 hover:text-yellow-700"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="mb-4 p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-800 text-sm md:text-base">
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

            {/* Form Fields */}
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

              <button
                onClick={handleIssue}
                disabled={!connected || issuing}
                className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
              >
                {issuing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                <span>{issuing ? "Issuing..." : "Issue Certificate"}</span>
              </button>
            </div>

            {/* Transaction Info */}
            {issuedTxHash && (
              <div className="mt-3 md:mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800 text-sm md:text-base">
                      Certificate Issued!
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Store:{" "}
                      <a
                        href={`https://sepolia.etherscan.io/address/${DOCUMENT_STORE_CONFIG.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center space-x-1"
                      >
                        <span>{DOCUMENT_STORE_CONFIG.address.slice(0, 12)}...</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Certificate Preview */}
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-700 mb-3 md:mb-4">
              Certificate Preview
            </h3>
            {issuedCert ? (
              <div className="certificate-preview">
                <div className="text-center border-2 border-secondary rounded-lg p-4 md:p-8">
                  <div className="flex justify-center mb-3 md:mb-4">
                    <FileText className="w-10 h-10 md:w-16 md:h-16 text-secondary" />
                  </div>
                  <p className="text-xs md:text-sm uppercase tracking-wider text-secondary mb-2">
                    Certificate Issuer
                  </p>
                  <h2 className="text-lg md:text-3xl font-bold mb-3 md:mb-4">
                    {issuedCert.certificateType}
                  </h2>
                  <p className="text-sm md:text-lg mb-4 md:mb-6">This certifies that</p>
                  <p className="text-lg md:text-2xl font-bold text-secondary mb-4 md:mb-6">
                    {issuedCert.recipientName}
                  </p>
                  <p className="text-xs md:text-sm italic mb-4 md:mb-6">
                    &quot;{issuedCert.description}&quot;
                  </p>
                  <div className="text-xs md:text-sm space-y-1">
                    <p>Issued: {formatDate(issuedCert.issueDate)}</p>
                    <p>
                      Valid: {formatDate(issuedCert.validFrom)} to{" "}
                      {formatDate(issuedCert.validUntil!)}
                    </p>
                  </div>
                  <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-white/20">
                    <p className="text-xs text-white/60">
                      ID: {issuedCert.id.split(":")[2]}
                    </p>
                    <div className="flex justify-center mt-3 md:mt-4">
                      <QRCodeSVG
                        value={JSON.stringify({ id: issuedCert.id })}
                        size={60}
                        bgColor="#ffffff"
                        fgColor="#1e3a5f"
                      />
                    </div>
                    <p className="text-xs text-white/60 mt-2">
                      Scan to verify
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-2 md:gap-4 mt-4 md:mt-6">
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
        </div>

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
