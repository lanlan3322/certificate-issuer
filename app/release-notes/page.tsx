"use client";

const highlights = [
  "DID-based certificate issuance with signed proof support",
  "Ethereum wallet issuance with Sepolia document-store integration",
  "Certificate verification and revocation status checks",
  "Template, gallery, and bulk issuance capabilities",
  "Admin and compliance-oriented issuer lifecycle management",
];

const changeLog = [
  {
    label: "Issuance",
    detail: "Expanded support for DID and Ethereum certificate issuance with cleaner validation and form handling.",
  },
  {
    label: "Verification",
    detail: "Improved credential verification flows for signed payloads and public verification experiences.",
  },
  {
    label: "Platform controls",
    detail: "Added stronger admin, template, and audit-related primitives supporting operational governance.",
  },
  {
    label: "Documentation",
    detail: "Added quick-start, admin, operator, and onboarding guidance for users and developers.",
  },
];

export default function ReleaseNotesPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-800 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="mb-8 border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">Certificate Issuer</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Release Notes</h1>
          <p className="mt-3 text-sm text-slate-600">Version 1.0 · Updated 2026-08-12</p>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900">Highlights</h2>
          <ul className="mt-4 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-cyan-600" />
                <span className="text-sm text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900">What changed</h2>
          <div className="mt-4 space-y-4">
            {changeLog.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900">How to use</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-6 text-sm leading-6 text-slate-700">
            <li>Open the main issuance view and complete the certificate form.</li>
            <li>Select the DID or Ethereum method based on your intended trust model.</li>
            <li>Review the generated payload, proof status, and revocation metadata.</li>
            <li>Use the verification page to confirm the credential before sharing it.</li>
            <li>Use admin and audit flows for operational oversight and lifecycle enforcement.</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900">Operational notes</h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-sm leading-6 text-slate-700">
            <li>Production signing should keep private keys outside browser-visible code.</li>
            <li>Ethereum issuance requires wallet authorization and a reachable Sepolia document store.</li>
            <li>Verification and revocation must be validated before credential distribution.</li>
          </ul>
        </section>

        <div className="rounded-xl bg-cyan-50 p-4 text-sm text-cyan-900">
          This release includes the documentation set for quick start, developer onboarding, admin usage, and operator guidance.
        </div>
      </div>

      <style jsx>{`
        @media print {
          body {
            background: white !important;
          }

          main {
            padding: 0 !important;
          }

          .print-shell {
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </main>
  );
}
