import {describe,expect,it} from "vitest";
import {CivicStore} from "./store";
import type {CivicIssue} from "../types";

const issue:CivicIssue={id:"CG-TEST",title:"Test report",description:"Real observed issue for test",imageUrl:"data:image/jpeg;base64,AA==",status:"under_review",category:"Road Infrastructure",address:"Dhaka",createdAt:new Date().toISOString(),upvotes:0,verifiedByCount:0,lat:23.8,lng:90.4,timeline:[]};

describe("citizen dashboard store",()=>{
 it("tracks a citizen's own reports and notifications",async()=>{
  const store=new CivicStore();
  const user=await store.upsertUser({googleSub:"sub-1",email:"citizen@example.com",name:"Citizen One"},"citizen");
  await store.saveIssue(issue,user.id);
  await store.notify(user.id,"Report received","Track this report",issue.id);
  expect((await store.listMyIssues(user.id)).map(i=>i.id)).toEqual([issue.id]);
  const notes=await store.notifications(user.id);expect(notes).toHaveLength(1);expect(notes[0].read).toBe(false);
  expect(await store.markNotificationRead(user.id,notes[0].id)).toBe(true);
  expect((await store.notifications(user.id))[0].read).toBe(true);
 });
 it("builds contributor ranking from actual user activity",async()=>{
  const store=new CivicStore();
  const user=await store.upsertUser({googleSub:"sub-2",email:"helper@example.com",name:"Helpful Citizen"},"citizen");
  await store.saveIssue({...issue,id:"CG-HERO"},user.id);
  await store.toggleVote("CG-HERO",user.id);
  const heroes=await store.contributors();
  expect(heroes[0]).toMatchObject({name:"Helpful Citizen",reports:1,helpfulVotes:1,score:6});
 });
});
