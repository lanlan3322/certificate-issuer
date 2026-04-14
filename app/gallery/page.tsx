"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";
import { Shield, FileText, CheckCircle, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DEMO_CERTIFICATES } from "../../lib/constants";
import { formatDate } from "../../lib/certificate";
import { CertificateData } from "../../lib/trustvc";

export default function GalleryPage() {
  const [selectedCert, setSelectedCert] = useState<typeof DEMO_CERTIFICATES[0] | null>(
    null
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-secondary" />
            <div>
              <h1 className="text-3xl font-bold">Certificate Gallery</h1>
              <p className="text-white/80">
                Browse sample certificates issued via TrustVC + OpenCerts
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
              {DEMO_CERTIFICATES.length}
            </p>
            <p className="text-sm text-gray-600">Total Certificates</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-green-600">
              {DEMO_CERTIFICATES.filter((c) => c.status === "valid").length}
            </p>
            <p className="text-sm text-gray-600">Valid</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-secondary">3</p>
            <p className="text-sm text-gray-600">Certificate Types</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-accent">100%</p>
            <p className="text-sm text-gray-600">W3C Compliant</p>
          </div>
        </div>

        {/* Certificates Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DEMO_CERTIFICATES.map((cert) => (
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
                        {formatDate(selectedCert.validUntil!)}
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