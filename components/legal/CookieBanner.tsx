"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  COOKIE_CONSENT_CHANGED, COOKIE_CONSENT_KEY, COOKIE_PREFERENCES_OPEN,
  readCookieConsent, saveCookieConsent, type CookieConsent,
} from "../../lib/cookie-consent";
import CookiePreferencesModal from "./CookiePreferencesModal";

export default function CookieBanner() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => { setConsent(readCookieConsent()); setReady(true); };
    const show = () => { setError(null); setOpen(true); };
    const storage = (event: StorageEvent) => {
      if (event.key === COOKIE_CONSENT_KEY || event.key === null) refresh();
    };
    refresh();
    window.addEventListener(COOKIE_PREFERENCES_OPEN, show);
    window.addEventListener(COOKIE_CONSENT_CHANGED, refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(COOKIE_PREFERENCES_OPEN, show);
      window.removeEventListener(COOKIE_CONSENT_CHANGED, refresh);
      window.removeEventListener("storage", storage);
    };
  }, []);

  const save = (analytics: boolean) => {
    try {
      setConsent(saveCookieConsent(analytics));
      setError(null);
      setOpen(false);
    } catch {
      setError("Your browser could not save cookie preferences. Enable site storage and try again. No new consent has been saved.");
    }
  };

  // Embedded certificate renderers must remain free of application overlays.
  if (/^\/renderer\/?$/.test(pathname ?? "")) return null;

  return (
    <>
      {ready && !consent && (
        <section aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-[60] max-h-[60dvh] overflow-y-auto border-t border-slate-300 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-lg font-bold">Your cookie choices</h2>
            <p className="mt-2 text-sm leading-6">Verifiable.sg uses cookies to improve your experience, maintain security and understand platform usage. You may accept all cookies or manage your preferences.</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Necessary cookies stay enabled. Analytics is optional and off until you agree. Marketing is not enabled.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => save(true)} className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Accept All</button>
              <button type="button" onClick={() => save(false)} className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Reject Optional</button>
              <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Cookie Preferences</button>
              <Link href="/privacy" className="rounded-lg px-4 py-2 text-sm font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Privacy Policy</Link>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
          </div>
        </section>
      )}
      {open && <CookiePreferencesModal analytics={consent?.analytics ?? false} error={error} onSave={save} onClose={() => setOpen(false)} />}
    </>
  );
}
