import {afterEach,describe,expect,it,vi} from "vitest";
import {isAdminEmail,requireAdmin,type AuthRequest} from "./auth";
const original=process.env.ADMIN_EMAILS;
afterEach(()=>{if(original===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=original;});
describe("admin allowlist",()=>{it("grants admin eligibility only to configured verified-email value",()=>{process.env.ADMIN_EMAILS="alkafirony@gmail.com";expect(isAdminEmail("alkafirony@gmail.com")).toBe(true);expect(isAdminEmail("someone@gmail.com")).toBe(false);});});
describe("administrator middleware",()=>{
 it("rejects citizens even if a client-provided role claims administrator access",()=>{
  process.env.ADMIN_EMAILS="admin@example.com";
  const request={user:{id:"citizen",email:"citizen@example.com",name:"Citizen",role:"admin"}} as AuthRequest;
  const json=vi.fn();const status=vi.fn(()=>({json}));const next=vi.fn();
  requireAdmin(request,{status} as any,next);
  expect(status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
 });
 it("allows only an administrator whose verified email is in the server allowlist",()=>{
  process.env.ADMIN_EMAILS="admin@example.com";
  const request={user:{id:"admin",email:"admin@example.com",name:"Admin",role:"admin"}} as AuthRequest;
  const next=vi.fn();
  requireAdmin(request,{} as any,next);
  expect(next).toHaveBeenCalledOnce();
 });
});
