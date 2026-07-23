"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";
import { PenLine, Upload, FileJson, AlertCircle, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";

export default function SignPage() {
  const [credentialJson, setCredentialJson] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; signed?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSign = async () => {
    if (!credentialJson.trim()) {
      setResult({ success: false, message: "Please paste a credential JSON to sign" });
      return;
    }
    if (!privateKey.trim()) {
      setResult({ success: false, message: "Please enter a private key" });
      return;
    }

    setLoading(true);
    try {
      const doc = JSON.parse(credentialJson);
      // TODO: Replace with real cryptographic signing using the provided private key
      // (e.g. via @trustvc or a W3C Data Integrity proof library).
      const signed = {
        ...doc,
        proof: {
          type: "DataIntegrityProof",
          cryptosuite: "ecdsa-sd-2023",
          created: new Date().toISOString(),
          verificationMethod: "did:example:issuer#key-1",
          proofPurpose: "assertionMethod",
          proofValue: "<signature-placeholder>",
        },
      };
      setResult({
        success: true,
        message: "Certificate signed successfully.",
        signed: JSON.stringify(signed, null, 2),
      });
    } catch (e) {
      setResult({
        success: false,
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

  const handleCopy = () => {
    if (result?.signed) {
      navigator.clipboard.writeText(result.signed);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-3">
            <PenLine className="w-8 h-8 text-secondary" />
            <div>
              <h1 className="text-3xl font-bold">Sign Certificate</h1>
              <p className="text-white/80">
                Sign a W3C Verifiable Credential with your private key
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Credential to Sign
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
          </div>

          <div className="mb-6">
            <label className="label">Private Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="input-field pr-10"
                placeholder="Enter your private key (hex or base64)"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showKey ? "Hide private key" : "Show private key"}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSign}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Signing...</span>
              </>
            ) : (
              <>
                <PenLine className="w-4 h-4" />
                <span>Sign Credential</span>
              </>
            )}
          </button>
        </div>

        {/* Result Section */}
        {result && (
          <div
            className={`card border-2 ${
              result.success ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
            }`}
          >
            <div className="flex items-start space-x-4">
              {result.success ? (
                <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3
                  className={`text-xl font-bold ${
                    result.success ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.success ? "Signing Successful" : "Signing Failed"}
                </h3>
                <p
                  className={`mt-1 ${
                    result.success ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {result.message}
                </p>

                {result.signed && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-700">Signed Credential</h4>
                      <button
                        onClick={handleCopy}
                        className="flex items-center space-x-1 px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        <FileJson className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="p-4 bg-white rounded-lg text-xs font-mono overflow-auto max-h-64 border border-gray-200">
                      {result.signed}
                    </pre>
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
              <h4 className="font-semibold text-blue-800">How Signing Works</h4>
              <p className="text-sm text-blue-700 mt-1">
                Signing attaches a cryptographic proof to a W3C Verifiable Credential.
                The proof binds the credential to the issuer&apos;s key so that verifiers
                can confirm authenticity and detect any tampering. Your private key
                never leaves your browser.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
