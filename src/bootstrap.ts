function showStartupFailure(reason:unknown){
  const root=document.getElementById("root");
  if(!root)return;
  const message=reason instanceof Error?reason.message:String(reason||"Unknown frontend startup error");
  root.innerHTML="";
  const panel=document.createElement("main");
  panel.style.cssText="min-height:100vh;display:grid;place-items:center;background:#f4f7f6;padding:24px;font-family:Inter,system-ui,sans-serif;color:#0f172a";
  const card=document.createElement("section");
  card.style.cssText="width:min(560px,100%);background:white;border:1px solid #cbd5e1;border-radius:16px;padding:28px;box-shadow:0 14px 40px rgba(15,23,42,.08)";
  const title=document.createElement("h1");title.textContent="CivicGuardian could not start";title.style.cssText="font-size:22px;margin:0 0 8px";
  const help=document.createElement("p");help.textContent="Copy this browser error when asking for help:";help.style.cssText="line-height:1.6;color:#475569";
  const detail=document.createElement("pre");detail.textContent=message;detail.style.cssText="white-space:pre-wrap;word-break:break-word;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:12px";
  card.append(title,help,detail);panel.append(card);root.append(panel);
}

window.addEventListener("error",event=>{
  if(!document.getElementById("app-root"))showStartupFailure(event.error||event.message);
});
window.addEventListener("unhandledrejection",event=>{
  if(!document.getElementById("app-root"))showStartupFailure(event.reason);
});

import("./main.tsx").catch(error=>{
  console.error("CivicGuardian bootstrap failed",error);
  showStartupFailure(error);
});
