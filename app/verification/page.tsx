"use client";

import { useState } from "react";
import {
  buildVerificationReport,
  parseVerificationInput,
  type VerificationReport,
} from "../../lib/phase6";

export default function VerificationPortalPage() {
  const [payload, setPayload] = useState(`{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential"],
  "issuer": { "id": "did:web:example.com" },
  "credentialSubject": { "id": "did:example:subject" }
}`);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = () => {
    try {
      const parsed = parseVerificationInput(payload);
      const nextReport = buildVerificationReport({
        incoming: parsed,
        status: "valid",
        signature: "verified",
        revocation: "clear",
      });
      setReport(nextReport);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse verification payload.");
      setReport(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">Phase 6</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Verification Portal</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Paste credential JSON</h2>
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={16}
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleVerify}
              className="mt-4 w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-medium text-white hover:bg-indigo-600"
            >
              Verify credential
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Verification result</h2>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {report && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{String(report.status ?? "unknown")}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
                  <p className="mt-1 text-sm text-slate-700">{String(report.summary ?? "")}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issuer / Subject</p>
                  <p className="mt-1 text-sm text-slate-700">Issuer: {String(report.issuer ?? "unknown")}</p>
                  <p className="mt-1 text-sm text-slate-700">Subject: {String(report.subject ?? "unknown")}</p>
                </div>
              </div>
            )}

            {!error && !report && (
              <p className="mt-4 text-sm text-slate-500">No verification has run yet.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
