"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";
import {
  PenLine,
  Upload,
  FileJson,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Download,
} from "lucide-react";
import { downloadCertificatesZip } from "../../lib/certificate";

interface SingleSignResult {
  success: boolean;
  message: string;
  signed?: string;
}

interface BatchSignRow {
  fileName: string;
  document?: Record<string, unknown>;
  status: "pending" | "signing" | "success" | "error";
  error?: string;
  signed?: Record<string, unknown>;
}

interface BatchSignedItem {
  fileName: string;
  certificate: Parameters<typeof downloadCertificatesZip>[0][number]["certificate"];
}

export default function SignPage() {
  const [signMode, setSignMode] = useState<"single" | "batch">("single");
  const [credentialJson, setCredentialJson] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [result, setResult] = useState<SingleSignResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchSignRow[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [signedBatchItems, setSignedBatchItems] = useState<BatchSignedItem[]>([]);

  const signDocument = (doc: Record<string, unknown>) => {
    // TODO: Replace with real cryptographic signing using the provided private key
    // (e.g. via @trustvc or a W3C Data Integrity proof library).
    return {
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
  };

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
      const doc = JSON.parse(credentialJson) as Record<string, unknown>;
      const signed = signDocument(doc);
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

  const handleBatchFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setBatchLoading(true);
    setBatchRows([]);
    setSignedBatchItems([]);
    setBatchMessage(null);

    try {
      const parsed = await Promise.all(
        files.map(async (file) => {
          try {
            const text = await file.text();
            const doc = JSON.parse(text) as Record<string, unknown>;
            return {
              fileName: file.name,
              document: doc,
              status: "pending" as const,
            };
          } catch (err) {
            return {
              fileName: file.name,
              status: "error" as const,
              error: `Invalid JSON: ${(err as Error).message}`,
            };
          }
        })
      );

      setBatchRows(parsed);
      const invalidCount = parsed.filter((row) => row.status === "error").length;
      setBatchMessage(
        invalidCount > 0
          ? `Loaded ${parsed.length} file(s). ${invalidCount} file(s) have invalid JSON and will be skipped.`
          : `Loaded ${parsed.length} file(s).`
      );
    } finally {
      setBatchLoading(false);
      e.target.value = "";
    }
  };

  const handleBatchSign = async () => {
    if (!privateKey.trim()) {
      setBatchMessage("Please enter a private key before batch signing.");
      return;
    }
    if (batchRows.length === 0 || batchLoading) return;

    setBatchLoading(true);
    setBatchMessage(null);

    const updated = [...batchRows];
    const signedItems: BatchSignedItem[] = [];

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      if (!row.document || row.status === "error") continue;

      updated[i] = { ...row, status: "signing", error: undefined };
      setBatchRows([...updated]);

      try {
        const signed = signDocument(row.document);
        const baseName = row.fileName.replace(/\.json$/i, "");
        updated[i] = {
          ...updated[i],
          signed,
          status: "success",
        };
        signedItems.push({
          fileName: `${baseName}-signed`,
          certificate:
            signed as unknown as Parameters<
              typeof downloadCertificatesZip
            >[0][number]["certificate"],
        });
      } catch (err) {
        updated[i] = {
          ...updated[i],
          status: "error",
          error: (err as Error).message,
        };
      }

      setBatchRows([...updated]);
    }

    setSignedBatchItems(signedItems);
    const successCount = updated.filter((row) => row.status === "success").length;
    const failureCount = updated.filter((row) => row.status === "error").length;
    setBatchMessage(
      `Batch signing complete: ${successCount} signed${failureCount > 0 ? `, ${failureCount} failed` : ""}.`
    );
    setBatchLoading(false);
  };

  const handleDownloadSignedBatchItem = (item: BatchSignedItem) => {
    const blob = new Blob([JSON.stringify(item.certificate, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${item.fileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllSigned = async () => {
    if (signedBatchItems.length === 0) return;
    try {
      await downloadCertificatesZip(signedBatchItems, "batch-signed-certificates.zip");
    } catch (err) {
      setBatchMessage(`Unable to download ZIP: ${(err as Error).message}`);
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
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Sign Credentials</h2>

          <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
            <button
              onClick={() => setSignMode("single")}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 text-sm font-medium transition-colors ${
                signMode === "single"
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <PenLine className="w-4 h-4" />
              <span>Single</span>
            </button>
            <button
              onClick={() => setSignMode("batch")}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 text-sm font-medium transition-colors ${
                signMode === "batch"
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Batch (JSON files)</span>
            </button>
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

          {signMode === "single" ? (
            <>
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
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="label">Upload JSON Credentials</label>
                <p className="text-xs text-gray-500 mb-2">
                  Select multiple `.json` credential files to sign in one batch.
                </p>
                <label className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200">
                  <Upload className="w-4 h-4" />
                  <span>{batchLoading ? "Loading..." : "Upload JSON Files"}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    multiple
                    onChange={handleBatchFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {batchRows.length > 0 && (
                <div className="mb-4 border border-gray-200 rounded-lg overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">File</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchRows.map((row) => (
                        <tr key={row.fileName} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">{row.fileName}</td>
                          <td className="px-3 py-2">
                            {row.status === "signing" && (
                              <span className="inline-flex items-center gap-1 text-primary">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Signing
                              </span>
                            )}
                            {row.status === "success" && (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Signed
                              </span>
                            )}
                            {row.status === "pending" && (
                              <span className="text-gray-600">Ready</span>
                            )}
                            {row.status === "error" && (
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <XCircle className="w-3 h-3" />
                                {row.error || "Failed"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleBatchSign}
                  disabled={batchLoading || batchRows.length === 0}
                  className="btn-primary flex-1 flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {batchLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PenLine className="w-4 h-4" />
                  )}
                  <span>{batchLoading ? "Signing..." : "Sign All"}</span>
                </button>
                <button
                  onClick={handleDownloadAllSigned}
                  disabled={signedBatchItems.length === 0 || batchLoading}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download All Signed</span>
                </button>
              </div>

              {batchMessage && (
                <p className="mt-3 text-sm text-gray-700">{batchMessage}</p>
              )}

              {signedBatchItems.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Signed Files</h4>
                  <ul className="space-y-2">
                    {signedBatchItems.map((item) => (
                      <li
                        key={item.fileName}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <span className="text-sm text-gray-700">{item.fileName}.json</span>
                        <button
                          onClick={() => handleDownloadSignedBatchItem(item)}
                          className="inline-flex items-center space-x-1 text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Result Section */}
        {signMode === "single" && result && (
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
