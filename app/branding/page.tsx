"use client";

import { useState } from "react";
import { Palette, ShieldCheck } from "lucide-react";
import { useIssuanceTemplates } from "../../hooks/useIssuanceTemplates";
import CertificateTemplateRenderer from "../templates/CertificateTemplateRenderer";

export default function BrandingPage() {
  const { templates, loading, error } = useIssuanceTemplates();
  const [selectedId, setSelectedId] = useState("");
  const selectedTemplate = templates.find((template) => template.id === selectedId) ?? templates[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Branding</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Template Management</h1>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="templates-heading">
        <div className="mb-5 flex items-center gap-3">
          <Palette className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          <h2 id="templates-heading" className="text-xl font-semibold text-slate-900">Available templates</h2>
        </div>
        <label htmlFor="branding-template" className="label">Template</label>
        <select
          id="branding-template"
          className="input-field"
          value={selectedTemplate?.id ?? ""}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={loading || !!error || templates.length === 0}
          aria-describedby="branding-template-description"
        >
          {(loading || error || templates.length === 0) && (
            <option value="">{loading ? "Loading templates..." : error ? "Templates unavailable" : "No available templates"}</option>
          )}
          {!loading && !error && templates.map((template) => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </select>
        <p id="branding-template-description" className="mt-2 text-sm text-slate-600">
          {!loading && !error && selectedTemplate
            ? selectedTemplate.description
            : "Active saved templates available to your organization. Platform admins can browse all organizations."}
        </p>
        {loading && <p role="status" className="mt-3 text-sm text-slate-600">Loading available templates...</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {!loading && !error && templates.length === 0 && (
          <p role="status" className="mt-3 text-sm text-amber-700">No active saved templates are available. Ask an administrator to link a template to an issuer in your organization.</p>
        )}
      </section>

      {!loading && !error && selectedTemplate && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="preview-heading">
          <div className="mb-3 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 id="preview-heading" className="text-xl font-semibold text-slate-900">{selectedTemplate.name} preview</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">Sample data only. This preview does not issue or sign a certificate.</p>
          <div className="overflow-x-auto rounded-xl bg-slate-100 p-4 sm:p-6" role="region" aria-label="Certificate template preview" tabIndex={0}>
            <div className="mx-auto w-[210mm] bg-white p-[14mm] text-slate-900 shadow-lg">
              <CertificateTemplateRenderer
                key={selectedTemplate.id}
                certificate={{
                  id: "SAMPLE-PREVIEW",
                  templateId: selectedTemplate.slug,
                  recipientName: "Sample Recipient",
                  recipientEmail: "recipient@example.com",
                  certificateType: "Certificate of Completion",
                  issuerName: "Sample Issuer",
                  description: "Sample Professional Development Course",
                  issueDate: "2026-01-01T00:00:00Z",
                  validFrom: "2026-01-01T00:00:00Z",
                }}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
