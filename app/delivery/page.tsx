"use client";

import { useState } from "react";
import NavBar from "../../components/NavBar";
import { buildVerificationLink, createEmailDelivery, createVerificationBundle } from "../../lib/phase4";

export default function DeliveryPage() {
  const [credentialId, setCredentialId] = useState("cert-demo-202");
  const [recipientName, setRecipientName] = useState("Alicia Tan");
  const [recipientEmail, setRecipientEmail] = useState("student@example.com");
  const [verificationUrl, setVerificationUrl] = useState(
    "https://example.com/verify"
  );
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const handleGenerate = () => {
    const link = buildVerificationLink(verificationUrl, credentialId);
    const email = createEmailDelivery({
      recipientEmail,
      recipientName,
      credentialId,
      verificationUrl: link,
    });
    const bundle = createVerificationBundle({
      credentialId,
      verificationUrl: link,
      recipientEmail,
    });

    setResult({ link, email, bundle });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Phase 4</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Recipient Delivery</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Credential ID</label>
                <input
                  value={credentialId}
                  onChange={(event) => setCredentialId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Recipient name</label>
                <input
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Recipient email</label>
                <input
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Verification base URL</label>
                <input
                  value={verificationUrl}
                  onChange={(event) => setVerificationUrl(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-600"
              >
                Generate delivery package
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {result ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verification URL</p>
                  <p className="mt-1 break-all text-sm text-slate-800">{String(result.link ?? "")}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                  <p className="mt-1 text-sm text-slate-800">To: {String((result.email as Record<string, unknown>)?.to ?? "")}</p>
                  <p className="mt-1 text-sm text-slate-800">Subject: {String((result.email as Record<string, unknown>)?.subject ?? "")}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">QR payload</p>
                  <pre className="mt-2 overflow-x-auto text-xs text-slate-700">
                    {String((result.bundle as Record<string, unknown>)?.qrPayload ?? "")}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Generate a delivery package to preview the verification link, email, and QR payload.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
