"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "../../lib/site";

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Summary {
  byAction: Array<{ action: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  totals: { issued: number; revoked: number; suspended: number; verifications: number };
}

const RANGES = [7, 30, 90] as const;

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<number>(30);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(withBasePath(`/api/audit?days=${days}&limit=200`));
      if (response.status === 401) {
        setError("Log in as an issuer to view the compliance trail.");
        setEvents([]);
        setSummary(null);
        return;
      }
      const payload = (await response.json()) as { summary?: Summary; events?: AuditEvent[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load audit data.");
      setSummary(payload.summary ?? null);
      setEvents(payload.events ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load audit data.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEvents = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return events;
    return events.filter(
      (event) =>
        event.action.toLowerCase().includes(needle) ||
        event.entityType.toLowerCase().includes(needle) ||
        (event.entityId ?? "").toLowerCase().includes(needle)
    );
  }, [events, filter]);

  const peakDay = useMemo(
    () => (summary?.byDay ?? []).reduce((max, day) => Math.max(max, day.count), 0),
    [summary]
  );

  const exportCsv = () => {
    const header = "timestamp,action,entity_type,entity_id\n";
    const rows = visibleEvents
      .map((event) =>
        [event.createdAt, event.action, event.entityType, event.entityId ?? ""]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Compliance &amp; Analytics</h1>
          <p className="mt-2 text-slate-600">
            Credential lifecycle activity and the immutable audit trail for your organization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                days === range ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {range}d
            </button>
          ))}
          <button
            type="button"
            onClick={exportCsv}
            disabled={visibleEvents.length === 0}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {summary && (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Issued", summary.totals.issued, "text-emerald-700"],
              ["Revoked", summary.totals.revoked, "text-red-700"],
              ["Suspended", summary.totals.suspended, "text-amber-700"],
              ["Verifications", summary.totals.verifications, "text-sky-700"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-slate-500">{label}</div>
                <div className={`mt-2 text-3xl font-bold ${tone}`}>{value as number}</div>
              </div>
            ))}
          </section>

          <section className="mb-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Activity over time</h2>
              {summary.byDay.length === 0 ? (
                <p className="text-sm text-slate-500">No activity recorded in this period.</p>
              ) : (
                <div className="flex h-40 items-end gap-1">
                  {summary.byDay.map((day) => (
                    <div key={day.day} className="flex flex-1 flex-col items-center gap-1" title={`${day.day}: ${day.count}`}>
                      <div
                        className="w-full rounded-t bg-sky-500"
                        style={{ height: `${peakDay ? (day.count / peakDay) * 100 : 0}%`, minHeight: day.count ? 4 : 0 }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Top actions</h2>
              {summary.byAction.length === 0 ? (
                <p className="text-sm text-slate-500">No actions recorded in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.byAction.map((row) => (
                    <li key={row.action} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-slate-700">{row.action}</span>
                      <span className="font-semibold text-slate-900">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Audit trail</h2>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by action or entity"
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading...</p>
        ) : visibleEvents.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No audit events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatTimestamp(event.createdAt)}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">{event.action}</td>
                    <td className="px-5 py-3 text-slate-600">{event.entityType}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{event.entityId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
