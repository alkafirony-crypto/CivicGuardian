import {describe,expect,it} from "vitest";
import {CivicStore} from "./store";
import type {CivicIssue} from "../types";

const issue:CivicIssue={id:"CG-TEST",title:"Test report",description:"Real observed issue for test",imageUrl:"data:image/jpeg;base64,AA==",status:"under_review",category:"Road Damage",address:"Dhaka",createdAt:new Date().toISOString(),upvotes:0,verifiedByCount:0,lat:23.8,lng:90.4,timeline:[]};

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
 it("counts genuine admin community actions without counting workflow actions",async()=>{
  const store=new CivicStore();
  const admin=await store.upsertUser({googleSub:"admin-sub",email:"admin@example.com",name:"Community Admin"},"admin");
  await store.saveIssue({...issue,id:"CG-ADMIN-HERO"},admin.id);
  await store.setVerdict("CG-ADMIN-HERO",admin.id,"confirm");
  const hero=(await store.contributors()).find(item=>item.id===admin.id);
  expect(hero).toMatchObject({role:"admin",reports:1,verifications:1,score:7});
 });
 it("supports following, resolution feedback, and notification preferences",async()=>{
  const store=new CivicStore();
  const user=await store.upsertUser({googleSub:"sub-3",email:"follower@example.com",name:"Report Follower"},"citizen");
  await store.saveIssue({...issue,id:"CG-FOLLOW",status:"resolved",resolutionProof:{afterImageUrl:"data:image/webp;base64,AA==",note:"Road surface repaired.",submittedAt:new Date().toISOString(),submittedBy:"Reviewer"}},user.id);
  const followed=await store.toggleFollow("CG-FOLLOW",user.id);
  expect(followed?.isFollowedByMe).toBe(true);
  expect(await store.followerIds("CG-FOLLOW")).toContain(user.id);
  const reviewed=await store.setResolutionFeedback("CG-FOLLOW",user.id,"review");
  expect(reviewed?.resolutionFeedback).toMatchObject({review:1,mine:"review"});
  await store.setNotificationPreferences(user.id,{statusUpdates:false,adminUpdates:true,resolutionRequests:true});
  await store.notify(user.id,"Hidden status","Should not be delivered","CG-FOLLOW","status");
  await store.notify(user.id,"Resolution update","Should be delivered","CG-FOLLOW","resolution");
  expect((await store.notifications(user.id)).map(note=>note.title)).toEqual(["Resolution update"]);
  await store.markAllNotificationsRead(user.id);
  expect((await store.notifications(user.id)).every(note=>note.read)).toBe(true);
 });
});
