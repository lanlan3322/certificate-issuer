"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FileText, Download, Copy, CheckCircle, AlertCircle, Shield, ShieldCheck } from "lucide-react";
import NavBar from "../components/NavBar";
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
import { CERTIFICATE_TEMPLATES } from "../lib/constants";

export default function HomePage() {
  const [formData, setFormData] = useState({
    recipientName: "",
    recipientEmail: "",
    certificateType: Object.keys(CERTIFICATE_TEMPLATES)[0],
    description: "",
  });
  const [issuedCert, setIssuedCert] = useState<CertificateData | null>(null);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleIssue = () => {
    const validation = validateCertificateData(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);

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

    setIssuedCert(certData);
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

              <button onClick={handleIssue} className="btn-primary w-full">
                Issue Certificate
              </button>
            </div>
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