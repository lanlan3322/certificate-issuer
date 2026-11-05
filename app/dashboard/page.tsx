"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import IssuedCertificatesTable, { type CredentialItem } from "../../components/IssuedCertificatesTable";
import { useWorkspaceSession } from "../../components/WorkspaceSession";
import { hasPermission, isPlatformAdmin } from "../../lib/permissions";
import { withBasePath } from "../../lib/site";

export default function DashboardPage() {
  const { user, error: sessionError } = useWorkspaceSession();
  const [credentialLoading, setCredentialLoading] = useState(Boolean(user));
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [allCredentials, setAllCredentials] = useState<CredentialItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setAllCredentials([]);
    if (!user) { setCredentialLoading(false); return; }
    setCredentialLoading(true); setCredentialError(null);
    void (async () => {
      try {
        const response = await fetch(withBasePath("/api/credentials"), { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { credentials?: CredentialItem[]; error?: string };
        if (!response.ok || !Array.isArray(payload.credentials)) throw new Error(payload.error ?? "Unable to load credentials.");
        if (!controller.signal.aborted) setAllCredentials(payload.credentials);
      } catch (reason) {
        if (!controller.signal.aborted) setCredentialError(reason instanceof Error ? reason.message : "Unable to load credentials.");
      } finally { if (!controller.signal.aborted) setCredentialLoading(false); }
    })();
    return () => controller.abort();
  }, [user]);

  if (!user) return <main className="mx-auto max-w-xl px-4 py-12">
    <h1 className="text-2xl font-bold">Your credential workspace</h1>
    <p role={sessionError ? "alert" : undefined} className="mt-3 text-slate-600">{sessionError ?? "Sign in to view your organization's credentials."}</p>
    <Link href="/issuer/" prefetch={false} className="btn-primary mt-6">Sign in</Link>
  </main>;

  const metrics = [
    ["Loaded credentials", allCredentials.length],
    ["Issued", allCredentials.filter((credential) => credential.status === "issued").length],
    ["Revoked", allCredentials.filter((credential) => credential.status === "revoked").length],
    ["Other statuses", allCredentials.filter((credential) => !["issued", "revoked"].includes(credential.status)).length],
  ] as const;

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Credential workspace</p>
        <h1 className="mt-2 text-3xl font-bold">Credential overview</h1>
        <p className="mt-2 text-sm text-slate-500">Welcome, {user.displayName}. {isPlatformAdmin(user) ? "Manage credentials across all organizations." : `Review your organization's credentials for ${user.issuerName}.`}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/profile/" prefetch={false} className="btn-secondary">My Profile</Link>
        {hasPermission(user, "credentials.issue") && <Link href="/insurance/" prefetch={false} className="btn-primary">Issue credential</Link>}
      </div>
    </header>
    <section aria-label="Loaded credential summary" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map(([label, count]) => <div key={label} className="stat-card">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{credentialLoading ? "\u2014" : credentialError ? "Unavailable" : count.toLocaleString()}</p>
      </div>)}
    </section>
    <p className="mb-4 text-xs text-slate-500">Summary reflects the records loaded below, not an organization-wide lifetime total.</p>
    <IssuedCertificatesTable credentials={allCredentials} onCredentialsChange={setAllCredentials} loading={credentialLoading}
      error={credentialError} currentIssuerId={isPlatformAdmin(user) ? undefined : user.issuerId}
      canManageCredentials={hasPermission(user, "credentials.revoke")} />
  </main>;
}
