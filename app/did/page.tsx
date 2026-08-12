"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

const starterDids = [
  { id: "did:web:imda.example", owner: "IMDA Academy", status: "active", method: "did:web", keyAlias: "prod-key-01" },
  { id: "did:web:openclaw.example", owner: "OpenClaw Labs", status: "rotating", method: "did:web", keyAlias: "prod-key-02" },
  { id: "did:web:northstar.example", owner: "Northstar Health", status: "disabled", method: "did:web", keyAlias: "legacy-key" },
];

export default function DIDPage() {
  const [form, setForm] = useState({
    owner: "OpenClaw Academy",
    method: "did:web",
    documentUrl: "https://openclaw.example/.well-known/did.json",
    keyAlias: "prod-issuer-key-01",
  });
  const [items, setItems] = useState(starterDids);

  const statusSummary = useMemo(() => {
    const counts = { active: 0, rotating: 0, disabled: 0 };
    items.forEach((item) => {
      counts[item.status as keyof typeof counts] += 1;
    });
    return counts;
  }, [items]);

  const handleCreate = () => {
    const next = {
      id: `did:web:${form.owner.toLowerCase().replace(/\s+/g, "-")}.example`,
      owner: form.owner,
      status: "active",
      method: form.method,
      keyAlias: form.keyAlias,
    };
    setItems((current) => [next, ...current]);
  };

  const rotateItem = (id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: item.status === "active" ? "rotating" : "active", keyAlias: `${item.keyAlias}-rotated` }
          : item
      )
    );
  };

  const deactivateItem = (id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "disabled" } : item
      )
    );
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-700">DID lifecycle</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Issuer identity control center</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{statusSummary.active}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rotating</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{statusSummary.rotating}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Disabled</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{statusSummary.disabled}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-violet-700" />
            <h2 className="text-xl font-semibold text-slate-900">Create or import DID</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Issuer owner</label>
              <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input-field">
                <option value="did:web">did:web</option>
                <option value="did:key">did:key</option>
                <option value="did:ethr">did:ethr</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Document URL</label>
              <input value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Key alias</label>
              <input value={form.keyAlias} onChange={(e) => setForm({ ...form, keyAlias: e.target.value })} className="input-field" />
            </div>
            <button onClick={handleCreate} className="btn-primary w-full">
              Generate DID document
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="text-xl font-semibold text-slate-900">Current DID registry</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
              live
            </span>
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{item.id}</div>
                    <div className="text-sm text-slate-600">{item.owner} • {item.method}</div>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700">
                    {item.status === "active" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : item.status === "rotating" ? <RefreshCw className="h-3.5 w-3.5 text-amber-600" /> : <ShieldAlert className="h-3.5 w-3.5 text-red-600" />}
                    {item.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>Key alias: {item.keyAlias}</span>
                  <span className="flex gap-2">
                    <button onClick={() => rotateItem(item.id)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100">Rotate</button>
                    <button onClick={() => deactivateItem(item.id)} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-700 hover:bg-red-100">Deactivate</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
