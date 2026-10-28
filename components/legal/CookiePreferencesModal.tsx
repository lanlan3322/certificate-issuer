"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Props {
  analytics: boolean;
  error: string | null;
  onSave: (analytics: boolean) => void;
  onClose: () => void;
}

export default function CookiePreferencesModal({ analytics, error, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [enabled, setEnabled] = useState(analytics);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby="cookie-preferences-title"
      aria-describedby="cookie-preferences-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <h2 id="cookie-preferences-title" className="text-xl font-bold">Cookie Preferences</h2>
      <p id="cookie-preferences-description" className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        Choose how optional cookies and similar browser storage may be used. You can change your choice from the footer anytime.
      </p>
      <div className="mt-5 space-y-4">
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <input type="checkbox" checked disabled className="mt-1 h-5 w-5" />
          <span><span className="block font-semibold">Necessary Cookies (always enabled)</span>
            <span className="text-sm text-slate-600 dark:text-slate-300">Required for login, security, service features, and remembering your preferences. These cannot be disabled here.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 h-5 w-5 accent-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" />
          <span><span className="block font-semibold">Analytics Cookies</span>
            <span className="text-sm text-slate-600 dark:text-slate-300">Optional usage measurement, including assistant interaction analytics. Off until you agree.</span>
          </span>
        </label>
        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Marketing Cookies:</strong> not enabled. Adding marketing tracking requires a future consent choice.</p>
      </div>
      <Link href="/privacy" onClick={onClose} className="mt-4 inline-block text-sm text-cyan-800 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 dark:text-cyan-300">Read our Privacy Policy</Link>
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => onSave(enabled)} className="rounded-lg bg-cyan-800 px-4 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600">Save Preferences</button>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-400 px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Close</button>
      </div>
    </dialog>
  );
}
