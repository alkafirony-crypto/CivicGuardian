import React from "react";
import {
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  BrainCircuit,
  Camera,
  CheckCircle2,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { AppUser, CivicIssue } from "../types";
import { IssueImage } from "./common/IssueImage";

export default function LandingPage({
  setActiveTab,
  recentIssues,
  setSelectedIssue,
  user,
}: {
  setActiveTab: (s: string) => void;
  recentIssues: CivicIssue[];
  setSelectedIssue: (i: CivicIssue) => void;
  user: AppUser | null;
}) {
  const publicAreas = [
    [MapPinned, "Map & Reports", "Public", "Explore citizen reports on the Bangladesh hazard map.", "dashboard"],
    [Award, "Community Heroes", "Public", "See civic recognition earned from recorded activity.", "heroes"],
  ] as const;
  const citizenAreas = user ? [
    [LayoutDashboard, "Citizen Dashboard", "Private", "Track your reports and their progress in one workspace.", "citizen"],
    [Bell, "Notifications", "Private", "See report, review and status-change updates.", "notifications"],
  ] as const : [];
  const adminAreas = user?.role === "admin" ? [
    [BarChart3, "Admin Dashboard", "Admin", "Review evidence and manage report status operations.", "admin"],
  ] as const : [];
  const platformAreas = [...publicAreas, ...citizenAreas, ...adminAreas];

  return (
    <div>
      <section className="cg-landing-hero relative overflow-hidden border-b border-[#514c48] text-white">
        <div className="pointer-events-none absolute -bottom-40 left-[22%] h-[420px] w-[420px] rounded-full bg-[#ff964a]/10 blur-3xl" />
        <div className="relative z-[1] mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-[#e0ff89] px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[.04em] text-[#2c2927]">
              <ShieldCheck className="h-3.5 w-3.5" /> Community hazard reporting across Bangladesh
            </div>
            <h1 className="cg-hero-title mt-6 max-w-3xl font-extrabold text-white">
              See a public hazard?<br />
              <span className="text-[#5bcff4]">Report what is really there.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-7 text-slate-200">
              CivicGuardian helps people across Bangladesh submit real photos and precise locations for road, drainage, electrical, waste, fire, gas and public-safety issues. AI assists with classification; people remain in control.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => setActiveTab("report")} className="cg-highvis flex min-h-12 items-center gap-2 rounded-lg px-5 py-3 text-[15px] font-bold shadow-lg transition hover:-translate-y-0.5">
                Report a hazard <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => setActiveTab("dashboard")} className="flex min-h-12 items-center gap-2 rounded-lg border border-[#77716c] bg-white/[.04] px-5 py-3 text-[15px] font-semibold text-white transition hover:border-[#5bcff4] hover:bg-white/[.08]">
                <MapPinned className="h-4 w-4 text-[#5bcff4]" /> Explore Bangladesh map
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-[13px] font-medium text-slate-300">
              <span className="flex items-center gap-2"><Camera className="h-4 w-4 text-[#e0ff89]" />Citizen evidence only</span>
              <span className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-[#e0ff89]" />Real report coordinates</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#e0ff89]" />Human-controlled status</span>
            </div>
          </div>

          <div className="cg-hero-panel rounded-2xl border p-6 shadow-2xl shadow-black/20 sm:p-8">
            <div className="text-[13px] font-semibold uppercase tracking-[.1em] text-[#e0ff89]">Bangladesh service area</div>
            <h2 className="mt-3 text-[28px] font-bold tracking-tight text-white">One map for civic hazards across Bangladesh.</h2>
            <p className="mt-4 text-[15px] leading-6 text-slate-300">
              CivicGuardian does not tie report categories to preset neighborhoods. The location comes from GPS, map selection or address search.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[[MapPinned, "Bangladesh-wide map"], [Camera, "Real uploads"], [BrainCircuit, "AI advisory"], [Users, "Community checks"]].map(([Icon, text]: any) => (
                <div key={text} className="rounded-xl border border-[#625c57] bg-[#2c2927]/70 p-4 transition hover:-translate-y-0.5 hover:border-[#5bcff4]">
                  <Icon className="h-5 w-5 text-[#5bcff4]" />
                  <div className="mt-3 text-[15px] font-semibold text-white">{text}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-[#625c57] bg-[#2c2927]/55 px-4 py-3 text-[13px] leading-5 text-slate-300">
              Independent community project. No government integration or official response is implied unless explicitly configured and verified.
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#ded9d4] bg-[#f4f2ef]">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-black uppercase tracking-[.18em] text-sky-700">Explore CivicGuardian</div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Explore the areas available to you.</h2>
            </div>
            <p className="max-w-lg text-xs leading-5 text-slate-500">Private citizen tools appear after sign-in. Administration is shown only to authorized admins.</p>
          </div>
          <div className={`mt-4 grid gap-3 md:grid-cols-2 ${platformAreas.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-2"}`}>
            {platformAreas.map(([Icon, title, access, description, tab]) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700"><Icon className="h-4 w-4" /></span>
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{access}</span>
                </div>
                <h3 className="mt-4 text-sm font-extrabold text-slate-900 group-hover:text-sky-800">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-5">
        <div className="max-w-2xl">
          <div className="text-xs font-black uppercase tracking-[.2em] text-sky-700">How it works</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Evidence first, then AI assistance</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            [Camera, "1. Capture evidence", "Upload or take a real photo and select the exact Bangladesh location. No generated incident imagery is used."],
            [BrainCircuit, "2. Review AI suggestion", "Gemini describes visible evidence, proposes a category and confidence, and flags uncertain or critical cases for review."],
            [Users, "3. Track human action", "Citizens can verify or dispute. Authorized CivicGuardian admins control review and resolution status with an audit trail."],
          ].map(([Icon, title, description]: any) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700"><Icon className="h-4 w-4" /></span>
              <h3 className="mt-3 text-[13px] font-black text-slate-900">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[.18em] text-sky-700">Public database</div>
              <h2 className="mt-1.5 text-xl font-black text-slate-950">Recent citizen reports</h2>
            </div>
            <button onClick={() => setActiveTab("dashboard")} className="text-sm font-bold text-sky-700 hover:text-sky-600">Open map →</button>
          </div>
          {recentIssues.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {recentIssues.slice(0, 3).map(issue => (
                <button key={issue.id} onClick={() => { setSelectedIssue(issue); setActiveTab("detail"); }} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md">
                  <IssueImage src={issue.imageUrl} alt={`Citizen evidence for ${issue.title}`} className="h-36 w-full object-cover" />
                  <div className="p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">{issue.category} · {issue.status.replaceAll("_", " ")}</div>
                    <div className="mt-1.5 font-bold text-slate-900">{issue.title}</div>
                    <div className="mt-2 text-xs text-slate-500">{issue.address}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Camera className="mx-auto h-7 w-7 text-slate-400" />
              <div className="mt-3 font-bold text-slate-700">No citizen reports yet</div>
              <p className="mt-1 text-sm text-slate-500">Real reports will appear here after submission. CivicGuardian does not seed fake incidents.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
