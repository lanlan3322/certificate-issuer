"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";
import { CheckCircle, Upload, FileJson, AlertCircle, ShieldCheck, XCircle, FileCheck } from "lucide-react";
import { verifyCredential, VerificationResult } from "../../lib/trustvc";

export default function VerifyPage() {
  const [credentialJson, setCredentialJson] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!credentialJson.trim()) {
      setResult({ valid: false, message: "Please paste a credential JSON" });
      return;
    }

    setLoading(true);
    try {
      const doc = JSON.parse(credentialJson);
      const verificationResult = await verifyCredential(doc);
      setResult(verificationResult);
    } catch (e) {
      setResult({
        valid: false,
        message: `Invalid JSON: ${(e as Error).message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCredentialJson(ev.target?.result as string ?? "");
      };
      reader.readAsText(file);
    }
  };

  const handleSampleCredential = () => {
    const sample = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://w3id.org/security/data-integrity/v2",
      ],
      "type": ["VerifiableCredential", "OpenCertsCertificate"],
      "id": "urn:uuid:0198e4a3-b601-7117-9d02-8c9a9a54ab5d",
      "credentialSubject": {
        "id": "did:email:sample@example.com",
        "type": ["Person"],
        "name": "Sample Recipient",
        "certificateType": "Professional Certificate",
      },
      "issuer": {
        "id": "did:web:lanlan3322.github.io:certificate-issuer",
        "type": "OpenAttestationIssuer",
        "name": "IMDA Training Academy",
        "identityProof": {
          "identityProofType": "DNS-DID",
          "identifier": "did:web:lanlan3322.github.io:certificate-issuer",
        },
      },
      "validFrom": "2026-01-01T00:00:00Z",
      "proof": {
        "type": "DataIntegrityProof",
        "proofValue": "sample-proof-value",
        "verificationMethod": "did:web:lanlan3322.github.io:certificate-issuer#keys-1",
        "cryptosuite": "ecdsa-sd-2023",
      },
    };
    setCredentialJson(JSON.stringify(sample, null, 2));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-8 h-8 text-secondary" />
            <div>
              <h1 className="text-3xl font-bold">Verify Certificate</h1>
              <p className="text-white/80">
                Check the authenticity of any W3C Verifiable Credential
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Enter Credential to Verify
          </h2>

          <div className="mb-4">
            <label className="label">Paste JSON Credential</label>
            <textarea
              value={credentialJson}
              onChange={(e) => setCredentialJson(e.target.value)}
              className="input-field font-mono text-sm"
              rows={10}
              placeholder='{"@context": [...], "type": [...], ...}'
            />
          </div>

          <div className="flex items-center space-x-4 mb-6">
            <label className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200">
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleSampleCredential}
              className="flex items-center space-x-2 px-4 py-2 bg-secondary/10 text-primary rounded-lg hover:bg-secondary/20"
            >
              <FileJson className="w-4 h-4" />
              <span>Load Sample</span>
            </button>
          </div>

          <button
            onClick={handleVerify}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Credential</span>
              </>
            )}
          </button>
        </div>

        {/* Result Section */}
        {result && (
          <div
            className={`card ${
              result.valid ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
            }`}
          >
            <div className="flex items-start space-x-4">
              {result.valid ? (
                <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3
                  className={`text-xl font-bold ${
                    result.valid ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.valid ? "Valid Certificate" : "Invalid Certificate"}
                </h3>
                <p
                  className={`mt-1 ${
                    result.valid ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {result.message}
                </p>

                {result.details && (
                  <div className="mt-4 p-4 bg-white rounded-lg">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      Details
                    </h4>
                    <dl className="text-sm space-y-1">
                      {Object.entries(result.details).map(([key, value]) => (
                        <div key={key} className="flex">
                          <dt className="font-medium text-gray-600 capitalize w-32">
                            {key}:
                          </dt>
                          <dd className="text-gray-800">
                            {Array.isArray(value) ? value.join(", ") : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-semibold text-blue-800">How Verification Works</h4>
              <p className="text-sm text-blue-700 mt-1">
                This tool verifies the structure and signature of W3C Verifiable
                Credentials. For full on-chain verification, the credential&apos;s
                document hash is checked against the Ethereum blockchain document
                store. A valid credential proves it was issued by the stated issuer
                and has not been tampered with.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}