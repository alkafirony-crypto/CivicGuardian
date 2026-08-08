import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";

export type UserRole = "citizen" | "admin";
export interface AuthUser { id: string; email: string; name: string; picture?: string; role: UserRole }
export interface AuthRequest extends Request { user?: AuthUser }
const COOKIE_NAME = "civicguardian_session";
const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(clientId);
const secret = () => process.env.COOKIE_SECRET || "development-only-civicguardian-secret";
const sign = (value: string) => crypto.createHmac("sha256", secret()).update(value).digest("base64url");

export function createSession(user: AuthUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 7 * 86400000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function parseSession(req: Request): AuthUser | undefined {
  const raw = req.headers.cookie?.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length+1);
  if (!raw) return;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return;
  const expected = sign(body);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return;
  try { const p=JSON.parse(Buffer.from(body,"base64url").toString()); if(p.exp<Date.now()) return; const role:UserRole=isAdminEmail(p.email)?"admin":"citizen"; return {id:p.id,email:p.email,name:p.name,picture:p.picture,role}; } catch { return; }
}
export function attachUser(req: AuthRequest,_res:Response,next:NextFunction){req.user=parseSession(req);next();}
export function requireAuth(req:AuthRequest,res:Response,next:NextFunction){if(!req.user)return res.status(401).json({error:"Sign in with Google to continue."});next();}
export function requireAdmin(req:AuthRequest,res:Response,next:NextFunction){if(!req.user)return res.status(401).json({error:"Sign in to continue."});if(req.user.role!=="admin"||!isAdminEmail(req.user.email))return res.status(403).json({error:"Administrator access required."});next();}
export async function verifyGoogleCredential(credential:string){
  if(!clientId)throw new Error("Google OAuth is not configured.");
  const ticket=await googleClient.verifyIdToken({idToken:credential,audience:clientId}); const p=ticket.getPayload();
  if(!p?.sub||!p.email||!p.email_verified)throw new Error("Google account email is not verified.");
  return {googleSub:p.sub,email:p.email.toLowerCase(),name:p.name||p.email.split("@")[0],picture:p.picture};
}
export const isAdminEmail=(email:string)=>(process.env.ADMIN_EMAILS||"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
export function setSessionCookie(res:Response,token:string){res.setHeader("Set-Cookie",`${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV==="production"?"; Secure":""}`);}
export function clearSessionCookie(res:Response){res.setHeader("Set-Cookie",`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`);}
