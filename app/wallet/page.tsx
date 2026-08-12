"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, CreditCard, Link2, Smartphone, Wallet } from "lucide-react";

const wallets = [
  { name: "OpenCerts Wallet", status: "Ready", note: "Credential receipt, QR display, wallet verification", accent: "bg-emerald-100 text-emerald-800" },
  { name: "Microsoft Entra Verified ID", status: "Preview", note: "Enterprise trust and identity verification", accent: "bg-cyan-100 text-cyan-800" },
  { name: "Future VC wallets", status: "Planned", note: "Interoperability and wallet portability", accent: "bg-amber-100 text-amber-800" },
];

export default function WalletPage() {
  const [credentialId, setCredentialId] = useState("cert-2026-0042");
  const [verificationUrl, setVerificationUrl] = useState("https://issuer.example/verify/cert-2026-0042");

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-700">Wallet integration</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Recipient experience and wallet-ready delivery</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
          <Wallet className="h-3.5 w-3.5" />
          Multi-wallet ready
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-violet-700" />
            <h2 className="text-xl font-semibold text-slate-900">Wallet handoff</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Credential ID</label>
              <input value={credentialId} onChange={(e) => setCredentialId(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Verification URL</label>
              <input value={verificationUrl} onChange={(e) => setVerificationUrl(e.target.value)} className="input-field" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span className="font-medium text-slate-800">Delivery package</span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800">Ready</span>
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Email delivery link</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> QR verification code</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> PDF / portable credential bundle</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-cyan-700" />
              <h2 className="text-xl font-semibold text-slate-900">Supported wallet flows</h2>
            </div>
            <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-800">3 channels</span>
          </div>

          <div className="space-y-3">
            {wallets.map((wallet) => (
              <div key={wallet.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">{wallet.name}</div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${wallet.accent}`}>
                    {wallet.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{wallet.note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">QR handoff</div>
          <div className="mt-3 flex h-32 items-center justify-center rounded-xl bg-slate-100 text-sm font-medium text-slate-700">Encoded verification link</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email delivery</div>
          <div className="mt-3 rounded-xl bg-slate-900 p-4 text-sm text-slate-100">
            Subject: Your verification certificate
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Security</div>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-700"><CreditCard className="h-4 w-4 text-emerald-600" /> Signed credential + verification check</div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-violet-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-violet-700">
          <ArrowRight className="h-4 w-4" />
          <span className="text-sm font-semibold uppercase tracking-[0.18em]">Next milestone</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          The wallet experience is positioned for email links, QR verification, and verifiable credential portability across OpenCerts and Microsoft-backed wallet ecosystems.
        </p>
      </div>
    </main>
  );
}
