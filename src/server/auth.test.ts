import {afterEach,describe,expect,it} from "vitest";
import {isAdminEmail} from "./auth";
const original=process.env.ADMIN_EMAILS;
afterEach(()=>{if(original===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=original;});
describe("admin allowlist",()=>{it("grants admin eligibility only to configured verified-email value",()=>{process.env.ADMIN_EMAILS="alkafirony@gmail.com";expect(isAdminEmail("alkafirony@gmail.com")).toBe(true);expect(isAdminEmail("someone@gmail.com")).toBe(false);});});
