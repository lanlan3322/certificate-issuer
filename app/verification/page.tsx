"use client";

import { useState } from "react";
import Link from "next/link";
import { parseVerificationInput } from "../../lib/phase6";

type CredentialPreview = {
  issuer: string;
  subject: string;
  types: string[];
};

function getIdentifier(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return "Not provided";
}

export default function VerificationPortalPage() {
  const [payload, setPayload] = useState(`{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential"],
  "issuer": { "id": "did:web:example.com" },
  "credentialSubject": { "id": "did:example:subject" }
}`);
  const [preview, setPreview] = useState<CredentialPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = () => {
    try {
      const parsed = parseVerificationInput(payload);
      setPreview({
        issuer: getIdentifier(parsed.issuer),
        subject: getIdentifier(parsed.credentialSubject),
        types: Array.isArray(parsed.type) ? parsed.type.filter((item): item is string => typeof item === "string") : [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse credential JSON.");
      setPreview(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">Credential payload preview</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Inspect credential JSON</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">This page only parses JSON fields. It does not verify signatures, issuer authorization, expiry, or revocation. Use <Link href="/verify" className="font-semibold underline">credential verification</Link> for those checks.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 id="inspector-json-heading" className="text-lg font-semibold text-slate-900">Credential JSON</h2>
            <textarea
              aria-labelledby="inspector-json-heading"
              name="credential-json"
              spellCheck={false}
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={16}
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handlePreview}
              className="mt-4 w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-medium text-white hover:bg-indigo-600"
            >
              Preview parsed fields
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Parsed fields — not a verification result</h2>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {preview && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credential types</p>
                  <p className="mt-1 text-sm text-slate-700">{preview.types.length ? preview.types.join(", ") : "Not provided"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identifiers in payload</p>
                  <p className="mt-1 break-all text-sm text-slate-700">Issuer: {preview.issuer}</p>
                  <p className="mt-1 break-all text-sm text-slate-700">Subject: {preview.subject}</p>
                </div>
              </div>
            )}

            {!error && !preview && (
              <p className="mt-4 text-sm text-slate-500">No credential fields have been previewed yet.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
