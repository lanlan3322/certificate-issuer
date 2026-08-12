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
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Documentation</p>
            <p className="mt-1 text-sm text-slate-600">Quick access to platform guides and operational references.</p>
          </div>

          <nav aria-label="Documentation links" className="flex flex-wrap gap-2 text-sm">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700"
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
