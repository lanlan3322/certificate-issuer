"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../../lib/site";

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

const orgInitialForm = {
  name: "",
  slug: "",
};

export default function AdminPage() {
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [orgForm, setOrgForm] = useState(orgInitialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const orgRes = await fetch(withBasePath("/api/organizations"));
        let fetchedOrgs: OrganizationRecord[] = [];

        if (orgRes.ok) {
          const json = await orgRes.json();
          const listPayload = json as OrganizationsResponse;

          if (Array.isArray(listPayload.organizations)) {
            fetchedOrgs = listPayload.organizations;
            setOrganizations(fetchedOrgs);
          }
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);


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

      // Append newly created org to the list so it appears in the dropdown immediately
      if (payload.organization) {
        setOrganizations((prev) => [...prev, payload.organization!]);
      }
      setOrgForm(orgInitialForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  const handleToggleOrgStatus = async (org: OrganizationRecord) => {
    const nextStatus = org.status === "active" ? "disabled" : "active";
    setError(null);

    try {
      const response = await fetch(withBasePath(`/api/organizations/${org.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = (await response.json()) as { error?: string; organization?: OrganizationRecord };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update organization status.");
      }

      setOrganizations((prev) =>
        prev.map((o) => (o.id === org.id ? payload.organization! : o))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update organization status.");
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Organization Administration</h1>
        <p className="mt-2 text-slate-600">
          Manage organizations, their activation state, and platform issuance eligibility.
        </p>
      </div>

      {/* Organizations section */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Organizations</h2>

        {loading ? (
          <p className="text-slate-500">Loading organizations…</p>
        ) : organizations.length === 0 ? (
          <>
            <p className="mb-4 text-slate-500">No organizations configured yet.</p>
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
          </>
        ) : (
          <div className="space-y-3">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{org.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                        org.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {org.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{org.slug}</p>
                  <p className="text-xs text-slate-500">Created: {new Date(org.createdAt).toLocaleDateString()}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleOrgStatus(org)}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    org.status === "active"
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  }`}
                >
                  {org.status === "active" ? "Disable" : "Activate"}
                </button>
              </div>
            ))}

            <form onSubmit={handleCreateOrganization} className="mt-6 space-y-4 pt-6 border-t border-slate-200">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Create new organization</label>
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
          </div>
        )}
      </section>
    </main>
  );
}
