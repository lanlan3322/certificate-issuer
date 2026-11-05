"use client";

import Link from "next/link";
import { openCookiePreferences } from "../lib/cookie-consent";

const groups = [
  { title: "Platform", links: [["/verify", "Verify a credential"], ["/enterprise", "Plans"], ["/issuer/", "Workspace sign in"]] },
  { title: "Resources", links: [["/docs/user-manual", "User guide"], ["/docs/admin-manual", "Admin guide"], ["/release-notes", "Release notes"], ["/contact", "Contact support"]] },
  { title: "Legal", links: [["/privacy", "Privacy policy"], ["/terms", "Terms of service"]] },
];

export default function Footer() {
  return <footer className="theme-fixed border-t border-slate-800 bg-slate-950 text-slate-300">
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <p className="text-lg font-bold text-white" translate="no">Verifiable.sg</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">Credential-as-a-Service for issuing, managing and verifying your organization&apos;s digital credentials.</p>
        </div>
        {groups.map((group) => <nav key={group.title} aria-label={`${group.title} links`}>
          <h2 className="mb-3 text-sm font-semibold text-white">{group.title}</h2>
          <ul className="space-y-1">{group.links.map(([href, label]) => <li key={href}>
            <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center rounded text-sm hover:text-cyan-300">{label}</Link>
          </li>)}</ul>
        </nav>)}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-400">
        <p>© Verifiable.sg. Built on open credential standards.</p>
        <button type="button" onClick={openCookiePreferences} className="min-h-11 rounded px-2 underline underline-offset-4 hover:text-white">Cookie preferences</button>
      </div>
    </div>
  </footer>;
}
