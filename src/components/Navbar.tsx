import React from "react";
import { Award, BarChart3, Bell, ChevronDown, LayoutDashboard, LogIn, MapPinned, PlusCircle, ShieldCheck } from "lucide-react";
import type { AppUser } from "../types";

type Props={activeTab:string;setActiveTab:(s:string)=>void;stats?:any;user:AppUser|null;onAuth:()=>void;onLogout:()=>void};

export default function Navbar({activeTab,setActiveTab,user,onAuth,onLogout}:Props){
 const publicNav=[
  {id:"dashboard",label:"Map & Reports",icon:MapPinned},
  {id:"heroes",label:"Community Heroes",icon:Award},
 ];
 const signedInNav=user ? [
  {id:"citizen",label:"Citizen Dashboard",icon:LayoutDashboard},
  {id:"notifications",label:"Notifications",icon:Bell},
 ] : [];
 const adminNav=user?.role==="admin" ? [{id:"admin",label:"Admin Dashboard",icon:BarChart3}] : [];
 const nav=[...publicNav,...signedInNav,...adminNav];
 const go=(item:{id:string})=>setActiveTab(item.id);
 return <header className="sticky top-0 z-50 border-b border-[#223149] bg-[#0b1220]/95 px-4 text-white shadow-[0_8px_28px_rgba(2,8,23,.12)] backdrop-blur-xl"><div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3">
  <button onClick={()=>setActiveTab("landing")} className="group flex min-w-0 items-center gap-2.5 text-left" aria-label="CivicGuardian home"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-sky-400/20 bg-sky-400/[.08] text-sky-300 transition group-hover:border-sky-400/40 group-hover:bg-sky-400/[.12]"><ShieldCheck className="h-[18px] w-[18px]"/></span><span className="hidden sm:block"><strong className="block text-[15px] leading-tight tracking-tight text-white">CivicGuardian</strong><span className="block max-w-[220px] truncate text-[9px] font-semibold uppercase tracking-[.13em] text-slate-500">Dhaka community safety</span></span></button>
  <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Primary navigation">{nav.map(n=>{const I=n.icon;const active=activeTab===n.id||(n.id==="dashboard"&&activeTab==="detail");return <button key={n.id} onClick={()=>go(n)} className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold transition ${active?"bg-sky-400/[.10] text-sky-200":"text-slate-400 hover:bg-slate-800/70 hover:text-white"}`}><I className="h-3.5 w-3.5"/>{n.label}{active&&<span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-sky-400"/>}</button>})}</nav>
  <div className="flex items-center gap-2"><button onClick={()=>user?setActiveTab("report"):onAuth()} className="hidden items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-[13px] font-extrabold text-white shadow-sm shadow-sky-950/20 transition hover:bg-sky-500 md:flex"><PlusCircle className="h-4 w-4"/>Report</button>{user?<div className="group relative"><button className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#111b2b] px-2 py-1.5">{user.picture?<img className="h-7 w-7 rounded-md bg-slate-800" src={user.picture} alt="" referrerPolicy="no-referrer"/>:<span className="grid h-7 w-7 place-items-center rounded-md bg-sky-500/10 text-xs font-black text-sky-300">{user.name.slice(0,1).toUpperCase()}</span>}<span className="hidden max-w-24 truncate text-xs font-bold text-slate-200 lg:block">{user.name}</span><ChevronDown className="h-3.5 w-3.5 text-slate-500"/></button><div className="invisible absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-700 bg-[#111b2b] p-2 opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100"><div className="px-3 py-2 text-xs"><div className="font-bold text-slate-200">{user.email}</div><div className="mt-1 capitalize text-sky-300">{user.role} account</div></div><button onClick={onLogout} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-400 hover:bg-slate-800">Sign out</button></div></div>:<button onClick={onAuth} className="flex items-center gap-2 rounded-lg border border-sky-400/35 bg-sky-400/[.08] px-3 py-2 text-[13px] font-extrabold text-sky-100 transition hover:border-sky-400/60 hover:bg-sky-400/[.14]"><LogIn className="h-4 w-4"/>Sign in</button>}</div>
 </div><nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto pb-2 xl:hidden" aria-label="Mobile navigation">{nav.map(n=><button key={n.id} onClick={()=>go(n)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${activeTab===n.id?"bg-sky-400/[.10] text-sky-200":"text-slate-500"}`}>{n.label}</button>)}{user&&<button onClick={()=>setActiveTab("report")} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-sky-300">Report Hazard</button>}</nav></header>;
}
