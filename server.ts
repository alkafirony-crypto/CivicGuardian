import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import { bangladeshSearchQueries, geocodeResultZoom, insideBangladeshServiceArea } from "./src/server/geo";
import { rankDuplicateCandidates } from "./src/server/duplicates";
import { CivicStore } from "./src/server/store";
import {
  attachUser,
  clearSessionCookie,
  createSession,
  isAdminEmail,
  requireAdmin,
  requireAuth,
  setSessionCookie,
  verifyGoogleCredential,
  type AuthRequest,
} from "./src/server/auth";
import { CIVIC_CATEGORIES } from "./src/config/civicCategories";
import { analyzeVisionAgent, validateVisionResult } from "./src/services/gemini";
import type { CivicIssue, IssueStatus, NotificationPreferences, ResolutionVerdict } from "./src/types";

dotenv.config();

const cliPortIndex = process.argv.indexOf("--port");
const cliPort = cliPortIndex >= 0 ? Number(process.argv[cliPortIndex + 1]) : Number.NaN;
const PORT = Number(process.env.PORT || (Number.isFinite(cliPort) ? cliPort : 3000));
const isProduction = process.env.NODE_ENV === "production";
const app = express();
const store = new CivicStore();

const authorities: Record<string, string> = {
  "Fire & Smoke": "Fire and emergency-safety review queue",
  "Gas Leakage": "Gas and utility-safety review queue",
  "Road Damage": "Road infrastructure review queue",
  "Flooding & Drainage": "Flooding and drainage review queue",
  "Water & Sewer": "Water and drainage review queue",
  "Electrical Hazard": "Electrical safety review queue",
  "Waste & Sanitation": "Waste and sanitation review queue",
  "Public Safety": "Public-safety review queue",
  "Public Property Damage": "Public infrastructure review queue",
};

if (isProduction) {
  for (const key of ["DATABASE_URL", "COOKIE_SECRET", "GOOGLE_CLIENT_ID", "GEMINI_API_KEY"]) {
    if (!process.env[key]) throw new Error(`${key} is required in production.`);
  }
  if ((process.env.COOKIE_SECRET || "").length < 32) {
    throw new Error("COOKIE_SECRET must contain at least 32 characters in production.");
  }
}

app.set("trust proxy", 1);
if (isProduction) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://accounts.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com"],
        connectSrc: ["'self'", "https://accounts.google.com", "https://*.googleapis.com"],
        frameSrc: ["https://accounts.google.com"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
}

app.use(express.json({ limit: "12mb" }));
app.use(attachUser);
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
const geocodeLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
const actionLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api", apiLimiter);

const imageSchema = z.string().max(10_000_000).refine(
  value => /^data:image\/(jpeg|png|webp);base64,/.test(value),
  "A valid JPEG, PNG or WEBP image is required.",
);
const reportSchema = z.object({
  title: z.string().trim().max(140).optional().default(""),
  description: z.string().trim().min(10).max(2000),
  address: z.string().trim().min(3).max(300),
  category: z.enum(CIVIC_CATEGORIES),
  image: imageSchema,
  aiAttestation: z.string().min(20).max(20_000),
  lat: z.number(),
  lng: z.number(),
  clientRequestId: z.string().uuid().optional(),
  evidenceConsent: z.literal(true),
});
const textSchema = z.object({ text: z.string().trim().min(1).max(1500) });
const statusSchema = z.object({
  nextStatus: z.enum(["reported", "under_review", "verified", "assigned", "in_progress", "resolved", "rejected", "duplicate", "unable_to_verify"]),
  note: z.string().trim().max(1000).optional(),
  afterImage: imageSchema.optional(),
}).superRefine((value, context) => {
  if (value.nextStatus === "resolved" && (!value.note || value.note.length < 10)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "A clear resolution note of at least 10 characters is required." });
  }
  if (value.nextStatus === "resolved" && !value.afterImage) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["afterImage"], message: "An after-repair photo is required before resolving a report." });
  }
});
const preferencesSchema = z.object({ statusUpdates: z.boolean(), adminUpdates: z.boolean(), resolutionRequests: z.boolean() });

const cleanText = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const aiSecret = () => process.env.COOKIE_SECRET || "development-only-civicguardian-secret";
const evidenceHash = (image: string) => crypto.createHash("sha256").update(image).digest("base64url");
const attestAi = (value: unknown, image: string) => {
  const body = Buffer.from(JSON.stringify({ value, evidenceHash: evidenceHash(image), exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", aiSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
};
const readAttestedAi = (token: string, image: string) => {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("AI assessment attestation is invalid.");
  const expected = crypto.createHmac("sha256", aiSecret()).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("AI assessment attestation could not be verified.");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
  if (parsed.exp < Date.now() || parsed.evidenceHash !== evidenceHash(image) || !validateVisionResult(parsed.value)) {
    throw new Error("AI assessment expired, changed, or is invalid. Please analyze the evidence again.");
  }
  return parsed.value;
};

async function notifyIssueAudience(
  issueId: string,
  title: string,
  message: string,
  kind: "status" | "admin" | "resolution" = "status",
) {
  const recipients = new Set(await store.followerIds(issueId));
  const reporter = await store.reporterIdForIssue(issueId);
  if (reporter) recipients.add(reporter);
  await Promise.all([...recipients].map(userId => store.notify(userId, title, message, issueId, kind)));
}

app.get("/api/health", async (_request, response) => {
  try {
    response.json({ ok: true, service: "CivicGuardian", ...(await store.health()) });
  } catch {
    response.status(503).json({ ok: false, database: "unavailable" });
  }
});

app.get("/api/auth/me", (request: AuthRequest, response) => response.json({
  user: request.user || null,
  googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
}));

app.post("/api/auth/google", async (request: AuthRequest, response) => {
  try {
    const credential = z.string().min(20).parse(request.body?.credential);
    const googleUser = await verifyGoogleCredential(credential);
    const role = isAdminEmail(googleUser.email) ? "admin" : "citizen";
    const user = await store.upsertUser(googleUser, role);
    setSessionCookie(response, createSession(user));
    response.json({ user });
  } catch (error: any) {
    response.status(401).json({ error: error?.message || "Google sign-in failed." });
  }
});

app.post("/api/auth/logout", (_request, response) => {
  clearSessionCookie(response);
  response.json({ ok: true });
});

app.get("/api/geocode/search", geocodeLimiter, async (request, response) => {
  try {
    const query = z.string().trim().min(2).max(160).parse(request.query.q);
    let rows: any[] = [];
    for (const searchQuery of bangladeshSearchQueries(query)) {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", searchQuery);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "8");
      url.searchParams.set("countrycodes", "bd");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("dedupe", "1");
      url.searchParams.set("accept-language", "en");
      const result = await fetch(url, {
        headers: { "User-Agent": "CivicGuardian/1.1 (community safety project)", Accept: "application/json", "Accept-Language": "en" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!result.ok) throw new Error("Geocoder unavailable");
      rows = await result.json();
      if (rows.length) break;
    }
    response.json({
      results: rows.filter(item => insideBangladeshServiceArea(Number(item.lat), Number(item.lon))).map(item => ({
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        type: item.type,
        addressType: item.addresstype,
        zoom: geocodeResultZoom(item.type, item.addresstype),
      })),
    });
  } catch (error: any) {
    response.status(503).json({ error: error.message || "Address search unavailable" });
  }
});

app.get("/api/geocode/reverse", geocodeLimiter, async (request, response) => {
  try {
    const lat = z.coerce.number().parse(request.query.lat);
    const lng = z.coerce.number().parse(request.query.lng);
    if (!insideBangladeshServiceArea(lat, lng)) return response.status(400).json({ error: "Please choose a point inside Bangladesh." });
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");
    const result = await fetch(url, {
      headers: { "User-Agent": "CivicGuardian/1.1 (community safety project)", Accept: "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!result.ok) throw new Error("Geocoder unavailable");
    const data: any = await result.json();
    if (data.address?.country_code && data.address.country_code !== "bd") {
      return response.status(400).json({ error: "Please choose a location inside Bangladesh." });
    }
    response.json({ displayName: data.display_name || "", lat, lng });
  } catch (error: any) {
    response.status(503).json({ error: error.message || "Reverse geocoding unavailable" });
  }
});

app.get("/api/issues", async (request: AuthRequest, response) => {
  try {
    const query = z.object({
      search: z.string().trim().max(120).optional(),
      category: z.string().trim().max(80).optional(),
      status: z.string().trim().max(40).optional(),
      dateFrom: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }).parse(request.query);
    response.json(await store.listIssues(request.user?.id, query));
  } catch (error: any) {
    response.status(400).json({ error: error?.message || "Could not load reports." });
  }
});

app.get("/api/issues/:id", async (request: AuthRequest, response) => {
  const issue = await store.getIssue(request.params.id, request.user?.id);
  if (!issue) return response.status(404).json({ error: "Issue not found." });
  response.json(issue);
});

app.get("/api/me/issues", requireAuth, async (request: AuthRequest, response) => {
  response.json(await store.listMyIssues(request.user!.id));
});

app.get("/api/me/notifications", requireAuth, async (request: AuthRequest, response) => {
  response.json(await store.notifications(request.user!.id));
});

app.post("/api/me/notifications/:id/read", requireAuth, async (request: AuthRequest, response) => {
  response.json({ ok: await store.markNotificationRead(request.user!.id, request.params.id) });
});

app.post("/api/me/notifications/read-all", requireAuth, async (request: AuthRequest, response) => {
  response.json({ ok: await store.markAllNotificationsRead(request.user!.id) });
});

app.get("/api/me/notification-preferences", requireAuth, async (request: AuthRequest, response) => {
  response.json(await store.getNotificationPreferences(request.user!.id));
});

app.put("/api/me/notification-preferences", requireAuth, async (request: AuthRequest, response) => {
  try {
    const preferences = preferencesSchema.parse(request.body) as NotificationPreferences;
    response.json(await store.setNotificationPreferences(request.user!.id, preferences));
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || "Notification preferences are invalid." });
  }
});

app.get("/api/contributors", async (_request, response) => response.json(await store.contributors()));

app.post("/api/issues/duplicates/check", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const input = z.object({
      lat: z.number(), lng: z.number(), category: z.enum(CIVIC_CATEGORIES),
      title: z.string().trim().max(140).optional(), description: z.string().trim().max(2000).optional(),
    }).parse(request.body);
    if (!insideBangladeshServiceArea(input.lat, input.lng)) return response.status(400).json({ error: "Location is outside the Bangladesh service area." });
    const nearby = await store.nearby(input.lat, input.lng, 600);
    response.json(rankDuplicateCandidates({
      lat: input.lat!, lng: input.lng!, category: input.category!, title: input.title, description: input.description,
    }, nearby));
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || error?.message || "Could not check nearby reports." });
  }
});

app.get("/api/stats", async (request: AuthRequest, response) => {
  response.json(await store.statistics());
});

app.post("/api/analyze-vision", requireAuth, aiLimiter, async (request: AuthRequest, response) => {
  try {
    const description = z.string().trim().min(10).max(2000).parse(request.body?.description);
    const title = z.string().trim().max(140).optional().parse(request.body?.title);
    const image = imageSchema.parse(request.body?.image);
    const result = await analyzeVisionAgent(image, cleanText(description), title ? cleanText(title) : undefined);
    response.json({ ...result, aiAttestation: attestAi(result, image) });
  } catch (error: any) {
    response.status(error?.message?.includes("not configured") ? 503 : 400).json({ error: error?.issues?.[0]?.message || error?.message || "Image analysis failed." });
  }
});

app.post("/api/issues", requireAuth, aiLimiter, async (request: AuthRequest, response) => {
  try {
    const input = reportSchema.parse(request.body);
    if (!insideBangladeshServiceArea(input.lat, input.lng)) {
      return response.status(400).json({ error: "CivicGuardian currently accepts reports from locations inside Bangladesh." });
    }
    const vision = readAttestedAi(input.aiAttestation, input.image);
    const requestKey = input.clientRequestId || crypto.randomUUID();
    const deterministicId = crypto.createHash("sha256").update(`${request.user!.id}:${requestKey}`).digest("base64url").slice(0, 10).toUpperCase();
    const issueId = `CG-${deterministicId}`;
    const existing = await store.getIssue(issueId, request.user!.id);
    if (existing) return response.status(200).json(existing);

    const now = new Date().toISOString();
    const category = input.category;
    const issue: CivicIssue = {
      id: issueId,
      title: cleanText(input.title) || `${category} report`,
      description: cleanText(input.description),
      imageUrl: input.image,
      status: "under_review",
      category,
      address: cleanText(input.address),
      createdAt: now,
      upvotes: 0,
      verifiedByCount: 0,
      lat: input.lat,
      lng: input.lng,
      timeline: [
        { status: "reported", date: now, note: "Citizen report received with location and photo evidence." },
        { status: "under_review", date: now, note: "AI advisory assessment recorded; human review remains required before any official action." },
      ],
      analysis: {
        vision: {
          category: vision.issueType,
          severity: vision.severity,
          confidence: vision.confidenceScore,
          riskAssessment: vision.safetyRisk,
          summary: vision.description,
        },
        resolution: {
          responsibleAuthority: authorities[category] || "Unassigned civic review queue",
          recommendedAction: "Human reviewer should validate the evidence and determine the appropriate response.",
          priority: vision.priority,
          estimatedResolutionTime: "Not estimated",
        },
        prediction: {
          escalationProbability: 0,
          impactForecast: "No automated impact forecast is presented as fact.",
          suggestedPreventiveAction: "Use caution around the reported hazard and follow verified emergency guidance.",
        },
      },
    };
    const saved = await store.saveIssue(issue, request.user!.id);
    await store.notify(request.user!.id, "Report received", `${issue.id} is now under review. You can track every status change from your dashboard.`, issue.id);
    await Promise.all((await store.adminIds()).map(adminId => store.notify(adminId, "New report awaiting review", `${issue.id}: ${issue.title}`, issue.id, "admin")));
    await store.audit(request.user!.id, "issue.created", issue.id, { requestKey, evidenceConsent: true });
    response.status(201).json(saved);
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || error?.message || "Unable to create report." });
  }
});

app.post("/api/issues/:id/upvote", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  const issue = await store.toggleVote(request.params.id, request.user!.id);
  if (!issue) return response.status(404).json({ error: "Issue not found." });
  response.json(issue);
});

app.post("/api/issues/:id/verify", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  const issue = await store.setVerdict(request.params.id, request.user!.id, "confirm");
  if (!issue) return response.status(404).json({ error: "Issue not found." });
  response.json(issue);
});

app.post("/api/issues/:id/not-accurate", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  const issue = await store.setVerdict(request.params.id, request.user!.id, "dispute");
  if (!issue) return response.status(404).json({ error: "Issue not found." });
  response.json(issue);
});

app.post("/api/issues/:id/follow", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  const issue = await store.toggleFollow(request.params.id, request.user!.id);
  if (!issue) return response.status(404).json({ error: "Issue not found." });
  response.json(issue);
});

app.post("/api/issues/:id/comments", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const { text } = textSchema.parse(request.body);
    const issue = await store.addComment(request.params.id, request.user!, cleanText(text));
    if (!issue) return response.status(404).json({ error: "Issue not found." });
    await store.audit(request.user!.id, "comment.created", request.params.id);
    response.json(issue);
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || "Invalid comment." });
  }
});

app.post("/api/issues/:id/images", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const imageUrl = imageSchema.parse(request.body?.imageUrl);
    const issue = await store.addAdditionalImage(request.params.id, request.user!.id, imageUrl);
    if (!issue) return response.status(404).json({ error: "Issue not found." });
    await store.audit(request.user!.id, "issue.evidence_added", request.params.id);
    response.json(issue);
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || "Additional evidence is invalid." });
  }
});

app.post("/api/comments/:id/moderate", requireAdmin, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const hidden = z.boolean().parse(request.body?.hidden);
    const ok = await store.moderateComment(request.params.id, hidden);
    if (!ok) return response.status(404).json({ error: "Comment not found." });
    await store.audit(request.user!.id, "comment.moderated", undefined, { commentId: request.params.id, hidden });
    response.json({ ok: true });
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || "Moderation request is invalid." });
  }
});

app.delete("/api/issues/:id/images/:index", requireAdmin, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const index = z.coerce.number().int().min(0).max(7).parse(request.params.index);
    const issue = await store.removeAdditionalImage(request.params.id, index);
    if (!issue) return response.status(404).json({ error: "Evidence image not found." });
    await store.audit(request.user!.id, "issue.evidence_moderated", request.params.id, { removedIndex: index });
    response.json(issue);
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || "Evidence moderation request is invalid." });
  }
});

app.post("/api/issues/:id/resolve", requireAdmin, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const issue = await store.getIssue(request.params.id, request.user!.id);
    if (!issue) return response.status(404).json({ error: "Issue not found." });
    const input = statusSchema.parse(request.body);
    const now = new Date().toISOString();
    const note = cleanText(input.note || `Status updated to ${input.nextStatus.replaceAll("_", " ")}.`);
    issue.status = input.nextStatus as IssueStatus;
    if (input.nextStatus === "resolved") {
      issue.resolutionProof = {
        afterImageUrl: input.afterImage!,
        note,
        submittedAt: now,
        submittedBy: "Authorized CivicGuardian reviewer",
      };
    }
    issue.timeline = [...(issue.timeline || []), {
      status: issue.status,
      date: now,
      note: `Authorized review update: ${note}`,
    }];
    const saved = await store.saveIssue(issue);
    const notificationTitle = input.nextStatus === "resolved" ? "Repair evidence added" : "Report status updated";
    const notificationMessage = input.nextStatus === "resolved"
      ? `${issue.id} was marked resolved with an after-repair photo. Please review and confirm the outcome.`
      : `${issue.id} is now ${input.nextStatus.replaceAll("_", " ")}.`;
    await notifyIssueAudience(issue.id, notificationTitle, notificationMessage, input.nextStatus === "resolved" ? "resolution" : "status");
    await store.audit(request.user!.id, "issue.status_changed", issue.id, { status: input.nextStatus, hasResolutionProof: Boolean(input.afterImage) });
    response.json(saved);
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || error?.message || "Status update failed." });
  }
});

app.post("/api/issues/:id/resolution-feedback", requireAuth, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const verdict = z.enum(["confirmed", "unresolved", "review"]).parse(request.body?.verdict) as ResolutionVerdict;
    let issue = await store.getIssue(request.params.id, request.user!.id);
    if (!issue) return response.status(404).json({ error: "Issue not found." });
    if (!issue.resolutionProof) return response.status(409).json({ error: "Resolution feedback is available only after repair evidence is added." });
    issue = await store.setResolutionFeedback(issue.id, request.user!.id, verdict);
    const negativeCount = (issue?.resolutionFeedback?.unresolved || 0) + (issue?.resolutionFeedback?.review || 0);
    const reporterDisagreed = verdict !== "confirmed" && await store.isReporter(request.params.id, request.user!.id);
    if (issue && issue.status === "resolved" && verdict !== "confirmed" && (reporterDisagreed || negativeCount >= 2)) {
      issue.status = "under_review";
      issue.timeline = [...issue.timeline, {
        status: "under_review",
        date: new Date().toISOString(),
        note: reporterDisagreed
          ? "Reopened because the original reporter said the issue remains unresolved or needs review."
          : "Reopened after multiple community members requested another resolution review.",
      }];
      await store.saveIssue(issue);
      await Promise.all((await store.adminIds()).map(adminId => store.notify(adminId, "Resolution needs another review", `${issue!.id} was reopened after community feedback.`, issue!.id, "admin")));
      await notifyIssueAudience(issue.id, "Report reopened", `${issue.id} returned to review after resolution feedback.`, "resolution");
      await store.audit(request.user!.id, "issue.reopened_from_feedback", issue.id, { verdict, negativeCount, reporterDisagreed });
      issue = await store.getIssue(issue.id, request.user!.id);
    } else {
      await store.audit(request.user!.id, "resolution.feedback", request.params.id, { verdict });
    }
    response.json(issue);
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || error?.message || "Resolution feedback failed." });
  }
});

app.post("/api/issues/:id/merge", requireAdmin, actionLimiter, async (request: AuthRequest, response) => {
  try {
    const mergeIntoId = z.string().trim().min(3).max(80).parse(request.body?.mergeIntoId);
    const child = await store.getIssue(request.params.id);
    const parent = await store.getIssue(mergeIntoId);
    if (!child || !parent) return response.status(404).json({ error: "One or both issues were not found." });
    if (child.id === parent.id) return response.status(400).json({ error: "A report cannot be merged into itself." });
    child.status = "duplicate";
    child.timeline.push({
      status: "duplicate",
      date: new Date().toISOString(),
      note: `Marked as a duplicate by an authorized CivicGuardian administrator; canonical report: ${parent.id}.`,
    });
    await store.saveIssue(child);
    await notifyIssueAudience(child.id, "Report linked to an existing issue", `${child.id} is now linked to canonical report ${parent.id}.`);
    await store.audit(request.user!.id, "issue.merged", child.id, { mergeIntoId: parent.id });
    response.json({ success: true, childIssue: child, parentIssue: parent });
  } catch (error: any) {
    response.status(400).json({ error: error?.issues?.[0]?.message || error?.message || "Merge failed." });
  }
});

app.get("/api/issues/:id/duplicates", async (request: AuthRequest, response) => {
  const issue = await store.getIssue(request.params.id, request.user?.id);
  if (!issue || issue.lat === undefined || issue.lng === undefined) return response.status(404).json({ error: "Issue not found." });
  const nearby = await store.nearby(issue.lat, issue.lng, 600);
  response.json(rankDuplicateCandidates({
    lat: issue.lat, lng: issue.lng, category: issue.category, title: issue.title, description: issue.description,
  }, nearby.filter(candidate => candidate.id !== issue.id)));
});

async function start() {
  await store.migrate();
  if (!isProduction) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");
    app.use(express.static(dist, {
      setHeaders(response, filePath) {
        if (filePath.endsWith("sw.js") || filePath.endsWith("index.html")) {
          response.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          response.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }));
    app.get("*", (_request, response) => response.sendFile(path.join(dist, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`CivicGuardian listening on http://0.0.0.0:${PORT}`));
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
