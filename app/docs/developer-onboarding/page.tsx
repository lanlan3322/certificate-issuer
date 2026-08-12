import Link from "next/link";

export default function DeveloperOnboardingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-800">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Developer Onboarding</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm leading-7 text-slate-700">
        <p>Start by reviewing the app entry points, TrustVC logic, and the main issue/verify flows before making changes.</p>
        <p className="mt-4">The repository is organized into app routes, reusable UI, hooks, and library logic. Keep changes small, test them, and validate the build before merging.</p>
        <p className="mt-4">Security matters: do not expose private keys in client-side bundles or public configuration files when the platform is used in production.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Back to docs</Link>
          <Link href="/" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Home</Link>
        </div>
      </div>
    </main>
  );
}
