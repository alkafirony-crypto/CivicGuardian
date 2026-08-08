import React,{useEffect,useState} from "react";
import {Bell,CheckCheck,RefreshCw} from "lucide-react";
import type {CivicNotification} from "../types";

export default function NotificationsCenter(){
 const [notes,setNotes]=useState<CivicNotification[]>([]);const [busy,setBusy]=useState(true);const [error,setError]=useState("");
 const load=async()=>{setBusy(true);setError("");try{const r=await fetch("/api/me/notifications");if(!r.ok)throw new Error();setNotes(await r.json());}catch{setError("Notifications could not be loaded. Please try again.");}finally{setBusy(false);}};
 useEffect(()=>{void load();},[]);
 const read=async(n:CivicNotification)=>{if(n.read)return;const r=await fetch(`/api/me/notifications/${n.id}/read`,{method:"POST"});if(r.ok)setNotes(x=>x.map(v=>v.id===n.id?{...v,read:true}:v));};
 const unread=notes.filter(n=>!n.read).length;
 return <main className="cg-dark-page min-h-[calc(100vh-72px)]"><div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 lg:py-14"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="cg-eyebrow flex items-center gap-2"><Bell className="h-4 w-4"/>Notification center</div><h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Report updates in one place.</h1><p className="mt-2 text-sm leading-6 text-slate-400">Status changes and relevant CivicGuardian activity appear here for your signed-in account.</p></div><button onClick={()=>void load()} className="cg-dark-button"><RefreshCw className={`h-4 w-4 ${busy?"animate-spin":""}`}/>Refresh</button></div>
  <div className="mt-8 flex items-center gap-3 rounded-xl border border-sky-500/15 bg-sky-500/[.06] px-4 py-3 text-sm text-sky-100"><CheckCheck className="h-4 w-4 text-sky-300"/><strong>{unread}</strong> unread notification{unread===1?"":"s"}</div>
  {error&&<div className="mt-5 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>}
  <section className="mt-5 overflow-hidden rounded-2xl border border-[#223148] bg-[#101925]">{!busy&&notes.length===0?<div className="p-12 text-center"><Bell className="mx-auto h-8 w-8 text-slate-600"/><div className="mt-3 font-bold text-slate-300">No notifications yet</div><p className="mt-1 text-sm text-slate-500">Updates will appear after real report activity.</p></div>:<div className="divide-y divide-[#223148]">{notes.map(n=><button key={n.id} onClick={()=>void read(n)} className={`flex w-full gap-4 p-5 text-left transition hover:bg-slate-800/40 ${n.read?"":"bg-sky-500/[.035]"}`}><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read?"bg-slate-700":"bg-sky-400"}`}/><div><div className="text-sm font-extrabold text-slate-100">{n.title}</div><p className="mt-1 text-sm leading-6 text-slate-400">{n.message}</p><div className="mt-2 text-[11px] text-slate-600">{new Date(n.createdAt).toLocaleString()}</div></div></button>)}</div>}</section>
 </div></main>;
}
