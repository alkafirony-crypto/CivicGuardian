import React, { useEffect, useState } from "react";
import { Bell, CheckCheck, RefreshCw, Settings2 } from "lucide-react";
import type { CivicNotification, NotificationPreferences } from "../types";
import { apiJson, jsonRequest } from "../lib/api";
import {useLanguage} from "../i18n";

const defaults: NotificationPreferences = { statusUpdates: true, adminUpdates: true, resolutionRequests: true };

export default function NotificationsCenter() {
  const [notes, setNotes] = useState<CivicNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaults);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const {t}=useLanguage();

  const load = async () => {
    setBusy(true); setError("");
    try {
      const [notifications, savedPreferences] = await Promise.all([
        apiJson<CivicNotification[]>("/api/me/notifications"),
        apiJson<NotificationPreferences>("/api/me/notification-preferences"),
      ]);
      setNotes(notifications); setPreferences(savedPreferences);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notifications could not be loaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const unread = notes.filter(note => !note.read).length;

  const read = async (notification: CivicNotification) => {
    if (notification.read) return;
    setNotes(current => current.map(item => item.id === notification.id ? { ...item, read: true } : item));
    try { await apiJson(`/api/me/notifications/${notification.id}/read`, { method: "POST" }); window.dispatchEvent(new Event("civicguardian:notifications-changed")); }
    catch { setNotes(current => current.map(item => item.id === notification.id ? { ...item, read: false } : item)); }
  };

  const readAll = async () => {
    const previous = notes;
    setNotes(current => current.map(note => ({ ...note, read: true })));
    try { await apiJson("/api/me/notifications/read-all", { method: "POST" }); window.dispatchEvent(new Event("civicguardian:notifications-changed")); }
    catch (caught) { setNotes(previous); setError(caught instanceof Error ? caught.message : "Could not mark notifications as read."); }
  };

  const savePreferences = async (next: NotificationPreferences) => {
    const previous = preferences;
    setPreferences(next); setSaving(true); setError("");
    try { setPreferences(await apiJson<NotificationPreferences>("/api/me/notification-preferences", jsonRequest("PUT", next))); }
    catch (caught) { setPreferences(previous); setError(caught instanceof Error ? caught.message : "Preferences could not be saved."); }
    finally { setSaving(false); }
  };

  return (
    <main className="cg-dark-page min-h-[calc(100vh-72px)]">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="cg-eyebrow flex items-center gap-2"><Bell className="h-3.5 w-3.5" />{t("notificationCenter")}</div><h1 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">{t("notificationHeading")}</h1><p className="mt-1.5 text-[13px] leading-5 text-slate-400">{t("notificationHelp")}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowPreferences(value => !value)} className="cg-dark-button"><Settings2 className="h-4 w-4" />{t("preferences")}</button><button type="button" disabled={!unread} onClick={() => void readAll()} className="cg-dark-button disabled:opacity-40"><CheckCheck className="h-4 w-4" />{t("markAllRead")}</button><button type="button" onClick={() => void load()} className="cg-dark-button"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{t("refresh")}</button></div></div>

        <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-sky-500/15 bg-sky-500/[.06] px-3.5 py-2.5 text-xs text-sky-100"><CheckCheck className="h-4 w-4 text-sky-300" /><strong>{unread}</strong> {t("unread")}</div>
        {error && <div className="mt-5 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200" role="alert">{error}</div>}

        {showPreferences && <section className="mt-5 rounded-2xl border border-slate-800 bg-[#101925] p-5"><div className="flex items-center justify-between"><div><h2 className="font-black text-white">Notification preferences</h2><p className="mt-1 text-xs text-slate-500">In-app only. Browser push is never enabled without permission.</p></div>{saving && <span className="text-xs text-sky-300">Saving...</span>}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[
          ["statusUpdates", "Status changes", "Review and workflow status updates"],
          ["adminUpdates", "Admin updates", "Administrator review messages"],
          ["resolutionRequests", "Resolution proof", "Repair evidence, confirmation, and reopening"],
        ].map(([key, title, description]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-[#0b111b] p-4"><input type="checkbox" checked={preferences[key as keyof NotificationPreferences]} onChange={event => void savePreferences({ ...preferences, [key]: event.target.checked })} className="mt-1 accent-sky-500" /><span><span className="block text-xs font-bold text-slate-200">{title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{description}</span></span></label>)}</div></section>}

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#223148] bg-[#101925]">
          {busy && !notes.length ? <div className="space-y-3 p-5">{[1, 2, 3].map(item => <div key={item} className="cg-skeleton h-24 rounded-xl bg-slate-800" />)}</div> : !notes.length ? <div className="p-12 text-center"><Bell className="mx-auto h-8 w-8 text-slate-600" /><div className="mt-3 font-bold text-slate-300">{t("noNotifications")}</div><p className="mt-1 text-sm text-slate-500">{t("noNotificationsHelp")}</p></div> : <div className="divide-y divide-[#223148]">{notes.map(notification => <button type="button" key={notification.id} onClick={() => void read(notification)} className={`flex w-full gap-4 p-5 text-left transition hover:bg-slate-800/40 ${notification.read ? "" : "bg-sky-500/[.035]"}`}><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read ? "bg-slate-700" : "bg-sky-400"}`} /><div><div className="text-sm font-extrabold text-slate-100">{notification.title}</div><p className="mt-1 text-sm leading-6 text-slate-400">{notification.message}</p><div className="mt-2 text-[11px] text-slate-600">{new Date(notification.createdAt).toLocaleString()}</div></div></button>)}</div>}
        </section>
      </div>
    </main>
  );
}
