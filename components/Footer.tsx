import Link from "next/link";

const footerLinks = [
  { href: "/docs", label: "Docs Index" },
  { href: "/docs/quick-start", label: "Quick Start" },
  { href: "/docs/user-manual", label: "User Manual" },
  { href: "/docs/admin-manual", label: "Admin Manual" },
  { href: "/docs/operator-manual", label: "Operator Manual" },
  { href: "/docs/developer-onboarding", label: "Developer Onboarding" },
  { href: "/release-notes", label: "Release Notes" },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Documentation</p>
            <p className="mt-2 text-sm text-slate-300">Quick access to platform guides, release notes, and operational references.</p>
          </div>

          <nav aria-label="Documentation links" className="flex flex-wrap gap-2 text-sm">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
