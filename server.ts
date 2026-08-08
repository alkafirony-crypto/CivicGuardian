import path from "path";
import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import { analyzeVisionAgent, CIVIC_CATEGORIES, validateVisionResult } from "./src/services/gemini";
import { CivicStore } from "./src/server/store";
import { attachUser, clearSessionCookie, createSession, isAdminEmail, requireAdmin, requireAuth, setSessionCookie, verifyGoogleCredential, type AuthRequest } from "./src/server/auth";
import { insideDhakaServiceArea as insideDhaka } from "./src/server/geo";
import type { CivicIssue } from "./src/types";

dotenv.config();
const cliPortIndex=process.argv.indexOf("--port");
const cliPort=cliPortIndex>=0?Number(process.argv[cliPortIndex+1]):NaN;
const app=express(); const store=new CivicStore(); const PORT=Number(process.env.PORT||(Number.isFinite(cliPort)?cliPort:3000));
const isProduction=process.env.NODE_ENV==="production";
const authorities:Record<string,string>={
  "Road Infrastructure":"Road infrastructure review queue","Water & Sewer":"Water and drainage review queue",
  "Waste & Sanitation":"Waste and sanitation review queue","Power & Grid":"Electrical safety review queue",
  "Public Safety":"Public-safety review queue","Park Maintenance":"Parks and public-space review queue"
};

if(isProduction){
  for(const key of ["DATABASE_URL","COOKIE_SECRET","GOOGLE_CLIENT_ID","GEMINI_API_KEY"])if(!process.env[key])throw new Error(`${key} is required in production.`);
  if((process.env.COOKIE_SECRET||"").length<32)throw new Error("COOKIE_SECRET must contain at least 32 characters in production.");
}

// Vite injects an inline React Refresh bootstrap script while developing. A
// production CSP correctly blocks inline scripts, so applying that CSP to the
// Vite middleware prevents React from mounting and leaves localhost blank.
// Keep the production policy strict and let Vite manage its dev response.
app.set("trust proxy",1);
// Keep Vite's development document and module responses completely untouched.
// Browser security headers belong on the production surface, where the app is
// serving its built assets instead of Vite's development runtime.
if(isProduction){
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","https://accounts.google.com"],styleSrc:["'self'","'unsafe-inline'","https://accounts.google.com"],imgSrc:["'self'","data:","blob:","https://*.googleusercontent.com","https://*.tile.openstreetmap.org","https://*.basemaps.cartocdn.com"],connectSrc:["'self'","https://accounts.google.com","https://*.googleapis.com"],frameSrc:["https://accounts.google.com"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}},crossOriginOpenerPolicy:{policy:"same-origin-allow-popups"},crossOriginResourcePolicy:{policy:"cross-origin"}}));
}
app.use(express.json({limit:"12mb"})); app.use(attachUser);
const limiter=rateLimit({windowMs:60_000,limit:120,standardHeaders:"draft-7",legacyHeaders:false}); app.use("/api",limiter);
const aiLimiter=rateLimit({windowMs:60_000,limit:12,standardHeaders:"draft-7",legacyHeaders:false});
const geocodeLimiter=rateLimit({windowMs:60_000,limit:20,standardHeaders:"draft-7",legacyHeaders:false});

const ReportSchema=z.object({title:z.string().trim().max(140).optional().default(""),description:z.string().trim().min(10).max(2000),address:z.string().trim().min(3).max(300),category:z.enum(CIVIC_CATEGORIES),image:z.string().max(10_000_000),aiAttestation:z.string().min(20).max(20_000),lat:z.number(),lng:z.number()});
const textSchema=z.object({text:z.string().trim().min(1).max(1500)});
const aiSecret=()=>process.env.COOKIE_SECRET||"development-only-civicguardian-secret";
const evidenceHash=(image:string)=>crypto.createHash("sha256").update(image).digest("base64url");
const attestAi=(value:unknown,image:string)=>{const body=Buffer.from(JSON.stringify({value,evidenceHash:evidenceHash(image),exp:Date.now()+10*60_000})).toString("base64url");const sig=crypto.createHmac("sha256",aiSecret()).update(body).digest("base64url");return `${body}.${sig}`;};
const readAttestedAi=(token:string,image:string)=>{const [body,sig]=token.split(".");if(!body||!sig)throw new Error("AI assessment attestation is invalid.");const expected=crypto.createHmac("sha256",aiSecret()).update(body).digest("base64url");if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new Error("AI assessment attestation could not be verified.");const parsed=JSON.parse(Buffer.from(body,"base64url").toString());if(parsed.exp<Date.now()||parsed.evidenceHash!==evidenceHash(image)||!validateVisionResult(parsed.value))throw new Error("AI assessment expired, changed, or is invalid. Please analyze the evidence again.");return parsed.value;};

app.get("/api/health",async(_req,res)=>{try{res.json({ok:true,service:"CivicGuardian",...(await store.health())});}catch{res.status(503).json({ok:false,database:"unavailable"});}});
app.get("/api/auth/me",(req:AuthRequest,res)=>res.json({user:req.user||null,googleClientId:process.env.GOOGLE_CLIENT_ID||process.env.VITE_GOOGLE_CLIENT_ID||""}));
app.post("/api/auth/google",async(req:AuthRequest,res)=>{try{const credential=z.string().min(20).parse(req.body?.credential);const g=await verifyGoogleCredential(credential);const role=isAdminEmail(g.email)?"admin":"citizen";const user=await store.upsertUser(g,role);setSessionCookie(res,createSession(user));res.json({user});}catch(e:any){res.status(401).json({error:e?.message||"Google sign-in failed."});}});
app.post("/api/auth/logout",(_req,res)=>{clearSessionCookie(res);res.json({ok:true});});

app.get("/api/geocode/search",geocodeLimiter,async(req,res)=>{try{const q=z.string().trim().min(2).max(160).parse(req.query.q);const u=new URL("https://nominatim.openstreetmap.org/search");u.searchParams.set("q",`${q}, Dhaka, Bangladesh`);u.searchParams.set("format","jsonv2");u.searchParams.set("limit","6");u.searchParams.set("countrycodes","bd");u.searchParams.set("viewbox","90.25,24.02,90.55,23.60");u.searchParams.set("bounded","1");u.searchParams.set("accept-language","en");const r=await fetch(u,{headers:{"User-Agent":"CivicGuardian/1.0 (community safety project)",Accept:"application/json","Accept-Language":"en"}});if(!r.ok)throw new Error("Geocoder unavailable");const rows:any[]=await r.json();res.json({results:rows.filter(x=>insideDhaka(Number(x.lat),Number(x.lon))).map(x=>({display_name:x.display_name,lat:x.lat,lon:x.lon,type:x.type}))});}catch(e:any){res.status(503).json({error:e.message||"Address search unavailable"});}});
app.get("/api/geocode/reverse",geocodeLimiter,async(req,res)=>{try{const lat=z.coerce.number().parse(req.query.lat),lng=z.coerce.number().parse(req.query.lng);if(!insideDhaka(lat,lng))return res.status(400).json({error:"Please choose a point inside the Dhaka service area."});const u=new URL("https://nominatim.openstreetmap.org/reverse");u.searchParams.set("lat",String(lat));u.searchParams.set("lon",String(lng));u.searchParams.set("format","jsonv2");u.searchParams.set("zoom","18");u.searchParams.set("accept-language","en");const r=await fetch(u,{headers:{"User-Agent":"CivicGuardian/1.0 (community safety project)",Accept:"application/json","Accept-Language":"en"}});if(!r.ok)throw new Error("Geocoder unavailable");const d:any=await r.json();res.json({displayName:d.display_name||"",lat,lng});}catch(e:any){res.status(503).json({error:e.message||"Reverse geocoding unavailable"});}});

app.get("/api/issues",async(req:AuthRequest,res)=>res.json(await store.listIssues(req.user?.id)));
app.get("/api/me/issues",requireAuth,async(req:AuthRequest,res)=>res.json(await store.listMyIssues(req.user!.id)));
app.get("/api/me/notifications",requireAuth,async(req:AuthRequest,res)=>res.json(await store.notifications(req.user!.id)));
app.post("/api/me/notifications/:id/read",requireAuth,async(req:AuthRequest,res)=>res.json({ok:await store.markNotificationRead(req.user!.id,req.params.id)}));
app.get("/api/contributors",async(_req,res)=>res.json(await store.contributors()));
app.post("/api/issues/duplicates/check",requireAuth,async(req:AuthRequest,res)=>{try{const p=z.object({lat:z.number(),lng:z.number(),category:z.enum(CIVIC_CATEGORIES)}).parse(req.body);if(!insideDhaka(p.lat,p.lng))return res.status(400).json({error:"Location is outside the Dhaka service area."});const nearby=await store.nearby(p.lat,p.lng,250);res.json(nearby.filter(i=>i.category===p.category).slice(0,5));}catch(e:any){res.status(400).json({error:e?.message||"Could not check nearby reports."});}});
app.get("/api/stats",async(req:AuthRequest,res)=>{const issues=await store.listIssues(req.user?.id);const analyzed=issues.filter(i=>i.analysis?.vision?.confidence!==undefined);const cats:Record<string,number>={};issues.forEach(i=>cats[i.category]=(cats[i.category]||0)+1);res.json({totalIssues:issues.length,resolvedIssues:issues.filter(i=>i.status==="resolved").length,averageConfidence:analyzed.length?Math.round(analyzed.reduce((n,i)=>n+(i.analysis?.vision?.confidence||0),0)/analyzed.length):0,criticalCount:issues.filter(i=>i.analysis?.vision?.severity==="Critical").length,categoryDistribution:cats,totalVerifiedCount:issues.reduce((n,i)=>n+i.verifiedByCount,0),totalPredictionsGenerated:analyzed.length});});

app.post("/api/analyze-vision",requireAuth,aiLimiter,async(req:AuthRequest,res)=>{try{const description=z.string().min(10).max(2000).parse(req.body?.description);const image=z.string().max(10_000_000).parse(req.body?.image);const result=await analyzeVisionAgent(image,description,req.body?.title);res.json({...result,aiAttestation:attestAi(result,image)});}catch(e:any){res.status(e?.message?.includes("not configured")?503:400).json({error:e?.message||"Image analysis failed."});}});

app.post("/api/issues",requireAuth,aiLimiter,async(req:AuthRequest,res)=>{try{
  const p=ReportSchema.parse(req.body);if(!insideDhaka(p.lat,p.lng))return res.status(400).json({error:"CivicGuardian currently accepts reports inside the Dhaka metropolitan service area."});
  const v=readAttestedAi(p.aiAttestation,p.image);const priority=v.priority;const issueType=p.category;const now=new Date().toISOString();
  const issue:CivicIssue={id:`CG-${Date.now().toString(36).toUpperCase()}`,title:p.title||`${issueType} report`,description:p.description,imageUrl:p.image,status:"under_review",category:issueType,address:p.address,createdAt:now,upvotes:0,verifiedByCount:0,lat:p.lat,lng:p.lng,timeline:[{status:"reported",date:now,note:"Citizen report received with location and photo evidence."},{status:"under_review",date:now,note:"AI advisory assessment recorded; human review remains required before any official action."}],analysis:{vision:{category:v.issueType,severity:v.severity,confidence:v.confidenceScore,riskAssessment:v.safetyRisk,summary:v.description},resolution:{responsibleAuthority:authorities[issueType]||"Unassigned civic review queue",recommendedAction:"Human reviewer should validate the evidence and determine the appropriate response.",priority,estimatedResolutionTime:"Not estimated"},prediction:{escalationProbability:0,impactForecast:"No automated impact forecast is presented as fact.",suggestedPreventiveAction:"Use caution around the reported hazard and follow verified emergency guidance."}}};
  const nearby=await store.nearby(p.lat,p.lng,250);(issue as any).duplicateCandidates=nearby.filter(i=>i.category===issueType).map(i=>i.id);const saved=await store.saveIssue(issue,req.user!.id);await store.notify(req.user!.id,"Report received",`${issue.id} is now under review. You can track every status change from your dashboard.`,issue.id);for(const adminId of await store.adminIds())await store.notify(adminId,"New report awaiting review",`${issue.id}: ${issue.title}`,issue.id);await store.audit(req.user!.id,"issue.created",issue.id,{nearbyCandidates:nearby.length});res.status(201).json(saved);
}catch(e:any){res.status(400).json({error:e?.issues?.[0]?.message||e?.message||"Unable to create report."});}});

app.post("/api/issues/:id/upvote",requireAuth,async(req:AuthRequest,res)=>{const issue=await store.toggleVote(req.params.id,req.user!.id);if(!issue)return res.status(404).json({error:"Issue not found."});res.json(issue);});
app.post("/api/issues/:id/verify",requireAuth,async(req:AuthRequest,res)=>{const issue=await store.setVerdict(req.params.id,req.user!.id,"confirm");if(!issue)return res.status(404).json({error:"Issue not found."});res.json(issue);});
app.post("/api/issues/:id/not-accurate",requireAuth,async(req:AuthRequest,res)=>{const issue=await store.setVerdict(req.params.id,req.user!.id,"dispute");if(!issue)return res.status(404).json({error:"Issue not found."});res.json(issue);});
app.post("/api/issues/:id/comments",requireAuth,async(req:AuthRequest,res)=>{try{const {text}=textSchema.parse(req.body);const issue=await store.addComment(req.params.id,req.user!,text);if(!issue)return res.status(404).json({error:"Issue not found."});res.json(issue);}catch(e:any){res.status(400).json({error:e?.message||"Invalid comment."});}});
app.post("/api/issues/:id/resolve",requireAdmin,async(req:AuthRequest,res)=>{const issue=await store.getIssue(req.params.id,req.user!.id);if(!issue)return res.status(404).json({error:"Issue not found."});const next=z.enum(["reported","under_review","verified","assigned","in_progress","resolved","rejected","duplicate","unable_to_verify"]).parse(req.body?.nextStatus);issue.status=next;issue.timeline=[...(issue.timeline||[]),{status:next,date:new Date().toISOString(),note:`Status updated by an authorized CivicGuardian administrator: ${next.replaceAll("_"," ")}.`}];const saved=await store.saveIssue(issue);const reporter=await store.reporterIdForIssue(issue.id);if(reporter)await store.notify(reporter,"Report status updated",`${issue.id} is now ${next.replaceAll("_"," ")}.`,issue.id);await store.audit(req.user!.id,"issue.status_changed",issue.id,{status:next});res.json(saved);});
app.post("/api/issues/:id/merge",requireAdmin,async(req:AuthRequest,res)=>{const child=await store.getIssue(req.params.id);const parent=await store.getIssue(String(req.body?.mergeIntoId));if(!child||!parent)return res.status(404).json({error:"One or both issues were not found."});child.status="duplicate";child.timeline.push({status:"duplicate",date:new Date().toISOString(),note:`Marked as a duplicate by an authorized CivicGuardian administrator; canonical report: ${parent.id}.`});await store.saveIssue(child);await store.audit(req.user!.id,"issue.merged",child.id,{mergeIntoId:parent.id});res.json({success:true,childIssue:child,parentIssue:parent});});

app.get("/api/issues/:id/duplicates",async(req:AuthRequest,res)=>{const issue=await store.getIssue(req.params.id,req.user?.id);if(!issue||issue.lat===undefined||issue.lng===undefined)return res.status(404).json({error:"Issue not found."});const nearby=await store.nearby(issue.lat,issue.lng,250);res.json(nearby.filter(i=>i.id!==issue.id&&i.category===issue.category));});

async function start(){await store.migrate();if(!isProduction){const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});app.use(vite.middlewares);}else{const dist=path.join(process.cwd(),"dist");app.use(express.static(dist));app.get("*",(_req,res)=>res.sendFile(path.join(dist,"index.html")));}app.listen(PORT,"0.0.0.0",()=>console.log(`CivicGuardian listening on http://0.0.0.0:${PORT}`));}
start().catch(e=>{console.error(e);process.exit(1);});
