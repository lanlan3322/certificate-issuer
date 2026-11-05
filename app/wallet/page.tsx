import Link from "next/link";
import { ArrowRight, FileText, Mail, ShieldCheck } from "lucide-react";

export default function WalletPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-700">Credential delivery</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Share credentials with recipients</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Wallet import and mobile wallet delivery are not available in this workspace. Issuers can download credential files or email a signed credential from the issuer dashboard.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {[
          { title: "Download credential files", description: "Download the signed credential JSON or a human-readable PDF from the issuer dashboard.", icon: FileText },
          { title: "Email the signed credential", description: "Send the signed JSON credential to the recipient address recorded during issuance.", icon: Mail },
          { title: "Check a credential", description: "Use the public verification service to check a credential's signature and status.", icon: ShieldCheck },
        ].map(({ title, description, icon: Icon }) => (
          <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <Icon className="h-5 w-5 text-violet-700" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-violet-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-violet-700">
          <ArrowRight className="h-4 w-4" />
          <span className="text-sm font-semibold uppercase tracking-[0.18em]">Get started</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">Issue a credential or review verification results using the available workspace tools.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/insurance" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Issue a credential <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/verify" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Verify a credential</Link>
        </div>
      </div>
    </main>
  );
}
