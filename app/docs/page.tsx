import Link from "next/link";

const docs = [
  {
    title: "Quick Start",
    description: "Local setup, issue flows, verification basics, and common troubleshooting.",
    href: "/docs/quick-start",
  },
  {
    title: "User Manual",
    description: "End-user guidance for issuing, verifying, downloading, and managing certificates.",
    href: "/docs/user-manual",
  },
  {
    title: "Admin Manual",
    description: "Issuer and platform administration, templates, revocation, and governance.",
    href: "/docs/admin-manual",
  },
  {
    title: "Operator Manual",
    description: "Operations, deployment, security checklist, and release process guidance.",
    href: "/docs/operator-manual",
  },
  {
    title: "Developer Onboarding",
    description: "Repository structure, workflows, and engineering expectations for contributors.",
    href: "/docs/developer-onboarding",
  },
  {
    title: "Release Notes",
    description: "Current platform highlights, changes, and operational notes.",
    href: "/release-notes",
  },
];

export default function DocsIndexPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-slate-800">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Documentation</p>
        <h1 className="mt-3 text-4xl font-bold text-slate-900">Platform guides and reference</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Start here for the user, admin, operator, and developer guidance needed to use and maintain the certificate platform.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => (
          <Link
            key={doc.title}
            href={doc.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Guide</p>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">{doc.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{doc.description}</p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-cyan-700 group-hover:text-cyan-800">
              Open guide →
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Need a starting point?</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Issue certificates
          </Link>
          <Link href="/verify" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
            Verify credentials
          </Link>
          <Link href="/gallery" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
            View gallery
          </Link>
        </div>
      </div>
    </main>
  );
}
