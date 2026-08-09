import React, { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaStatus() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorkerRegistration | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", install);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(registration => {
        if (registration.waiting) setUpdateReady(registration);
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting) setUpdateReady(registration);
          });
        });
      }).catch(() => undefined);
    }
    return () => window.removeEventListener("beforeinstallprompt", install);
  }, []);

  if (hidden || (!installPrompt && !updateReady)) return null;
  const update = () => {
    updateReady?.waiting?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };
  const install = async () => {
    await installPrompt?.prompt();
    await installPrompt?.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[1200] flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-700 bg-[#101925] p-3 text-sm text-slate-200 shadow-2xl" role="status">
      {updateReady ? <RefreshCw className="h-5 w-5 shrink-0 text-sky-300" /> : <Download className="h-5 w-5 shrink-0 text-sky-300" />}
      <span className="min-w-0 flex-1">{updateReady ? "A safer, newer CivicGuardian version is ready." : "Install CivicGuardian for quicker mobile access and offline drafts."}</span>
      <button type="button" onClick={updateReady ? update : install} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-black text-white">{updateReady ? "Update" : "Install"}</button>
      <button type="button" onClick={() => setHidden(true)} className="rounded-lg p-1 text-slate-500 hover:text-white" aria-label="Dismiss"><X className="h-4 w-4" /></button>
    </div>
  );
}
