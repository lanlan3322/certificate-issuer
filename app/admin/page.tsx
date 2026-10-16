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

interface IssuerRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  contactEmail: string;
  status: "active" | "disabled" | "suspended";
  createdAt: string;
}

interface IssuersResponse {
  issuers?: IssuerRecord[];
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
  const [selectedOrg, setSelectedOrg] = useState<OrganizationRecord | null>(null);
  const [issuers, setIssuers] = useState<IssuerRecord[]>([]);
  const [issuerLoading, setIssuerLoading] = useState(false);
  const [issuerForm, setIssuerForm] = useState({ name: "", slug: "", contactEmail: "" });
  const [issuerError, setIssuerError] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState<"all" | string>("all");
  const [createOrgId, setCreateOrgId] = useState<string>("");
  const [transferringIssuerId, setTransferringIssuerId] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

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

  const handleSelectOrg = async (org: OrganizationRecord) => {
    if (selectedOrg?.id === org.id) {
      setSelectedOrg(null);
      setIssuers([]);
      return;
    }

    setSelectedOrg(org);
    setIssuers([]);
    setIssuerLoading(true);
    setIssuerError(null);

    try {
      const response = await fetch(withBasePath("/api/issuers"));
      if (!response.ok) {
        throw new Error("Failed to load issuers.");
      }
      const data = (await response.json()) as IssuersResponse;
      const allIssuers = Array.isArray(data.issuers) ? data.issuers : [];
      setIssuers(allIssuers.filter((i) => i.organizationId === org.id));
    } catch (err) {
      setIssuerError(err instanceof Error ? err.message : "Unable to load issuers.");
    } finally {
      setIssuerLoading(false);
    }
  };

  const handleCreateIssuer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssuerError(null);

    const name = issuerForm.name.trim();
    const slug = formatSlug(issuerForm.slug);
    const contactEmail = issuerForm.contactEmail.trim();

    if (!name || !slug || !contactEmail) {
      setIssuerError("Name, slug, and contact email are required.");
      return;
    }

    try {
      const response = await fetch(withBasePath("/api/issuers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, contactEmail, organizationId: createOrgId || undefined }),
      });

      const data = (await response.json()) as { error?: string; issuer?: IssuerRecord };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create issuer.");
      }

      setIssuers((prev) => [...prev, data.issuer!]);
      setIssuerForm({ name: "", slug: "", contactEmail: "" });
    } catch (err) {
      setIssuerError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  const handleToggleIssuerStatus = async (issuer: IssuerRecord) => {
    const nextStatus = issuer.status === "active" ? "disabled" : "active";
    setIssuerError(null);

    try {
      const response = await fetch(withBasePath("/api/issuers"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: issuer.id, status: nextStatus }),
      });

      const data = (await response.json()) as { error?: string; issuer?: IssuerRecord };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update issuer status.");
      }

      setIssuers((prev) =>
        prev.map((i) => (i.id === issuer.id ? data.issuer! : i))
      );
    } catch (err) {
      setIssuerError(err instanceof Error ? err.message : "Unable to update issuer status.");
    }
  };

  const handleTransferIssuer = async (issuerId: string, newOrgId: string) => {
    setTransferError(null);
    setTransferringIssuerId(issuerId);

    try {
      const response = await fetch(withBasePath("/api/issuers"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: issuerId, organizationId: newOrgId }),
      });

      const data = (await response.json()) as { error?: string; issuer?: IssuerRecord };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to transfer issuer.");
      }

      setIssuers((prev) => prev.map((i) => (i.id === issuerId ? data.issuer! : i)));
      setTransferError("Issuer transferred successfully!");
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setTransferringIssuerId(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Organization Administration</h1>
          <p className="mt-2 text-slate-600">
            Manage organizations, their activation state, and platform issuance eligibility.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGlobalFilter((prev) => (prev === "all" ? "scoped" : "all"));
            setSelectedOrg(null);
            setIssuers([]);
            setCreateOrgId("");
          }}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            globalFilter === "all"
              ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {globalFilter === "all" ? "Switch to Organization" : "Switch to Issuer"}
        </button>
      </div>

      {/* Global Mode: Issuer Management */}
      {globalFilter === "all" && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Platform Issuer Management</h2>
          <p className="mb-5 text-sm text-slate-500">Create issuers for any organization or reassign existing ones.</p>

          {transferError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{transferError}</div>
          )}

          <div className="mb-8 rounded-lg border border-slate-200 p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Create New Issuer</h3>
            <form onSubmit={handleCreateIssuer} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Assign to organization</label>
                  <select required className="w-full rounded-md border border-slate-300 px-3 py-2" value={createOrgId} onChange={(e) => setCreateOrgId(e.target.value)}>
                    <option value="">Select an organization</option>
                    {organizations.filter((o) => o.status === "active").map((org) => (
                      <option key={org.id} value={org.id}>{org.name} ({org.slug})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Issuer name</label>
                  <input required className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. Root CA" name="name" value={issuerForm.name} onChange={(e) => setIssuerForm({ ...issuerForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
                  <input required className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. root-ca" name="slug" value={issuerForm.slug} onChange={(e) => setIssuerForm({ ...issuerForm, slug: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Contact email</label>
                  <input required type="email" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. ca-admin@example.com" name="contactEmail" value={issuerForm.contactEmail} onChange={(e) => setIssuerForm({ ...issuerForm, contactEmail: e.target.value })} />
                </div>
              </div>
              {issuerError && <p className="text-sm text-red-600">{issuerError}</p>}
              <button type="submit" className={`w-full rounded-md px-4 py-2 font-medium text-white ${!createOrgId ? "cursor-not-allowed bg-slate-400" : "bg-indigo-600 hover:bg-indigo-500"}`}>Create issuer</button>
            </form>
          </div>

          <div className="rounded-lg border border-slate-200 p-5">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Reassign Issuer to Organization</h3>
            <form onSubmit={(e) => { e.preventDefault(); const f=e.target as HTMLFormElement; const d=new FormData(f); const iid=(d.get("issuerId")?.toString()||"").trim(); const nid=(d.get("newOrgId")?.toString()||"").trim(); if(!iid){setTransferError("Please select an issuer.");return;} if(!nid){setTransferError("Please select a target organization.");return;} handleTransferIssuer(iid,nid); }} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Issuer</label>
                  <select required className="w-full rounded-md border border-slate-300 px-3 py-2" name="issuerId">
                    <option value="">Select an issuer</option>
                    {issuers.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.slug}) — Current: {organizations.find((o)=>o.id===i.organizationId)?.name ?? i.organizationId}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Target organization</label>
                  <select required className="w-full rounded-md border border-slate-300 px-3 py-2" name="newOrgId">
                    <option value="">Select organization</option>
                    {organizations.filter((o) => o.status === "active").map((org) => (
                      <option key={org.id} value={org.id}>{org.name} ({org.slug})</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full rounded-md bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-500">Transfer issuer</button>
            </form>
          </div>
        </section>
      )}

      {/* Organizations section — scoped mode only */}
      {globalFilter !== "all" && (
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
                onClick={() => handleSelectOrg(org)}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-slate-50 ${
                  selectedOrg?.id === org.id ? "border-blue-500 bg-blue-50/50" : "border-slate-200"
                }`}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleToggleOrgStatus(org);
                  }}
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
      )}

      {selectedOrg && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Issuers &ndash; {selectedOrg.name}</h2>
          <p className="mb-5 text-sm text-slate-500">Manage issuers registered for this organization.</p>

          {issuerLoading ? (
            <p className="text-slate-500">Loading issuers…</p>
          ) : issuers.length === 0 ? (
            <>
              <p className="mb-4 text-slate-500">No issuers configured for this organization yet.</p>
              <form onSubmit={handleCreateIssuer} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Issuer name</label>
                  <input
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g. Root CA"
                    name="name"
                    value={issuerForm.name}
                    onChange={(e) => setIssuerForm({ ...issuerForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
                  <input
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g. root-ca"
                    name="slug"
                    value={issuerForm.slug}
                    onChange={(e) => setIssuerForm({ ...issuerForm, slug: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Lowercase letters, numbers, and hyphens only. Auto-formatted on submit.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Contact email</label>
                  <input
                    required
                    type="email"
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="e.g. ca-admin@example.com"
                    name="contactEmail"
                    value={issuerForm.contactEmail}
                    onChange={(e) => setIssuerForm({ ...issuerForm, contactEmail: e.target.value })}
                  />
                </div>
                {issuerError && <p className="text-sm text-red-600">{issuerError}</p>}
                <button
                  type="submit"
                  className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
                >
                  Create issuer
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {issuers.map((issuer) => (
                  <div
                    key={issuer.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">{issuer.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                            issuer.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {issuer.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{issuer.slug}</p>
                      <p className="text-xs text-slate-500">Contact: {issuer.contactEmail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleIssuerStatus(issuer)}
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
            </>
          )}
        </section>
      )}
    </main>
  );
}
