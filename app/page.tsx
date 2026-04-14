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
} from "lucide-react";
import NavBar from "../components/NavBar";
import { useWalletConnection } from "../hooks/useWalletConnection";
import {
  CertificateData,
  generateCertificateId,
  buildVCPayload,
} from "../lib/trustvc";
import {
  formatDate,
  getISODateString,
  calculateValidUntil,
  validateCertificateData,
  downloadCertificate,
  copyToClipboard,
} from "../lib/certificate";
import { CERTIFICATE_TEMPLATES, TRUSTVC_CONFIG } from "../lib/constants";

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

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleConnectWallet = async () => {
    await connect();
    // Check if we need to switch to Sepolia
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
        issuerName: "IMDA Training Academy",
        issueDate: now,
        description: formData.description,
        validFrom: now,
        validUntil: calculateValidUntil(now, formData.certificateType),
      };

      // Build the credential payload
      const credential = buildVCPayload(certData);

      // For demo purposes, we create the signed credential
      // In production, this would call TrustVC SDK to sign and issue on-chain
      setIssuedCert(certData);
      setIssuedTxHash("demo-tx-hash-" + Math.random().toString(36).substr(2, 9));
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

  // Truncate wallet address for display
  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-2">
            Issue Verifiable Certificates
          </h1>
          <p className="text-lg text-white/80">
            Powered by TrustVC, managed by IMDA. W3C Verifiable Credentials
            with on-chain verification.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Issue Form */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-6">
              <FileText className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-gray-800">
                Issue New Certificate
              </h2>
            </div>

            {/* Wallet Connection Section */}
            <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border border-primary/20">
              {connected ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">
                        {truncateAddress(address!)}
                      </p>
                      <p className="text-sm text-gray-600">{balance}</p>
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
                  <Wallet className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="text-gray-600 mb-3">
                    Connect your wallet to issue certificates
                  </p>
                  <button
                    onClick={handleConnectWallet}
                    disabled={connecting}
                    className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg font-medium flex items-center justify-center mx-auto space-x-2 disabled:opacity-50"
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

              {/* MetaMask not installed warning */}
              {isMetaMaskInstalled() === false && !walletWarningDismissed && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-yellow-800">
                      <strong>MetaMask not detected.</strong> Please install the{" "}
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        MetaMask browser extension
                      </a>{" "}
                      to connect your wallet.
                    </p>
                  </div>
                  <button
                    onClick={() => setWalletWarningDismissed(true)}
                    className="text-yellow-500 hover:text-yellow-700"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">
                      Please fix the following:
                    </p>
                    <ul className="text-sm text-red-600 mt-1 list-disc list-inside">
                      {errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Recipient Name</label>
                <input
                  type="text"
                  name="recipientName"
                  value={formData.recipientName}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="e.g., Ahmad bin Rahman"
                />
              </div>

              <div>
                <label className="label">Recipient Email</label>
                <input
                  type="email"
                  name="recipientEmail"
                  value={formData.recipientEmail}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="e.g., ahmad@company.sg"
                />
              </div>

              <div>
                <label className="label">Certificate Type</label>
                <select
                  name="certificateType"
                  value={formData.certificateType}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  {Object.values(CERTIFICATE_TEMPLATES).map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Description / Achievement</label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="e.g., Certified in AI Governance"
                />
              </div>

              <button
                onClick={handleIssue}
                disabled={!connected || issuing}
                className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800">
                      Certificate Issued Successfully!
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Document store:{" "}
                      <a
                        href={`https://sepolia.etherscan.io/address/${TRUSTVC_CONFIG.documentStoreAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline flex items-center inline-flex space-x-1"
                      >
                        <span>{TRUSTVC_CONFIG.documentStoreAddress.slice(0, 10)}...</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                    <p className="text-xs text-green-600">
                      Transaction:{" "}
                      <a
                        href={`https://sepolia.etherscan.io/tx/${issuedTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline flex items-center inline-flex space-x-1"
                      >
                        <span>{issuedTxHash.slice(0, 20)}...</span>
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
            <h3 className="text-lg font-semibold text-gray-700 mb-4">
              Certificate Preview
            </h3>
            {issuedCert ? (
              <div className="certificate-preview">
                <div className="text-center border-2 border-secondary rounded-lg p-8">
                  <div className="flex justify-center mb-4">
                    <FileText className="w-16 h-16 text-secondary" />
                  </div>
                  <p className="text-sm uppercase tracking-wider text-secondary mb-2">
                    IMDA Training Academy
                  </p>
                  <h2 className="text-3xl font-bold mb-4">
                    {issuedCert.certificateType}
                  </h2>
                  <p className="text-lg mb-6">This certifies that</p>
                  <p className="text-2xl font-bold text-secondary mb-6">
                    {issuedCert.recipientName}
                  </p>
                  <p className="text-sm italic mb-6">
                    &quot;{issuedCert.description}&quot;
                  </p>
                  <div className="text-sm space-y-1">
                    <p>Issued: {formatDate(issuedCert.issueDate)}</p>
                    <p>
                      Valid: {formatDate(issuedCert.validFrom)} to{" "}
                      {formatDate(issuedCert.validUntil!)}
                    </p>
                  </div>
                  <div className="mt-6 pt-6 border-t border-white/20">
                    <p className="text-xs text-white/60">
                      ID: {issuedCert.id.split(":")[2]}
                    </p>
                    <div className="flex justify-center mt-4">
                      <QRCodeSVG
                        value={JSON.stringify({ id: issuedCert.id })}
                        size={80}
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
                <div className="flex space-x-4 mt-6">
                  <button
                    onClick={handleDownload}
                    className="flex-1 bg-white text-primary px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 hover:bg-gray-100"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download JSON</span>
                  </button>
                  <button
                    onClick={handleCopyCredential}
                    className="flex-1 bg-white text-primary px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2 hover:bg-gray-100"
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
              <div className="card bg-gray-100 flex items-center justify-center h-80">
                <div className="text-center text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Fill in the form to see preview</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="card text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">W3C Standard</h3>
            <p className="text-sm text-gray-600">
              Verifiable Credentials following international W3C standards
            </p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="font-semibold mb-2">On-Chain Verification</h3>
            <p className="text-sm text-gray-600">
              Document hashes stored on Ethereum for tamper-proof verification
            </p>
          </div>
          <div className="card text-center">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold mb-2">IMDA Managed</h3>
            <p className="text-sm text-gray-600">
              Backed by Singapore&apos;s IMDA for trusted digital services
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
