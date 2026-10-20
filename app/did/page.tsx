"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { withBasePath } from "../../lib/site";

interface IssuerProfile {
  id: string;
  issuerName: string;
  displayName: string;
  did: string;
  verificationMethod: string;
  documentStoreAddress: string | null;
  documentStoreNetwork: string | null;
  logoUrl: string | null;
  website: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProfileForm {
  issuerName: string;
  displayName: string;
  did: string;
  verificationMethod: string;
  documentStoreAddress: string;
  documentStoreNetwork: string;
  logoUrl: string;
  website: string;
  keyReference: string;
}

interface ProfileResponse {
  issuerProfile?: IssuerProfile;
  issuerProfiles?: IssuerProfile[];
  canManage?: boolean;
  error?: string;
}

const emptyForm: ProfileForm = {
  issuerName: "",
  displayName: "",
  did: "",
  verificationMethod: "",
  documentStoreAddress: "",
  documentStoreNetwork: "",
  logoUrl: "",
  website: "",
  keyReference: "",
};

function profilePayload(form: ProfileForm) {
  return {
    issuerName: form.issuerName.trim(),
    displayName: form.displayName.trim(),
    did: form.did.trim(),
    verificationMethod: form.verificationMethod.trim(),
    documentStoreAddress: form.documentStoreAddress.trim() || null,
    documentStoreNetwork: form.documentStoreNetwork.trim() || null,
    logoUrl: form.logoUrl.trim() || null,
    website: form.website.trim() || null,
    ...(form.keyReference.trim() ? { keyReference: form.keyReference.trim() } : {}),
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function didDocumentUrl(did: string) {
  if (!did.startsWith("did:web:")) return null;
  try {
    const host = did.slice("did:web:".length);
    return new URL("/.well-known/did.json", `https://${host}`).href;
  } catch {
    return null;
  }
}

function ProfileFormFields({
  form,
  setForm,
  creating,
}: {
  form: ProfileForm;
  setForm: (form: ProfileForm) => void;
  creating: boolean;
}) {
  const update = (field: keyof ProfileForm, value: string) =>
    setForm({ ...form, [field]: value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">
        Issuer name
        <input
          required
          value={form.issuerName}
          onChange={(event) => update("issuerName", event.target.value)}
          className="input-field mt-1"
          autoComplete="organization"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Display name
        <input
          required
          value={form.displayName}
          onChange={(event) => update("displayName", event.target.value)}
          className="input-field mt-1"
        />
      </label>
      {creating && (
        <>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Issuer DID
            <input
              required
              value={form.did}
              onChange={(event) => update("did", event.target.value)}
              className="input-field mt-1"
              placeholder="did:web:academy.verifiable.sg"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Verification method
            <input
              required
              value={form.verificationMethod}
              onChange={(event) => update("verificationMethod", event.target.value)}
              className="input-field mt-1"
              placeholder="did:web:academy.verifiable.sg#key-1"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Signing key reference
            <input
              required
              value={form.keyReference}
              onChange={(event) => update("keyReference", event.target.value.toUpperCase())}
              className="input-field mt-1 font-mono"
              placeholder="ACADEMY_SIGNING_KEY"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Enter the server-side secret reference only. Never enter or upload private-key material here.
            </span>
          </label>
        </>
      )}
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Document Store address
        <input
          value={form.documentStoreAddress}
          onChange={(event) => update("documentStoreAddress", event.target.value)}
          className="input-field mt-1"
          placeholder="0x..."
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Document Store network
        <input
          value={form.documentStoreNetwork}
          onChange={(event) => update("documentStoreNetwork", event.target.value)}
          className="input-field mt-1"
          placeholder="sepolia"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Website
        <input
          type="url"
          value={form.website}
          onChange={(event) => update("website", event.target.value)}
          className="input-field mt-1"
          placeholder="https://example.org"
        />
      </label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Logo URL
        <input
          type="url"
          value={form.logoUrl}
          onChange={(event) => update("logoUrl", event.target.value)}
          className="input-field mt-1"
          placeholder="https://example.org/logo.png"
        />
      </label>
    </div>
  );
}

export default function DIDPage() {
  const [profiles, setProfiles] = useState<IssuerProfile[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ProfileForm>(emptyForm);
  const [editForm, setEditForm] = useState<ProfileForm>(emptyForm);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(withBasePath("/api/issuer-profiles?includeInactive=true"));
      const payload = (await response.json()) as ProfileResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load issuer profiles.");
      setProfiles(payload.issuerProfiles ?? []);
      setCanManage(payload.canManage === true);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load issuer profiles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const activeCount = profiles.filter((profile) => profile.active).length;
  const inactiveCount = profiles.length - activeCount;

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(withBasePath("/api/issuer-profiles"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload(createForm)),
      });
      const payload = (await response.json()) as ProfileResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to create issuer profile.");
      setCreateForm(emptyForm);
      setCreateOpen(false);
      setNotice(`Issuer profile "${payload.issuerProfile?.displayName ?? createForm.displayName}" created.`);
      await loadProfiles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create issuer profile.");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (profile: IssuerProfile) => {
    setEditingId(profile.id);
    setEditForm({
      ...emptyForm,
      issuerName: profile.issuerName,
      displayName: profile.displayName,
      documentStoreAddress: profile.documentStoreAddress ?? "",
      documentStoreNetwork: profile.documentStoreNetwork ?? "",
      logoUrl: profile.logoUrl ?? "",
      website: profile.website ?? "",
    });
    setError(null);
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(withBasePath("/api/issuer-profiles"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...profilePayload(editForm) }),
      });
      const payload = (await response.json()) as ProfileResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to update issuer profile.");
      setEditingId(null);
      setNotice(`Issuer profile "${payload.issuerProfile?.displayName ?? editForm.displayName}" updated.`);
      await loadProfiles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update issuer profile.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (profile: IssuerProfile) => {
    if (profile.active && !window.confirm(`Deactivate ${profile.displayName}? Templates using this profile may no longer issue new credentials.`)) {
      return;
    }
    setBusyProfileId(profile.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(withBasePath("/api/issuer-profiles"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id, active: !profile.active }),
      });
      const payload = (await response.json()) as ProfileResponse;
      if (!response.ok) throw new Error(payload.error ?? "Unable to update issuer profile status.");
      setProfiles((current) =>
        current.map((item) => item.id === profile.id ? payload.issuerProfile ?? item : item)
      );
      setNotice(`"${profile.displayName}" ${profile.active ? "deactivated" : "activated"}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update issuer profile status.");
    } finally {
      setBusyProfileId(null);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-700">DID lifecycle</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Issuer identity management</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Manage the issuer identities used by your certificate templates. Signing keys remain
            server-managed and are never uploaded or displayed here.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setCreateOpen((open) => !open);
              setError(null);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
          >
            {createOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {createOpen ? "Cancel" : "Add issuer profile"}
          </button>
        )}
      </div>

      {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {createOpen && canManage && (
        <section className="mb-8 rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-violet-700" />
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Create issuer profile</h2>
              <p className="text-sm text-slate-600">Create one identity for a certificate issuer; select it on that issuer&apos;s templates.</p>
            </div>
          </div>
          <form onSubmit={submitCreate} className="space-y-5">
            <ProfileFormFields form={createForm} setForm={setCreateForm} creating />
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Creating..." : "Create profile"}
              </button>
              <p className="self-center text-xs text-slate-500">
                Only <code>did:web</code> profiles are supported. Configure the referenced private key in the server secret store first.
              </p>
            </div>
          </form>
        </section>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Issuer profiles" value={profiles.length} />
        <SummaryCard label="Active" value={activeCount} tone="green" />
        <SummaryCard label="Inactive" value={inactiveCount} tone="slate" />
      </div>

      <section aria-labelledby="registry-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            <h2 id="registry-title" className="text-xl font-semibold text-slate-900">Issuer profiles</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadProfiles()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading issuer profiles...
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 font-semibold text-slate-900">No issuer profiles yet</h3>
            <p className="mt-1 text-sm text-slate-600">
              {canManage ? "Add a profile to assign a dedicated DID and signing configuration to a certificate template." : "An issuer administrator can create profiles for this issuer."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {profiles.map((profile) => {
              const documentUrl = didDocumentUrl(profile.did);
              return (
              <article key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {editingId === profile.id ? (
                  <form onSubmit={submitEdit} className="space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900">Edit {profile.displayName}</h3>
                      <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel edit" className="rounded p-1 text-slate-500 hover:bg-slate-100">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <ProfileFormFields form={editForm} setForm={setEditForm} creating={false} />
                    <p className="text-xs text-slate-500">
                      DID, verification method, and signing key reference are immutable after first use.
                      The key reference is hidden and remains managed by the platform.
                    </p>
                    <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
                      {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? "Saving..." : "Save changes"}
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-900">{profile.displayName}</h3>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${profile.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                            {profile.active
                              ? <CheckCircle2 className="h-3.5 w-3.5" />
                              : <ShieldAlert className="h-3.5 w-3.5" />}
                            {profile.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{profile.issuerName}</p>
                        <p className="mt-3 break-all font-mono text-sm text-violet-800">{profile.did}</p>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          Verification method: <code>{profile.verificationMethod}</code>
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" onClick={() => beginEdit(profile)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                            Edit details
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(profile)}
                            disabled={busyProfileId === profile.id}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60 ${profile.active ? "border-amber-300 text-amber-800 hover:bg-amber-50" : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"}`}
                          >
                            {busyProfileId === profile.id ? "Updating..." : profile.active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      )}
                    </div>

                    <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label="Document Store" value={profile.documentStoreAddress || "Not configured"} />
                      <Detail label="Network" value={profile.documentStoreNetwork || "Not configured"} />
                      <Detail label="Signing key" value="Platform-managed reference" />
                      <Detail label="Updated" value={formatDate(profile.updatedAt)} />
                    </dl>
                    {(profile.website || profile.logoUrl || documentUrl) && (
                      <div className="mt-4 flex flex-wrap gap-4 text-sm">
                        {documentUrl && (
                          <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline">
                            DID document <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {profile.website && (
                          <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline">
                            Website <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {profile.logoUrl && (
                          <a href={profile.logoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:underline">
                            Logo asset <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                    <p className="mt-4 text-xs text-slate-500">
                      Choose this issuer profile when creating or editing a certificate template in the{" "}
                      <a href={withBasePath("/templates/builder/")} className="font-medium text-violet-700 hover:underline">Template Builder</a>.
                      Issued credentials keep their saved DID, verification method, and Document Store.
                    </p>
                  </>
                )}
              </article>
              );
            })}
          </div>
        )}
      </section>

      {!canManage && !loading && profiles.length > 0 && (
        <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
          You can view these issuer profiles. Contact an issuer administrator to create, edit, or deactivate profiles.
        </p>
      )}
    </main>
  );
}

function SummaryCard({ label, value, tone = "violet" }: { label: string; value: number; tone?: "violet" | "green" | "slate" }) {
  const colors = {
    violet: "text-violet-700",
    green: "text-emerald-700",
    slate: "text-slate-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${colors[tone]}`}>{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-800">{value}</dd>
    </div>
  );
}
