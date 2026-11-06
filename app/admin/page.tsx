"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useWorkspaceSession } from "../../components/WorkspaceSession";
import IssuerKeysPanel from "../../components/IssuerKeysPanel";
import { withBasePath } from "../../lib/site";
import { hasPermission } from "../../lib/permissions";

type IssuerStatus = "active" | "inactive" | "suspended" | "deleted" | "disabled";
type IssuerRole = "issuer_admin" | "issuer_operator" | "viewer";
interface Organization { id: string; name: string; status: string }
interface Issuer {
  id: string;
  organizationId: string;
  name: string;
  displayName?: string | null;
  slug: string;
  contactEmail: string;
  website?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  didUri?: string;
  verificationMethod?: string | null;
  keyFingerprint?: string | null;
  status: IssuerStatus;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
interface IssuerMember { issuerId: string; userId: string; role: IssuerRole; createdAt: string }

type IssuerDraft = Omit<Issuer, "id" | "createdAt" | "updatedAt" | "organizationId" | "didUri" | "verificationMethod" | "keyFingerprint" | "active">;
const blankDraft: IssuerDraft = {
  name: "", displayName: "", slug: "", contactEmail: "", website: "", description: "", logoUrl: "", status: "active",
};
const roles: IssuerRole[] = ["issuer_admin", "issuer_operator", "viewer"];

function normalizeStatus(status: IssuerStatus) {
  return status === "disabled" ? "inactive" : status;
}

function issuerDraft(issuer: Issuer): IssuerDraft {
  return {
    name: issuer.name,
    displayName: issuer.displayName ?? "",
    slug: issuer.slug,
    contactEmail: issuer.contactEmail,
    website: issuer.website ?? "",
    description: issuer.description ?? "",
    logoUrl: issuer.logoUrl ?? "",
    status: normalizeStatus(issuer.status) as IssuerStatus,
  };
}

function metadataBody(draft: IssuerDraft) {
  return {
    name: draft.name.trim(),
    displayName: draft.displayName?.trim() || null,
    slug: draft.slug.trim().toLowerCase(),
    contactEmail: draft.contactEmail.trim(),
    website: draft.website?.trim() || null,
    description: draft.description?.trim() || null,
    logoUrl: draft.logoUrl?.trim() || null,
    status: draft.status,
  };
}

async function responseJson<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>;
}

export default function AdminPage() {
  const { user } = useWorkspaceSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [form, setForm] = useState<IssuerDraft>(blankDraft);
  const [organizationId, setOrganizationId] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("");
  const [selectedIssuerId, setSelectedIssuerId] = useState("");
  const [detailVersion, setDetailVersion] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [details, setDetails] = useState<Issuer | null>(null);
  const [members, setMembers] = useState<IssuerMember[]>([]);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<IssuerRole>("issuer_operator");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, IssuerRole>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = hasPermission(user, "issuers.manage");
  const platformAdmin = hasPermission(user, "organizations.manage");

  useEffect(() => {
    const controller = new AbortController();
    if (!user || !canManage) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    setError(null);
    const loadOrganizations = async () => {
      const path = platformAdmin ? "/api/organizations" : `/api/organizations/${encodeURIComponent(user.organizationId)}`;
      const response = await fetch(withBasePath(path), { signal: controller.signal });
      const payload = await responseJson<{ organizations?: Organization[]; organization?: Organization }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Unable to load organizations.");
      const items = platformAdmin ? payload.organizations : payload.organization ? [payload.organization] : undefined;
      if (!Array.isArray(items)) throw new Error("Invalid organization list response.");
      if (!controller.signal.aborted) {
        setOrganizations(items);
        if (!platformAdmin) setOrganizationId(user.organizationId);
      }
    };
    const loadIssuers = async () => {
      const response = await fetch(withBasePath("/api/issuers"), { signal: controller.signal });
      const payload = await responseJson<{ issuers?: Issuer[] }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Unable to load issuers.");
      if (!Array.isArray(payload.issuers)) throw new Error("Invalid issuer list response.");
      if (!controller.signal.aborted) setIssuers(payload.issuers);
    };
    void Promise.allSettled([loadOrganizations(), loadIssuers()]).then((results) => {
      if (controller.signal.aborted) return;
      const errors = results.flatMap((result) => result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : "Unable to load issuer management."] : []);
      setError(errors.length ? errors.join(" ") : null);
      setLoading(false);
    });
    return () => controller.abort();
  }, [user, canManage, platformAdmin]);

  useEffect(() => {
    if (!selectedIssuerId) {
      setDetails(null);
      setMembers([]);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    const load = async () => {
      const [issuerResponse, memberResponse] = await Promise.all([
        fetch(withBasePath(`/api/issuers/${encodeURIComponent(selectedIssuerId)}`), { signal: controller.signal }),
        fetch(withBasePath(`/api/issuers/${encodeURIComponent(selectedIssuerId)}/members`), { signal: controller.signal }),
      ]);
      const [issuerPayload, memberPayload] = await Promise.all([
        responseJson<{ issuer?: Issuer }>(issuerResponse),
        responseJson<{ members?: IssuerMember[] }>(memberResponse),
      ]);
      if (!issuerResponse.ok || !issuerPayload.issuer) throw new Error(issuerPayload.error ?? "Unable to load issuer details.");
      if (!memberResponse.ok || !Array.isArray(memberPayload.members)) throw new Error(memberPayload.error ?? "Unable to load issuer members.");
      if (!controller.signal.aborted) {
        setDetails(issuerPayload.issuer);
        setMembers(memberPayload.members);
        setRoleDrafts(Object.fromEntries(memberPayload.members.map((member) => [member.userId, member.role])));
      }
    };
    void load().catch((reason) => {
      if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "Unable to load issuer details.");
    }).finally(() => {
      if (!controller.signal.aborted) setDetailLoading(false);
    });
    return () => controller.abort();
  }, [selectedIssuerId, detailVersion]);

  const saveIssuer = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const creating = !editingId;
      const body = {
        ...(creating ? { organizationId } : { id: editingId }),
        ...metadataBody(form),
      };
      const response = await fetch(withBasePath(creating ? "/api/issuers" : `/api/issuers/${encodeURIComponent(editingId)}`), {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await responseJson<{ issuer?: Issuer }>(response);
      if (!response.ok || !payload.issuer) throw new Error(payload.error ?? `Unable to ${creating ? "create" : "update"} issuer.`);
      const saved = payload.issuer;
      setIssuers((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedIssuerId(saved.id);
      setEditingId("");
      setForm(blankDraft);
      setNotice(creating ? "Issuer created." : "Issuer details updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save issuer."); }
    finally { setBusy(false); }
  };

  const beginEdit = (issuer: Issuer) => {
    setSelectedIssuerId(issuer.id);
    setEditingId(issuer.id);
    setOrganizationId(issuer.organizationId);
    setForm(issuerDraft(issuer));
    setError(null);
    setNotice(null);
  };

  const changeStatus = async (issuer: Issuer, status: "active" | "inactive") => {
    if (status === "inactive" && !window.confirm(`Deactivate ${issuer.displayName || issuer.name}? Existing credentials remain available for historical verification.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(withBasePath(`/api/issuers/${encodeURIComponent(issuer.id)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: issuer.id, ...metadataBody({ ...issuerDraft(issuer), status }) }),
      });
      const payload = await responseJson<{ issuer?: Issuer }>(response);
      if (!response.ok || !payload.issuer) throw new Error(payload.error ?? "Unable to update issuer status.");
      const updated = payload.issuer;
      setIssuers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setDetails(updated);
      setNotice(status === "inactive" ? "Issuer deactivated." : "Issuer activated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update issuer status."); }
    finally { setBusy(false); }
  };

  const softDelete = async (issuer: Issuer) => {
    if (!platformAdmin) return;
    if (!window.confirm(`Soft-delete ${issuer.displayName || issuer.name}? This preserves historical records but removes the issuer from normal use.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(withBasePath(`/api/issuers/${encodeURIComponent(issuer.id)}`), { method: "DELETE" });
      const payload: { issuer?: Issuer; error?: string } = response.status === 204
        ? {} : await responseJson<{ issuer?: Issuer }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Unable to soft-delete issuer.");
      const updated = payload.issuer ?? { ...issuer, status: "deleted" as const, active: false };
      setIssuers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setDetails(updated);
      setNotice("Issuer soft-deleted. Historical records are preserved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to soft-delete issuer."); }
    finally { setBusy(false); }
  };

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedIssuerId) return;
    setBusy(true); setDetailError(null); setNotice(null);
    try {
      const response = await fetch(withBasePath(`/api/issuers/${encodeURIComponent(selectedIssuerId)}/members`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberUserId.trim(), role: memberRole }),
      });
      const payload = await responseJson<{ member?: IssuerMember }>(response);
      if (!response.ok || !payload.member) throw new Error(payload.error ?? "Unable to add issuer member.");
      setMemberUserId("");
      const listResponse = await fetch(withBasePath(`/api/issuers/${encodeURIComponent(selectedIssuerId)}/members`));
      const listPayload = await responseJson<{ members?: IssuerMember[] }>(listResponse);
      if (!listResponse.ok || !Array.isArray(listPayload.members)) throw new Error(listPayload.error ?? "Member saved but the list could not be refreshed.");
      setMembers(listPayload.members);
      setRoleDrafts(Object.fromEntries(listPayload.members.map((member) => [member.userId, member.role])));
      setNotice("Issuer member added.");
    } catch (reason) { setDetailError(reason instanceof Error ? reason.message : "Unable to add issuer member."); }
    finally { setBusy(false); }
  };

  const changeMemberRole = async (member: IssuerMember) => {
    const role = roleDrafts[member.userId] ?? member.role;
    if (role === member.role) return;
    setBusy(true); setDetailError(null); setNotice(null);
    try {
      const response = await fetch(withBasePath(`/api/issuers/${encodeURIComponent(member.issuerId)}/members`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role }),
      });
      const payload = await responseJson<{ member?: IssuerMember }>(response);
      if (!response.ok || !payload.member) throw new Error(payload.error ?? "Unable to change member role.");
      setMembers((current) => current.map((item) => item.userId === member.userId ? payload.member! : item));
      setNotice("Issuer member role updated.");
    } catch (reason) { setDetailError(reason instanceof Error ? reason.message : "Unable to change member role."); }
    finally { setBusy(false); }
  };

  const removeMember = async (member: IssuerMember) => {
    if (!window.confirm(`Remove user ${member.userId} from this issuer? Their issuer-scoped access will end.`)) return;
    setBusy(true); setDetailError(null); setNotice(null);
    try {
      const response = await fetch(withBasePath(`/api/issuers/${encodeURIComponent(member.issuerId)}/members?userId=${encodeURIComponent(member.userId)}`), { method: "DELETE" });
      if (!response.ok) {
        const payload = await responseJson<{ error?: string }>(response);
        throw new Error(payload.error ?? "Unable to remove issuer member.");
      }
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setRoleDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== member.userId)));
      setNotice("Issuer member removed.");
    } catch (reason) { setDetailError(reason instanceof Error ? reason.message : "Unable to remove issuer member."); }
    finally { setBusy(false); }
  };

  if (!canManage) return <main className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-bold">Issuer management</h1><p role="alert" className="mt-3">Issuer administrator access is required.</p></main>;
  const visible = issuers.filter((issuer) => !organizationFilter || issuer.organizationId === organizationFilter);
  const selectedIssuer = details?.id === selectedIssuerId ? details : issuers.find((issuer) => issuer.id === selectedIssuerId) ?? null;
  const formOrganizationOptions = organizations.filter((organization) => organization.status === "active");

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Administration</p>
        <h1 className="mt-2 text-3xl font-bold">Issuer directory</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Manage issuer profiles, lifecycle and issuer-scoped members. Organization ownership cannot be transferred.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => { setSelectedIssuerId(""); setEditingId(""); setForm(blankDraft); setOrganizationId(platformAdmin ? "" : user?.organizationId ?? ""); setNotice(null); setError(null); }}>Create issuer</button>
        <Link href="/organizations" prefetch={false} className="btn-secondary">{platformAdmin ? "Manage organizations" : "My organization"}</Link>
      </div>
    </header>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {loading && <p role="status" className="mb-4">Loading issuer directory...</p>}

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="card" aria-labelledby="issuer-directory-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="issuer-directory-heading" className="text-xl font-semibold">Issuers</h2>
          <span className="text-sm text-slate-500">{visible.length} {visible.length === 1 ? "issuer" : "issuers"}</span>
        </div>
        <label className="label" htmlFor="issuer-organization-filter">Filter by organization</label>
        <select id="issuer-organization-filter" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)} className="input-field mb-5">
          <option value="">All accessible organizations</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>
        {!loading && !error && !visible.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800">No issuers match this organization.</p>}
        <ul className="space-y-3">
          {visible.map((issuer) => {
            const status = normalizeStatus(issuer.status);
            return <li key={issuer.id} className={`rounded-xl border p-4 ${selectedIssuerId === issuer.id ? "border-cyan-500 ring-1 ring-cyan-500" : "border-slate-200 dark:border-slate-700"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold">{issuer.displayName || issuer.name}</h3>
                  {issuer.displayName && <p className="mt-1 text-xs text-slate-500">Issuer name: {issuer.name}</p>}
                  <p className="mt-1 break-all text-sm text-slate-500">{issuer.contactEmail}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize dark:bg-slate-800">{status}</span>
              </div>
              <p className="my-3 break-all text-xs text-slate-500">{organizations.find((org) => org.id === issuer.organizationId)?.name ?? issuer.organizationId} · {issuer.slug}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary min-h-11 px-3 py-2" onClick={() => {
                  setSelectedIssuerId(issuer.id);
                  setDetailVersion((version) => version + 1);
                  setEditingId("");
                  setForm(blankDraft);
                  setError(null);
                }}>View details</button>
                {status !== "deleted" && <button type="button" className="btn-secondary min-h-11 px-3 py-2" onClick={() => beginEdit(issuer)}>Edit</button>}
                {status !== "deleted" && status !== "suspended" && <button type="button" disabled={busy} className="btn-secondary min-h-11 px-3 py-2" onClick={() => void changeStatus(issuer, status === "active" ? "inactive" : "active")}>{status === "active" ? "Deactivate" : "Activate"}</button>}
                {platformAdmin && status !== "deleted" && <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" onClick={() => void softDelete(issuer)}>Soft-delete</button>}
              </div>
            </li>;
          })}
        </ul>
      </section>

      <div className="space-y-6">
        <section className="card" aria-labelledby="issuer-form-heading">
          <h2 id="issuer-form-heading" className="text-xl font-semibold">{editingId ? "Edit issuer" : "Create issuer"}</h2>
          <p className="mt-2 text-sm text-slate-500">Issuer codes are unique within their organization. Organization ownership is fixed after creation.</p>
          <form onSubmit={(event) => void saveIssuer(event)} className="mt-5 space-y-4">
            {!editingId && <label className="label" htmlFor="issuer-organization">Organization
              <select id="issuer-organization" name="organizationId" required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="input-field mt-1">
                <option value="">Select an organization</option>
                {formOrganizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>}
            <label className="label" htmlFor="issuer-display-name">Display name
              <input id="issuer-display-name" name="displayName" autoComplete="organization" value={form.displayName ?? ""} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className="input-field mt-1" />
            </label>
            <label className="label" htmlFor="issuer-name">Issuer name
              <input id="issuer-name" name="name" autoComplete="off" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input-field mt-1" />
              <span className="mt-1 block text-xs font-normal text-slate-500">Legacy issuer name. Set the user-facing label separately with Display name.</span>
            </label>
            <label className="label" htmlFor="issuer-slug">Issuer code (slug)
              <input id="issuer-slug" name="slug" autoComplete="off" spellCheck={false} pattern="[a-z0-9][a-z0-9-]{1,62}" required value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} className="input-field mt-1" />
              <span className="mt-1 block text-xs font-normal text-slate-500">2–63 lowercase letters, numbers or hyphens; unique within this organization.</span>
            </label>
            <label className="label" htmlFor="issuer-contact-email">Contact email
              <input id="issuer-contact-email" name="contactEmail" type="email" autoComplete="email" required value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} className="input-field mt-1" />
            </label>
            <label className="label" htmlFor="issuer-website">Website
              <input id="issuer-website" name="website" type="url" autoComplete="url" value={form.website ?? ""} onChange={(event) => setForm({ ...form, website: event.target.value })} className="input-field mt-1" />
            </label>
            <label className="label" htmlFor="issuer-logo-url">Logo URL
              <input id="issuer-logo-url" name="logoUrl" type="url" value={form.logoUrl ?? ""} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} className="input-field mt-1" />
            </label>
            <label className="label" htmlFor="issuer-description">Description
              <textarea id="issuer-description" name="description" rows={3} value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input-field mt-1" />
            </label>
            {editingId && <label className="label" htmlFor="issuer-status">Status
              <select id="issuer-status" name="status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as IssuerStatus })} className="input-field mt-1">
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
              </select>
            </label>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || loading || (!editingId && formOrganizationOptions.length === 0)} className="btn-primary min-h-11">{busy ? "Saving..." : editingId ? "Save issuer" : "Create issuer"}</button>
              {editingId && <button type="button" className="btn-secondary min-h-11" onClick={() => { setEditingId(""); setForm(blankDraft); }}>Cancel edit</button>}
            </div>
            {!editingId && !loading && formOrganizationOptions.length === 0 && <p role="status" className="text-sm text-amber-700">No active organizations are available. Ask a platform administrator to create or activate one.</p>}
          </form>
        </section>

        {selectedIssuer && <section className="card" aria-labelledby="issuer-details-heading">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="issuer-details-heading" className="text-xl font-semibold">Issuer details</h2>
              <p className="mt-1 break-all text-sm text-slate-500">{selectedIssuer.displayName || selectedIssuer.name}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize dark:bg-slate-800">{normalizeStatus(selectedIssuer.status)}</span>
          </div>
          {detailLoading && <p role="status" className="mb-3 text-sm text-slate-600">Loading details and members...</p>}
          {detailError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{detailError}</p>}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-medium text-slate-500">Issuer name</dt><dd className="mt-1 break-all">{selectedIssuer.name}</dd></div>
            <div><dt className="font-medium text-slate-500">Issuer code (slug)</dt><dd className="mt-1 break-all">{selectedIssuer.slug}</dd></div>
            <div><dt className="font-medium text-slate-500">Contact email</dt><dd className="mt-1 break-all">{selectedIssuer.contactEmail}</dd></div>
            <div><dt className="font-medium text-slate-500">Organization</dt><dd className="mt-1">{organizations.find((org) => org.id === selectedIssuer.organizationId)?.name ?? selectedIssuer.organizationId}</dd></div>
            {selectedIssuer.website && <div><dt className="font-medium text-slate-500">Website</dt><dd className="mt-1 break-all"><a className="underline" href={selectedIssuer.website} target="_blank" rel="noreferrer">{selectedIssuer.website}</a></dd></div>}
            {selectedIssuer.description && <div className="sm:col-span-2"><dt className="font-medium text-slate-500">Description</dt><dd className="mt-1 whitespace-pre-wrap">{selectedIssuer.description}</dd></div>}
          </dl>

          <IssuerKeysPanel key={selectedIssuer.id} issuerId={selectedIssuer.id} />

          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
            <h3 className="text-lg font-semibold">Issuer members</h3>
            <p className="mt-1 text-sm text-slate-500">Assign existing application users by user ID. Membership changes apply only to this issuer.</p>
            {!detailLoading && !members.length && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800">No members are assigned to this issuer.</p>}
            <ul className="mt-3 space-y-3">
              {members.map((member) => <li key={member.userId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="break-all text-sm font-medium">{member.userId}</p>
                <p className="mt-1 text-xs text-slate-500">Added {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "date unavailable"}</p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="label min-w-[180px] flex-1" htmlFor={`member-role-${member.userId}`}>Role
                    <select id={`member-role-${member.userId}`} value={roleDrafts[member.userId] ?? member.role} onChange={(event) => setRoleDrafts({ ...roleDrafts, [member.userId]: event.target.value as IssuerRole })} className="input-field mt-1">
                      {roles.map((role) => <option key={role} value={role}>{role.replace("_", " ")}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy || (roleDrafts[member.userId] ?? member.role) === member.role} className="btn-secondary min-h-11 px-3 py-2" onClick={() => void changeMemberRole(member)}>Save role</button>
                  <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" onClick={() => void removeMember(member)}>Remove</button>
                </div>
              </li>)}
            </ul>
            <form onSubmit={(event) => void addMember(event)} className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <h4 className="font-semibold">Add existing user</h4>
              <label className="label" htmlFor="issuer-member-user-id">Application user ID
                <input id="issuer-member-user-id" name="userId" required autoComplete="off" value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} className="input-field mt-1" />
              </label>
              <label className="label" htmlFor="issuer-member-role">Issuer role
                <select id="issuer-member-role" value={memberRole} onChange={(event) => setMemberRole(event.target.value as IssuerRole)} className="input-field mt-1">
                  {roles.map((role) => <option key={role} value={role}>{role.replace("_", " ")}</option>)}
                </select>
              </label>
              <p className="text-xs leading-5 text-slate-500">issuer_admin manages this issuer&apos;s templates; issuer_operator can issue, revoke and send; viewer has read-only access.</p>
              <button type="submit" disabled={busy || detailLoading} className="btn-primary min-h-11">{busy ? "Saving..." : "Add issuer member"}</button>
            </form>
          </div>
        </section>}
      </div>
    </div>
  </main>;
}
