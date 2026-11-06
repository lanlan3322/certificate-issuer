"use client";

import Link from "next/link";
import { openCookiePreferences } from "../lib/cookie-consent";

const groups = [
  { title: "Platform", links: [["/platform", "Platform capabilities"], ["/solutions", "Industry solutions"], ["/pricing", "Pricing"], ["/partners", "Partner ecosystem"], ["/verify", "Verify a credential"], ["/issuer/", "Workspace sign in"]] },
  { title: "Resources", links: [["/resources", "Resource centre"], ["/docs/user-manual", "User guide"], ["/docs/admin-manual", "Admin guide"], ["/release-notes", "Release notes"], ["/about", "About IBS Digital Credential Services"], ["/contact", "Contact support"]] },
  { title: "Legal", links: [["/privacy", "Privacy policy"], ["/terms", "Terms of service"]] },
];

export default function Footer() {
  return <footer className="theme-fixed border-t border-slate-800 bg-slate-950 text-slate-300">
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-5 border-b border-slate-800 pb-8">
        <p className="max-w-xl text-xl font-semibold text-white">Trusted credentials. Your organization&apos;s identity.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/contact#demo" className="inline-flex min-h-11 items-center rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">Book Demo</Link>
          <Link href="/contact#sales" className="inline-flex min-h-11 items-center rounded-xl border border-slate-500 px-5 py-3 text-white hover:bg-slate-800">Talk to Sales</Link>
        </div>
      </div>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <p className="text-lg font-bold text-white" translate="no">Verifiable.sg</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">Credential-as-a-Service to issue, manage, revoke and verify digital credentials under your organization&apos;s identity and brand.</p>
          <p className="mt-3 text-xs text-slate-400">IBS Digital Credential Services<br />Powered by Verifiable.sg</p>
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
