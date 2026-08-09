import React, { useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, BellOff, CheckCircle2, Clock, ImagePlus, Link, MapPin, MessageSquare, RotateCcw, Share2, Sparkles, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import type { CivicIssue, ResolutionVerdict } from "../types";
import { statusText } from "../i18n";
import { IssueImage } from "./common/IssueImage";
import ImageUploader from "./report/ImageUploader";

export default function IssueDetailPage({ issue, onBack, onUpvote, onVerify, onNotAccurate, onFollow, onResolutionFeedback, onAddComment, onAddImage, busy = false }: {
  issue: CivicIssue;
  allIssues: CivicIssue[];
  onBack: () => void;
  onUpvote: (id: string) => Promise<void>;
  onVerify: (id: string) => Promise<void>;
  onNotAccurate: (id: string) => Promise<void>;
  onFollow: (id: string) => Promise<void>;
  onResolutionFeedback: (id: string, verdict: ResolutionVerdict) => Promise<void>;
  onUpdateStatus: (id: string, nextStatus: string) => Promise<void>;
  onAddComment: (author: string, text: string) => Promise<void>;
  onAddImage: (url: string) => Promise<void>;
  onSelectIssue?: (issue: CivicIssue) => void;
  setActiveTab?: (tab: string) => void;
  busy?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [additionalImage, setAdditionalImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const ai = issue.analysis?.vision;

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setSending(true); setActionError("");
    try {
      await onAddComment("", comment.trim());
      setComment("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The comment could not be posted.");
    } finally {
      setSending(false);
    }
  };

  const addEvidence = async () => {
    if (!additionalImage) return;
    setSending(true); setActionError("");
    try {
      await onAddImage(additionalImage);
      setAdditionalImage(null); setEvidenceOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The evidence could not be added.");
    } finally {
      setSending(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/#/reports/${encodeURIComponent(issue.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: issue.title, text: `CivicGuardian report ${issue.id}`, url });
      else { await navigator.clipboard.writeText(url); setShareStatus("Report link copied"); }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") setShareStatus("Could not share the link");
    }
  };

  const feedback = async (verdict: ResolutionVerdict) => {
    setActionError("");
    try { await onResolutionFeedback(issue.id, verdict); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Feedback could not be saved."); }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:px-5 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-teal-800"><ArrowLeft className="h-4 w-4" />Back to Bangladesh reports</button>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void onFollow(issue.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50 ${issue.isFollowedByMe ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-300 bg-white text-slate-600"}`} aria-pressed={issue.isFollowedByMe}>{issue.isFollowedByMe ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}{issue.isFollowedByMe ? "Following" : "Follow"} · {issue.followersCount || 0}</button>
          <button type="button" onClick={() => void share()} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600"><Share2 className="h-4 w-4" />Share</button>
        </div>
      </div>
      {shareStatus && <div className="mt-3 text-right text-xs font-semibold text-teal-700" role="status">{shareStatus}</div>}
      {actionError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{actionError}</div>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,.8fr)]">
        <section className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{issue.category}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{statusText(issue.status)}</span>{ai?.severity && <span className={`rounded-full px-3 py-1 text-xs font-bold ${ai.severity === "Critical" ? "bg-red-100 text-red-800" : ai.severity === "High" ? "bg-orange-100 text-orange-800" : "bg-amber-50 text-amber-800"}`}>{ai.severity} AI severity</span>}</div>
            <h1 className="mt-2.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{issue.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-teal-700" />{issue.address}</span><span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{new Date(issue.createdAt).toLocaleString()}</span><span className="font-semibold">Report {issue.id}</span></div>
          </div>

          {issue.resolutionProof ? <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white" aria-labelledby="repair-proof-heading">
            <div className="border-b border-teal-100 bg-teal-50 p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-teal-800"><Wrench className="h-4 w-4" />Before-and-after resolution proof</div><h2 id="repair-proof-heading" className="mt-2 text-xl font-black text-slate-950">Review the repair evidence yourself.</h2></div>
            <div className="grid md:grid-cols-2"><figure className="border-b border-slate-200 md:border-b-0 md:border-r"><IssueImage src={issue.imageUrl} alt={`Original citizen evidence for ${issue.title}`} className="h-72 w-full bg-slate-950 object-contain" /><figcaption className="p-3 text-xs font-bold text-slate-600">Before · original citizen evidence</figcaption></figure><figure><IssueImage src={issue.resolutionProof.afterImageUrl} alt={`After-repair evidence for ${issue.title}`} className="h-72 w-full bg-slate-950 object-contain" /><figcaption className="p-3 text-xs font-bold text-slate-600">After · repair evidence</figcaption></figure></div>
            <div className="border-t border-slate-200 p-5"><p className="text-sm leading-6 text-slate-700">{issue.resolutionProof.note}</p><p className="mt-2 text-[11px] text-slate-500">Submitted by {issue.resolutionProof.submittedBy} on {new Date(issue.resolutionProof.submittedAt).toLocaleString()}. This proof remains visible if the report is reopened.</p></div>
          </section> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><IssueImage src={issue.imageUrl} alt={`Citizen evidence for ${issue.title}`} className="max-h-[520px] w-full bg-slate-950 object-contain" /><div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><strong className="text-slate-700">Citizen-provided evidence.</strong> This image is part of the submitted report and is not AI-generated.</div></div>}

          {(issue.additionalImages || []).length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black text-slate-900">Additional community evidence</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{issue.additionalImages!.map((image, index) => <IssueImage key={`${index}-${image.slice(-12)}`} src={image} alt={`Additional evidence ${index + 1} for ${issue.title}`} className="h-36 w-full rounded-xl bg-slate-950 object-cover" />)}</div></section>}

          <div className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-black text-slate-900">Citizen description</h2><p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-slate-600">{issue.description}</p></div>
          {ai && <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-blue-800"><Sparkles className="h-4 w-4" />AI advisory assessment</div><div className="mt-4 grid gap-4 sm:grid-cols-3"><div><div className="text-[10px] font-bold uppercase text-slate-400">AI category</div><div className="mt-1 font-bold text-slate-900">{ai.category}</div></div><div><div className="text-[10px] font-bold uppercase text-slate-400">Confidence</div><div className="mt-1 font-bold text-slate-900">{ai.confidence}%</div></div><div><div className="text-[10px] font-bold uppercase text-slate-400">Severity</div><div className="mt-1 font-bold text-slate-900">{ai.severity}</div></div></div><p className="mt-4 text-sm leading-6 text-slate-700">{ai.summary}</p><div className="mt-4 flex gap-2 rounded-xl bg-white/80 p-3 text-xs leading-5 text-blue-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />AI output is not an official finding. It must be reviewed by an authorized human before operational action.</div></div>}
          {issue.analysis?.resolution && <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">Responsible review queue</div><div className="mt-2 font-black text-slate-900">{issue.analysis.resolution.responsibleAuthority}</div><p className="mt-2 text-xs leading-5 text-slate-500">This is CivicGuardian routing guidance only. It does not imply a connection to a government agency or promise a completion date.</p></div>}
        </section>

        <aside className="space-y-5">
          {issue.resolutionProof && <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-teal-700" /><h2 className="font-black text-slate-900">Is it really resolved?</h2></div><p className="mt-2 text-xs leading-5 text-slate-600">Compare the photos and use local knowledge. AI never closes a report automatically.</p><div className="mt-4 space-y-2"><button type="button" disabled={busy} onClick={() => void feedback("confirmed")} className={`w-full rounded-xl border px-3 py-3 text-xs font-bold ${issue.resolutionFeedback?.mine === "confirmed" ? "border-teal-700 bg-white text-teal-800" : "border-teal-200 bg-white/70 text-slate-700"}`}>Confirm resolved · {issue.resolutionFeedback?.confirmed || 0}</button><button type="button" disabled={busy} onClick={() => void feedback("unresolved")} className={`w-full rounded-xl border px-3 py-3 text-xs font-bold ${issue.resolutionFeedback?.mine === "unresolved" ? "border-red-500 bg-red-50 text-red-700" : "border-teal-200 bg-white/70 text-slate-700"}`}>Still unresolved · {issue.resolutionFeedback?.unresolved || 0}</button><button type="button" disabled={busy} onClick={() => void feedback("review")} className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold ${issue.resolutionFeedback?.mine === "review" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-teal-200 bg-white/70 text-slate-700"}`}><RotateCcw className="h-4 w-4" />Needs another review · {issue.resolutionFeedback?.review || 0}</button></div><p className="mt-3 text-[11px] leading-5 text-slate-500">The original reporter can reopen directly. Multiple independent community requests also return it to admin review.</p></section>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">Community corroboration</h2><p className="mt-1 text-xs leading-5 text-slate-500">Support an existing report instead of duplicating it. Confirm only if you can independently verify it.</p><div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1"><button type="button" disabled={busy} onClick={() => void onUpvote(issue.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold disabled:opacity-50 ${issue.isUpvotedByMe ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600"}`} aria-pressed={issue.isUpvotedByMe}><Link className="h-4 w-4" />Support {issue.upvotes}</button><button type="button" disabled={busy} onClick={() => void onVerify(issue.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold disabled:opacity-50 ${issue.isVerifiedByMe ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`} aria-pressed={issue.isVerifiedByMe}><ThumbsUp className="h-4 w-4" />Confirm {issue.verifiedByCount}</button><button type="button" disabled={busy} onClick={() => void onNotAccurate(issue.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold disabled:opacity-50 ${issue.isNotAccurateByMe ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`} aria-pressed={issue.isNotAccurateByMe}><ThumbsDown className="h-4 w-4" />Dispute {issue.notAccurateCount || 0}</button></div></section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black text-slate-900">Transparent status history</h2><div className="mt-5 space-y-5 border-l-2 border-slate-100 pl-5">{issue.timeline.map((event, index) => <div key={`${event.date}-${index}`} className="relative"><span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${index === issue.timeline.length - 1 ? "bg-teal-700" : "bg-slate-300"}`} /><div className="text-xs font-black text-slate-800">{statusText(event.status)}</div><div className="mt-1 text-[11px] text-slate-400">{new Date(event.date).toLocaleString()}</div><p className="mt-1 text-xs leading-5 text-slate-500">{event.note}</p></div>)}</div></section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5"><button type="button" onClick={() => setEvidenceOpen(value => !value)} className="flex w-full items-center justify-between text-left"><span className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-teal-700" /><span className="font-black text-slate-900">Add useful evidence</span></span><span className="text-xs font-bold text-teal-700">{evidenceOpen ? "Close" : "Add"}</span></button>{evidenceOpen && <div className="mt-4"><p className="mb-3 text-xs leading-5 text-slate-500">Add only a lawful, relevant photo. Use the privacy editor before upload when needed.</p><ImageUploader compact image={additionalImage} setImage={setAdditionalImage} errorMsg={imageError} setErrorMsg={setImageError} /><button type="button" disabled={!additionalImage || sending} onClick={() => void addEvidence()} className="mt-3 w-full rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white disabled:opacity-40">{sending ? "Adding evidence..." : "Add to this report"}</button></div>}</section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-teal-700" /><h2 className="font-black text-slate-900">Comments</h2></div><div className="mt-4 space-y-3">{(issue.comments || []).map(commentItem => <div key={commentItem.id} className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold text-slate-700">{commentItem.author}</div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{commentItem.text}</p></div>)}{!(issue.comments || []).length && <p className="text-xs text-slate-400">No comments yet.</p>}</div><form onSubmit={submitComment} className="mt-4"><label className="sr-only" htmlFor="report-comment">Add useful local information</label><textarea id="report-comment" value={comment} onChange={event => setComment(event.target.value)} maxLength={1500} rows={3} placeholder="Add useful local information" className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm" /><button disabled={sending || !comment.trim()} className="mt-2 w-full rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white disabled:opacity-40">{sending ? "Posting..." : "Post comment"}</button></form></section>
        </aside>
      </div>
    </main>
  );
}
