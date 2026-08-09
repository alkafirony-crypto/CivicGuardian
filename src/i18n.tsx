import React, { createContext, useContext, useEffect } from "react";

const messages = {
  home: "Home", map: "Map & Reports", dashboard: "Citizen Dashboard", heroes: "Community Heroes",
  notifications: "Notifications", admin: "Admin Dashboard", report: "Report Hazard", signIn: "Sign in",
  signOut: "Sign out", signingOut: "Signing out...", backReports: "Back to reports",
  reportHazard: "Report a hazard", location: "Location", evidence: "Evidence", review: "Review & submit",
  continueEvidence: "Continue to evidence", observed: "What did you observe?", analyze: "Analyze evidence with Gemini",
  analyzing: "Analyzing evidence...", submit: "Submit citizen report", submitting: "Submitting...",
  consent: "I confirm this is my lawful evidence and I understand it may appear publicly.",
  photoSafety: "Avoid photographing people unnecessarily. Never approach fire, exposed electricity, violence, or unstable structures to take a photo.",
  aiAdvisory: "AI assessments are advisory", offline: "You are offline. Your report remains saved as a draft.",
  welcome: "Welcome to CivicGuardian", secureAccess: "Secure access with your verified Google account.",
  signInReason: "Sign in to report hazards, track your submissions, follow reports, and receive status notifications.",
  googlePrivacy: "Google verifies identity. CivicGuardian never receives your Google password.",
  notificationCenter: "Notification center", notificationHeading: "Report updates in one place.",
  notificationHelp: "Follow reports and choose the updates that are useful to you.", preferences: "Preferences",
  markAllRead: "Mark all read", refresh: "Refresh", unread: "unread notifications", noNotifications: "No notifications yet",
  noNotificationsHelp: "Follow a report or submit one to receive useful updates.",
} as const;

type MessageKey = keyof typeof messages;
type CopyContextValue = { t: (key: MessageKey) => string };
const CopyContext = createContext<CopyContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = "en";
    localStorage.removeItem("civicguardian:language");
  }, []);
  return <CopyContext.Provider value={{ t: key => messages[key] }}>{children}</CopyContext.Provider>;
}

export function useLanguage() {
  const value = useContext(CopyContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export function statusText(status: string) {
  return status === "reported" ? "Submitted" : status.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}
