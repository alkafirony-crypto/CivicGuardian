import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileClock, Image as ImageIcon, MapPin, Sparkles, Trash2, WifiOff } from "lucide-react";
import type { CivicIssue, DuplicateCandidate } from "../types";
import type { VisionAnalysisResult } from "../services/gemini";
import { apiJson, jsonRequest } from "../lib/api";
import { useOnline } from "../lib/useOnline";
import { useLanguage } from "../i18n";
import { CIVIC_CATEGORIES } from "../config/civicCategories";
import ImageUploader from "./report/ImageUploader";

const LocationPicker = lazy(() => import("./report/LocationPicker"));
const categories = [...CIVIC_CATEGORIES];
const DRAFT_KEY = "civicguardian:report-draft:v2";

type Phase = "location" | "evidence" | "review";
type Draft = {
  phase: Phase;
  lat: number | null;
  lng: number | null;
  address: string;
  image: string | null;
  title: string;
  description: string;
  category: string;
  evidenceConsent: boolean;
  clientRequestId: string;
  savedAt: string;
};

function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const value = Math.random() * 16 | 0;
    return (character === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function readDraft(): Draft | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") as Draft | null;
    if (!parsed || Date.now() - new Date(parsed.savedAt).getTime() > 7 * 86_400_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function ReportIssuePage({ onSubmit, setActiveTab, setSelectedIssue }: {
  onSubmit: (issue: any) => Promise<CivicIssue>;
  setActiveTab: (tab: string) => void;
  setSelectedIssue: (issue: CivicIssue) => void;
}) {
  const restored = useMemo(readDraft, []);
  const [phase, setPhase] = useState<Phase>(restored?.phase === "review" ? "evidence" : restored?.phase || "location");
  const [lat, setLat] = useState<number | null>(restored?.lat ?? null);
  const [lng, setLng] = useState<number | null>(restored?.lng ?? null);
  const [address, setAddress] = useState(restored?.address || "");
  const [image, setImage] = useState<string | null>(restored?.image || null);
  const [title, setTitle] = useState(restored?.title || "");
  const [description, setDescription] = useState(restored?.description || "");
  const [category, setCategory] = useState(categories.some(item => item === restored?.category) ? restored!.category : "Uncertain");
  const [evidenceConsent, setEvidenceConsent] = useState(Boolean(restored?.evidenceConsent));
  const [clientRequestId, setClientRequestId] = useState(restored?.clientRequestId || newRequestId());
  const [analysis, setAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [continueSeparate, setContinueSeparate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [draftStatus, setDraftStatus] = useState(restored ? "Draft restored" : "");
  const online = useOnline();
  const { t } = useLanguage();
  const copy = {
    photoRequired: "Please upload or take a real photo of the issue.",
    descriptionShort: "Please describe the issue in at least 10 characters.",
    consentRequired: "Please confirm the evidence consent before sending the photo for analysis.",
    analysisUnavailable: "AI analysis is currently unavailable.",
    reviewDuplicates: "Review the possible matches, then confirm this is a different issue.",
    submitFailed: "Could not submit the report.",
    draftRestored: "Draft restored",
    draftSaved: "Draft saved on this device",
  };

  const hasDraftContent = Boolean(address || image || title || description || lat !== null);
  useEffect(() => {
    if (!hasDraftContent) return;
    const timer = window.setTimeout(() => {
      const draft: Draft = { phase, lat, lng, address, image, title, description, category, evidenceConsent, clientRequestId, savedAt: new Date().toISOString() };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setDraftStatus("Draft saved on this device");
      } catch {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, image: null }));
          setDraftStatus("Text and location saved. The photo was too large for local draft storage.");
        } catch {
          setDraftStatus("This browser could not save the draft.");
        }
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [phase, lat, lng, address, image, title, description, category, evidenceConsent, clientRequestId, hasDraftContent]);

  const discardDraft = () => {
    if(hasDraftContent&&!window.confirm("Discard this saved report draft? This cannot be undone."))return;
    localStorage.removeItem(DRAFT_KEY);
    setPhase("location"); setLat(null); setLng(null); setAddress(""); setImage(null); setTitle(""); setDescription("");
    setCategory("Uncertain"); setEvidenceConsent(false); setAnalysis(null); setDuplicates([]); setContinueSeparate(false);
    setClientRequestId(newRequestId()); setDraftStatus(""); setError("");
  };

  const checkDuplicates = async (nextCategory: string) => {
    if (lat === null || lng === null) return;
    try {
      const matches = await apiJson<DuplicateCandidate[]>("/api/issues/duplicates/check", jsonRequest("POST", {
        lat, lng, category: nextCategory, title, description,
      }));
      setDuplicates(matches);
      setContinueSeparate(matches.length === 0);
    } catch {
      setDuplicates([]);
      setContinueSeparate(true);
    }
  };

  const analyze = async () => {
    if (!online) { setError(t("offline")); return; }
    if (!image) { setUploadError(copy.photoRequired); return; }
    if (description.trim().length < 10) { setError(copy.descriptionShort); return; }
    if (!evidenceConsent) { setError(copy.consentRequired); return; }
    setBusy(true); setError("");
    try {
      const result = await apiJson<VisionAnalysisResult>("/api/analyze-vision", jsonRequest("POST", { image, description, title }), 35_000);
      setAnalysis(result); setCategory(result.issueType); setPhase("review");
      await checkDuplicates(result.issueType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.analysisUnavailable);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!online) { setError(t("offline")); return; }
    if (lat === null || lng === null || !analysis?.aiAttestation || !image) return;
    if (duplicates.length > 0 && !continueSeparate) { setError(copy.reviewDuplicates); return; }
    setBusy(true); setError("");
    try {
      const issue = await onSubmit({ title, description, address, category, image, aiAttestation: analysis.aiAttestation, lat, lng, evidenceConsent, clientRequestId });
      localStorage.removeItem(DRAFT_KEY);
      setSelectedIssue(issue); setActiveTab("detail");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.submitFailed);
    } finally {
      setBusy(false);
    }
  };

  const openCandidate = (candidate: DuplicateCandidate) => {
    setSelectedIssue(candidate.issue);
    setActiveTab("detail");
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-5 sm:px-5 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setActiveTab("dashboard")} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-teal-800"><ArrowLeft className="h-4 w-4" />{t("backReports")}</button>
        {hasDraftContent && <button type="button" onClick={discardDraft} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-red-300 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" />Discard draft</button>}
      </div>

      {!online && <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" />{t("offline")}</div>}
      {draftStatus && <div className="mb-5 flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-semibold text-teal-900" aria-live="polite"><FileClock className="h-4 w-4" />{draftStatus}</div>}

      <div className="grid gap-5 lg:grid-cols-[205px_1fr]">
        <aside>
          <div className="text-xs font-black uppercase tracking-[.18em] text-teal-700">{t("reportHazard")}</div>
          <h1 className="mt-1.5 text-2xl font-black leading-tight text-slate-950">Report a civic issue</h1>
          <p className="mt-2 text-[12px] leading-5 text-slate-500">Add the location and real evidence. Gemini assists with classification, while people control verification and resolution.</p>
          <div className="mt-5 grid grid-cols-3 gap-2 lg:grid-cols-1">
            {[["location", "1", t("location")], ["evidence", "2", t("evidence")], ["review", "3", t("review")]].map(([id, number, label]) => (
              <div key={id} className={`flex min-w-0 items-center gap-2 rounded-lg p-2 text-[11px] font-bold ${phase === id ? "bg-teal-50 text-teal-900" : "text-slate-400"}`} aria-current={phase === id ? "step" : undefined}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] ${phase === id ? "bg-teal-700 text-white" : "bg-slate-100"}`}>{number}</span><span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </aside>

        <section>
          {phase === "location" && <div>
            <Suspense fallback={<div className="cg-skeleton h-[480px] rounded-xl" aria-label="Loading location map" />}>
              <LocationPicker lat={lat} lng={lng} address={address} setAddress={setAddress} onChange={(nextLat, nextLng, suggestion) => { setLat(nextLat); setLng(nextLng); if (suggestion) setAddress(suggestion); }} />
            </Suspense>
            <button type="button" disabled={lat === null || lng === null || !address.trim()} onClick={() => setPhase("evidence")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40">{t("continueEvidence")} <ArrowRight className="h-4 w-4" /></button>
          </div>}

          {phase === "evidence" && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ImageIcon className="h-4 w-4 text-teal-700" />Add real evidence</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Take a photo at the scene or upload one you captured. Images are resized, re-encoded, and stripped of unnecessary metadata before upload.</p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><AlertTriangle className="mr-1 inline h-4 w-4" />{t("photoSafety")}</div>
            <div className="mt-4"><ImageUploader image={image} setImage={setImage} errorMsg={uploadError} setErrorMsg={setUploadError} /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Short title <span className="font-normal text-slate-400">(optional)</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} placeholder="e.g. Exposed cable beside footpath" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-normal text-slate-900" /></label>
              <label className="text-xs font-bold text-slate-600">Your category<select value={category} onChange={event => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal">{categories.map(item => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label className="mt-4 block text-xs font-bold text-slate-600">{t("observed")}<textarea value={description} onChange={event => setDescription(event.target.value)} rows={5} maxLength={2000} placeholder="Describe only what you observed and why it may be unsafe." className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 text-sm font-normal text-slate-900" /><span className="mt-1 block text-right font-normal text-slate-400">{description.length}/2000</span></label>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700"><input type="checkbox" checked={evidenceConsent} onChange={event => setEvidenceConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-700" /><span>{t("consent")}</span></label>
            {error && <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
            <div className="mt-5 flex gap-2"><button type="button" onClick={() => setPhase("location")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600">Back</button><button type="button" disabled={busy || !online || !image || description.trim().length < 10 || !evidenceConsent} onClick={() => void analyze()} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />{busy ? t("analyzing") : t("analyze")}</button></div>
          </div>}

          {phase === "review" && analysis && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.15em] text-teal-700"><Sparkles className="h-4 w-4" />AI advisory assessment</div><h2 className="mt-1.5 text-xl font-black text-slate-950">Review before submitting</h2></div><span className={`w-fit rounded-full px-3 py-1 text-[10px] font-bold ${analysis.needsHumanReview ? "bg-amber-100 text-amber-800" : "bg-teal-50 text-teal-800"}`}>{analysis.needsHumanReview ? "Human review required" : "AI suggestion"}</span></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">{[["AI category", analysis.issueType], ["Severity", analysis.severity], ["Confidence", `${analysis.confidenceScore}%`]].map(([heading, value]) => <div key={heading} className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{heading}</div><div className="mt-1 font-bold text-slate-900">{value}</div></div>)}</div>
            <div className="mt-5 rounded-xl border border-slate-200 p-4"><div className="text-xs font-bold text-slate-700">Visible evidence identified by AI</div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{analysis.observedEvidence?.length ? analysis.observedEvidence.map((item, index) => <li key={index}>{item}</li>) : <li>No reliable visual evidence extracted.</li>}</ul></div>
            <label className="mt-5 block text-xs font-bold text-slate-600">Final category <span className="font-normal text-slate-400">You can correct the AI.</span><select value={category} onChange={event => { setCategory(event.target.value); void checkDuplicates(event.target.value); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal">{categories.map(item => <option key={item}>{item}</option>)}</select></label>

            {duplicates.length > 0 && <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-sm font-black text-amber-950">Possible existing reports nearby</div>
              <p className="mt-1 text-xs leading-5 text-amber-900">Open an existing report to confirm, follow, or add useful information. CivicGuardian will never merge an uncertain match automatically.</p>
              <div className="mt-3 space-y-2">{duplicates.map(candidate => <div key={candidate.issue.id} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><div className="text-xs font-black text-slate-900">{candidate.issue.id} · {candidate.issue.title}</div><div className="mt-1 text-[11px] text-slate-500">{candidate.reasons.join(" · ")} · {candidate.similarityScore}% match</div></div><button type="button" onClick={() => openCandidate(candidate)} className="shrink-0 rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-950">Open & support</button></div></div>)}</div>
              <label className="mt-3 flex items-start gap-2 text-xs font-bold text-amber-950"><input type="checkbox" checked={continueSeparate} onChange={event => setContinueSeparate(event.target.checked)} className="mt-0.5 accent-amber-700" />This is genuinely different, so continue with a separate report.</label>
            </div>}

            <div className="mt-5 flex gap-2 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />The AI result is advisory. Submission creates a citizen report, not an official government finding or dispatch.</div>
            {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800" role="alert">{error}</div>}
            <div className="mt-6 flex gap-3"><button type="button" onClick={() => setPhase("evidence")} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600">Back</button><button type="button" disabled={busy || !online || (duplicates.length > 0 && !continueSeparate)} onClick={() => void publish()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b3b4a] px-4 py-3 text-sm font-bold text-white hover:bg-[#072f3b] disabled:opacity-50"><MapPin className="h-4 w-4" />{busy ? t("submitting") : t("submit")}</button></div>
          </div>}
        </section>
      </div>
    </main>
  );
}
