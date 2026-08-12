import Link from "next/link";

export default function OperatorManualPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-800">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Operator Manual</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm leading-7 text-slate-700">
        <p>Operators are responsible for environment setup, deployment, build validation, DID publication, wallet readiness, and security checks.</p>
        <p className="mt-4">Before release, confirm the build succeeds, critical routes render, and verification/revocation flows behave as expected.</p>
        <p className="mt-4">For production, keep private keys outside browser-visible code and use secure backend boundaries for signing.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Back to docs</Link>
          <Link href="/release-notes" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Release notes</Link>
        </div>
      </div>
    </main>
  );
}
