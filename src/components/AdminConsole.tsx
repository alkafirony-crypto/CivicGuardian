import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, MessageSquare, ShieldCheck, Trash2, Users } from "lucide-react";
import { apiJson } from "../lib/api";
import type { AdminCommentSummary, AdminUserSummary, AppUser, CivicIssue, CivicNotification, DashboardMetrics } from "../types";
import ImageUploader from "./report/ImageUploader";

const statusOptions = ["under_review", "verified", "assigned", "in_progress", "resolved", "rejected", "unable_to_verify"];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
type AdminSection = "reports" | "users" | "comments";

export default function AdminConsole({ issues, metrics, currentUser, onSelect, onStatus }: {
  issues: CivicIssue[];
  metrics: DashboardMetrics;
  currentUser: AppUser;
  onSelect: (issue: CivicIssue) => void;
  onStatus: (id: string, status: string, details?: { note?: string; afterImage?: string }) => Promise<void>;
}) {
  const [section, setSection] = useState<AdminSection>("reports");
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<CivicNotification[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [comments, setComments] = useState<AdminCommentSummary[]>([]);
  const [managementLoading, setManagementLoading] = useState(true);
  const [resolutionId, setResolutionId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const rows = useMemo(
    () => issues.filter(issue => filter === "all" || (filter === "open" ? issue.status !== "resolved" : issue.status === filter)),
    [issues, filter],
  );

  const loadManagement = useCallback(async () => {
    setManagementLoading(true);
    try {
      const [userRows, commentRows] = await Promise.all([
        apiJson<AdminUserSummary[]>("/api/admin/users"),
        apiJson<AdminCommentSummary[]>("/api/admin/comments"),
      ]);
      setUsers(userRows);
      setComments(commentRows);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Administration data could not be loaded.");
    } finally {
      setManagementLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/me/notifications")
      .then(response => response.ok ? response.json() : [])
      .then(setNotes)
      .catch(() => setNotes([]));
    void loadManagement();
  }, [issues, loadManagement]);

  const update = async (id: string, status: string, details?: { note?: string; afterImage?: string }) => {
    setBusy(id); setActionError(""); setActionNotice("");
    try { await onStatus(id, status, details); }
    catch (error) { setActionError(error instanceof Error ? error.message : "The status could not be updated."); throw error; }
    finally { setBusy(""); }
  };

  const chooseStatus = (issue: CivicIssue, status: string) => {
    if (status === "resolved") {
      setResolutionId(issue.id); setResolutionNote(""); setAfterImage(null); setUploadError("");
      return;
    }
    void update(issue.id, status);
  };

  const submitResolution = async () => {
    if (!resolutionId || resolutionNote.trim().length < 10 || !afterImage) return;
    try {
      await update(resolutionId, "resolved", { note: resolutionNote.trim(), afterImage });
      setResolutionId(""); setResolutionNote(""); setAfterImage(null);
    } catch { /* Error is already shown. */ }
  };

  const removeUser = async (user: AdminUserSummary) => {
    const confirmed = window.confirm(
      `Remove ${user.name} (${user.email})?\n\nThis revokes sign-in, removes their comments and participation, and makes their existing reports anonymous. The reports themselves remain in CivicGuardian.`,
    );
    if (!confirmed) return;
    setBusy(`user:${user.id}`); setActionError(""); setActionNotice("");
    try {
      await apiJson(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      await loadManagement();
      setActionNotice(`${user.name} was removed and can no longer sign in.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The user could not be removed.");
    } finally {
      setBusy("");
    }
  };

  const deleteComment = async (comment: AdminCommentSummary) => {
    if (!window.confirm(`Delete this comment by ${comment.author}? This cannot be undone.`)) return;
    setBusy(`comment:${comment.id}`); setActionError(""); setActionNotice("");
    try {
      await apiJson(`/api/admin/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" });
      setComments(current => current.filter(item => item.id !== comment.id));
      setActionNotice("The comment was deleted and the action was audit-logged.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The comment could not be deleted.");
    } finally {
      setBusy("");
    }
  };

  const statCards = [
    ["Total reports", metrics.totalIssues, ClipboardCheck],
    ["Active users", users.length, Users],
    ["Visible comments", comments.length, MessageSquare],
    ["Critical AI flags", metrics.criticalCount, AlertTriangle],
    ["Resolved", metrics.resolvedIssues, CheckCircle2],
    ["Admin alerts", notes.filter(note => !note.read).length, Bell],
  ] as const;

  const sectionTabs: Array<[AdminSection, string, number]> = [
    ["reports", "Reports", rows.length],
    ["users", "Users", users.length],
    ["comments", "Comments", comments.length],
  ];

  return (
    <main className="cg-dark-page min-h-[calc(100vh-72px)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5 lg:py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-sky-300"><ShieldCheck className="h-4 w-4" />Protected administrator dashboard</div>
            <h1 className="mt-1.5 text-2xl font-black text-white sm:text-3xl">Operations and community management</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-400">Review reports, manage registered users, and moderate comments. Every destructive action requires confirmation and is recorded in the audit log.</p>
          </div>
          {section === "reports" && <select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-[#111824] px-4 py-2.5 text-sm text-slate-200">
            {["open", "all", "under_review", "verified", "assigned", "in_progress", "resolved"].map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select>}
        </div>

        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Administrator sections">
          {sectionTabs.map(([id, title, count]) => <button key={id} type="button" onClick={() => setSection(id)} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${section === id ? "border-[#e0ff89] bg-[#e0ff89] text-[#2c2927]" : "border-slate-700 bg-[#111824] text-slate-300 hover:border-sky-400"}`}>{title} <span className="ml-1 opacity-70">{count}</span></button>)}
        </nav>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map(([title, value, Icon]) => <div key={title} className="cg-dark-card"><Icon className="h-5 w-5 text-sky-300" /><div className="mt-2 text-2xl font-bold text-white">{managementLoading && (title === "Active users" || title === "Visible comments") ? "…" : value}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</div></div>)}
        </div>

        {actionError && <div className="mt-5 rounded-xl border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-200" role="alert">{actionError}</div>}
        {actionNotice && <div className="mt-5 rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4 text-sm text-emerald-200" role="status">{actionNotice}</div>}

        {section === "reports" && <>
          {notes.length > 0 && <section className="mt-6 rounded-2xl border border-slate-800 bg-[#111824] p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-sky-300"><Bell className="h-4 w-4" />Recent notifications</div><div className="mt-3 grid gap-2 md:grid-cols-2">{notes.slice(0, 4).map(note => <div key={note.id} className="rounded-xl border border-slate-800 bg-[#0b1018] p-4"><div className="text-[15px] font-semibold text-slate-200">{note.title}</div><p className="mt-1.5 text-[14px] text-slate-400">{note.message}</p></div>)}</div></section>}

          {resolutionId && <section className="mt-5 rounded-xl border border-teal-500/30 bg-[#111824] p-4 sm:p-5" aria-labelledby="resolution-proof-title">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="text-xs font-black uppercase tracking-[.15em] text-teal-300">Trusted resolution record</div><h2 id="resolution-proof-title" className="mt-1 text-xl font-black text-white">Add repair proof for {resolutionId}</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">A report cannot be marked resolved without a clear note and an after-repair photo. Citizens will be asked to confirm the outcome.</p></div><button type="button" onClick={() => setResolutionId("")} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-400">Cancel</button></div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2"><label className="text-xs font-bold text-slate-300">Resolution note<textarea value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} maxLength={1000} rows={7} placeholder="Explain what was repaired and what this photo shows." className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-[#0b1018] p-3 text-sm font-normal text-white" /><span className="mt-1 block text-right font-normal text-slate-600">{resolutionNote.length}/1000</span></label><div><div className="mb-2 text-xs font-bold text-slate-300">After-repair photo</div><ImageUploader compact image={afterImage} setImage={setAfterImage} errorMsg={uploadError} setErrorMsg={setUploadError} /></div></div>
            <button type="button" disabled={busy === resolutionId || resolutionNote.trim().length < 10 || !afterImage} onClick={() => void submitResolution()} className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-black text-white hover:bg-teal-500 disabled:opacity-40">{busy === resolutionId ? "Saving resolution proof..." : "Mark resolved with proof"}</button>
          </section>}

          <section className="mt-6 overflow-x-auto rounded-2xl border border-slate-800 bg-[#111824]">
            <div className="min-w-[680px]"><div className="grid grid-cols-[1.3fr_.7fr_.8fr] gap-5 border-b border-slate-800 bg-[#0e151f] px-6 py-4 text-[13px] font-semibold uppercase tracking-wider text-slate-400"><span>Report</span><span>Status</span><span>Review action</span></div>
              {rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No reports in this queue.</div>}
              {rows.map(issue => <div key={issue.id} className="grid grid-cols-[1.3fr_.7fr_.8fr] items-center gap-5 border-b border-slate-800 px-6 py-5 text-[15px]"><button onClick={() => onSelect(issue)} className="text-left"><div className="font-bold text-slate-100 hover:text-sky-300">{issue.title}</div><div className="mt-1 text-xs text-slate-500">{issue.address} · {issue.category}</div></button><span className="text-xs font-bold text-slate-400">{label(issue.status)}</span><select disabled={busy === issue.id} value={issue.status} onChange={event => chooseStatus(issue, event.target.value)} className="min-w-0 rounded-lg border border-slate-700 bg-[#0b1018] px-2 py-2 text-xs text-slate-200 disabled:opacity-50">{statusOptions.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></div>)}
            </div>
          </section>
        </>}

        {section === "users" && <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-[#111824]" aria-labelledby="registered-users-title">
          <div className="border-b border-slate-800 bg-[#0e151f] px-5 py-5"><h2 id="registered-users-title" className="text-xl font-bold text-white">Registered users</h2><p className="mt-1 text-sm text-slate-400">Admins can see registered accounts and remove access. Removing a user anonymizes report ownership and deletes that user’s comments and participation, but preserves civic reports.</p></div>
          {managementLoading ? <div className="p-8 text-center text-sm text-slate-400">Loading users…</div> : users.length ? <div className="divide-y divide-slate-800">{users.map(user => <article key={user.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-white">{user.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${user.role === "admin" ? "bg-violet-500/15 text-violet-300" : "bg-sky-500/15 text-sky-300"}`}>{user.role}</span>{user.id === currentUser.id && <span className="text-xs font-bold text-[#e0ff89]">You</span>}</div><p className="mt-1 break-all text-sm text-slate-400">{user.email}</p><p className="mt-1 text-xs text-slate-500">{user.reportCount} reports · {user.commentCount} comments · Last sign-in {new Date(user.lastLoginAt).toLocaleString()}</p></div><button type="button" disabled={busy === `user:${user.id}` || user.id === currentUser.id} onClick={() => void removeUser(user)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-700/70 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-4 w-4" />{user.id === currentUser.id ? "Current account" : busy === `user:${user.id}` ? "Removing…" : "Remove user"}</button></article>)}</div> : <div className="p-8 text-center text-sm text-slate-400">No active users found.</div>}
        </section>}

        {section === "comments" && <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-[#111824]" aria-labelledby="comment-moderation-title">
          <div className="border-b border-slate-800 bg-[#0e151f] px-5 py-5"><h2 id="comment-moderation-title" className="text-xl font-bold text-white">Comment moderation</h2><p className="mt-1 text-sm text-slate-400">Review every visible comment across CivicGuardian. Delete only spam, abuse, unsafe content, or personal information. Deletion is permanent and audit-logged.</p></div>
          {managementLoading ? <div className="p-8 text-center text-sm text-slate-400">Loading comments…</div> : comments.length ? <div className="divide-y divide-slate-800">{comments.map(comment => <article key={comment.id} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="font-bold text-sky-300">{comment.author}</span><span>on {comment.issueId}</span><span>{new Date(comment.createdAt).toLocaleString()}</span></div><div className="mt-1 text-sm font-semibold text-slate-300">{comment.issueTitle}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{comment.text}</p></div><button type="button" disabled={busy === `comment:${comment.id}`} onClick={() => void deleteComment(comment)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-700/70 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-950/50 disabled:opacity-40"><Trash2 className="h-4 w-4" />{busy === `comment:${comment.id}` ? "Deleting…" : "Delete comment"}</button></article>)}</div> : <div className="p-8 text-center text-sm text-slate-400">No visible comments to moderate.</div>}
        </section>}
      </div>
    </main>
  );
}
