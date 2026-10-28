"use client";

import { useId, useRef, useState } from "react";
import { withBasePath } from "../lib/site";

interface Props {
  credential: { id: string; status: string; recipientName: string; recipientEmail: string };
}

export default function SendCertificateButton({ credential }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const headingId = useId();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (credential.status.toLowerCase() !== "issued") return null;

  const close = () => {
    if (inFlight.current) return;
    dialog.current?.close();
    trigger.current?.focus();
  };
  const send = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch(withBasePath("/api/credentials/send"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: credential.id, requestId: requestId.current }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to send certificate.");
      if (!payload.message) throw new Error("Email acceptance was not confirmed.");
      setMessage(payload.message);
      dialog.current?.close();
      trigger.current?.focus();
      requestId.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send certificate.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <button ref={trigger} type="button" onClick={() => {
      setError(null); setMessage(null); dialog.current?.showModal();
    }} className="rounded-md border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800 focus-visible:outline focus-visible:outline-2 dark:bg-slate-800 dark:text-cyan-200">
      Send
    </button>
    {message && <p role="status" className="mt-2 max-w-56 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
    <dialog ref={dialog} aria-labelledby={headingId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
      className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 text-left text-slate-900 shadow-xl backdrop:bg-black/60 dark:bg-slate-900 dark:text-slate-100">
      <h2 id={headingId} className="text-xl font-bold">Send certificate?</h2>
      <p className="mt-4 break-words text-sm">Email the signed .json certificate to {credential.recipientName} at <strong>{credential.recipientEmail}</strong>?</p>
      <p className="mt-3 text-sm">Confirm this is the intended recipient. The certificate may contain personal data. The recipient address cannot be changed here.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button type="button" disabled={sending} onClick={() => void send()} className="rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{sending ? "Sending..." : "Confirm Send"}</button>
        <button type="button" autoFocus disabled={sending} onClick={close} className="rounded-lg border border-slate-400 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Cancel</button>
      </div>
    </dialog>
  </div>;
}
