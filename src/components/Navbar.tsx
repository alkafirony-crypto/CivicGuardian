import React, { useEffect, useRef, useState } from "react";
import {
  Award,
  BarChart3,
  Bell,
  ChevronDown,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  MapPinned,
  PlusCircle,
} from "lucide-react";
import type { AppUser } from "../types";
import Logo from "./Logo";
import {useLanguage} from "../i18n";

type Props = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stats?: any;
  user: AppUser | null;
  onAuth: () => void;
  onLogout: () => void | Promise<void>;
};

export default function Navbar({
  activeTab,
  setActiveTab,
  user,
  onAuth,
  onLogout,
}: Props) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [unreadCount,setUnreadCount]=useState(0);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const {t}=useLanguage();

  const publicNav = [
    { id: "dashboard", label: t("map"), icon: MapPinned },
    { id: "heroes", label: t("heroes"), icon: Award },
  ];
  const signedInNav = user
    ? [
        { id: "citizen", label: t("dashboard"), icon: LayoutDashboard },
        { id: "notifications", label: t("notifications"), icon: Bell },
      ]
    : [];
  const adminNav =
    user?.role === "admin"
      ? [{ id: "admin", label: t("admin"), icon: BarChart3 }]
      : [];
  const nav = [...publicNav, ...signedInNav, ...adminNav];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!user) setUserMenuOpen(false);
  }, [user]);

  useEffect(()=>{
    if(!user){setUnreadCount(0);return;}
    let active=true;
    const load=()=>fetch("/api/me/notifications").then(r=>r.ok?r.json():[]).then((rows:any[])=>{if(active)setUnreadCount(rows.filter(row=>!row.read).length);}).catch(()=>undefined);
    void load();
    const interval=window.setInterval(load,30_000);
    window.addEventListener("civicguardian:notifications-changed",load);
    return()=>{active=false;window.clearInterval(interval);window.removeEventListener("civicguardian:notifications-changed",load);};
  },[user,activeTab]);

  const go = (item: { id: string }) => {
    setUserMenuOpen(false);
    setActiveTab(item.id);
  };

  const handleLogout = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await onLogout();
      setUserMenuOpen(false);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#514c48] bg-[#2c2927]/98 px-4 text-white shadow-[0_8px_24px_rgba(44,41,39,.14)] backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4">
        <button
          onClick={() => setActiveTab("landing")}
          className="group flex min-w-0 items-center gap-2.5 text-left"
          aria-label="CivicGuardian home"
        >
          <Logo className="h-10 w-10 shrink-0 transition group-hover:scale-[1.03]" />
          <span className="hidden sm:block">
            <strong className="block text-[17px] font-bold leading-tight tracking-tight text-white">
              CivicGuardian
            </strong>
            <span className="block max-w-[210px] truncate text-[11px] font-medium uppercase tracking-[.08em] text-[#bdecfb]">
              Bangladesh community safety
            </span>
          </span>
        </button>

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Primary navigation"
        >
          {nav.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id ||
              (item.id === "dashboard" && activeTab === "detail");
            return (
              <button
                key={item.id}
                onClick={() => go(item)}
                className={`relative flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold transition ${
                  active
                    ? "bg-[#bdecfb] text-[#2c2927]"
                    : "text-slate-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.id==="notifications"&&unreadCount>0&&<span className="grid min-w-4 place-items-center rounded-full bg-sky-500 px-1 text-[9px] font-black text-white" aria-label={`${unreadCount} unread notifications`}>{unreadCount>99?"99+":unreadCount}</span>}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => (user ? setActiveTab("report") : onAuth())}
            className="cg-highvis hidden min-h-11 items-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-bold shadow-sm transition md:flex"
          >
            <PlusCircle className="h-4 w-4" />
            {t("report")}
          </button>

          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-[#6d6762] bg-[#383431] px-2 py-1.5 transition hover:border-[#5bcff4] hover:bg-[#413d39]"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Open account menu"
              >
                {user.picture ? (
                  <img
                    className="h-8 w-8 rounded-md bg-[#514c48]"
                    src={user.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-[#5bcff4]/15 text-[13px] font-bold text-[#bdecfb]">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-28 truncate text-[14px] font-semibold text-white xl:block">
                  {user.name}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <div
                role="menu"
                className={`absolute right-0 top-[calc(100%+0.5rem)] w-56 origin-top-right rounded-xl border border-slate-700 bg-[#111b2b] p-2 shadow-2xl transition-all duration-150 ${
                  userMenuOpen
                    ? "visible translate-y-0 scale-100 opacity-100"
                    : "invisible -translate-y-1 scale-95 opacity-0 pointer-events-none"
                }`}
              >
                <div className="border-b border-slate-800 px-3 py-2 text-xs">
                  <div className="truncate font-bold text-slate-200">
                    {user.email}
                  </div>
                  <div className="mt-1 capitalize text-sky-300">
                    {user.role} account
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={isSigningOut}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-wait disabled:opacity-60"
                >
                  {isSigningOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  {isSigningOut ? t("signingOut") : t("signOut")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onAuth}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-[#5bcff4]/60 bg-[#5bcff4]/10 px-4 py-2.5 text-[15px] font-bold text-[#bdecfb] transition hover:border-[#5bcff4] hover:bg-[#5bcff4]/20"
            >
              <LogIn className="h-4 w-4" />
              {t("signIn")}
            </button>
          )}
        </div>
      </div>

      <nav
        className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto pb-2 lg:hidden"
        aria-label="Mobile navigation"
      >
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => go(item)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold ${
              activeTab === item.id
                ? "bg-[#bdecfb] text-[#2c2927]"
                : "text-slate-300"
            }`}
          >
            {item.label}
            {item.id==="notifications"&&unreadCount>0&&<span className="rounded-full bg-sky-500 px-1.5 text-[9px] text-white">{unreadCount}</span>}
          </button>
        ))}
        {user && (
          <button
            onClick={() => setActiveTab("report")}
            className="shrink-0 rounded-lg bg-[#e0ff89] px-3 py-2 text-[13px] font-bold text-[#2c2927]"
          >
            {t("report")}
          </button>
        )}
      </nav>
    </header>
  );
}
