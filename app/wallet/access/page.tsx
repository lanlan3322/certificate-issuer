"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";
import { withBasePath } from "../../../lib/site";

export default function WalletAccessPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "invalid_link" || reason === "missing_code") {
      setError("That sign-in link is invalid or expired. Request a new link and open it in the same browser.");
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      const callback = new URL(withBasePath("/auth/callback/"), window.location.origin);
      callback.searchParams.set("next", withBasePath("/wallet/dashboard/"));
      const { error: authError } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true, emailRedirectTo: callback.href },
      });
      if (authError) throw authError;
      setMessage("If the address can receive a sign-in link, check your email and open the link in this browser.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send a sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
    <section className="card">
      <p className="text-sm font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Professional Credential Passport</p>
      <h1 className="mt-2 text-3xl font-bold">Sign in to your wallet</h1>
      <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">Use the email address your credential issuer recorded. A verified email links you to matching credentials; anyone with control of that mailbox may be able to access them.</p>
      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
        <label className="label" htmlFor="wallet-email">Email address</label>
        <input id="wallet-email" type="email" autoComplete="email" required value={email}
          onChange={(event) => setEmail(event.target.value)} className="input-field" />
        <button className="btn-primary w-full" disabled={loading}>{loading ? "Sending..." : "Email me a sign-in link"}</button>
      </form>
      {message && <p role="status" className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <Link href="/wallet/dashboard" className="mt-4 inline-block text-sm font-semibold text-violet-700 dark:text-violet-300">Already signed in? Open wallet</Link>
    </section>
  </main>;
}
