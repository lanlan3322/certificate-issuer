"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "../lib/site";

interface KeyMetadata {
  id: string;
  fingerprint: string;
  algorithm: "P-256";
  keyVersion: number;
  status: "pending" | "active" | "retired";
  createdAt: string;
  rotatedAt: string | null;
  downloadAvailable: boolean;
}

interface KeyList { keys: KeyMetadata[]; canManage: boolean }

async function errorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

export default function IssuerKeysPanel({ issuerId }: { issuerId: string }) {
  const [data, setData] = useState<KeyList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadAttempted, setDownloadAttempted] = useState(false);
  const locked = useRef(false);
  const downloadStarted = useRef(false);
  const endpoint = withBasePath(`/api/issuers/${encodeURIComponent(issuerId)}/keys`);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal });
    if (!response.ok) throw new Error(await errorMessage(response, "Unable to load issuer keys."));
    const payload: KeyList = await response.json();
    if (!Array.isArray(payload.keys) || typeof payload.canManage !== "boolean") {
      throw new Error("Invalid issuer key metadata response.");
    }
    if (!signal?.aborted) {
      // Keep only display metadata, never the complete API object.
      setData({
        canManage: payload.canManage,
        keys: payload.keys.map((key) => ({
          id: key.id, fingerprint: key.fingerprint, algorithm: key.algorithm,
          keyVersion: key.keyVersion, status: key.status, createdAt: key.createdAt,
          rotatedAt: key.rotatedAt, downloadAvailable: key.downloadAvailable,
        })),
      });
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setLoading(true); setError(null); setNotice(null);
    setDownloadAttempted(false); downloadStarted.current = false;
    void load(controller.signal).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load issuer keys.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load]);

  const rotate = async () => {
    if (!data?.canManage || locked.current) return;
    if (!window.confirm("Rotate Key? This creates the next P-256 version as pending only. It will not activate or replace the active key. Activation requires a matching existing verified, published DID binding.")) return;
    locked.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rotate" }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Unable to rotate key."));
      setNotice("Next key version created as pending. The active key has not changed.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rotate key.");
    } finally {
      locked.current = false; setBusy(false);
    }
  };

  const download = async () => {
    if (!data?.canManage || !data.keys.some((key) => key.downloadAvailable) || locked.current || downloadStarted.current) return;
    if (!window.confirm("Download Key Pair? This ZIP archive includes the private PEM export. It can be retrieved only once, within 10 minutes of issuer creation, by the original creating administrator (version 1 only). Store it securely. It cannot be retrieved again; a lost response cannot be retried.")) return;
    locked.current = true; downloadStarted.current = true;
    setBusy(true); setDownloadAttempted(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`${endpoint}/download`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Key export failed."));
      if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/zip") {
        throw new Error(await errorMessage(response, "Unexpected key export response."));
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = "issuer-key-pair.zip";
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setNotice("Key pair download started. Store the archive securely; this export cannot be retrieved again.");
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : "Key export failed."} A lost response cannot be retried. The one-time export may already be consumed.`);
    } finally {
      locked.current = false; setBusy(false);
    }
  };

  return <section className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700" aria-label="Issuer keys">
    <h3 className="text-lg font-semibold">Issuer keys</h3>
    {loading && <p role="status" className="mt-3 text-sm">Loading key metadata...</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {data && <>
      {data.canManage && <p className="mt-2 text-sm text-slate-500">P-256 keys support TrustVC compatibility. New keys remain pending until activation against a matching existing verified, published DID binding. Rotation does not activate a key.</p>}
      {!data.keys.length && <p className="mt-3 text-sm">No key metadata available. Viewing this panel does not generate keys.</p>}
      <ul className="mt-3 space-y-3">
        {data.keys.map((key) => <li key={key.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <dl className="space-y-2 text-sm">
            <div><dt className="font-medium">Fingerprint</dt><dd className="break-all font-mono">{key.fingerprint}</dd></div>
            {data.canManage && <>
              <div><dt className="font-medium">Algorithm</dt><dd>{key.algorithm}</dd></div>
              <div><dt className="font-medium">Version</dt><dd>{key.keyVersion}</dd></div>
              <div><dt className="font-medium">Status</dt><dd className="capitalize">{key.status}</dd></div>
              <div><dt className="font-medium">Created</dt><dd>{key.createdAt ? new Date(key.createdAt).toLocaleString() : "Unavailable"}</dd></div>
              <div><dt className="font-medium">Rotated</dt><dd>{key.rotatedAt ? new Date(key.rotatedAt).toLocaleString() : "Not rotated"}</dd></div>
            </>}
          </dl>
        </li>)}
      </ul>
      {data.canManage && <>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">The ZIP archive includes the private PEM export. Download is available once, within 10 minutes of creation, only to the original creating administrator for version 1. It cannot be retrieved again; a lost response cannot be retried.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => void rotate()}>Rotate Key</button>
          <button type="button" className="btn-primary min-h-11" disabled={busy || downloadAttempted || !data.keys.some((key) => key.downloadAvailable)} onClick={() => void download()}>Download Key Pair</button>
        </div>
      </>}
    </>}
  </section>;
}
