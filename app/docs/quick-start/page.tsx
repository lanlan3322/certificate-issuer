import Link from "next/link";

export default function QuickStartPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-800">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Quick Start</h1>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ol className="list-decimal space-y-4 pl-6 text-sm leading-7 text-slate-700">
          <li>Install dependencies with <span className="font-semibold">npm install</span>.</li>
          <li>Run the app with <span className="font-semibold">npm run dev</span>.</li>
          <li>Open the home page to issue a certificate using DID or Ethereum.</li>
          <li>Use the Verify page to validate a signed credential JSON payload.</li>
          <li>Review the gallery for templates and examples before final issuance.</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Back to docs</Link>
          <Link href="/" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Issue page</Link>
        </div>
      </div>
    </main>
  );
}
