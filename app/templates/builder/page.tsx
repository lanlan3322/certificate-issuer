"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "../../../lib/site";
import CertificatePaper from "../CertificatePaper";
import {
  createTemplateDefinition,
  renderTemplateText,
  type TemplateFieldDefinition,
} from "../../../lib/phase3";
import { useWorkspaceSession } from "../../../components/WorkspaceSession";
import { hasPermission } from "../../../lib/permissions";

type FieldDraft = TemplateFieldDefinition & { id: string };

interface SavedTemplate {
  id: string;
  issuerId?: string;
  issuerDisplayName?: string | null;
  organizationDisplayName?: string | null;
  slug: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
  issuerProfileId: string | null;
}

interface IssuerProfileOption {
  id: string;
  displayName: string;
  did: string;
}
interface IssuerOption {
  id: string;
  name: string;
  displayName?: string | null;
  organizationId?: string;
  organizationDisplayName?: string | null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63) || "custom-template";
}

const starterValues = {
  recipientName: "Sample Recipient",
  certificateType: "AI Governance",
  issuerName: "Sample Organization",
  description: "Completed the required governance program",
};

const initialFields: FieldDraft[] = [
  {
    id: "recipientName",
    key: "recipientName",
    label: "Recipient name",
    value: "{{recipientName}}",
    required: true,
    type: "text",
  },
  {
    id: "certificateType",
    key: "certificateType",
    label: "Certificate type",
    value: "{{certificateType}}",
    required: true,
    type: "text",
  },
  {
    id: "issuerName",
    key: "issuerName",
    label: "Issuer name",
    value: "{{issuerName}}",
    required: true,
    type: "text",
  },
];

export default function TemplateBuilderPage() {
  const { user } = useWorkspaceSession();
  const canManage = hasPermission(user, "templates.manage");
  const [name, setName] = useState("Sample Learning Credential");
  const [title, setTitle] = useState("Certificate of {{certificateType}}");
  const [subtitle, setSubtitle] = useState("Awarded to {{recipientName}}");
  const [description, setDescription] = useState("Issued by {{issuerName}}");
  const [accentColor, setAccentColor] = useState("#0f172a");
  const [fields, setFields] = useState<FieldDraft[]>(initialFields);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [issuerProfiles, setIssuerProfiles] = useState<IssuerProfileOption[]>([]);
  const [issuerProfileId, setIssuerProfileId] = useState("");
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuers, setIssuers] = useState<IssuerOption[]>([]);
  const [ownerIssuerId, setOwnerIssuerId] = useState("");

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch(withBasePath("/api/templates"));
      if (response.status === 401) {
        setError("Log in as an issuer to save and load templates.");
        return;
      }
      const payload = (await response.json()) as { templates?: SavedTemplate[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load templates.");
      setSavedTemplates(payload.templates ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load templates.");
    }
  }, []);

  const loadIssuerProfiles = useCallback(async (issuerId: string, signal?: AbortSignal) => {
    try {
      const response = await fetch(withBasePath(`/api/issuer-profiles?issuerId=${encodeURIComponent(issuerId)}`), { signal });
      const payload = (await response.json()) as {
        issuerProfiles?: IssuerProfileOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load issuer profiles.");
      if (signal?.aborted) return;
      setIssuerProfiles(payload.issuerProfiles ?? []);
      setProfileLoadError(null);
    } catch (profileError) {
      if (signal?.aborted) return;
      setProfileLoadError(
        profileError instanceof Error ? profileError.message : "Unable to load issuer profiles."
      );
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void loadTemplates();
    void (async () => {
      try {
        const response = await fetch(withBasePath("/api/issuers"));
        const payload = await response.json() as { issuers?: IssuerOption[]; error?: string };
        if (!response.ok || !Array.isArray(payload.issuers)) throw new Error(payload.error ?? "Unable to load issuers.");
        setIssuers(payload.issuers);
        if (payload.issuers.length === 1) setOwnerIssuerId(payload.issuers[0].id);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load issuers."); }
    })();
  }, [canManage, loadTemplates]);

  useEffect(() => {
    if (!ownerIssuerId) {
      setIssuerProfiles([]);
      setIssuerProfileId("");
      setProfileLoadError(null);
      setProfilesLoading(false);
      return;
    }
    const controller = new AbortController();
    setIssuerProfiles([]);
    setProfileLoadError(null);
    setProfilesLoading(true);
    void loadIssuerProfiles(ownerIssuerId, controller.signal).finally(() => {
      if (!controller.signal.aborted) setProfilesLoading(false);
    });
    return () => controller.abort();
  }, [loadIssuerProfiles, ownerIssuerId]);

  const template = useMemo(
    () =>
      createTemplateDefinition({
        name,
        title,
        subtitle,
        accentColor,
        description,
        fields: fields.map((field) => ({
          key: field.key,
          label: field.label,
          value: field.value,
          required: field.required,
          type: field.type,
        })),
      }),
    [accentColor, description, fields, name, subtitle, title]
  );

  const preview = useMemo(
    () => renderTemplateText(template, starterValues),
    [template]
  );

  const updateField = (id: string, patch: Partial<FieldDraft>) => {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field))
    );
  };

  const addField = () => {
    const nextKey = `customField${fields.length + 1}`;
    setFields((current) => [
      ...current,
      {
        id: `${nextKey}-${Date.now()}`,
        key: nextKey,
        label: `Custom field ${current.length + 1}`,
        value: `{{${nextKey}}}`,
        required: false,
        type: "text",
      },
    ]);
  };

  const removeField = (id: string) => {
    setFields((current) => current.filter((field) => field.id !== id));
  };

  const saveTemplate = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(withBasePath("/api/templates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slugify(name),
          name,
          description,
          // The full definition is persisted so the template can be reloaded.
          definition: template,
          issuerProfileId: issuerProfileId || null,
          issuerId: ownerIssuerId,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save template.");
      setStatus(`Saved "${name}".`);
      await loadTemplates();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    } finally {
      setSaving(false);
    }
  };

  const loadTemplate = (saved: SavedTemplate) => {
    const definition = saved.definition as {
      name?: string;
      title?: string;
      subtitle?: string;
      description?: string;
      accentColor?: string;
      fields?: TemplateFieldDefinition[];
    };
    setName(definition.name ?? saved.name);
    setIssuerProfileId(saved.issuerProfileId ?? "");
    setOwnerIssuerId(saved.issuerId ?? "");
    setTitle(definition.title ?? "");
    setSubtitle(definition.subtitle ?? "");
    setDescription(definition.description ?? saved.description);
    setAccentColor(definition.accentColor ?? "#0f172a");
    setFields(
      (definition.fields ?? []).map((field, index) => ({ ...field, id: `${field.key}-${index}` }))
    );
    setStatus(`Loaded "${saved.name}".`);
  };

  const deleteTemplate = async (saved: SavedTemplate) => {
    setError(null);
    try {
      const response = await fetch(withBasePath(`/api/templates?id=${encodeURIComponent(saved.id)}`), {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete template.");
      setStatus(`Deleted "${saved.name}".`);
      await loadTemplates();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete template.");
    }
  };

  if (!canManage) {
    return <main className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-bold">Template builder</h1><p role="alert" className="mt-3">Issuer administrator access is required.</p></main>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Organization branding</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Credential template builder</h1>
            <p className="mt-2 text-sm text-slate-600">Create reusable credential layouts for an issuer you are allowed to manage.</p>
          </div>
        </div>
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {status && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{status}</div>}
        <div className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="template-owner-issuer">Template issuer
            <select id="template-owner-issuer" required value={ownerIssuerId} onChange={(event) => { setOwnerIssuerId(event.target.value); setIssuerProfileId(""); }}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">Select an allowed issuer</option>
              {issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.displayName || issuer.name}{issuer.organizationDisplayName ? ` — ${issuer.organizationDisplayName}` : ""}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="template-issuer-profile">
            Issuer profile
            <select
              id="template-issuer-profile"
              value={issuerProfileId}
              onChange={(event) => setIssuerProfileId(event.target.value)}
              disabled={!ownerIssuerId || profilesLoading || Boolean(profileLoadError)}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">{ownerIssuerId ? "Use the issuer's default profile" : "Select an issuer first"}</option>
              {issuerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} ({profile.did})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Profiles are loaded only for the selected issuer. Leave blank to use that issuer&apos;s default profile.
            </span>
          </label>
          {profileLoadError && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{profileLoadError}</p>}
          {profilesLoading && <p role="status" className="text-sm text-slate-500 md:col-span-2">Loading profiles for the selected issuer...</p>}
          {!issuers.length && <p role="status" className="text-sm text-amber-700 md:col-span-2">No issuers are available to you. Ask an issuer administrator to assign access.</p>}
          <button
            type="button"
            onClick={saveTemplate}
            disabled={saving || !ownerIssuerId || profilesLoading || Boolean(profileLoadError)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save template"}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Template name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Accent color</label>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white p-1"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Subtitle</label>
                <input
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">Fields</label>
                  <button
                    type="button"
                    onClick={addField}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    + Add field
                  </button>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Field {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeField(field.id)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={field.label}
                          onChange={(event) => updateField(field.id, { label: event.target.value })}
                          placeholder="Field label"
                          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                        />
                        <input
                          value={field.key}
                          onChange={(event) => updateField(field.id, { key: event.target.value })}
                          placeholder="Variable key"
                          className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <input
                          value={field.value}
                          onChange={(event) => updateField(field.id, { value: event.target.value })}
                          placeholder="{{recipientName}}"
                          className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                        />
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(event) => updateField(field.id, { required: event.target.checked })}
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Live preview</h2>
              <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                {template.id}
              </span>
            </div>

            <CertificatePaper
              className="flex flex-col items-center justify-center rounded-xl border p-5 text-center shadow-inner"
              style={{ borderColor: accentColor, background: `linear-gradient(135deg, ${accentColor}08, white)` }}
            >
              <div className="certificate-main w-full break-words">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Credential issuer</p>
                <h3 className="mt-4 text-2xl font-bold" style={{ color: accentColor }}>
                  {preview.title}
                </h3>
                <p className="mt-3 text-lg text-slate-700">{preview.subtitle}</p>
                <p className="mt-4 text-sm italic text-slate-600">“{preview.description}”</p>
                <div className="mt-5 space-y-2 text-left text-sm text-slate-700">
                  {preview.fields.map((field) => (
                    <div key={field.key} className="flex justify-between gap-3 rounded bg-slate-100 px-2 py-1">
                      <span className="font-medium text-slate-600">{field.label}</span>
                      <span>{field.value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CertificatePaper>

            {savedTemplates.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Saved templates
                </h3>
                <ul className="space-y-2">
                  {savedTemplates.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="min-w-0">
                        <span className="block truncate">{item.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[item.issuerDisplayName, item.organizationDisplayName].filter(Boolean).join(" · ") || "Owner unavailable"}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => loadTemplate(item)}
                          className="text-xs font-medium text-sky-700 hover:underline"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(item)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
