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

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled";
  createdAt: string;
}

interface OrganizationsResponse {
  organizations?: OrganizationRecord[];
}

interface CurrentOrgResponse {
  organization?: OrganizationRecord | null;
}

const initialForm = {
  name: "",
  slug: "",
  contactEmail: "",
  didUri: "",
};

const orgInitialForm = {
  name: "",
  slug: "",
};

export default function IssuerAdminPage() {
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | "">("");
  const [issuers, setIssuers] = useState<IssuerRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [orgForm, setOrgForm] = useState(orgInitialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // Load all organizations for the dropdown
        const orgRes = await fetch(withBasePath("/api/organizations"));
        let fetchedOrgs: OrganizationRecord[] = [];

        if (orgRes.ok) {
          const json = await orgRes.json();
          const listPayload = json as OrganizationsResponse;

          if (Array.isArray(listPayload.organizations)) {
            fetchedOrgs = listPayload.organizations;
            setOrganizations(fetchedOrgs);
            // Use the first org as current user's default display
            setOrganization(fetchedOrgs[0] ?? null);
            // Pre-select the first organization in the issuer form dropdown
            setSelectedOrganizationId(fetchedOrgs[0]?.id ?? "");
          }
        }

        // Load issuers if we have organizations
        if (fetchedOrgs.length > 0) {
          const response = await fetch(withBasePath("/api/issuers"));
          const payload = (await response.json()) as { issuers?: IssuerRecord[] };
          setIssuers(payload.issuers ?? []);
        } else {
          setIssuers([]);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadIssuers = async () => {
    try {
      const response = await fetch(withBasePath("/api/issuers"));
      if (!response.ok) throw new Error("Unable to load issuers.");
      const payload = (await response.json()) as { issuers?: IssuerRecord[] };
      setIssuers(payload.issuers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load issuers.");
    }
  };

  const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

  const formatSlug = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const handleOrgFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrgForm({ ...orgForm, [e.target.name]: e.target.value });
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = orgForm.name.trim();
    const slug = formatSlug(orgForm.slug);

    if (!name) {
      setError("Organization name is required.");
      return;
    }
    if (!slug || !SLUG_PATTERN.test(slug)) {
      setError(
        "Organization slug must be 2–63 characters, using only lowercase letters, numbers, and hyphens (starting with a letter or number)."
      );
      return;
    }

    try {
      const response = await fetch(withBasePath("/api/organizations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });

      const payload = (await response.json()) as {
        error?: string;
        organization?: OrganizationRecord;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create organization.");
      }

      setOrganization(payload.organization ?? null);
      // Append newly created org to the list so it appears in the dropdown immediately
      if (payload.organization) {
        setOrganizations((prev) => [...prev, payload.organization!]);
        // Pre-select the newly created organization in the issuer form dropdown
        setSelectedOrganizationId(payload.organization.id);
      }
      setOrgForm(orgInitialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const slug = formatSlug(form.slug);
    const contactEmail = form.contactEmail.trim();

    if (!name) {
      setError("Issuer name is required.");
      return;
    }
    if (!slug || !SLUG_PATTERN.test(slug)) {
      setError(
        "Slug must be 2–63 characters, using only lowercase letters, numbers, and hyphens (starting with a letter or number)."
      );
      return;
    }
    if (!contactEmail) {
      setError("Contact email is required.");
      return;
    }

    // Update form with sanitized values before sending
    setForm({ name, slug, contactEmail, didUri: form.didUri.trim() });

    try {
      const response = await fetch(withBasePath("/api/issuers"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, slug, contactEmail, didUri: form.didUri.trim() || undefined, organizationId: selectedOrganizationId }),
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

      {/* Organization section */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Organization</h2>
        {organization ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800">{organization.name}</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-700">
                  {organization.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{organization.slug}</p>
              <p className="mt-1 text-xs text-slate-500">Created: {new Date(organization.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateOrganization} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Organization name</label>
              <input
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. My Organization"
                name="name"
                value={orgForm.name}
                onChange={handleOrgFormChange}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
              <input
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. my-org-name"
                name="slug"
                value={orgForm.slug}
                onChange={handleOrgFormChange}
              />
              <p className="mt-1 text-xs text-slate-500">
                Lowercase letters, numbers, and hyphens only. Auto-formatted on submit.
              </p>
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
            >
              Create organization
            </button>
          </form>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Create issuer</h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Organization selector */}
            {organizations.length > 1 ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Organization</label>
                <select
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : organizations.length === 1 ? (
              <input type="hidden" name="organizationId" value={organizations[0].id} />
            ) : null}

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
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. my-issuer-name"
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Lowercase letters, numbers, and hyphens only. Auto-format: spaces become hyphens, uppercase is lowered.
              </p>
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
