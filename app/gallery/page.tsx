"use client";

import { useRef, useMemo, useState } from "react";
import NavBar from "../../components/NavBar";
import { Shield, FileText, CheckCircle, ExternalLink, Upload, X as XIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DEMO_CERTIFICATES } from "../../lib/constants";
import { formatDate } from "../../lib/certificate";

type CertEntry = {
  id: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  issuerName: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
  status: string;
};

export default function GalleryPage() {
  const [selectedCert, setSelectedCert] = useState<CertEntry | null>(null);
  const [uploadedCerts, setUploadedCerts] = useState<CertEntry[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const certificates: CertEntry[] = uploadedCerts ?? DEMO_CERTIFICATES;
  const certTypeCount = useMemo(
    () => new Set(certificates.map((c) => c.certificateType)).size,
    [certificates]
  );

  function isValidCertEntry(obj: unknown): obj is CertEntry {
    if (!obj || typeof obj !== "object") return false;
    const c = obj as Record<string, unknown>;
    return (
      typeof c.id === "string" &&
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
    const issuer = vc.issuer as Record<string, any> | undefined;

    const id = typeof vc.id === "string" ? vc.id : undefined;
    const recipientName = typeof subject?.name === "string" ? subject.name : undefined;
    const recipientEmail = typeof subject?.email === "string" ? subject.email : undefined;
    const certificateType =
      typeof subject?.certificateType === "string" ? subject.certificateType : undefined;
    const issuerName = typeof issuer?.name === "string" ? issuer.name : undefined;
    const issueDate =
      typeof subject?.issuedOn === "string"
        ? subject.issuedOn
        : typeof vc.validFrom === "string"
          ? vc.validFrom
          : undefined;
    const description = typeof subject?.description === "string" ? subject.description : "";
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
      !id ||
      !recipientName ||
      !recipientEmail ||
      !certificateType ||
      !issuerName ||
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
      status: "valid",
    };
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const arr: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        const certs = arr
          .map((item) => (isValidCertEntry(item) ? item : mapVcToCertEntry(item)))
          .filter((c): c is CertEntry => c !== null);
        if (certs.length === 0) {
          setUploadError(
            "No valid certificate entries found. Each entry must include: id, recipientName, recipientEmail, certificateType, issuerName, issueDate, description, validFrom, and status."
          );
          setUploadedCerts(null);
          return;
        }
        setUploadedCerts(certs);
        setUploadError(null);
        setSelectedCert(null);
      } catch {
        setUploadError("Invalid JSON file. Please upload a valid JSON file.");
        setUploadedCerts(null);
      }
    };
    reader.readAsText(file);
  }

  function clearUpload() {
    setUploadedCerts(null);
    setUploadError(null);
    setSelectedCert(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-secondary" />
            <div>
              <h1 className="text-3xl font-bold">Certificate View</h1>
              <p className="text-white/80">
                Browse sample certificates issued via TrustVC + OpenCerts
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* JSON Upload */}
        <div className="card mb-8">
          <div className="flex items-center space-x-3 mb-3">
            <Upload className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-800">Upload JSON</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Upload a JSON file (single certificate object or array) to render it in the view.
          </p>
          <div className="flex items-center space-x-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="block text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-accent"
            />
            {uploadedCerts && (
              <button
                onClick={clearUpload}
                className="flex items-center space-x-1 text-sm text-red-600 hover:text-red-800"
              >
                <XIcon className="w-4 h-4" />
                <span>Clear</span>
              </button>
            )}
          </div>
          {uploadError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {uploadError}
            </p>
          )}
          {uploadedCerts && (
            <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              Loaded {uploadedCerts.length} certificate{uploadedCerts.length !== 1 ? "s" : ""} from file.
            </p>
          )}
        </div>

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
              key={cert.id}
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-primary to-accent text-white p-6 rounded-t-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-secondary text-sm uppercase tracking-wider">
                      {selectedCert.certificateType}
                    </p>
                    <h2 className="text-2xl font-bold mt-1">
                      {selectedCert.recipientName}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedCert(null)}
                    className="text-white/80 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {/* Certificate Visual */}
                <div className="bg-gray-50 rounded-lg border-2 border-secondary p-6 mb-6">
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-primary mx-auto mb-3" />
                    <p className="text-xs uppercase tracking-wider text-secondary mb-2">
                      IMDA Training Academy
                    </p>
                    <h3 className="text-xl font-bold text-gray-800 mb-4">
                      {selectedCert.certificateType}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Awarded to
                    </p>
                    <p className="text-2xl font-bold text-primary mb-4">
                      {selectedCert.recipientName}
                    </p>
                    <p className="text-sm italic text-gray-600 mb-6">
                      &quot;{selectedCert.description}&quot;
                    </p>
                    <div className="text-sm text-gray-500 space-y-1">
                      <p>Issued: {formatDate(selectedCert.issueDate)}</p>
                      <p>
                        Valid: {formatDate(selectedCert.validFrom)} to{" "}
                        {selectedCert.validUntil ? formatDate(selectedCert.validUntil) : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex items-center justify-center mb-6">
                  <div className="bg-white p-4 rounded-lg shadow-md text-center">
                    <QRCodeSVG
                      value={JSON.stringify({ id: selectedCert.id })}
                      size={100}
                      bgColor="#ffffff"
                      fgColor="#1e3a5f"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Scan to verify
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Certificate ID</p>
                    <p className="font-mono text-gray-800">{selectedCert.id}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <p className="flex items-center space-x-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-700 font-medium">Valid</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Recipient Email</p>
                    <p className="text-gray-800">{selectedCert.recipientEmail}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Issuer</p>
                    <p className="text-gray-800">{selectedCert.issuerName}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
