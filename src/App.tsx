import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import ReportIssuePage from "./components/ReportIssuePage";
import CommunityDashboard from "./components/CommunityDashboard";
import IssueDetailPage from "./components/IssueDetailPage";
import AdminConsole from "./components/AdminConsole";
import CitizenDashboard from "./components/CitizenDashboard";
import CommunityHeroes from "./components/CommunityHeroes";
import NotificationsCenter from "./components/NotificationsCenter";
import AuthModal from "./components/AuthModal";
import { AppUser, CivicIssue, DashboardMetrics } from "./types";
import { ShieldAlert, AlertCircle } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("landing");
  const [issues, setIssues] = useState<CivicIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<CivicIssue | null>(null);
  const [stats, setStats] = useState<DashboardMetrics>({
    totalIssues: 0,
    resolvedIssues: 0,
    averageConfidence: 0,
    criticalCount: 0,
    categoryDistribution: {}
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [user,setUser]=useState<AppUser|null>(null);
  const [authOpen,setAuthOpen]=useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [issuesRes, statsRes] = await Promise.all([
        fetch("/api/issues"),
        fetch("/api/stats")
      ]);

      if (!issuesRes.ok || !statsRes.ok) {
        throw new Error("Failed to load records from database.");
      }

      const issuesData = await issuesRes.json();
      const statsData = await statsRes.json();

      setIssues(issuesData);
      setStats(statsData);
      
      // Keep selectedIssue synced with latest database state if open
      if (selectedIssue) {
        const updatedSelected = issuesData.find((i: CivicIssue) => i.id === selectedIssue.id);
        if (updatedSelected) {
          setSelectedIssue(updatedSelected);
        }
      }
      
      setErrorMsg("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Unable to synchronize with the CivicGuardian service. Please verify server connectivity.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetch("/api/auth/me").then(r=>r.json()).then(d=>setUser(d.user||null)).catch(()=>{});
  }, []);

  useEffect(() => {
    if (!user && ["citizen", "notifications", "admin"].includes(activeTab)) setActiveTab("landing");
    else if (user && user.role !== "admin" && activeTab === "admin") setActiveTab("citizen");
  }, [activeTab, user]);

  const requireUser=()=>{if(!user){setAuthOpen(true);return false;}return true;};

  // Handle Upvoting
  const handleUpvote = async (id: string) => {
    if(!requireUser()) return;
    try {
      const res = await fetch(`/api/issues/${id}/upvote`, {
        method: "POST"
      });
      if (res.ok) {
        const updatedIssue = await res.json();
        // Update issues list state
        setIssues(prev => prev.map(item => item.id === id ? updatedIssue : item));
        // Sync detail view state if viewing
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updatedIssue);
        }
      }
    } catch (err) {
      console.error("Error toggling upvote:", err);
    }
  };

  // Handle Verification
  const handleVerify = async (id: string) => {
    if(!requireUser()) return;
    try {
      const res = await fetch(`/api/issues/${id}/verify`, {
        method: "POST"
      });
      if (res.ok) {
        const updatedIssue = await res.json();
        setIssues(prev => prev.map(item => item.id === id ? updatedIssue : item));
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updatedIssue);
        }
      }
    } catch (err) {
      console.error("Error toggling verification:", err);
    }
  };

  // Handle Not Accurate
  const handleNotAccurate = async (id: string) => {
    if(!requireUser()) return;
    try {
      const res = await fetch(`/api/issues/${id}/not-accurate`, {
        method: "POST"
      });
      if (res.ok) {
        const updatedIssue = await res.json();
        setIssues(prev => prev.map(item => item.id === id ? updatedIssue : item));
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updatedIssue);
        }
      }
    } catch (err) {
      console.error("Error toggling not-accurate:", err);
    }
  };

  // Handle Add Comment
  const handleAddComment = async (id: string, author: string, text: string) => {
    if(!requireUser()) return;
    try {
      const res = await fetch(`/api/issues/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, text })
      });
      if (res.ok) {
        const updatedIssue = await res.json();
        setIssues(prev => prev.map(item => item.id === id ? updatedIssue : item));
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updatedIssue);
        }
      }
    } catch (err) {
      console.error("Error posting comment:", err);
    }
  };

  // Handle Add Additional Image
  const handleAddImage = async (id: string, imageUrl: string) => {
    if(!requireUser()) return;
    try {
      const res = await fetch(`/api/issues/${id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl })
      });
      if (res.ok) {
        const updatedIssue = await res.json();
        setIssues(prev => prev.map(item => item.id === id ? updatedIssue : item));
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updatedIssue);
        }
      }
    } catch (err) {
      console.error("Error adding image:", err);
    }
  };

  // Handle Status Update (Municipal Command)
  const handleUpdateStatus = async (id: string, nextStatus: string) => {
    if(!user || user.role!=="admin") { setAuthOpen(true); return; }
    try {
      const res = await fetch(`/api/issues/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextStatus })
      });
      if (res.ok) {
        const updatedIssue = await res.json();
        setIssues(prev => prev.map(item => item.id === id ? updatedIssue : item));
        setSelectedIssue(updatedIssue);
        
        // Refresh stats database
        const statsRes = await fetch("/api/stats");
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      }
    } catch (err) {
      console.error("Error advancing status timeline:", err);
    }
  };

  // Handle New Issue Submit (called by child form)
  const handleSubmitIssue = async (issuePayload: any): Promise<CivicIssue> => {
    if(!user){setAuthOpen(true);throw new Error("Please sign in with Google before submitting a report.");}
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(issuePayload)
    });

    if (!res.ok) {
      const body=await res.json().catch(()=>({}));
      throw new Error(body.error||"Failed to process the report.");
    }

    const createdIssue = await res.json();
    
    // Optimistic / Immediate State Update
    setIssues(prev => [createdIssue, ...prev]);
    
    // Refresh stats
    const statsRes = await fetch("/api/stats");
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      setStats(statsData);
    }

    return createdIssue;
  };

  return (
    <div id="app-root" className="min-h-screen bg-[#f4f7f6] text-slate-900 flex flex-col justify-between selection:bg-teal-200 selection:text-teal-950">
      
      {/* Global Navbar */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        stats={{
          totalIssues: stats.totalIssues,
          resolvedIssues: stats.resolvedIssues,
          criticalCount: stats.criticalCount
        }}
        user={user}
        onAuth={()=>setAuthOpen(true)}
        onLogout={async()=>{await fetch("/api/auth/logout",{method:"POST"});setUser(null);setActiveTab("landing");await fetchData();}}
      />

      {/* Main Page Routing Wrapper */}
      <main id="app-main-content" className="flex-grow">
        {isLoading && issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 font-mono">
            <span className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"></span>
            <span className="text-xs text-gray-500">SYNCHRONIZING CIVIC DATABASE...</span>
          </div>
        ) : errorMsg ? (
          <div className="max-w-md mx-auto my-16 p-6 border border-red-900 bg-red-950/30 rounded-2xl text-center space-y-4 font-mono text-xs">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-red-400 font-bold">COMMUNICATION OUTAGE</p>
            <p className="text-gray-400">{errorMsg}</p>
            <button 
              onClick={fetchData} 
              className="px-4 py-2 bg-gray-900 border border-red-900 hover:bg-gray-800 text-white rounded-lg transition-all cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {activeTab === "landing" && (
                <LandingPage 
                  setActiveTab={setActiveTab} 
                  recentIssues={issues}
                  setSelectedIssue={setSelectedIssue}
                  user={user}
                />
              )}

              {activeTab === "dashboard" && (
                <CommunityDashboard 
                  issues={issues}
                  metrics={stats}
                  onUpvote={handleUpvote}
                  onVerify={handleVerify}
                  onNotAccurate={handleNotAccurate}
                  onSelectIssue={setSelectedIssue}
                  setActiveTab={setActiveTab}
                />
              )}

              {activeTab === "citizen" && user && (
                <CitizenDashboard user={user} onReport={()=>setActiveTab("report")} onOpenReport={(issue)=>{setSelectedIssue(issue);setActiveTab("detail");}} />
              )}

              {activeTab === "heroes" && <CommunityHeroes />}

              {activeTab === "notifications" && user && <NotificationsCenter />}

              {activeTab === "report" && (
                <ReportIssuePage 
                  onSubmit={handleSubmitIssue}
                  setActiveTab={setActiveTab}
                  setSelectedIssue={setSelectedIssue}
                />
              )}

              {activeTab === "detail" && selectedIssue && (
                <IssueDetailPage 
                  issue={selectedIssue}
                  allIssues={issues}
                  onBack={() => setActiveTab("dashboard")}
                  onUpvote={handleUpvote}
                  onVerify={handleVerify}
                  onNotAccurate={handleNotAccurate}
                  onUpdateStatus={handleUpdateStatus}
                  onAddComment={(author, text) => handleAddComment(selectedIssue.id, author, text)}
                  onAddImage={(imageUrl) => handleAddImage(selectedIssue.id, imageUrl)}
                  onSelectIssue={setSelectedIssue}
                  setActiveTab={setActiveTab}
                />
              )}

              {activeTab === "admin" && user?.role === "admin" && (
                <AdminConsole issues={issues} metrics={stats} onSelect={(issue)=>{setSelectedIssue(issue);setActiveTab("detail");}} onStatus={async(id,status)=>{await handleUpdateStatus(id,status);await fetchData();}} />
              )}
            </motion.div>
          </AnimatePresence>
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer id="app-footer" className="border-t border-slate-200 bg-white py-8 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-teal-700" />
            <span>CivicGuardian © 2026 · Community Hazard Reporting and Public Safety Management System</span>
          </div>
          <div className="flex gap-4">
            <span className="text-slate-400">AI assessments are advisory</span>
            <span className="text-slate-400">Coverage: Dhaka</span>
          </div>
        </div>
      </footer>

      <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)} onAuthenticated={async u=>{setUser(u);await fetchData();}} />

    </div>
  );
}
