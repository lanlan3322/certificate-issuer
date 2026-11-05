"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { withBasePath } from "../../lib/site";
import { safeInternalPath } from "../../lib/safe-internal-path";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { isValidPassword, PASSWORD_REQUIREMENTS } from "../../lib/password-policy";
import LegalNotice from "../../components/legal/LegalNotice";
import { useWorkspaceSession } from "../../components/WorkspaceSession";
import DashboardPage from "../dashboard/page";

export default function IssuerPortalPage() {
  const router = useRouter();
  const { user, refresh } = useWorkspaceSession();
  const recoveryTask = useRef<Promise<boolean> | null>(null);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoverySession, setRecoverySession] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const acceptInvitation = async () => {
      const params = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const type = fragment.get("type");
      if (params.get("mode") === "reset" || type === "invite" || type === "recovery") setMode("reset");
      const linkError = params.get("error");
      if (linkError === "invalid_link") setError("That reset link is invalid or has expired.");
      if (linkError === "missing_code") setError("That reset link is missing the recovery token.");
      if (linkError === "pkce_recovery_link") setError("That reset link uses an unsupported PKCE code. Request a new reset email after the recovery email template is updated.");
      if (type !== "invite" && type !== "recovery") {
        if (params.get("mode") === "reset") {
          const { data, error: recoveryError } = await getSupabaseBrowserClient().auth.getUser();
          if (recoveryError || !data.user) throw new Error("That reset link is invalid or has expired. Request a new reset email.");
          return true;
        }
        return false;
      }
      const accessToken = fragment.get("access_token"), refreshToken = fragment.get("refresh_token");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!accessToken || !refreshToken) throw new Error("The access link is incomplete. Request a new link or contact your administrator.");
      const { error: recoveryError } = await getSupabaseBrowserClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (recoveryError) throw new Error("The access link is invalid or expired. Request a new link or contact your administrator.");
      await refresh();
      return true;
    };
    recoveryTask.current ??= acceptInvitation();
    void recoveryTask.current.then((confirmed) => { if (active) setRecoverySession(confirmed); }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to accept invitation.");
    }).finally(() => { if (active) setRecoveryChecked(true); });
    return () => { active = false; };
  }, [refresh]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null); setMessage(null);
    try {
      const response = await fetch(withBasePath(mode === "login" ? "/api/auth/login" : "/api/auth/reset-request"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { email }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Request failed.");
      if (mode === "login") {
        await refresh();
        router.push(safeInternalPath(new URLSearchParams(window.location.search).get("next")));
        router.refresh();
      } else setMessage(payload.message ?? "If the email is registered, reset instructions have been created.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setLoading(false); }
  };
  const submitReset = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null); setMessage(null);
    try {
      if (!isValidPassword(newPassword)) throw new Error(PASSWORD_REQUIREMENTS);
      const response = await fetch(withBasePath("/api/auth/reset"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPassword }),
      });
      const payload = await response.json() as { error?: string; errorMessage?: string };
      if (!response.ok) throw new Error(payload.errorMessage ?? payload.error ?? "Unable to reset password.");
      setMessage("Password reset successfully. You can now log in.");
      setMode("login"); setNewPassword(""); setRecoverySession(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reset password."); }
    finally { setLoading(false); }
  };
  const switchMode = () => { setMode(mode === "login" ? "reset" : "login"); setError(null); setMessage(null); };

  if (!recoveryChecked) return <main className="mx-auto max-w-xl px-4 py-10"><p role="status">Preparing your workspace...</p></main>;
  if (user && mode !== "reset" && !recoverySession && !message) return <DashboardPage />;

  return <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
    <section className="card">
      <header className="mb-6">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-cyan-300"><ShieldCheck aria-hidden="true" size={24} /></div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Verifiable.sg workspace</p>
        <h1 className="mt-2 text-3xl font-bold">{recoverySession ? "Set your password" : mode === "reset" ? "Reset your password" : "Welcome back"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{recoverySession ? "Complete your account access to start using your organization’s workspace." : "One place to manage your organization’s credentials, templates and issuer access."}</p>
      </header>
      {recoverySession && mode === "reset" ? <form onSubmit={(event) => void submitReset(event)} className="space-y-4">
        <p role="status" className="text-sm text-emerald-700">Recovery session verified.</p>
        <label className="label" htmlFor="new-password">New password</label>
        <input id="new-password" name="new-password" required minLength={10} autoComplete="new-password" type="password" aria-describedby="password-requirements"
          value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input-field" />
        <p id="password-requirements" className="text-xs leading-5 text-slate-500">{PASSWORD_REQUIREMENTS}</p>
        <button disabled={loading} className="btn-primary w-full">{loading ? "Saving password..." : "Set new password"}</button>
      </form> : <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="label" htmlFor="workspace-email">{mode === "reset" ? "Registered email" : "Email"}</label>
        <input id="workspace-email" name="email" type="email" autoComplete="username" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} className="input-field" />
        {mode === "login" && <><label className="label" htmlFor="workspace-password">Password</label>
          <input id="workspace-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="input-field" /></>}
        <button disabled={loading} className="btn-primary w-full">{loading ? "Working..." : mode === "reset" ? "Send reset instructions" : "Sign in"}</button>
        <button type="button" onClick={switchMode} className="min-h-11 rounded text-sm font-semibold text-cyan-700 dark:text-cyan-300">{mode === "login" ? "Forgot your password?" : "Back to sign in"}</button>
      </form>}
      {message && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-500"><KeyRound aria-hidden="true" size={16} className="shrink-0" />Access is provided by your organization administrator. Contact them if you need an invitation.</p>
      <LegalNotice accountCreation={recoverySession} />
    </section>
  </main>;
}
