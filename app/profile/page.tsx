"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { AuthUser } from "../../lib/auth";
import { withBasePath } from "../../lib/site";

interface Profile extends AuthUser {
  organizationName: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(withBasePath("/api/auth/profile"));
        const payload = await response.json() as { profile?: Profile; error?: string };
        if (!response.ok || !payload.profile) throw new Error(payload.error ?? "Unable to load your profile.");
        if (active) {
          setProfile(payload.profile);
          setDisplayName(payload.profile.displayName);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load your profile.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(withBasePath("/api/auth/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const payload = await response.json() as { displayName?: string; updatedAt?: string; error?: string };
      if (!response.ok || !payload.displayName || !payload.updatedAt) throw new Error(payload.error ?? "Unable to update your profile.");
      const updatedName = payload.displayName;
      const updatedAt = payload.updatedAt;
      setDisplayName(updatedName);
      setProfile((current) => current && { ...current, displayName: updatedName, updatedAt });
      setMessage("Profile updated.");
      window.dispatchEvent(new Event("trustvc-auth-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!profile) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(withBasePath("/api/auth/reset-request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: profile.email }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error ?? "Unable to send reset instructions.");
      setMessage(payload.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send reset instructions.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-cyan-700 hover:underline">Back to dashboard</Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">My Profile</h1>
      {loading && <p role="status" className="mt-4">Loading your profile...</p>}
      {error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 text-emerald-700 dark:text-emerald-300">{message}</p>}
      {profile && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <form onSubmit={save} className="space-y-4">
            <label htmlFor="display-name" className="block font-medium">Display name</label>
            <input id="display-name" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="input-field w-full" />
            <button disabled={saving || !displayName.trim()} className="btn-primary disabled:opacity-60">{saving ? "Saving..." : "Save profile"}</button>
          </form>
          <p className="mt-6 text-sm text-slate-500">The following account and access details are read-only. Contact an administrator to change them.</p>
          <dl className="mt-4 grid gap-4 break-words sm:grid-cols-2">
            {[
              ["Email", profile.email],
              ["Roles", profile.roles.join(", ")],
              ["Organization", profile.organizationName],
              ["Organization ID", profile.organizationId],
              ["Issuer", profile.issuerName],
              ["Issuer ID", profile.issuerId],
              ["User ID", profile.id],
              ["Created", profile.createdAt],
              ["Last updated", profile.updatedAt],
            ].map(([label, value]) => (
              <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1">{value}</dd></div>
            ))}
          </dl>
          <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
            <h2 className="font-semibold">Password</h2>
            <p className="my-3 text-sm text-slate-500">Send password reset instructions to your registered email address.</p>
            <button type="button" disabled={sending} onClick={() => void resetPassword()} className="btn-primary disabled:opacity-60">{sending ? "Sending..." : "Reset password"}</button>
          </div>
        </section>
      )}
    </main>
  );
}
