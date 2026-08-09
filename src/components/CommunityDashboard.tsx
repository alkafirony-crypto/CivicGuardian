import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Award, CalendarDays, CheckCircle2, Crosshair, ListFilter, Map, MapPin, Search, ShieldAlert, ThumbsUp, Users } from "lucide-react";
import { categoryOptions } from "../config/civicCategories";
import type { CivicIssue, ContributorSummary, DashboardMetrics } from "../types";
import { IssueImage } from "./common/IssueImage";

const MapView = lazy(() => import("./dashboard/MapView"));
const terminalStatuses = new Set(["resolved", "rejected", "duplicate"]);
const FILTER_KEY="civicguardian:public-report-filters";

function savedFilters(){
  try{return JSON.parse(sessionStorage.getItem(FILTER_KEY)||"{}");}catch{return {};}
}

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CommunityDashboard({ issues, metrics, onUpvote, onVerify, onNotAccurate, onSelectIssue, setActiveTab, busyActions = new Set() }: {
  issues: CivicIssue[];
  metrics: DashboardMetrics;
  onUpvote: (id: string) => Promise<void>;
  onVerify: (id: string) => Promise<void>;
  onNotAccurate: (id: string) => Promise<void>;
  onSelectIssue: (issue: CivicIssue) => void;
  setActiveTab: (tab: string) => void;
  busyActions?: Set<string>;
}) {
  const initial=useMemo(savedFilters,[]);
  const [query, setQuery] = useState(initial.query||"");
  const [status, setStatus] = useState(initial.status||"All");
  const [category, setCategory] = useState(initial.category||"All");
  const [severity, setSeverity] = useState(initial.severity||"All");
  const [dateRange, setDateRange] = useState(initial.dateRange||"All");
  const [heroes, setHeroes] = useState<ContributorSummary[]>([]);
  const [visibleCount, setVisibleCount] = useState(9);
  const [showMap, setShowMap] = useState(false);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(3);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    fetch("/api/contributors").then(response => response.ok ? response.json() : []).then(setHeroes).catch(() => setHeroes([]));
  }, [issues]);
  useEffect(()=>{sessionStorage.setItem(FILTER_KEY,JSON.stringify({query,status,category,severity,dateRange}));},[query,status,category,severity,dateRange]);

  const categories = useMemo(() => categoryOptions(issues.map(issue => issue.category)), [issues]);
  useEffect(() => { if (!categories.includes(category)) setCategory("All"); }, [categories, category]);
  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff = dateRange === "7" ? now - 7 * 86_400_000 : dateRange === "30" ? now - 30 * 86_400_000 : 0;
    return issues.filter(issue => {
      const text = `${issue.title} ${issue.address} ${issue.category} ${issue.description}`.toLowerCase();
      const locationMatch = !myLocation || (issue.lat !== undefined && issue.lng !== undefined && distanceKm(myLocation[0], myLocation[1], issue.lat, issue.lng) <= radius);
      return (status === "All" || (status === "open" ? !terminalStatuses.has(issue.status) : issue.status === status))
        && (category === "All" || issue.category === category)
        && (severity === "All" || issue.analysis?.vision?.severity === severity)
        && (!cutoff || new Date(issue.createdAt).getTime() >= cutoff)
        && text.includes(query.trim().toLowerCase())
        && locationMatch;
    });
  }, [issues, status, category, severity, dateRange, query, myLocation, radius]);
  const visible = filtered.slice(0, visibleCount);

  useEffect(() => setVisibleCount(9), [query, status, category, severity, dateRange, myLocation, radius]);

  const openIssue = (issue: CivicIssue) => {
    onSelectIssue(issue);
    setActiveTab("detail");
  };

  const useMyArea = () => {
    if (!navigator.geolocation) { setLocationMessage("Location is not supported by this browser. You can still use every public filter."); return; }
    setLocating(true);
    setLocationMessage("Your location is used only in this browser to filter nearby public reports. It is not saved or shared.");
    navigator.geolocation.getCurrentPosition(
      position => { setMyLocation([position.coords.latitude, position.coords.longitude]); setLocating(false); setShowMap(true); setLocationMessage("Showing public reports near your current area. Your location was not uploaded."); },
      () => { setLocating(false); setLocationMessage("Location permission was not granted. CivicGuardian still works with manual filters and map search."); },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><div className="text-[10px] font-black uppercase tracking-[.16em] text-teal-700">Bangladesh community safety</div><h1 className="mt-1.5 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Hazard map & public reports</h1><p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-500">Explore citizen evidence across Bangladesh, follow progress, and help corroborate reports. AI suggestions remain advisory.</p></div>
        <button type="button" onClick={() => setActiveTab("report")} className="rounded-lg bg-[#2c2927] px-5 py-3 font-semibold text-white hover:bg-[#413d39]">+ Report a hazard</button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Total reports", metrics.totalIssues, Users], ["Critical", metrics.criticalCount, ShieldAlert], ["Resolved", metrics.resolvedIssues, CheckCircle2], ["Verified actions", metrics.totalVerifiedCount || 0, ThumbsUp]].map(([label, value, Icon]: any) => <div key={label} className="flex items-center gap-4 rounded-2xl border border-[#ded9d4] bg-white px-5 py-5 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#bdecfb]"><Icon className="h-5 w-5 text-[#2c2927]" /></span><div><div className="text-2xl font-bold leading-none text-[#2c2927]">{value}</div><div className="mt-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">{label}</div></div></div>)}</section>

      <section className="rounded-xl border border-sky-200 bg-sky-50 p-3.5" aria-labelledby="my-area-heading">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div><div id="my-area-heading" className="flex items-center gap-2 text-sm font-black text-sky-950"><Crosshair className="h-4 w-4" />My Area</div><p className="mt-1 max-w-2xl text-xs leading-5 text-sky-900">See nearby open hazards without creating an account preference or storing your private location. Permission is requested only when you click the button.</p></div>
          <div className="flex flex-wrap gap-2">
            {myLocation && <label className="flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-slate-700">Within<select value={radius} onChange={event => setRadius(Number(event.target.value))} className="bg-transparent py-2.5 outline-none">{[1, 3, 5, 10].map(value => <option key={value} value={value}>{value} km</option>)}</select></label>}
            <button type="button" onClick={useMyArea} disabled={locating} className="rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{locating ? "Finding area..." : myLocation ? "Refresh my area" : "Use my current area"}</button>
            {myLocation && <button type="button" onClick={() => { setMyLocation(null); setLocationMessage(""); }} className="rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-bold text-sky-900">Clear</button>}
          </div>
        </div>
        {locationMessage && <p className="mt-3 text-xs text-sky-900" role="status">{locationMessage}</p>}
        {myLocation && <div className="mt-3 rounded-xl bg-white/75 px-3 py-2 text-xs font-bold text-sky-950">{filtered.filter(issue=>issue.analysis?.vision?.severity==="Critical").length} critical AI-flagged report{filtered.filter(issue=>issue.analysis?.vision?.severity==="Critical").length===1?"":"s"} within this view. Treat AI severity as advisory and follow verified safety guidance.</div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(4,.7fr)]">
          <label className="relative"><span className="sr-only">Search reports</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reports or locations" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-600" /></label>
          <label><span className="sr-only">Category</span><select value={category} onChange={event => setCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{categories.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span className="sr-only">Status</span><select value={status} onChange={event => setStatus(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{[["All", "All statuses"], ["open", "Open"], ["under_review", "Under review"], ["in_progress", "In progress"], ["resolved", "Resolved"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">AI severity</span><select value={severity} onChange={event => setSeverity(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{["All", "Critical", "High", "Medium", "Low"].map(value => <option key={value} value={value}>{value === "All" ? "All severities" : `${value} severity`}</option>)}</select></label>
          <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Date range</span><select value={dateRange} onChange={event => setDateRange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm">{[["All", "Any date"], ["7", "Last 7 days"], ["30", "Last 30 days"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><ListFilter className="h-4 w-4" />{filtered.length} matching public report{filtered.length === 1 ? "" : "s"}</span><button type="button" onClick={() => setShowMap(value => !value)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Map className="h-4 w-4" />{showMap ? "Hide map" : "Show interactive map"}</button></div>
      </section>

      {showMap && <Suspense fallback={<div className="cg-skeleton h-[470px] rounded-xl" aria-label="Loading interactive map" />}><MapView issues={filtered} onSelectIssue={openIssue} /></Suspense>}

      <section className="overflow-hidden rounded-2xl border border-[#514c48] bg-[#2c2927] p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.12em] text-[#e0ff89]"><Award className="h-4 w-4" />Community heroes</div><h2 className="mt-2 text-2xl font-bold">Top citizen contributors</h2><p className="mt-2 leading-6 text-slate-300">Only real citizen activity earns points. Administrator accounts and workflow actions are excluded from the leaderboard.</p></div><button type="button" onClick={() => setActiveTab("heroes")} className="rounded-lg border border-[#5bcff4] px-4 py-2.5 font-semibold text-[#bdecfb] hover:bg-[#5bcff4]/10">View full leaderboard →</button></div>
        {heroes.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{heroes.slice(0, 8).map((hero, index) => <div key={hero.id} className="rounded-lg border border-[#625c57] bg-[#383431] p-3"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-sky-400/10 text-[10px] font-black text-[#e0ff89]">#{index + 1}</span><div className="min-w-0"><div className="truncate text-xs font-extrabold text-slate-100">{hero.name}</div><div className="text-[9px] font-bold text-slate-500">{hero.score} contribution points</div></div></div></div>)}</div> : <div className="mt-4 rounded-lg border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">No citizen ranking yet. CivicGuardian will not invent leaderboard entries.</div>}
      </section>

      <section aria-labelledby="report-list-heading">
        <h2 id="report-list-heading" className="sr-only">Filtered public reports</h2>
        {visible.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{visible.map(issue => {
          const issueSeverity = issue.analysis?.vision?.severity || "Unassessed";
          const busy = busyActions.has(issue.id);
          return <article key={issue.id} className="overflow-hidden rounded-2xl border border-[#ded9d4] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><button type="button" onClick={() => openIssue(issue)} className="block w-full text-left"><IssueImage src={issue.imageUrl} alt={`Citizen evidence for ${issue.title}`} className="h-44 w-full object-cover" /><div className="p-5"><div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold uppercase tracking-wider text-[#2c2927]">{issue.category}</span><span className="rounded-full bg-[#f4f2ef] px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-600">{issue.status.replaceAll("_", " ")}</span></div><h3 className="mt-2 line-clamp-2 text-[17px] font-bold text-[#2c2927]">{issue.title}</h3><p className="mt-2 flex items-start gap-1.5 text-[14px] text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ff964a]" />{issue.address}</p><div className="mt-3 text-[13px] font-semibold text-slate-500">AI severity: <span className="text-slate-800">{issueSeverity}</span></div></div></button><div className="grid grid-cols-3 border-t border-slate-100 text-[13px] font-semibold"><button type="button" disabled={busy} onClick={() => void onUpvote(issue.id)} className={`p-3.5 hover:bg-[#f4f2ef] disabled:opacity-50 ${issue.isUpvotedByMe ? "text-teal-700" : "text-slate-600"}`} aria-pressed={issue.isUpvotedByMe}>Support {issue.upvotes}</button><button type="button" disabled={busy} onClick={() => void onVerify(issue.id)} className={`border-x border-slate-100 p-3.5 hover:bg-[#f4f2ef] disabled:opacity-50 ${issue.isVerifiedByMe ? "text-teal-700" : "text-slate-600"}`} aria-pressed={issue.isVerifiedByMe}>Confirm {issue.verifiedByCount}</button><button type="button" disabled={busy} onClick={() => void onNotAccurate(issue.id)} className={`p-3.5 hover:bg-[#f4f2ef] disabled:opacity-50 ${issue.isNotAccurateByMe ? "text-red-600" : "text-slate-600"}`} aria-pressed={issue.isNotAccurateByMe}>Dispute</button></div></article>;
        })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Search className="mx-auto h-7 w-7 text-slate-400" /><div className="mt-3 font-bold text-slate-700">No reports match these filters</div><p className="mt-1 text-sm text-slate-500">Clear a filter or expand your My Area distance.</p></div>}
        {visibleCount < filtered.length && <div className="mt-6 text-center"><button type="button" onClick={() => setVisibleCount(count => count + 9)} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:border-teal-500">Load 9 more reports</button></div>}
      </section>
    </main>
  );
}
