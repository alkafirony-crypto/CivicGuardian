import React,{useEffect,useRef,useState} from "react";
import { ShieldCheck,X } from "lucide-react";
import type { AppUser } from "../types";

declare global { interface Window { google?: any } }
export default function AuthModal({open,onClose,onAuthenticated}:{open:boolean;onClose:()=>void;onAuthenticated:(u:AppUser)=>void}){
  const [clientId,setClientId]=useState("");const [error,setError]=useState("");const buttonRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{fetch("/api/auth/me").then(r=>r.json()).then(d=>setClientId(d.googleClientId||""));},[]);
  useEffect(()=>{if(!open||!clientId)return;let cancelled=false;const render=()=>{if(cancelled||!window.google||!buttonRef.current)return;buttonRef.current.innerHTML="";window.google.accounts.id.initialize({client_id:clientId,callback:async({credential}:{credential:string})=>{setError("");const r=await fetch("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential})});const d=await r.json();if(!r.ok){setError(d.error||"Sign-in failed.");return;}onAuthenticated(d.user);onClose();}});window.google.accounts.id.renderButton(buttonRef.current,{theme:"outline",size:"large",width:320,text:"continue_with"});};if(window.google)render();else{const existing=document.querySelector('script[data-civic-google]');if(existing)existing.addEventListener("load",render,{once:true});else{const s=document.createElement("script");s.src="https://accounts.google.com/gsi/client";s.async=true;s.dataset.civicGoogle="1";s.onload=render;document.head.appendChild(s);}}return()=>{cancelled=true;};},[open,clientId,onAuthenticated,onClose]);
  if(!open)return null;
  return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/75 backdrop-blur-sm p-4"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-slate-900 shadow-2xl">
    <div className="flex items-start justify-between"><div className="flex gap-3"><div className="rounded-2xl bg-teal-700 p-2.5 text-white"><ShieldCheck/></div><div><h2 className="text-xl font-black">Welcome to CivicGuardian</h2><p className="mt-1 text-sm text-slate-500">Secure access with your verified Google account.</p></div></div><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X/></button></div>
    <p className="mt-5 text-sm leading-6 text-slate-500">Sign in to report hazards, track your submissions and receive status notifications.</p>
    <div className="mt-5 flex min-h-11 justify-center" ref={buttonRef}/>{!clientId&&<div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Google Sign-In needs GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID in your deployment environment.</div>}{error&&<div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}
    <p className="mt-5 text-center text-[11px] text-slate-400">Google verifies identity. CivicGuardian never receives your Google password.</p>
  </div></div>;
}
