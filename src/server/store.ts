import { Pool } from "pg";
import type { AuthUser, UserRole } from "./auth";
import type { CivicIssue, CivicNotification, ContributorSummary } from "../types";

function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v));}
export class CivicStore {
  private pool?:Pool;
  private memoryIssues:CivicIssue[]=[];
  private users=new Map<string,AuthUser&{googleSub:string}>();
  private votes=new Map<string,Set<string>>();
  private verdicts=new Map<string,Map<string,"confirm"|"dispute">>();
  private memoryReporters=new Map<string,string>();
  private memoryNotifications=new Map<string,CivicNotification[]>();
  constructor(){if(process.env.DATABASE_URL)this.pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined});}
  get persistent(){return !!this.pool;}
  async health(){if(!this.pool)return {database:"local-memory",persistent:false};await this.pool.query("SELECT 1");return {database:"postgres-postgis",persistent:true};}
  async migrate(){if(!this.pool)return; const fs=await import("fs");const path=await import("path");const sql=fs.readFileSync(path.join(process.cwd(),"db/migrations/001_init.sql"),"utf8");await this.pool.query(sql);}
  async upsertUser(g:{googleSub:string;email:string;name:string;picture?:string},role:UserRole):Promise<AuthUser>{
    if(!this.pool){let u=[...this.users.values()].find(v=>v.email===g.email);if(!u){u={id:`dev-${g.googleSub}`,email:g.email,name:g.name,picture:g.picture,role,googleSub:g.googleSub};this.users.set(u.id,u);}else{u={...u,...g,role:u.role==="admin"?"admin":role};this.users.set(u.id,u);}return u;}
    const q=await this.pool.query(`INSERT INTO users(google_sub,email,name,picture,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,picture=EXCLUDED.picture,last_login_at=now(),role=CASE WHEN users.role='admin' THEN 'admin' ELSE EXCLUDED.role END RETURNING id,email,name,picture,role`,[g.googleSub,g.email,g.name,g.picture||null,role]);return q.rows[0];
  }
  private async pgIssue(row:any,userId?:string):Promise<CivicIssue>{
    const iq=this.pool!; const [votes,checks,comments,mineVote,mineCheck]=await Promise.all([
      iq.query("SELECT count(*)::int n FROM votes WHERE issue_id=$1",[row.id]),iq.query("SELECT verdict,count(*)::int n FROM verifications WHERE issue_id=$1 GROUP BY verdict",[row.id]),iq.query("SELECT id::text,author,text,created_at AS \"createdAt\" FROM comments WHERE issue_id=$1 ORDER BY created_at",[row.id]),userId?iq.query("SELECT 1 FROM votes WHERE issue_id=$1 AND user_id=$2",[row.id,userId]):Promise.resolve({rowCount:0}),userId?iq.query("SELECT verdict FROM verifications WHERE issue_id=$1 AND user_id=$2",[row.id,userId]):Promise.resolve({rows:[]})]);
    const c=Object.fromEntries(checks.rows.map((x:any)=>[x.verdict,x.n])); const mine=(mineCheck as any).rows?.[0]?.verdict;
    return {id:row.id,title:row.title,description:row.description,imageUrl:row.image_url||"",status:row.status,category:row.category,address:row.address,createdAt:row.created_at,upvotes:votes.rows[0].n,verifiedByCount:c.confirm||0,notAccurateCount:c.dispute||0,isUpvotedByMe:!!(mineVote as any).rowCount,isVerifiedByMe:mine==="confirm",isNotAccurateByMe:mine==="dispute",lat:row.lat,lng:row.lng,timeline:row.timeline||[],analysis:row.analysis,additionalImages:row.additional_images||[],comments:comments.rows};
  }
  async listIssues(userId?:string){
    if(!this.pool)return this.memoryIssues.map(i=>this.decorateMemory(i,userId));
    const q=await this.pool.query(`SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng FROM issues ORDER BY created_at DESC`);return Promise.all(q.rows.map(r=>this.pgIssue(r,userId)));
  }
  async listMyIssues(userId:string){
    if(!this.pool)return this.memoryIssues.filter(i=>this.memoryReporters.get(i.id)===userId).map(i=>this.decorateMemory(i,userId));
    const q=await this.pool.query(`SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng FROM issues WHERE reporter_id=$1 ORDER BY created_at DESC`,[userId]);
    return Promise.all(q.rows.map(r=>this.pgIssue(r,userId)));
  }
  async getIssue(id:string,userId?:string){if(!this.pool){const x=this.memoryIssues.find(i=>i.id===id);return x?this.decorateMemory(x,userId):undefined;}const q=await this.pool.query(`SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng FROM issues WHERE id=$1`,[id]);return q.rowCount?this.pgIssue(q.rows[0],userId):undefined;}
  private decorateMemory(i:CivicIssue,userId?:string){const x=clone(i);x.upvotes=[...this.votes.values()].filter(s=>s.has(i.id)).length||i.upvotes;x.verifiedByCount=[...this.verdicts.values()].filter(m=>m.get(i.id)==="confirm").length||i.verifiedByCount;x.notAccurateCount=[...this.verdicts.values()].filter(m=>m.get(i.id)==="dispute").length; x.isUpvotedByMe=!!userId&&this.votes.get(userId)?.has(i.id);x.isVerifiedByMe=!!userId&&this.verdicts.get(userId)?.get(i.id)==="confirm";x.isNotAccurateByMe=!!userId&&this.verdicts.get(userId)?.get(i.id)==="dispute";return x;}
  async saveIssue(issue:CivicIssue,reporterId?:string){
    if(!this.pool){const ix=this.memoryIssues.findIndex(i=>i.id===issue.id);if(ix>=0)this.memoryIssues[ix]=clone(issue);else this.memoryIssues.unshift(clone(issue));if(reporterId)this.memoryReporters.set(issue.id,reporterId);return this.getIssue(issue.id,reporterId);}
    await this.pool.query(`INSERT INTO issues(id,reporter_id,title,description,image_url,status,category,address,location,analysis,timeline,additional_images,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,ST_SetSRID(ST_MakePoint($9,$10),4326)::geography,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,status=EXCLUDED.status,category=EXCLUDED.category,address=EXCLUDED.address,location=EXCLUDED.location,analysis=EXCLUDED.analysis,timeline=EXCLUDED.timeline,additional_images=EXCLUDED.additional_images,updated_at=now()`,[issue.id,reporterId||null,issue.title,issue.description,issue.imageUrl,issue.status,issue.category,issue.address,issue.lng,issue.lat,JSON.stringify(issue.analysis||null),JSON.stringify(issue.timeline||[]),JSON.stringify(issue.additionalImages||[]),issue.createdAt]);return this.getIssue(issue.id,reporterId);
  }
  async reporterIdForIssue(issueId:string){
    if(!this.pool)return this.memoryReporters.get(issueId);
    const q=await this.pool.query("SELECT reporter_id::text AS id FROM issues WHERE id=$1",[issueId]);return q.rows[0]?.id as string|undefined;
  }
  async notify(userId:string,title:string,message:string,issueId?:string){
    if(!this.pool){const n:CivicNotification={id:crypto.randomUUID(),issueId,title,message,createdAt:new Date().toISOString(),read:false};this.memoryNotifications.set(userId,[n,...(this.memoryNotifications.get(userId)||[])]);return n;}
    const q=await this.pool.query(`INSERT INTO notifications(user_id,issue_id,title,message) VALUES($1,$2,$3,$4) RETURNING id::text,"issue_id" AS "issueId",title,message,created_at AS "createdAt",is_read AS read`,[userId,issueId||null,title,message]);return q.rows[0] as CivicNotification;
  }
  async notifications(userId:string){
    if(!this.pool)return (this.memoryNotifications.get(userId)||[]).map(clone);
    const q=await this.pool.query(`SELECT id::text,issue_id AS "issueId",title,message,created_at AS "createdAt",is_read AS read FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[userId]);return q.rows as CivicNotification[];
  }
  async markNotificationRead(userId:string,id:string){
    if(!this.pool){const rows=this.memoryNotifications.get(userId)||[];const n=rows.find(x=>x.id===id);if(n)n.read=true;return !!n;}
    const q=await this.pool.query("UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2",[id,userId]);return !!q.rowCount;
  }
  async contributors():Promise<ContributorSummary[]>{
    if(!this.pool){
      return [...this.users.values()].filter(u=>u.role==="citizen").map(u=>{const reports=[...this.memoryReporters.values()].filter(id=>id===u.id).length;const verifications=this.verdicts.get(u.id)?.size||0;const helpfulVotes=this.votes.get(u.id)?.size||0;return{id:u.id,name:u.name,picture:u.picture,reports,verifications,helpfulVotes,score:reports*5+verifications*2+helpfulVotes};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8);
    }
    const q=await this.pool.query(`SELECT u.id::text,u.name,u.picture,COUNT(DISTINCT i.id)::int reports,COUNT(DISTINCT v.issue_id)::int verifications,COUNT(DISTINCT vo.issue_id)::int "helpfulVotes",(COUNT(DISTINCT i.id)*5+COUNT(DISTINCT v.issue_id)*2+COUNT(DISTINCT vo.issue_id))::int score FROM users u LEFT JOIN issues i ON i.reporter_id=u.id LEFT JOIN verifications v ON v.user_id=u.id LEFT JOIN votes vo ON vo.user_id=u.id WHERE u.role='citizen' GROUP BY u.id,u.name,u.picture HAVING COUNT(DISTINCT i.id)+COUNT(DISTINCT v.issue_id)+COUNT(DISTINCT vo.issue_id)>0 ORDER BY score DESC LIMIT 8`);return q.rows as ContributorSummary[];
  }
  async adminIds(){
    if(!this.pool)return [...this.users.values()].filter(u=>u.role==="admin").map(u=>u.id);
    const q=await this.pool.query("SELECT id::text FROM users WHERE role='admin'");return q.rows.map((x:any)=>x.id as string);
  }
  async toggleVote(issueId:string,userId:string){if(!this.pool){let s=this.votes.get(userId)||new Set();s.has(issueId)?s.delete(issueId):s.add(issueId);this.votes.set(userId,s);return this.getIssue(issueId,userId);}const r=await this.pool.query("DELETE FROM votes WHERE user_id=$1 AND issue_id=$2 RETURNING issue_id",[userId,issueId]);if(!r.rowCount)await this.pool.query("INSERT INTO votes(user_id,issue_id) VALUES($1,$2)",[userId,issueId]);return this.getIssue(issueId,userId);}
  async setVerdict(issueId:string,userId:string,verdict:"confirm"|"dispute"){if(!this.pool){let m=this.verdicts.get(userId)||new Map();m.get(issueId)===verdict?m.delete(issueId):m.set(issueId,verdict);this.verdicts.set(userId,m);return this.getIssue(issueId,userId);}const old=await this.pool.query("SELECT verdict FROM verifications WHERE user_id=$1 AND issue_id=$2",[userId,issueId]);if(old.rows[0]?.verdict===verdict)await this.pool.query("DELETE FROM verifications WHERE user_id=$1 AND issue_id=$2",[userId,issueId]);else await this.pool.query("INSERT INTO verifications(user_id,issue_id,verdict) VALUES($1,$2,$3) ON CONFLICT(user_id,issue_id) DO UPDATE SET verdict=EXCLUDED.verdict,updated_at=now()",[userId,issueId,verdict]);return this.getIssue(issueId,userId);}
  async addComment(issueId:string,user:AuthUser,text:string){if(!this.pool){const i=this.memoryIssues.find(x=>x.id===issueId);if(!i)return;i.comments=[...(i.comments||[]),{id:crypto.randomUUID(),author:user.name,text,createdAt:new Date().toISOString()}];return this.getIssue(issueId,user.id);}await this.pool.query("INSERT INTO comments(issue_id,user_id,author,text) VALUES($1,$2,$3,$4)",[issueId,user.id,user.name,text]);return this.getIssue(issueId,user.id);}
  async nearby(lat:number,lng:number,meters=250){if(!this.pool){return this.memoryIssues.filter(i=>i.lat&&i.lng&&Math.hypot((i.lat-lat)*111000,(i.lng-lng)*102000)<=meters);}const q=await this.pool.query(`SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng,ST_Distance(location,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) distance_m FROM issues WHERE ST_DWithin(location,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography,$3) ORDER BY distance_m LIMIT 10`,[lat,lng,meters]);return Promise.all(q.rows.map(r=>this.pgIssue(r)));}
  async audit(actorId:string,action:string,issueId?:string,metadata:any={}){if(this.pool)await this.pool.query("INSERT INTO audit_log(actor_id,action,issue_id,metadata) VALUES($1,$2,$3,$4)",[actorId,action,issueId||null,JSON.stringify(metadata)]);}
}
