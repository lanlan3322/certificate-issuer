"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  Loader2,
  Shield,
  X,
  FileSpreadsheet,
} from "lucide-react";
import IssuingMethodSelector from "./IssuingMethodSelector";
import {
  BatchRow,
  parseExcel,
  parseCSV,
  generateSampleCSV,
} from "../lib/batchParse";
import { CertificateData, generateCertificateId, buildVCPayload } from "../lib/trustvc";
import {
  getISODateString,
  calculateValidUntil,
} from "../lib/certificate";
import { CERTIFICATE_TEMPLATES, IssuingMethod } from "../lib/constants";

interface BatchIssuePanelProps {
  connected: boolean;
  issuingMethods: IssuingMethod[];
  onToggleIssuingMethod: (method: IssuingMethod) => void;
  onIssuedCertificatesChange: (certificates: IssuedCertificateItem[]) => void;
  onIssuingChange: (issuing: boolean) => void;
}

export interface IssuedCertificateItem {
  fileName: string;
  certificate: ReturnType<typeof buildVCPayload>;
}

interface BatchIssuedCertificatesPanelProps {
  issuedCertificates: IssuedCertificateItem[];
  issuing: boolean;
  onDownloadCertificate: (item: IssuedCertificateItem) => void;
}

export function BatchIssuedCertificatesPanel({
  issuedCertificates,
  issuing,
  onDownloadCertificate,
}: BatchIssuedCertificatesPanelProps) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Issued Certificates</h3>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {issuedCertificates.length}
        </span>
      </div>

      <div className="max-h-72 overflow-auto">
        {issuing && issuedCertificates.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-500 flex items-center space-x-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Issuing certificates...</span>
          </div>
        )}

        {!issuing && issuedCertificates.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-500">
            No certificates yet. Issue a batch to see downloadable files here.
          </div>
        )}

        {issuedCertificates.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {issuedCertificates.map((item, index) => (
              <li
                key={`${item.fileName}-${index}`}
                className="px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-gray-700 truncate" title={item.fileName}>
                  {item.fileName}
                </span>
                <button
                  onClick={() => onDownloadCertificate(item)}
                  className="inline-flex items-center space-x-1 text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function BatchIssuePanel({
  connected,
  issuingMethods,
  onToggleIssuingMethod,
  onIssuedCertificatesChange,
  onIssuingChange,
}: BatchIssuePanelProps) {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);
  const issuedCount = rows.filter((r) => r.status === "success").length;
  const failedCount = rows.filter((r) => r.status === "error").length;
  const isComplete =
    !issuing &&
    validRows.length > 0 &&
    issuedCount + failedCount === validRows.length;

  useEffect(() => {
    onIssuingChange(issuing);
  }, [issuing, onIssuingChange]);

  const handleFile = async (file: File) => {
    setParseError(null);
    setRows([]);
    onIssuedCertificatesChange([]);
    setFileName(file.name);

    try {
      let parsed: BatchRow[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        parsed = parseCSV(text);
      } else {
        parsed = await parseExcel(file);
      }

      if (parsed.length === 0) {
        setParseError(
          "No data rows found. Ensure the file has a header row and at least one data row."
        );
      } else {
        setRows(parsed);
      }
    } catch (err) {
      setParseError(`Failed to parse file: ${(err as Error).message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected after clearing
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleIssueAll = async () => {
    if (!connected || issuing) return;
    setIssuing(true);
    onIssuingChange(true);
    onIssuedCertificatesChange([]);

    const updated = [...rows];
    const generatedCertificates: IssuedCertificateItem[] = [];

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      if (row.errors.length > 0) continue;

      updated[i] = { ...row, status: "issuing" };
      setRows([...updated]);

      try {
        // Simulate async issuance (demo pattern matching single-certificate flow)
        await new Promise<void>((resolve) => setTimeout(resolve, 150));

        const now = getISODateString();
        const certData: CertificateData = {
          id: generateCertificateId(),
          recipientName: row.recipientName,
          recipientEmail: row.recipientEmail,
          certificateType: row.certificateType,
          issuerName: "Certificate Issuer",
          issueDate: now,
          description: row.description,
          validFrom: now,
          validUntil: calculateValidUntil(now, row.certificateType),
          issuingMethods,
        };

        const payload = buildVCPayload(certData);

        const txHash =
          "demo-tx-hash-" + Math.random().toString(36).substring(2, 11);
        updated[i] = { ...updated[i], status: "success", txHash };

        const safeName = row.recipientName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || `row-${row.rowIndex}`;

        generatedCertificates.push({
          fileName: `certificate-${safeName}-${row.rowIndex}.json`,
          certificate: payload,
        });
      } catch (err) {
        updated[i] = {
          ...updated[i],
          status: "error",
          issueError: (err as Error).message,
        };
      }

      setRows([...updated]);
    }

    onIssuedCertificatesChange(generatedCertificates);
    onIssuingChange(false);
    setIssuing(false);
  };

  const handleDownloadTemplate = () => {
    const csv = generateSampleCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "certificate_batch_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setRows([]);
    setFileName(null);
    setParseError(null);
    onIssuingChange(false);
    onIssuedCertificatesChange([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <IssuingMethodSelector
        selectedMethods={issuingMethods}
        onToggle={onToggleIssuingMethod}
        helperText="These methods apply to every certificate issued from this batch."
      />

      {/* Instructions */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
        <p className="font-medium text-blue-800 mb-1">Expected columns:</p>
        <code className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded block">
          recipientName, recipientEmail, certificateType, description
        </code>
        <p className="text-blue-600 mt-2 text-xs">
          Valid certificate types:{" "}
          {Object.values(CERTIFICATE_TEMPLATES)
            .map((t) => t.name)
            .join(", ")}
        </p>
        <button
          onClick={handleDownloadTemplate}
          className="mt-2 flex items-center space-x-1 text-blue-700 hover:text-blue-900 font-medium text-xs"
        >
          <Download className="w-3 h-3" />
          <span>Download sample CSV template</span>
        </button>
      </div>

      {parseError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{parseError}</p>
        </div>
      )}

      {/* File Upload Zone */}
      {rows.length === 0 && (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600 text-sm font-medium">
              Drop your Excel or CSV file here
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Supports .xlsx, .xls, .csv
            </p>
            <span className="mt-3 inline-flex items-center space-x-1 bg-primary text-white text-xs px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              <Upload className="w-3 h-3" />
              <span>Choose File</span>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

        </>
      )}

      {/* Parsed Rows Preview */}
      {rows.length > 0 && (
        <div>
          {/* Row count badges */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-sm font-medium text-gray-700 truncate max-w-[160px]">
                {fileName}
              </span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {rows.length} row{rows.length !== 1 ? "s" : ""}
              </span>
              {validRows.length > 0 && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {validRows.length} valid
                </span>
              )}
              {invalidRows.length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {invalidRows.length} invalid
                </span>
              )}
            </div>
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
              title="Clear and upload a different file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Row table */}
          <div className="border border-gray-200 rounded-lg overflow-auto max-h-64">
            <table className="w-full text-xs min-w-[480px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium w-8">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={`border-t border-gray-100 ${
                      row.errors.length > 0
                        ? "bg-red-50"
                        : row.status === "success"
                        ? "bg-green-50"
                        : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-gray-500">{row.rowIndex}</td>
                    <td className="px-3 py-2">
                      {row.recipientName || (
                        <span className="text-red-400 italic">missing</span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[130px] truncate">
                      {row.recipientEmail || (
                        <span className="text-red-400 italic">missing</span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">
                      {row.certificateType || (
                        <span className="text-red-400 italic">missing</span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[160px]">
                      {row.status === "issuing" && (
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      )}
                      {row.status === "success" && (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      )}
                      {row.status === "error" && (
                        <span className="text-red-500 flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{row.issueError}</span>
                        </span>
                      )}
                      {row.status === "pending" && row.errors.length > 0 && (
                        <span className="text-red-500 truncate block">
                          {row.errors[0]}
                        </span>
                      )}
                      {row.status === "pending" && row.errors.length === 0 && (
                        <span className="text-green-600">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invalid rows notice */}
          {invalidRows.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              {invalidRows.length} row(s) have validation errors and will be
              skipped.
            </div>
          )}

          {/* Completion summary */}
          {isComplete && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-800">
                Batch complete: {issuedCount} issued
                {failedCount > 0 ? `, ${failedCount} failed` : ""}.
              </p>
            </div>
          )}

          {/* Issue button */}
          {!isComplete && (
            <button
              onClick={handleIssueAll}
              disabled={!connected || issuing || validRows.length === 0}
              className="mt-3 btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
            >
              {issuing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              <span>
                {issuing
                  ? "Issuing..."
                  : `Issue ${validRows.length} Certificate${
                      validRows.length !== 1 ? "s" : ""
                    }`}
              </span>
            </button>
          )}

          {!connected && rows.length > 0 && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Connect your wallet above to issue certificates.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
