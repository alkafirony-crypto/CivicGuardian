import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import type { CivicIssue, CivicNotification, DashboardMetrics } from "../types";

const statusOptions = ["under_review", "verified", "assigned", "in_progress", "resolved", "rejected", "unable_to_verify"];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());

export default function AdminConsole({ issues, metrics, onSelect, onStatus }: {
  issues: CivicIssue[];
  metrics: DashboardMetrics;
  onSelect: (issue: CivicIssue) => void;
  onStatus: (id: string, status: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<CivicNotification[]>([]);
  const rows = useMemo(
    () => issues.filter(issue => filter === "all" || (filter === "open" ? issue.status !== "resolved" : issue.status === filter)),
    [issues, filter],
  );

  useEffect(() => {
    fetch("/api/me/notifications")
      .then(response => response.ok ? response.json() : [])
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [issues]);

  const update = async (id: string, status: string) => {
    setBusy(id);
    try { await onStatus(id, status); } finally { setBusy(""); }
  };

  const statCards = [
    ["Total reports", metrics.totalIssues, ClipboardCheck],
    ["Critical AI flags", metrics.criticalCount, AlertTriangle],
    ["Resolved", metrics.resolvedIssues, CheckCircle2],
    ["Admin alerts", notes.filter(note => !note.read).length, Bell],
  ] as const;

  return (
    <main className="cg-dark-page min-h-[calc(100vh-72px)]">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-sky-300">
              <ShieldCheck className="h-4 w-4" /> Protected administrator dashboard
            </div>
            <h1 className="mt-2 text-3xl font-black text-white">CivicGuardian operations review</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Review citizen evidence and AI suggestions. Administrator actions are audit-logged. This console does not imply integration with a government authority.
            </p>
          </div>
          <select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-[#111824] px-4 py-2.5 text-sm text-slate-200">
            {["open", "all", "under_review", "verified", "assigned", "in_progress", "resolved"].map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(([title, value, Icon]) => (
            <div key={title} className="cg-dark-card">
              <Icon className="h-5 w-5 text-sky-300" />
              <div className="mt-3 text-2xl font-black text-white">{value}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</div>
            </div>
          ))}
        </div>

        {notes.length > 0 && (
          <section className="mt-7 rounded-2xl border border-slate-800 bg-[#111824] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-sky-300">
              <Bell className="h-4 w-4" /> Recent notifications
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {notes.slice(0, 4).map(note => (
                <div key={note.id} className="rounded-xl border border-slate-800 bg-[#0b1018] p-3">
                  <div className="text-xs font-extrabold text-slate-200">{note.title}</div>
                  <p className="mt-1 text-xs text-slate-500">{note.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7 overflow-x-auto rounded-2xl border border-slate-800 bg-[#111824]">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[1.3fr_.7fr_.8fr] gap-4 border-b border-slate-800 bg-[#0e151f] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <span>Report</span><span>Status</span><span>Review action</span>
            </div>
            {rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No reports in this queue.</div>}
            {rows.map(issue => (
              <div key={issue.id} className="grid grid-cols-[1.3fr_.7fr_.8fr] items-center gap-4 border-b border-slate-800 px-5 py-4 text-sm">
                <button onClick={() => onSelect(issue)} className="text-left">
                  <div className="font-bold text-slate-100 hover:text-sky-300">{issue.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{issue.address} · {issue.category}</div>
                </button>
                <span className="text-xs font-bold text-slate-400">{label(issue.status)}</span>
                <select disabled={busy === issue.id} value={issue.status} onChange={event => void update(issue.id, event.target.value)} className="min-w-0 rounded-lg border border-slate-700 bg-[#0b1018] px-2 py-2 text-xs text-slate-200 disabled:opacity-50">
                  {statusOptions.map(status => <option key={status} value={status}>{label(status)}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
