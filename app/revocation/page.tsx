"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";

export default function RevocationManagementPage() {
  const [credentialId, setCredentialId] = useState("cert-demo-102");
  const [action, setAction] = useState<"revoke" | "suspend" | "reinstate">("revoke");
  const [reason, setReason] = useState("Policy review");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/certificate-issuer/api/revocation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ credentialId, action, reason }),
      });

      const payload = (await response.json()) as { error?: string; record?: Record<string, unknown> };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update revocation status.");
      }

      setResult(payload.record ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update revocation status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">Phase 3</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Revocation Management</h1>
          <p className="mt-2 text-slate-600">
            Revoke, suspend, or reinstate credentials with an auditable status transition log.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Credential ID</label>
                <input
                  value={credentialId}
                  onChange={(event) => setCredentialId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Action</label>
                <select
                  value={action}
                  onChange={(event) => setAction(event.target.value as "revoke" | "suspend" | "reinstate")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
                >
                  <option value="revoke">Revoke</option>
                  <option value="suspend">Suspend</option>
                  <option value="reinstate">Reinstate</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-violet-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-violet-700 px-4 py-2.5 font-medium text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating..." : "Apply status change"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Result</h2>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{String(result.status ?? "unknown")}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</p>
                  <p className="mt-1 text-sm text-slate-700">{String(result.reason ?? "—")}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit trail</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {Array.isArray(result.history)
                      ? (result.history as Array<Record<string, string>>).map((entry, index) => (
                          <li key={`${entry.action}-${index}`} className="rounded bg-white px-2 py-1">
                            {entry.action}: {entry.reason} ({entry.at})
                          </li>
                        ))
                      : <li>No history available.</li>}
                  </ul>
                </div>
              </div>
            )}

            {!error && !result && (
              <p className="mt-4 text-sm text-slate-500">
                No status change has been submitted yet.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
