"use client";

import { useMemo, useState } from "react";
import { buildComplianceSummary, createAuditEvent, type AuditEvent } from "../../lib/phase7";

const sampleEvents: AuditEvent[] = [
  createAuditEvent({
    credentialId: "cert-100",
    actor: "issuer-ops",
    action: "issued",
    status: "success",
    metadata: { templateId: "classic" },
  }),
  createAuditEvent({
    credentialId: "cert-100",
    actor: "compliance-review",
    action: "revoked",
    status: "success",
    metadata: { reason: "Policy review" },
  }),
];

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>(sampleEvents);
  const summary = useMemo(() => buildComplianceSummary(events), [events]);

  const addSampleEvent = () => {
    const next = createAuditEvent({
      credentialId: "cert-101",
      actor: "issuer-ops",
      action: "verified",
      status: "success",
      metadata: { portal: "public-portal" },
    });
    setEvents((current) => [...current, next]);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Phase 7</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Audit & Compliance</h1>
          </div>
          <button
            type="button"
            onClick={addSampleEvent}
            className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600"
          >
            Add audit event
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Compliance summary</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total events</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalEvents}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status counts</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li>success: {summary.statusCounts.success}</li>
                  <li>failed: {summary.statusCounts.failed}</li>
                  <li>pending: {summary.statusCounts.pending}</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credential IDs</p>
                <p className="mt-1 text-sm text-slate-700">{summary.credentialIds.join(", ") || "None"}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Audit trail</h2>
            <ul className="mt-4 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">{event.action}</span>
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
                      {event.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{event.occurredAt}</p>
                  <p className="mt-1 text-sm text-slate-700">Credential: {event.credentialId}</p>
                  <p className="text-sm text-slate-700">Actor: {event.actor}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
