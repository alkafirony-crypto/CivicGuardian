import React,{useEffect,useRef,useState} from "react";
import {X } from "lucide-react";
import type { AppUser } from "../types";
import Logo from "./Logo";
import {apiJson,jsonRequest} from "../lib/api";
import {useLanguage} from "../i18n";

declare global { interface Window { google?: any } }
export default function AuthModal({open,onClose,onAuthenticated}:{open:boolean;onClose:()=>void;onAuthenticated:(u:AppUser)=>void}){
  const [clientId,setClientId]=useState("");const [error,setError]=useState("");const buttonRef=useRef<HTMLDivElement>(null);
  const {t}=useLanguage();
  useEffect(()=>{apiJson<{googleClientId?:string}>("/api/auth/me").then(d=>setClientId(d.googleClientId||"")).catch(()=>setError("Sign-in configuration could not be loaded. Please retry."));},[]);
  useEffect(()=>{if(!open||!clientId)return;let cancelled=false;const render=()=>{if(cancelled||!window.google||!buttonRef.current)return;buttonRef.current.innerHTML="";window.google.accounts.id.initialize({client_id:clientId,callback:async({credential}:{credential:string})=>{setError("");try{const d=await apiJson<{user:AppUser}>("/api/auth/google",jsonRequest("POST",{credential}));onAuthenticated(d.user);onClose();}catch(e){setError(e instanceof Error?e.message:"Sign-in failed.");}}});window.google.accounts.id.renderButton(buttonRef.current,{theme:"outline",size:"large",width:320,text:"continue_with",locale:"en"});};if(window.google)render();else{const existing=document.querySelector('script[data-civic-google]');if(existing)existing.addEventListener("load",render,{once:true});else{const s=document.createElement("script");s.src="https://accounts.google.com/gsi/client";s.async=true;s.dataset.civicGoogle="1";s.onload=render;document.head.appendChild(s);}}return()=>{cancelled=true;};},[open,clientId,onAuthenticated,onClose]);
  if(!open)return null;
  return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
    <div className="flex items-start justify-between"><div className="flex gap-3"><Logo className="h-10 w-10 shrink-0"/><div><h2 id="auth-modal-title" className="text-lg font-black">{t("welcome")}</h2><p className="mt-1 text-xs text-slate-500">{t("secureAccess")}</p></div></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close sign-in dialog"><X className="h-5 w-5"/></button></div>
    <p className="mt-5 text-sm leading-6 text-slate-500">{t("signInReason")}</p>
    <div className="mt-5 flex min-h-11 justify-center" ref={buttonRef}/>{!clientId&&<div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Google Sign-In needs GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID in your deployment environment.</div>}{error&&<div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}
    <p className="mt-5 text-center text-[11px] text-slate-400">{t("googlePrivacy")}</p>
  </div></div>;
}
