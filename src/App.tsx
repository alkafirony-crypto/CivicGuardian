import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CheckCircle2, ShieldAlert, WifiOff, X } from "lucide-react";
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import AuthModal from "./components/AuthModal";
import PwaStatus from "./components/PwaStatus";
import Logo from "./components/Logo";
import { apiJson, jsonRequest } from "./lib/api";
import { cacheIssues, clearIssueCache, readCachedIssues } from "./lib/issueCache";
import type { AppUser, CivicIssue, DashboardMetrics, ResolutionVerdict } from "./types";

const ReportIssuePage = lazy(() => import("./components/ReportIssuePage"));
const CommunityDashboard = lazy(() => import("./components/CommunityDashboard"));
const IssueDetailPage = lazy(() => import("./components/IssueDetailPage"));
const AdminConsole = lazy(() => import("./components/AdminConsole"));
const CitizenDashboard = lazy(() => import("./components/CitizenDashboard"));
const CommunityHeroes = lazy(() => import("./components/CommunityHeroes"));
const NotificationsCenter = lazy(() => import("./components/NotificationsCenter"));

type Tab = "landing" | "dashboard" | "citizen" | "heroes" | "notifications" | "report" | "detail" | "admin";
type Route = { tab: Tab; issueId?: string };

const emptyMetrics: DashboardMetrics = { totalIssues: 0, resolvedIssues: 0, averageConfidence: 0, criticalCount: 0, categoryDistribution: {} };
const protectedTabs = new Set<Tab>(["citizen", "notifications", "report", "admin"]);
const issueDataTabs = new Set<Tab>(["dashboard", "detail", "admin"]);

function routeFromHash(): Route {
  const path = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "reports" && parts[1]) return { tab: "detail", issueId: decodeURIComponent(parts[1]) };
  const routes: Record<string, Tab> = { home: "landing", reports: "dashboard", "my-reports": "citizen", heroes: "heroes", notifications: "notifications", report: "report", admin: "admin" };
  return { tab: routes[parts[0]] || "landing" };
}

function hashFor(tab: Tab, issueId?: string) {
  const routes: Record<Tab, string> = {
    landing: "#/home", dashboard: "#/reports", citizen: "#/my-reports", heroes: "#/heroes",
    notifications: "#/notifications", report: "#/report", detail: `#/reports/${encodeURIComponent(issueId || "")}`, admin: "#/admin",
  };
  return routes[tab];
}

function metricsFromIssues(issues: CivicIssue[]): DashboardMetrics {
  const analyzed = issues.filter(issue => issue.analysis?.vision?.confidence !== undefined);
  const categories: Record<string, number> = {};
  for (const issue of issues) categories[issue.category] = (categories[issue.category] || 0) + 1;
  return {
    totalIssues: issues.length,
    resolvedIssues: issues.filter(issue => issue.status === "resolved").length,
    averageConfidence: analyzed.length ? Math.round(analyzed.reduce((total, issue) => total + (issue.analysis?.vision?.confidence || 0), 0) / analyzed.length) : 0,
    criticalCount: issues.filter(issue => issue.analysis?.vision?.severity === "Critical").length,
    categoryDistribution: categories,
    totalVerifiedCount: issues.reduce((total, issue) => total + issue.verifiedByCount, 0),
    totalPredictionsGenerated: analyzed.length,
  };
}

function PageFallback() {
  return <div className="mx-auto max-w-7xl space-y-5 px-5 py-10 sm:px-8" aria-label="Loading page"><div className="flex items-center gap-3"><Logo className="h-10 w-10" /><div className="cg-skeleton h-8 w-1/2 rounded-lg" /></div><div className="grid gap-5 md:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="cg-skeleton h-52 rounded-2xl" />)}</div></div>;
}

function SessionFallback() {
  return <div className="cg-dark-page min-h-[calc(100vh-72px)]"><div className="mx-auto max-w-7xl px-5 py-10 sm:px-8"><div className="rounded-2xl border border-[#514c48] bg-[#383431] p-6 text-white shadow-sm"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#e0ff89] text-[#2c2927]"><ShieldAlert className="h-5 w-5" /></div><div><div className="font-black">Restoring your secure session</div><p className="mt-0.5 text-sm text-[#d8d4d0]">Your page will appear as soon as sign-in is confirmed.</p></div></div></div></div></div>;
}

export default function App() {
  const initialRoute = useMemo(routeFromHash, []);
  const [activeTab, setActiveTab] = useState<Tab>(initialRoute.tab);
  const [routeIssueId, setRouteIssueId] = useState(initialRoute.issueId || "");
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [selectedIssue, setSelectedIssueState] = useState<CivicIssue | null>(null);
  const [stats, setStats] = useState<DashboardMetrics>(emptyMetrics);
  const [isLoading, setIsLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [requestedTab, setRequestedTab] = useState<Tab | null>(null);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const reduceMotion = useReducedMotion();

  const showToast = useCallback((kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(current => current?.message === message ? null : current), 4500);
  }, []);

  const replaceIssue = useCallback((updated: CivicIssue) => {
    setIssues(current => current.some(issue => issue.id === updated.id)
      ? current.map(issue => issue.id === updated.id ? updated : issue)
      : [updated, ...current]);
    setSelectedIssueState(current => current?.id === updated.id ? updated : current);
  }, []);

  const setSelectedIssue = useCallback((issue: CivicIssue) => {
    setSelectedIssueState(issue);
    setRouteIssueId(issue.id);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [issueRows, metricRows] = await Promise.all([
        apiJson<CivicIssue[]>("/api/issues?limit=200"),
        apiJson<DashboardMetrics>("/api/stats"),
      ]);
      setIssues(issueRows); setStats(metricRows); setErrorMsg(""); setOfflineMode(false);
      setSelectedIssueState(current => current ? issueRows.find(issue => issue.id === current.id) || current : current);
      void cacheIssues(issueRows).catch(() => undefined);
    } catch (error) {
      const cached = await readCachedIssues().catch(() => []);
      if (cached.length) {
        setIssues(cached); setStats(metricsFromIssues(cached)); setOfflineMode(true); setErrorMsg("");
      } else {
        setErrorMsg(error instanceof Error ? error.message : "Unable to synchronize with the CivicGuardian service.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void readCachedIssues()
      .then(cached => {
        if (!active || !cached.length) return;
        setIssues(current => current.length ? current : cached);
        setStats(current => current.totalIssues ? current : metricsFromIssues(cached));
        setIsLoading(false);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) void fetchData();
      });
    apiJson<{ user: AppUser | null }>("/api/auth/me")
      .then(data => setUser(data.user || null))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
    return () => { active = false; };
  }, [fetchData]);

  const navigate = useCallback((tabName: string) => {
    const tab = tabName as Tab;
    if (protectedTabs.has(tab) && !user) {
      setRequestedTab(tab);
      setAuthOpen(true);
      return;
    }
    if (tab === "admin" && user?.role !== "admin") {
      showToast("error", "Administrator access is required for that page.");
      return;
    }
    setActiveTab(tab);
    if (tab !== "detail") {
      const nextHash = hashFor(tab);
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [user, reduceMotion, showToast]);

  useEffect(() => {
    const handleHash = () => {
      const route = routeFromHash();
      setRouteIssueId(route.issueId || "");
      if (protectedTabs.has(route.tab) && authReady && !user) {
        setRequestedTab(route.tab); setAuthOpen(true); setActiveTab("landing");
        return;
      }
      if (route.tab === "admin" && user?.role !== "admin") { setActiveTab(user ? "citizen" : "landing"); return; }
      setActiveTab(route.tab);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    if (protectedTabs.has(activeTab) && !user) {
      setRequestedTab(activeTab); setAuthOpen(true); setActiveTab("landing");
    } else if (activeTab === "admin" && user?.role !== "admin") {
      setActiveTab(user ? "citizen" : "landing");
    }
  }, [activeTab, authReady, user]);

  useEffect(() => {
    if (activeTab !== "detail") return;
    const id = routeIssueId || selectedIssue?.id;
    if (!id) { navigate("dashboard"); return; }
    const known = issues.find(issue => issue.id === id);
    if (known) setSelectedIssueState(known);
    else apiJson<CivicIssue>(`/api/issues/${encodeURIComponent(id)}`).then(issue => { replaceIssue(issue); setSelectedIssueState(issue); }).catch(() => { showToast("error", "That report could not be found."); navigate("dashboard"); });
  }, [activeTab, routeIssueId, issues, selectedIssue?.id, navigate, replaceIssue, showToast]);

  useEffect(() => {
    if (activeTab === "detail" && selectedIssue) {
      const nextHash = hashFor("detail", selectedIssue.id);
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
    }
  }, [activeTab, selectedIssue]);

  const requireUser = () => {
    if (!user) { setAuthOpen(true); return false; }
    return true;
  };

  const markBusy = (id: string, value: boolean) => setBusyActions(current => {
    const next = new Set(current);
    value ? next.add(id) : next.delete(id);
    return next;
  });

  const optimisticIssueAction = async (id: string, endpoint: string, update: (issue: CivicIssue) => CivicIssue) => {
    if (!requireUser() || busyActions.has(id)) return;
    const snapshot = issues.find(issue => issue.id === id) || (selectedIssue?.id === id ? selectedIssue : undefined);
    if (!snapshot) return;
    replaceIssue(update(snapshot)); markBusy(id, true);
    try { replaceIssue(await apiJson<CivicIssue>(endpoint, { method: "POST" })); }
    catch (error) { replaceIssue(snapshot); showToast("error", error instanceof Error ? error.message : "The action could not be saved."); }
    finally { markBusy(id, false); }
  };

  const handleUpvote = (id: string) => optimisticIssueAction(id, `/api/issues/${id}/upvote`, issue => ({ ...issue, isUpvotedByMe: !issue.isUpvotedByMe, upvotes: Math.max(0, issue.upvotes + (issue.isUpvotedByMe ? -1 : 1)) }));
  const handleVerify = (id: string) => optimisticIssueAction(id, `/api/issues/${id}/verify`, issue => ({
    ...issue,
    isVerifiedByMe: !issue.isVerifiedByMe,
    isNotAccurateByMe: false,
    verifiedByCount: Math.max(0, issue.verifiedByCount + (issue.isVerifiedByMe ? -1 : 1)),
    notAccurateCount: Math.max(0, (issue.notAccurateCount || 0) - (issue.isNotAccurateByMe ? 1 : 0)),
  }));
  const handleNotAccurate = (id: string) => optimisticIssueAction(id, `/api/issues/${id}/not-accurate`, issue => ({
    ...issue,
    isNotAccurateByMe: !issue.isNotAccurateByMe,
    isVerifiedByMe: false,
    notAccurateCount: Math.max(0, (issue.notAccurateCount || 0) + (issue.isNotAccurateByMe ? -1 : 1)),
    verifiedByCount: Math.max(0, issue.verifiedByCount - (issue.isVerifiedByMe ? 1 : 0)),
  }));
  const handleFollow = (id: string) => optimisticIssueAction(id, `/api/issues/${id}/follow`, issue => ({ ...issue, isFollowedByMe: !issue.isFollowedByMe, followersCount: Math.max(0, (issue.followersCount || 0) + (issue.isFollowedByMe ? -1 : 1)) }));

  const handleResolutionFeedback = async (id: string, verdict: ResolutionVerdict) => {
    if (!requireUser() || busyActions.has(id)) return;
    markBusy(id, true);
    try {
      const updated = await apiJson<CivicIssue>(`/api/issues/${id}/resolution-feedback`, jsonRequest("POST", { verdict }));
      replaceIssue(updated);
      showToast("success", updated.status === "under_review" ? "The report has returned to review." : "Your resolution feedback was recorded.");
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Feedback could not be saved."); throw error; }
    finally { markBusy(id, false); }
  };

  const handleAddComment = async (id: string, _author: string, text: string) => {
    if (!requireUser()) throw new Error("Please sign in before commenting.");
    const snapshot = issues.find(issue => issue.id === id) || selectedIssue;
    if (!snapshot) throw new Error("Report not found.");
    const optimistic = { ...snapshot, comments: [...(snapshot.comments || []), { id: `pending-${Date.now()}`, author: user!.name, text, createdAt: new Date().toISOString() }] };
    replaceIssue(optimistic);
    try { replaceIssue(await apiJson<CivicIssue>(`/api/issues/${id}/comments`, jsonRequest("POST", { text }))); }
    catch (error) { replaceIssue(snapshot); throw error; }
  };

  const handleAddImage = async (id: string, imageUrl: string) => {
    if (!requireUser()) throw new Error("Please sign in before adding evidence.");
    const snapshot = issues.find(issue => issue.id === id) || selectedIssue;
    if (!snapshot) throw new Error("Report not found.");
    replaceIssue({ ...snapshot, additionalImages: [...(snapshot.additionalImages || []), imageUrl] });
    try { replaceIssue(await apiJson<CivicIssue>(`/api/issues/${id}/images`, jsonRequest("POST", { imageUrl }))); }
    catch (error) { replaceIssue(snapshot); throw error; }
  };

  const handleUpdateStatus = async (id: string, nextStatus: string, details?: { note?: string; afterImage?: string }) => {
    if (!user || user.role !== "admin") throw new Error("Administrator access is required.");
    markBusy(id, true);
    try {
      const updated = await apiJson<CivicIssue>(`/api/issues/${id}/resolve`, jsonRequest("POST", { nextStatus, ...details }));
      replaceIssue(updated); setStats(metricsFromIssues(issues.map(issue => issue.id === id ? updated : issue)));
      showToast("success", nextStatus === "resolved" ? "Resolution proof published for citizen confirmation." : "Report status updated.");
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Status update failed."); throw error; }
    finally { markBusy(id, false); }
  };

  const handleSubmitIssue = async (payload: any): Promise<CivicIssue> => {
    if (!user) { setAuthOpen(true); throw new Error("Please sign in with Google before submitting a report."); }
    const created = await apiJson<CivicIssue>("/api/issues", jsonRequest("POST", payload), 35_000);
    replaceIssue(created);
    setStats(current => current.totalIssues && issues.some(issue => issue.id === created.id) ? current : metricsFromIssues([created, ...issues]));
    void cacheIssues([created, ...issues]).catch(() => undefined);
    showToast("success", `Report ${created.id} was submitted successfully.`);
    return created;
  };

  const handleLogout = async () => {
    const signedInUser = user;
    setUser(null); setAuthOpen(false); setSelectedIssueState(null); setActiveTab("landing"); window.location.hash = hashFor("landing");
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
      await clearIssueCache().catch(() => undefined);
      await fetchData();
    } catch (error) {
      setUser(signedInUser);
      showToast("error", error instanceof Error ? error.message : "Sign out did not complete. Please try again.");
    }
  };

  const authenticated = async (authenticatedUser: AppUser) => {
    setUser(authenticatedUser); setAuthReady(true); setAuthOpen(false);
    await fetchData();
    if (requestedTab) {
      const next = requestedTab;
      setRequestedTab(null);
      if (next === "admin" && authenticatedUser.role !== "admin") {
        setActiveTab("citizen"); window.location.hash = hashFor("citizen");
      } else {
        setActiveTab(next); window.location.hash = hashFor(next);
      }
    }
  };

  return (
    <div id="app-root" className="flex min-h-screen flex-col justify-between bg-[#f4f2ef] text-[#2c2927] selection:bg-[#e0ff89] selection:text-[#2c2927]">
      <a href="#app-main-content" className="cg-skip-link">Skip to main content</a>
      <Navbar activeTab={activeTab} setActiveTab={navigate} stats={{ totalIssues: stats.totalIssues, resolvedIssues: stats.resolvedIssues, criticalCount: stats.criticalCount }} user={user} onAuth={() => setAuthOpen(true)} onLogout={handleLogout} />

      {offlineMode && <div className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900" role="status"><WifiOff className="h-4 w-4" />Offline view: showing previously loaded public reports. Actions and submission will resume when connected.</div>}

      <main id="app-main-content" className="flex-grow" tabIndex={-1}>
        {activeTab === "landing" && errorMsg && !issues.length && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900" role="status">Live report data is still connecting. You can explore CivicGuardian now or <button type="button" onClick={() => void fetchData()} className="font-black underline underline-offset-2">retry</button>.</div>}
        {protectedTabs.has(activeTab) && !authReady ? <SessionFallback /> : issueDataTabs.has(activeTab) && isLoading && !issues.length ? <PageFallback /> : issueDataTabs.has(activeTab) && errorMsg && !issues.length ? <div className="mx-auto my-16 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><AlertCircle className="mx-auto h-8 w-8 text-red-600" /><p className="mt-3 font-black text-red-800">CivicGuardian is temporarily unavailable</p><p className="mt-2 text-sm leading-6 text-slate-600">{errorMsg}</p><button type="button" onClick={() => void fetchData()} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Retry connection</button></div> : <Suspense fallback={<PageFallback />}><AnimatePresence mode="wait"><motion.div key={activeTab} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: reduceMotion ? 0 : .18 }}>
          {activeTab === "landing" && <LandingPage setActiveTab={navigate} recentIssues={issues} setSelectedIssue={issue => { setSelectedIssue(issue); setActiveTab("detail"); }} user={user} />}
          {activeTab === "dashboard" && <CommunityDashboard issues={issues} metrics={stats} onUpvote={handleUpvote} onVerify={handleVerify} onNotAccurate={handleNotAccurate} onSelectIssue={issue => { setSelectedIssue(issue); setActiveTab("detail"); }} setActiveTab={navigate} busyActions={busyActions} />}
          {activeTab === "citizen" && user && <CitizenDashboard user={user} onReport={() => navigate("report")} onOpenReport={issue => { setSelectedIssue(issue); setActiveTab("detail"); }} />}
          {activeTab === "heroes" && <CommunityHeroes />}
          {activeTab === "notifications" && user && <NotificationsCenter />}
          {activeTab === "report" && user && <ReportIssuePage onSubmit={handleSubmitIssue} setActiveTab={navigate} setSelectedIssue={setSelectedIssue} />}
          {activeTab === "detail" && selectedIssue && <IssueDetailPage issue={selectedIssue} allIssues={issues} onBack={() => navigate("dashboard")} onUpvote={handleUpvote} onVerify={handleVerify} onNotAccurate={handleNotAccurate} onFollow={handleFollow} onResolutionFeedback={handleResolutionFeedback} onUpdateStatus={handleUpdateStatus} onAddComment={(author, text) => handleAddComment(selectedIssue.id, author, text)} onAddImage={imageUrl => handleAddImage(selectedIssue.id, imageUrl)} busy={busyActions.has(selectedIssue.id)} />}
          {activeTab === "admin" && user?.role === "admin" && <AdminConsole issues={issues} metrics={stats} currentUser={user} onSelect={issue => { setSelectedIssue(issue); setActiveTab("detail"); }} onStatus={async (id, status, details) => { await handleUpdateStatus(id, status, details); await fetchData(); }} />}
        </motion.div></AnimatePresence></Suspense>}
      </main>

      <footer className="border-t border-[#ded9d4] bg-white px-5 py-6 text-center text-[13px] text-slate-600"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#2c2927]" /><span>CivicGuardian © 2026 · Independent Bangladesh community safety project</span></div><div className="flex flex-wrap justify-center gap-4"><span>AI assessments are advisory</span><span>Coverage: Bangladesh</span><span>No official emergency dispatch</span></div></div></footer>

      <AuthModal open={authOpen} onClose={() => { setAuthOpen(false); setRequestedTab(null); }} onAuthenticated={authenticated} />
      <PwaStatus />
      {toast && <div className={`fixed right-4 top-20 z-[1300] flex max-w-sm items-start gap-3 rounded-2xl border p-4 text-sm shadow-2xl ${toast.kind === "success" ? "border-teal-200 bg-white text-teal-950" : "border-red-200 bg-white text-red-900"}`} role="status">{toast.kind === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}<span className="flex-1">{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Dismiss message"><X className="h-4 w-4" /></button></div>}
    </div>
  );
}
