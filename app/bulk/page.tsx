"use client";

import { useState } from "react";
import { buildBulkIssuanceJob, validateBulkRows, type BulkRow } from "../../lib/phase5";

const sampleRows: BulkRow[] = [
  { recipientName: "Sample Recipient One", recipientEmail: "one@example.com", certificateType: "AI Governance" },
  { recipientName: "Sample Recipient Two", recipientEmail: "two@example.com", certificateType: "Data Ethics" },
  { recipientName: "Sample Recipient Three", recipientEmail: "invalid-email", certificateType: "Privacy" },
];

export default function BulkIssuePage() {
  const [rowsText, setRowsText] = useState(
    sampleRows
      .map((row) => `${row.recipientName},${row.recipientEmail},${row.certificateType}`)
      .join("\n")
  );
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  const handlePreview = () => {
    const parsedRows = rowsText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [recipientName, recipientEmail, certificateType] = line.split(",");
        return {
          recipientName: recipientName?.trim() ?? "",
          recipientEmail: recipientEmail?.trim() ?? "",
          certificateType: certificateType?.trim() ?? "",
        };
      });

    const validation = validateBulkRows(parsedRows);
    const job = buildBulkIssuanceJob({
      issuerName: "Sample Organization",
      rows: parsedRows,
      templateId: "modern",
    });

    setSummary({
      validation,
      job,
      total: parsedRows.length,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Batch workflow preview</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Preview batch validation</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">This page checks sample CSV rows only. It does not issue credentials or add records to your organization.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 id="batch-csv-heading" className="text-lg font-semibold text-slate-900">Sample CSV rows</h2>
            <textarea
              aria-labelledby="batch-csv-heading"
              name="batch-csv"
              spellCheck={false}
              value={rowsText}
              onChange={(event) => setRowsText(event.target.value)}
              rows={12}
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={handlePreview}
              className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-2.5 font-medium text-white hover:bg-amber-500"
            >
              Preview row validation
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Validation preview</h2>

            {summary ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview status — not issued</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{String((summary as any).job?.status ?? "n/a")}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valid rows</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{String((summary as any).job?.validRows ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Errors</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {Array.isArray((summary as any).validation?.errors) && (summary as any).validation.errors.length > 0 ? (
                      (summary as any).validation.errors.map((message: string, index: number) => (
                        <li key={`${message}-${index}`} className="rounded bg-white px-2 py-1">
                          {message}
                        </li>
                      ))
                    ) : (
                      <li className="rounded bg-white px-2 py-1">No validation errors.</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Preview the row checks before using your organization&apos;s supported issuance workflow.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
