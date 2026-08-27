"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "../../../lib/site";
import {
  createTemplateDefinition,
  renderTemplateText,
  type TemplateFieldDefinition,
} from "../../../lib/phase3";

type FieldDraft = TemplateFieldDefinition & { id: string };

interface SavedTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63) || "custom-template";
}

const starterValues = {
  recipientName: "Alicia Tan",
  certificateType: "AI Governance",
  issuerName: "OpenClaw Academy",
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
  const [name, setName] = useState("OpenClaw Learning Certificate");
  const [title, setTitle] = useState("Certificate of {{certificateType}}");
  const [subtitle, setSubtitle] = useState("Awarded to {{recipientName}}");
  const [description, setDescription] = useState("Issued by {{issuerName}}");
  const [accentColor, setAccentColor] = useState("#0f172a");
  const [fields, setFields] = useState<FieldDraft[]>(initialFields);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Phase 3</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Template Builder</h1>
          </div>
          <button
            type="button"
            onClick={saveTemplate}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save template"}
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {status && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{status}</div>}

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

            <div
              className="rounded-xl border p-5 text-center shadow-inner"
              style={{ borderColor: accentColor, background: `linear-gradient(135deg, ${accentColor}08, white)` }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Certificate Issuer</p>
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

            {savedTemplates.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Saved templates
                </h3>
                <ul className="space-y-2">
                  {savedTemplates.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="truncate">{item.name}</span>
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
