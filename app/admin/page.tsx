"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../../lib/site";

interface IssuerRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  contactEmail: string;
  status: "active" | "disabled" | "suspended";
  createdAt: string;
}

const initialForm = {
  organizationId: "org-demo",
  name: "",
  slug: "",
  contactEmail: "",
};

export default function IssuerAdminPage() {
  const [issuers, setIssuers] = useState<IssuerRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIssuers = async () => {
    try {
      const response = await fetch(withBasePath("/api/issuers"));
      const payload = (await response.json()) as { issuers?: IssuerRecord[] };
      setIssuers(payload.issuers ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load issuers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadIssuers();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(withBasePath("/api/issuers"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { error?: string; issuer?: IssuerRecord };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create issuer.");
      }

      setForm(initialForm);
      await loadIssuers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create issuer.");
    }
  };

  const toggleStatus = async (issuer: IssuerRecord) => {
    const nextStatus = issuer.status === "active" ? "disabled" : "active";
    setError(null);

    try {
      const response = await fetch(withBasePath("/api/issuers"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: issuer.id, status: nextStatus }),
      });

      const payload = (await response.json()) as { error?: string; issuer?: IssuerRecord };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update issuer status.");
      }

      await loadIssuers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update issuer status.");
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Issuer Administration</h1>
        <p className="mt-2 text-slate-600">
          Manage issuer workspaces, activation state, and platform issuance eligibility.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Create issuer</h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Organization</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.organizationId}
                onChange={(event) => setForm({ ...form, organizationId: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Issuer name</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Contact email</label>
              <input
                type="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.contactEmail}
                onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
            >
              Create issuer
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Issuer workspaces</h2>

          {loading ? (
            <p className="text-slate-500">Loading issuers…</p>
          ) : issuers.length === 0 ? (
            <p className="text-slate-500">No issuers configured yet.</p>
          ) : (
            <div className="space-y-3">
              {issuers.map((issuer) => (
                <div
                  key={issuer.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">{issuer.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-700">
                        {issuer.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{issuer.slug}</p>
                    <p className="text-sm text-slate-500">{issuer.contactEmail}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void toggleStatus(issuer)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      issuer.status === "active"
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    }`}
                  >
                    {issuer.status === "active" ? "Disable" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
