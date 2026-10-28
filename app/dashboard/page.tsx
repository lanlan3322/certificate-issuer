"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import IssuedCertificatesTable, { type CredentialItem } from "../../components/IssuedCertificatesTable";

interface AuthUser { issuerId: string; email: string; displayName: string; issuerName: string; organization: string }

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [allCredentials, setAllCredentials] = useState<CredentialItem[]>([]);

  // Detect auth session and load credentials on mount
  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "POST" });
        const payload = await res.json() as { user?: AuthUser | null };
        if (!cancelled) {
          if (payload.user) {
            setUser(payload.user);
            setCredentialLoading(true);
            try {
              const credRes = await fetch("/api/credentials");
              const credPayload = await credRes.json() as { credentials?: CredentialItem[]; error?: string };
              if (!credRes.ok || !Array.isArray(credPayload.credentials)) throw new Error(credPayload.error ?? "Unable to load certificates.");
              setAllCredentials(credPayload.credentials);
            } catch (reason) {
              setCredentialError(reason instanceof Error ? reason.message : "Unable to load certificates.");
            } finally {
              setCredentialLoading(false);
            }
          }
          setAuthLoading(false);
        }
      } catch {
        if (!cancelled) setAuthLoading(false);
      }
    };
    void checkAuth();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setUser(null);
    setAllCredentials([]);
    window.dispatchEvent(new Event("trustvc-auth-changed"));
  };

  if (authLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-cyan-500 border-t-transparent rounded-full" />
      </main>
    );
  }

  /* ─── Authenticated Dashboard ──────────────────────────────────── */
  if (user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome bar */}
        <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Welcome, {user.displayName}</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{user.issuerName} · {user.organization}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/profile/" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">My Profile</Link>
            <Link href="/insurance/" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-slate-600">Issue certificate</Link>
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>

        <IssuedCertificatesTable credentials={allCredentials} onCredentialsChange={setAllCredentials} loading={credentialLoading} error={credentialError} />
      </main>
    );
  }

  return <Link href="/issuer/">Log in to view your dashboard.</Link>;
}
