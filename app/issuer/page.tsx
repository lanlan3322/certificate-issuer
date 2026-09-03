"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { withBasePath } from "../../lib/site";

type Mode = "login" | "reset";
interface User { issuerId: string; email: string; displayName: string; issuerName: string; }
interface Credential { id: string; external_id: string; recipient_name: string; recipient_email: string; status: string; issued_at: string; credential: Record<string, unknown>; }

export default function IssuerPortalPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoverySession, setRecoverySession] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSession = async () => {
    const response = await fetch(withBasePath("/api/auth/me"), { method: "POST" });
    const payload = await response.json() as { user?: User | null };
    if (!payload.user) return;
    setUser(payload.user);
    const credentialResponse = await fetch(withBasePath("/api/credentials"));
    const credentialPayload = await credentialResponse.json() as { credentials?: Credential[] };
    setCredentials(credentialPayload.credentials ?? []);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "reset") {
      setMode("reset");
      // Arriving here from an email link means /auth/recovery established
      // the recovery session, so the new-password form can be shown.
      setRecoverySession(true);
    }
    if (params.get("error") === "invalid_link") setError("That reset link is invalid or has expired.");
    if (params.get("error") === "missing_code") setError("That reset link is missing the recovery token.");
    if (params.get("error") === "pkce_recovery_link") setError("That reset link uses an unsupported PKCE code. Request a new reset email after the recovery email template is updated.");
    void loadSession().catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/reset-request";
      const body = mode === "login" ? { email, password } : { email };
      const response = await fetch(withBasePath(endpoint), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string; user?: User; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Request failed.");
      if (mode === "login") {
        setUser(payload.user ?? null);
        await loadSession();
        window.dispatchEvent(new Event("trustvc-auth-changed"));
        const nextPath = new URLSearchParams(window.location.search).get("next");
        router.push(nextPath?.startsWith("/") ? nextPath : "/issuer/");
      }
      else { setMessage(payload.message ?? "If the email is registered, reset instructions have been created."); }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Request failed."); }
    finally { setLoading(false); }
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null); setMessage(null);
    try {
      const response = await fetch(withBasePath("/api/auth/reset"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPassword }) });
      const payload = await response.json() as { error?: string; errorMessage?: string };
      if (!response.ok) throw new Error(payload.errorMessage ?? payload.error ?? "Unable to reset password.");
      setMessage("Password reset successfully. You can now log in."); setMode("login"); setNewPassword(""); setRecoverySession(false);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to reset password."); }
    finally { setLoading(false); }
  };

  const logout = async () => { await fetch(withBasePath("/api/auth/logout"), { method: "POST" }); setUser(null); setCredentials([]); window.dispatchEvent(new Event("trustvc-auth-changed")); };

  if (user) return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Issuer portal</p><h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Welcome, {user.displayName}</h1><p className="mt-1 text-slate-600 dark:text-slate-300">{user.issuerName} · {user.email}</p></div>
        <div className="flex gap-2"><Link href="/insurance/" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Issue certificate</Link><button type="button" onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"><LogOut className="h-4 w-4" /> Log out</button></div>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">Your certificates</h2>{credentials.length === 0 ? <p className="text-slate-500">No certificates have been stored for this issuer yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700"><tr><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Issued</th></tr></thead><tbody>{credentials.map((credential) => <tr key={credential.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-200">{credential.recipient_name}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-400">{credential.recipient_email}</td><td className="px-3 py-3 uppercase text-xs">{credential.status}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-400">{new Date(credential.issued_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}</section>
    </main>
  );

  return <main className="mx-auto max-w-xl px-4 py-10 sm:px-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8"><div className="mb-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-cyan-300"><ShieldCheck className="h-6 w-6" /></div><h1 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">Issuer access</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Sign in to manage your certificates.</p></div>
    {mode === "reset" ? <form className="space-y-4" onSubmit={submit}><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Registered email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-field mt-1" /></label><button disabled={loading} className="btn-primary w-full">{loading ? "Sending..." : "Send reset instructions"}</button>{recoverySession && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Recovery session verified. Set a new password below.</div>}</form> : <form className="space-y-4" onSubmit={submit}><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-field mt-1" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-field mt-1" /></label><button disabled={loading} className="btn-primary w-full">{loading ? "Working..." : "Log in"}</button></form>}
    {recoverySession && mode === "reset" && <form className="mt-5 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700" onSubmit={submitReset}><label className="block text-sm font-medium text-slate-700 dark:text-slate-200">New password<input required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input-field mt-1" /><span className="mt-1 block text-xs text-slate-500">Minimum 10 characters with uppercase, lowercase, and number.</span></label><button disabled={loading} className="btn-primary w-full">Set new password</button></form>}
    {message && <div className="mt-4"><p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>{mode === "reset" && message === "If the email is registered, reset instructions have been created." && <button type="button" onClick={() => { setMode("login"); setMessage(null); }} className="mt-3 text-sm font-semibold text-cyan-700 hover:text-cyan-800 hover:underline dark:text-cyan-300 dark:hover:text-cyan-200">Log in</button>}</div>}{error && <div className="mt-4"><p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>{mode === "login" && error === "Invalid email or password." && <button type="button" onClick={() => { setMode("reset"); setError(null); setMessage(null); }} className="mt-3 text-sm font-semibold text-cyan-700 hover:text-cyan-800 hover:underline dark:text-cyan-300 dark:hover:text-cyan-200">Reset password</button>}</div>}<p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" /> Passwords are hashed server-side and never stored in the browser.</p>
  </section></main>;
}