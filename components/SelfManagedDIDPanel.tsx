"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { isPlatformAdmin, normalizeRoles } from "../lib/permissions";
import { withBasePath } from "../lib/site";
import type { ManagedDIDDocument } from "../lib/managed-did";

interface Configuration {
  domain: string; did: string; selected: boolean; revision: number; validation_status: string;
  checked_at: string | null; validation_message: string | null; linkage_expires_at: string | null;
  expected_document: ManagedDIDDocument;
}
export default function SelfManagedDIDPanel({ organizationId }: { organizationId: string }) {
  const { user } = useWorkspaceSession();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const canManage = !!user && (isPlatformAdmin(user) || normalizeRoles(user.roles).includes("organization_admin"));
  const endpoint = withBasePath(`/api/self-managed-dids?organizationId=${encodeURIComponent(organizationId)}`);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: "no-store", signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load customer DID configuration.");
    if (!signal?.aborted) setConfiguration(payload.configuration);
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    setConfiguration(null); setDomain(""); setError(null); setNotice(null); setLoading(true);
    void load(controller.signal).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load DID configuration.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load, user?.id]);
  const action = async (name: string, file?: "did" | "configuration") => {
    if (!canManage || lock.current) return;
    if ((name === "self-managed" || name === "managed") && !window.confirm(
      name === "self-managed"
        ? "Validate and switch new issuance to the customer DID? If deployment becomes unavailable or issuer keys change, self-managed issuance stops until revalidated. Historical managed identities remain available."
        : "Switch new issuance to the managed organization DID? Keep customer-hosted files online permanently for existing credentials."
    )) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(endpoint, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, ...(name === "configure" ? { domain } : {}) }) });
      const payload = await response.json();
      if (!response.ok) {
        await load();
        throw new Error(payload.error || "DID action failed.");
      }
      if (name === "files" && file) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(file === "did" ? payload.did : payload.configuration, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a");
        try {
          anchor.href = url; anchor.download = file === "did" ? "did.json" : "did-configuration.json";
          document.body.appendChild(anchor); anchor.click();
        } finally { anchor.remove(); URL.revokeObjectURL(url); }
        setNotice("Public file downloaded. Deploy both files at the exact HTTPS URLs below, then validate.");
      } else setNotice(name === "validate" ? "Both files and the domain linkage signature verified." : "DID configuration updated.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "DID operation failed."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-700" aria-label="Self-managed DID portal">
    <h2 className="text-xl font-bold">DID Management</h2>
    <p className="text-sm text-slate-600 dark:text-slate-400">
      Choose managed hosting or publish your organization DID on your own domain. Verifiable.sg still protects and uses your encrypted issuer signing keys; self-managed means DID hosting, not private-key custody.
    </p>
    {loading && <p role="status">Loading DID configuration...</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!loading && <p className="text-sm font-semibold">New issuance uses: {configuration?.selected ? "Self-Managed DID" : "Managed DID"}</p>}
    {!loading && !configuration && (canManage ? <form onSubmit={event => { event.preventDefault(); void action("configure"); }} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor={`did-domain-${organizationId}`}>Customer domain</label>
      <input id={`did-domain-${organizationId}`} className="input-field w-full" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        required maxLength={253} placeholder="academy.com" value={domain} disabled={busy} onChange={event => setDomain(event.target.value)} />
      <p className="text-xs text-slate-500">Enter a domain only, without https:// or a path. The domain cannot be renamed after configuration, to preserve historical identity.</p>
      <button className="btn-primary min-h-11" disabled={busy || !domain.trim()}>Create DID configuration</button>
    </form> : <p className="text-sm">An organization administrator can configure a customer-hosted DID.</p>)}
    {configuration && <>
      <section aria-label="DID overview">
        <h3 className="font-bold">Overview</h3>
        <p className="mt-2 break-all font-mono text-sm">{configuration.did}</p>
        <p className="mt-2 text-sm">Method: did:web. Hosting: self-managed. Revision: {configuration.revision}.</p>
        {canManage && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11" disabled={busy || !configuration.selected} onClick={() => void action("managed")}>Use Managed DID</button>
          <button type="button" className="btn-primary min-h-11" disabled={busy} onClick={() => void action("self-managed")}>Validate and use Self-Managed DID</button>
        </div>}
      </section>
      <section aria-label="DID file downloads" className="space-y-3">
        <h3 className="font-bold">Download Files</h3>
        <p className="text-sm">Publish both files with HTTPS, valid TLS, HTTP 200 and JSON responses. Redirects are rejected. Enable cross-origin reads for browser verifiers.</p>
        <ul className="space-y-2 break-all font-mono text-xs">
          {["did.json", "did-configuration.json"].map(file => <li key={file}><a className="underline" target="_blank" rel="noreferrer" href={`https://${configuration.domain}/.well-known/${file}`}>{`https://${configuration.domain}/.well-known/${file}`}</a></li>)}
        </ul>
        {canManage && <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => void action("files", "did")}>Download customer did.json</button>
          <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => void action("files", "configuration")}>Download did-configuration.json</button>
        </div>}
        <p className="text-xs text-slate-500">The linkage file contains a signed, expiring public credential, never a private key. Renew before expiry. Keep old issuer methods and hosted files available for historical verification.</p>
      </section>
      <section aria-label="DID deployment validation" className="space-y-2">
        <h3 className="font-bold">Validation Status</h3>
        <p className="text-sm">Last result: <strong>{configuration.validation_status}</strong>{configuration.checked_at ? ` (${new Date(configuration.checked_at).toLocaleString()})` : " - not checked"}</p>
        {configuration.validation_message && <p className="text-sm">{configuration.validation_message}</p>}
        <p className="text-xs text-slate-500">Every new self-managed issuance rechecks both live files. Adding issuers or activating keys requires an updated deployment; no automatic managed fallback is used.</p>
        {configuration.linkage_expires_at && <p className="text-sm">Linkage expiry: {new Date(configuration.linkage_expires_at).toLocaleDateString()}</p>}
        {canManage && <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => void action("validate")}>{busy ? "Working..." : "Validate deployment"}</button>}
      </section>
      <section aria-label="Customer issuer methods">
        <h3 className="font-bold">Issuer Methods</h3>
        <ul className="mt-3 space-y-3 text-sm">{configuration.expected_document.verificationMethod.map(method => <li key={method.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
          <p className="break-all font-mono">{method.id}</p>
          <p>{configuration.expected_document.authentication.includes(method.id) ? "Active issuer key" : "Historical public method"}</p>
          <p className="mt-1 break-all font-mono text-xs">{method.publicKeyMultibase}</p>
        </li>)}</ul>
        <details className="mt-4"><summary className="cursor-pointer font-semibold">Generated customer DID document</summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(configuration.expected_document, null, 2)}</pre>
        </details>
      </section>
    </>}
  </section>;
}
