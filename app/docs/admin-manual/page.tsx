import Link from "next/link";

export default function AdminManualPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-800">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Admin Manual</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm leading-7 text-slate-700">
        <p>Admins can manage issuer records, activation state, template setup, and operational lifecycle checks.</p>
        <p className="mt-4">Review the issuer workspace state before approving issuance and confirm DID or wallet configuration is valid before publishing credentials.</p>
        <p className="mt-4">Revocation, status checks, and audit review are important for safe governance across multiple issuers.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Back to docs</Link>
          <Link href="/admin" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Open admin</Link>
        </div>
      </div>
    </main>
  );
}
