"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OrganizationRecord } from "../services/OrganizationService";
import type { OrganizationMember, MembershipRole } from "../services/OrganizationMemberService";
import { withBasePath } from "../lib/site";
import { isPlatformAdmin } from "../lib/permissions";

const blank = { name: "", displayName: "", slug: "", website: "", logoUrl: "", status: "active" as "active" | "disabled" };
const inputStyle = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white";
const buttonStyle = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50";
interface PlatformUser { id: string; email: string; display_name: string; roles: string[] }

export default function OrganizationWorkspace({ initialOrganizations, canManage, canManageMembers }: {
  initialOrganizations: OrganizationRecord[]; canManage: boolean; canManageMembers: boolean;
}) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [selected, setSelected] = useState<OrganizationRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blank);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<MembershipRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [users, setUsers] = useState<PlatformUser[]>([]);

  async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(withBasePath(url), {
      method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload: T & { error?: string } = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Organization request failed.");
    return payload;
  }

  async function view(org: OrganizationRecord) {
    setBusy(true); setError(null); setNotice(null); setEditing(false); setMembers([]);
    try {
      const payload = await request<{ organization: OrganizationRecord }>(`/api/organizations/${org.id}`);
      setSelected(payload.organization);
      if (canManageMembers) setMembers((await request<{ members: OrganizationMember[] }>(`/api/organizations/${org.id}/members`)).members);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load organization."); }
    finally { setBusy(false); }
  }

  function edit(org?: OrganizationRecord) {
    setSelected(org ?? null); setEditing(true); setError(null); setNotice(null);
    setForm(org ? { name: org.name, displayName: org.displayName, slug: org.slug,
      website: org.website ?? "", logoUrl: org.logoUrl ?? "", status: org.status } : blank);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const payload = await request<{ organization: OrganizationRecord }>(selected ? `/api/organizations/${selected.id}` : "/api/organizations",
        selected ? "PATCH" : "POST", form);
      const organization: OrganizationRecord = payload.organization;
      setOrganizations((current) => selected ? current.map((org) => org.id === organization.id ? organization : org) : [...current, organization]);
      setSelected(organization); setEditing(false); setNotice("Organization saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save organization."); }
    finally { setBusy(false); }
  }

  async function changeStatus(org: OrganizationRecord) {
    if (org.status === "active" && !window.confirm(`Deactivate ${org.displayName}? Organization members will lose workspace access. Existing public credentials remain verifiable.`)) return;
    setBusy(true); setError(null);
    try {
      const { organization } = await request<{ organization: OrganizationRecord }>(`/api/organizations/${org.id}`, "PATCH", { status: org.status === "active" ? "disabled" : "active" });
      setOrganizations((current) => current.map((item) => item.id === org.id ? organization : item));
      setSelected(organization); setNotice("Organization status updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update organization."); }
    finally { setBusy(false); }
  }

  async function changeMember(method: "POST" | "PATCH" | "DELETE", memberUserId = userId, memberRole = role) {
    if (!selected) return;
    if (method === "DELETE" && !window.confirm("Remove this member's access to the organization?")) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (method === "DELETE") {
        await request(`/api/organizations/${selected.id}/members`, method, { userId: memberUserId });
        setMembers((current) => current.filter((member) => member.userId !== memberUserId));
      } else {
        const { member } = await request<{ member: OrganizationMember }>(`/api/organizations/${selected.id}/members`,
          method, { userId: memberUserId, role: memberRole });
        setMembers((current) => [...current.filter((item) => item.userId !== member.userId), member]);
      }
      setUserId(""); setNotice("Organization membership updated.");
      window.dispatchEvent(new Event("trustvc-auth-changed"));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update membership."); }
    finally { setBusy(false); }
  }

  async function loadUsers() {
    setBusy(true); setError(null);
    try { setUsers((await request<{ users: PlatformUser[] }>("/api/users")).users); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load users."); }
    finally { setBusy(false); }
  }

  async function togglePlatformRole(user: { id: string; roles: string[] }) {
    if (!window.confirm(`${isPlatformAdmin(user) ? "Remove" : "Grant"} platform administrator access? This changes access across all organizations.`)) return;
    setBusy(true); setError(null);
    try {
      const platformAdmin = !isPlatformAdmin(user);
      await request("/api/users", "PATCH", { userId: user.id, platformAdmin });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, roles: platformAdmin ? ["platform_admin"] : [] } : item));
      setNotice("User platform permissions updated.");
      window.dispatchEvent(new Event("trustvc-auth-changed"));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update user."); }
    finally { setBusy(false); }
  }

  return <main id="members" className="mx-auto max-w-6xl space-y-6 px-4 py-10 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm font-semibold text-cyan-700">Credential-as-a-Service</p><h1 className="mt-2 text-3xl font-bold">Organizations</h1></div>
      {canManage && <button className={buttonStyle} onClick={() => edit()} disabled={busy}>Create organization</button>}
    </header>
    {canManageMembers && <p className="text-sm">Select an organization below to review its users and manage organization memberships.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    {canManage && <section className="space-y-3 rounded-xl border border-slate-300 p-4">
      <h2 className="text-xl font-semibold">Platform users</h2>
      <button className={buttonStyle} disabled={busy} onClick={() => void loadUsers()}>Load user directory</button>
      <ul className="space-y-3">{users.map((user) => <li key={user.id} className="flex flex-wrap items-center gap-3 text-sm">
        <span>{user.display_name} ({user.email})</span><code>{user.id}</code>
        <button className={buttonStyle} disabled={busy} onClick={() => void togglePlatformRole(user)}>
          {isPlatformAdmin(user) ? "Remove platform admin" : "Grant platform admin"}
        </button>
      </li>)}</ul>
    </section>}
    <section className="overflow-x-auto rounded-xl border border-slate-300 p-4">
      <h2 className="mb-3 text-xl font-semibold">Organization directory</h2>
      <table role="table" className="credential-table w-full text-left text-sm"><caption className="sr-only">Organizations and administration actions</caption><thead><tr>{["Name", "Slug", "Status", "Actions"].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{organizations.map((org) => <tr key={org.id} className="border-t border-slate-200">
          <td data-label="Organization" className="p-3">{org.displayName}</td><td data-label="Slug" className="p-3">{org.slug}</td><td data-label="Status" className="p-3">{org.status}</td>
          <td data-label="Actions" className="flex flex-wrap gap-2 p-3"><button className={buttonStyle} onClick={() => void view(org)} disabled={busy}>View</button>
            {canManage && <><button className={buttonStyle} onClick={() => edit(org)} disabled={busy}>Edit</button>
              <button className={buttonStyle} onClick={() => void changeStatus(org)} disabled={busy}>{org.status === "active" ? "Deactivate" : "Activate"}</button></>}</td>
        </tr>)}</tbody></table>
      {!organizations.length && <p className="p-3">No organizations found.</p>}
    </section>
    {editing && canManage && <section className="rounded-xl border border-slate-300 p-5">
      <h2 className="text-xl font-semibold">{selected ? "Edit organization" : "Create organization"}</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        {([["name", "Organization Name"], ["displayName", "Display Name"], ["slug", "Slug"], ["website", "Website"], ["logoUrl", "Logo URL"]] as const).map(([field, label]) =>
          <label key={field} className="text-sm font-medium">{label}<input className={inputStyle}
            required={["name", "displayName", "slug"].includes(field)} type={field === "website" || field === "logoUrl" ? "url" : "text"}
            value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
        <label className="text-sm font-medium">Status<select className={inputStyle} value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value === "active" ? "active" : "disabled" })}>
          <option value="active">Active</option><option value="disabled">Inactive</option></select></label>
        <div className="flex gap-3"><button disabled={busy} className={buttonStyle} type="submit">{busy ? "Saving..." : "Save organization"}</button>
          <button type="button" className={buttonStyle} onClick={() => setEditing(false)}>Cancel</button></div>
      </form>
    </section>}
    {selected && !editing && <section className="space-y-4 rounded-xl border border-slate-300 p-5">
      <h2 className="text-xl font-semibold">{selected.displayName}</h2>
      <dl className="grid gap-2 text-sm">
        <div><dt className="font-semibold">Organization ID</dt><dd className="break-all">{selected.id}</dd></div>
        <div><dt className="font-semibold">Organization Name</dt><dd>{selected.name}</dd></div>
        <div><dt className="font-semibold">Website</dt><dd>{selected.website ?? "Not provided"}</dd></div>
        <div><dt className="font-semibold">Logo</dt><dd className="break-all">{selected.logoUrl ?? "Not provided"}</dd></div>
      </dl>
      {canManageMembers && <><h3 className="text-lg font-semibold">Organization members</h3>
        <p className="text-sm">Add existing application users by ID. Membership does not create a login or change the user&apos;s active workspace.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void changeMember("POST"); }}>
          <label className="grow text-sm">Application user ID<input className={inputStyle} required value={userId} onChange={(event) => setUserId(event.target.value)} /></label>
          <label className="text-sm">Role<select className={inputStyle} value={role} onChange={(event) => setRole(event.target.value as MembershipRole)}>
            <option value="viewer">Viewer</option><option value="issuer">Issuer</option><option value="organization_admin">Organization admin</option>
          </select></label><button className={buttonStyle} disabled={busy}>Add member</button>
        </form>
        <ul className="space-y-3">{members.map((member) => <li key={member.id} className="flex flex-wrap items-center gap-3 rounded border border-slate-200 p-3">
          <span className="break-all text-sm">{member.userId}</span>
          <label className="text-sm">Member role<select className={inputStyle} value={member.role} disabled={busy}
            onChange={(event) => void changeMember("PATCH", member.userId, event.target.value as MembershipRole)}>
            <option value="viewer">Viewer</option><option value="issuer">Issuer</option><option value="organization_admin">Organization admin</option>
          </select></label>
          <button disabled={busy} className={buttonStyle} onClick={() => void changeMember("DELETE", member.userId)}>Remove member</button>
        </li>)}</ul></>}
    </section>}
  </main>;
}
