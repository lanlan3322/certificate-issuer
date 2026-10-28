"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { withBasePath } from "../lib/site";
import { openCookiePreferences } from "../lib/cookie-consent";

const footerLinks = [
  { href: "/docs/user-manual", label: "User Manual" },
  { href: "/docs/admin-manual", label: "Admin Manual" },
  { href: "/release-notes", label: "Release Notes" },
];

export default function Footer({ authenticated = false }: { authenticated?: boolean }) {
  const [visible, setVisible] = useState(authenticated);
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    let requestId = 0;
    const refreshAuthentication = async () => {
      const currentRequest = ++requestId;
      try {
        const response = await fetch(withBasePath("/api/auth/me"), { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error("Unable to confirm footer authentication.");
        const payload = await response.json() as { user?: unknown };
        if (active && currentRequest === requestId) setVisible(Boolean(payload.user));
      } catch {
        if (active && currentRequest === requestId) setVisible(false);
      }
    };
    void refreshAuthentication();
    window.addEventListener("trustvc-auth-changed", refreshAuthentication);
    return () => {
      active = false;
      window.removeEventListener("trustvc-auth-changed", refreshAuthentication);
    };
  }, [pathname]);

  return (
    <footer className="theme-fixed border-t border-slate-200 bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {visible && <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">Documentation</p>
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
        </div>}
        <div className={`${visible ? "mt-6 border-t border-slate-700 pt-6 " : ""}flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between`}>
          <p>© Verifiable.sg</p>
          <nav aria-label="Legal links" className="flex flex-wrap items-center gap-3">
            <Link href="/privacy" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Privacy Policy</Link>
            <span aria-hidden="true">|</span>
            <Link href="/terms" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Terms of Service</Link>
            <span aria-hidden="true">|</span>
            <Link href="/contact" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Contact Us</Link>
            <span aria-hidden="true">|</span>
            <button type="button" onClick={openCookiePreferences} className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Cookie Preferences</button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
