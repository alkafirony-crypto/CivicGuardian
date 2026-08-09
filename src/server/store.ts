import fs from "fs";
import path from "path";
import { Pool } from "pg";
import type { AuthUser, UserRole } from "./auth";
import type {
  AdminCommentSummary,
  AdminUserSummary,
  CivicIssue,
  CivicNotification,
  ContributorSummary,
  DashboardMetrics,
  NotificationPreferences,
  ResolutionVerdict,
} from "../types";

type IssueFilters = {
  search?: string;
  category?: string;
  status?: string;
  dateFrom?: string;
  limit?: number;
  offset?: number;
};

type NotificationKind = "status" | "admin" | "resolution";

const DEFAULT_PREFERENCES: NotificationPreferences = {
  statusUpdates: true,
  adminUpdates: true,
  resolutionRequests: true,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function badgesFor(summary: Omit<ContributorSummary, "badges">): string[] {
  const badges: string[] = [];
  if (summary.reports >= 1) badges.push("First responder");
  if (summary.verifications >= 5) badges.push("Community verifier");
  if (summary.score >= 25) badges.push("Trusted contributor");
  return badges;
}

export class CivicStore {
  private pool?: Pool;
  private memoryIssues: CivicIssue[] = [];
  private users = new Map<string, AuthUser & { googleSub: string; createdAt: string; lastLoginAt: string }>();
  private removedUserEmails = new Set<string>();
  private memoryCommentOwners = new Map<string, string>();
  private votes = new Map<string, Set<string>>();
  private verdicts = new Map<string, Map<string, "confirm" | "dispute">>();
  private follows = new Map<string, Set<string>>();
  private resolutionFeedback = new Map<string, Map<string, ResolutionVerdict>>();
  private memoryReporters = new Map<string, string>();
  private memoryNotifications = new Map<string, CivicNotification[]>();
  private memoryPreferences = new Map<string, NotificationPreferences>();

  constructor() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      });
    }
  }

  get persistent() {
    return Boolean(this.pool);
  }

  async health() {
    if (!this.pool) return { database: "local-memory", persistent: false };
    await this.pool.query("SELECT 1");
    return { database: "postgres-postgis", persistent: true };
  }

  async migrate() {
    if (!this.pool) return;
    const migrationDir = path.join(process.cwd(), "db/migrations");
    const files = fs.readdirSync(migrationDir).filter(file => file.endsWith(".sql")).sort();
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS civicguardian_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const appliedResult = await this.pool.query<{ filename: string }>("SELECT filename FROM civicguardian_migrations");
    const applied = new Set(appliedResult.rows.map(row => row.filename));
    for (const file of files) {
      if (applied.has(file)) continue;
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(fs.readFileSync(path.join(migrationDir, file), "utf8"));
        await client.query("INSERT INTO civicguardian_migrations(filename) VALUES($1) ON CONFLICT DO NOTHING", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  }

  async upsertUser(
    google: { googleSub: string; email: string; name: string; picture?: string },
    role: UserRole,
  ): Promise<AuthUser> {
    if (!this.pool) {
      const normalizedEmail = google.email.toLowerCase();
      if (this.removedUserEmails.has(normalizedEmail)) throw new Error("This account has been removed by an administrator.");
      let user = [...this.users.values()].find(candidate => candidate.email === google.email);
      const now = new Date().toISOString();
      if (!user) {
        user = { id: `dev-${google.googleSub}`, ...google, role, createdAt: now, lastLoginAt: now };
      } else {
        user = { ...user, ...google, role: user.role === "admin" ? "admin" : role, lastLoginAt: now };
      }
      this.users.set(user.id, user);
      return user;
    }

    const result = await this.pool.query(
      `INSERT INTO users(google_sub,email,name,picture,role)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(email) DO UPDATE SET
         name=EXCLUDED.name,
         picture=EXCLUDED.picture,
         last_login_at=now(),
         role=CASE WHEN users.role='admin' THEN 'admin' ELSE EXCLUDED.role END
       WHERE users.is_active=true
       RETURNING id::text,email,name,picture,role`,
      [google.googleSub, google.email, google.name, google.picture || null, role],
    );
    if (!result.rows[0]) throw new Error("This account has been removed by an administrator.");
    return result.rows[0];
  }

  async isUserActive(userId: string) {
    if (!this.pool) return this.users.has(userId);
    const result = await this.pool.query("SELECT 1 FROM users WHERE id=$1 AND is_active=true", [userId]);
    return Boolean(result.rowCount);
  }

  async listAdminUsers(): Promise<AdminUserSummary[]> {
    if (!this.pool) {
      return [...this.users.values()].map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        reportCount: [...this.memoryReporters.values()].filter(ownerId => ownerId === user.id).length,
        commentCount: [...this.memoryCommentOwners.values()].filter(ownerId => ownerId === user.id).length,
      })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    const result = await this.pool.query(
      `SELECT u.id::text,u.email,u.name,u.picture,u.role,
        u.created_at AS "createdAt",u.last_login_at AS "lastLoginAt",
        COUNT(DISTINCT i.id)::int AS "reportCount",
        COUNT(DISTINCT c.id)::int AS "commentCount"
       FROM users u
       LEFT JOIN issues i ON i.reporter_id=u.id
       LEFT JOIN comments c ON c.user_id=u.id AND c.is_hidden=false
       WHERE u.is_active=true
       GROUP BY u.id,u.email,u.name,u.picture,u.role,u.created_at,u.last_login_at
       ORDER BY u.created_at DESC`,
    );
    return result.rows as AdminUserSummary[];
  }

  async listAdminComments(): Promise<AdminCommentSummary[]> {
    if (!this.pool) {
      return this.memoryIssues.flatMap(issue => (issue.comments || []).map(comment => ({
        id: comment.id,
        issueId: issue.id,
        issueTitle: issue.title,
        author: comment.author,
        text: comment.text,
        createdAt: comment.createdAt,
      }))).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    const result = await this.pool.query(
      `SELECT c.id::text,c.issue_id AS "issueId",i.title AS "issueTitle",
        c.author,c.text,c.created_at AS "createdAt"
       FROM comments c
       JOIN issues i ON i.id=c.issue_id
       WHERE c.is_hidden=false
       ORDER BY c.created_at DESC`,
    );
    return result.rows as AdminCommentSummary[];
  }

  async removeUser(userId: string, removedBy?: string) {
    if (!this.pool) {
      const user = this.users.get(userId);
      if (!user) return undefined;
      this.removedUserEmails.add(user.email.toLowerCase());
      this.users.delete(userId);
      this.votes.delete(userId);
      this.verdicts.delete(userId);
      this.follows.delete(userId);
      this.resolutionFeedback.delete(userId);
      this.memoryNotifications.delete(userId);
      this.memoryPreferences.delete(userId);
      for (const [issueId, ownerId] of this.memoryReporters) {
        if (ownerId === userId) this.memoryReporters.delete(issueId);
      }
      for (const issue of this.memoryIssues) {
        issue.comments = (issue.comments || []).filter(comment => this.memoryCommentOwners.get(comment.id) !== userId);
      }
      for (const [commentId, ownerId] of this.memoryCommentOwners) {
        if (ownerId === userId) this.memoryCommentOwners.delete(commentId);
      }
      return user;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query(
        `SELECT id::text,email,name,picture,role,created_at AS "createdAt",last_login_at AS "lastLoginAt"
         FROM users WHERE id=$1 AND is_active=true FOR UPDATE`,
        [userId],
      );
      if (!target.rowCount) {
        await client.query("ROLLBACK");
        return undefined;
      }
      await client.query("UPDATE issues SET reporter_id=NULL WHERE reporter_id=$1", [userId]);
      await client.query("DELETE FROM comments WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM votes WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM verifications WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM issue_follows WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM resolution_feedback WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM notification_preferences WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM notifications WHERE user_id=$1", [userId]);
      await client.query(
        "UPDATE users SET is_active=false,removed_at=now(),removed_by=$2 WHERE id=$1",
        [userId, removedBy || null],
      );
      await client.query("COMMIT");
      return target.rows[0] as AdminUserSummary;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async pgIssue(row: any, userId?: string): Promise<CivicIssue> {
    const database = this.pool!;
    const [votes, checks, comments, mineVote, mineCheck, followers, mineFollow, feedback] = await Promise.all([
      database.query("SELECT count(*)::int n FROM votes WHERE issue_id=$1", [row.id]),
      database.query("SELECT verdict,count(*)::int n FROM verifications WHERE issue_id=$1 GROUP BY verdict", [row.id]),
      database.query(
        `SELECT id::text,author,text,created_at AS "createdAt"
         FROM comments WHERE issue_id=$1 AND is_hidden=false ORDER BY created_at`,
        [row.id],
      ),
      userId ? database.query("SELECT 1 FROM votes WHERE issue_id=$1 AND user_id=$2", [row.id, userId]) : Promise.resolve({ rowCount: 0 }),
      userId ? database.query("SELECT verdict FROM verifications WHERE issue_id=$1 AND user_id=$2", [row.id, userId]) : Promise.resolve({ rows: [] }),
      database.query("SELECT count(*)::int n FROM issue_follows WHERE issue_id=$1", [row.id]),
      userId ? database.query("SELECT 1 FROM issue_follows WHERE issue_id=$1 AND user_id=$2", [row.id, userId]) : Promise.resolve({ rowCount: 0 }),
      database.query(
        `SELECT verdict,count(*)::int n,
          max(CASE WHEN user_id=$2 THEN verdict END) AS mine
         FROM resolution_feedback WHERE issue_id=$1 GROUP BY verdict`,
        [row.id, userId || null],
      ),
    ]);
    const verificationCounts = Object.fromEntries(checks.rows.map((item: any) => [item.verdict, item.n]));
    const mineVerdict = (mineCheck as any).rows?.[0]?.verdict;
    const resolutionCounts: Record<string, number> = { confirmed: 0, unresolved: 0, review: 0 };
    let myResolutionVerdict: ResolutionVerdict | undefined;
    for (const item of feedback.rows) {
      resolutionCounts[item.verdict] = item.n;
      if (item.mine) myResolutionVerdict = item.mine;
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url || "",
      status: row.status,
      category: row.category,
      address: row.address,
      createdAt: row.created_at,
      upvotes: votes.rows[0].n,
      verifiedByCount: verificationCounts.confirm || 0,
      notAccurateCount: verificationCounts.dispute || 0,
      isUpvotedByMe: Boolean((mineVote as any).rowCount),
      isVerifiedByMe: mineVerdict === "confirm",
      isNotAccurateByMe: mineVerdict === "dispute",
      lat: Number(row.lat),
      lng: Number(row.lng),
      timeline: row.timeline || [],
      analysis: row.analysis,
      additionalImages: row.additional_images || [],
      comments: comments.rows,
      followersCount: followers.rows[0].n,
      isFollowedByMe: Boolean((mineFollow as any).rowCount),
      resolutionProof: row.resolution_proof || undefined,
      resolutionFeedback: {
        confirmed: resolutionCounts.confirmed,
        unresolved: resolutionCounts.unresolved,
        review: resolutionCounts.review,
        mine: myResolutionVerdict,
      },
    };
  }

  async listIssues(userId?: string, filters: IssueFilters = {}) {
    if (!this.pool) {
      let rows = this.memoryIssues.map(issue => this.decorateMemory(issue, userId));
      if (filters.search) {
        const search = filters.search.toLowerCase();
        rows = rows.filter(issue => `${issue.title} ${issue.address} ${issue.category} ${issue.description}`.toLowerCase().includes(search));
      }
      if (filters.category) rows = rows.filter(issue => issue.category === filters.category);
      if (filters.status) rows = rows.filter(issue => issue.status === filters.status);
      if (filters.dateFrom) rows = rows.filter(issue => new Date(issue.createdAt) >= new Date(filters.dateFrom!));
      return rows.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 200));
    }

    const where: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      where.push(condition.replace("?", `$${values.length}`));
    };
    if (filters.search) add("to_tsvector('simple',coalesce(title,'')||' '||coalesce(description,'')||' '||coalesce(address,'')) @@ plainto_tsquery('simple',?)", filters.search);
    if (filters.category) add("category=?", filters.category);
    if (filters.status) add("status=?", filters.status);
    if (filters.dateFrom) add("created_at>=?::timestamptz", filters.dateFrom);
    const limit = Math.min(Math.max(filters.limit || 200, 1), 500);
    const offset = Math.max(filters.offset || 0, 0);
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng
       FROM issues ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return Promise.all(result.rows.map(row => this.pgIssue(row, userId)));
  }

  async listMyIssues(userId: string) {
    if (!this.pool) {
      return this.memoryIssues
        .filter(issue => this.memoryReporters.get(issue.id) === userId)
        .map(issue => this.decorateMemory(issue, userId));
    }
    const result = await this.pool.query(
      `SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng
       FROM issues WHERE reporter_id=$1 ORDER BY created_at DESC`,
      [userId],
    );
    return Promise.all(result.rows.map(row => this.pgIssue(row, userId)));
  }

  async statistics(): Promise<DashboardMetrics> {
    if (!this.pool) {
      const issues = this.memoryIssues.map(issue => this.decorateMemory(issue));
      const analyzed = issues.filter(issue => issue.analysis?.vision?.confidence !== undefined);
      const categoryDistribution: Record<string, number> = {};
      for (const issue of issues) categoryDistribution[issue.category] = (categoryDistribution[issue.category] || 0) + 1;
      return {
        totalIssues: issues.length,
        resolvedIssues: issues.filter(issue => issue.status === "resolved").length,
        averageConfidence: analyzed.length ? Math.round(analyzed.reduce((sum, issue) => sum + (issue.analysis?.vision?.confidence || 0), 0) / analyzed.length) : 0,
        criticalCount: issues.filter(issue => issue.analysis?.vision?.severity === "Critical").length,
        categoryDistribution,
        totalVerifiedCount: issues.reduce((sum, issue) => sum + issue.verifiedByCount, 0),
        totalPredictionsGenerated: analyzed.length,
      };
    }
    const [summary, categories, verifications] = await Promise.all([
      this.pool.query(`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status='resolved')::int AS resolved,
        count(*) FILTER (WHERE analysis->'vision'->>'severity'='Critical')::int AS critical,
        count(*) FILTER (WHERE analysis->'vision'->>'confidence' IS NOT NULL)::int AS analyzed,
        coalesce(round(avg((analysis->'vision'->>'confidence')::numeric) FILTER (WHERE analysis->'vision'->>'confidence' IS NOT NULL)),0)::int AS confidence
        FROM issues`),
      this.pool.query("SELECT category,count(*)::int n FROM issues GROUP BY category"),
      this.pool.query("SELECT count(*)::int n FROM verifications WHERE verdict='confirm'"),
    ]);
    const row = summary.rows[0];
    return {
      totalIssues: row.total,
      resolvedIssues: row.resolved,
      averageConfidence: row.confidence,
      criticalCount: row.critical,
      categoryDistribution: Object.fromEntries(categories.rows.map(item => [item.category, item.n])),
      totalVerifiedCount: verifications.rows[0].n,
      totalPredictionsGenerated: row.analyzed,
    };
  }

  async getIssue(id: string, userId?: string) {
    if (!this.pool) {
      const issue = this.memoryIssues.find(candidate => candidate.id === id);
      return issue ? this.decorateMemory(issue, userId) : undefined;
    }
    const result = await this.pool.query(
      `SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng FROM issues WHERE id=$1`,
      [id],
    );
    return result.rowCount ? this.pgIssue(result.rows[0], userId) : undefined;
  }

  private decorateMemory(issue: CivicIssue, userId?: string) {
    const decorated = clone(issue);
    decorated.upvotes = [...this.votes.values()].filter(set => set.has(issue.id)).length;
    decorated.verifiedByCount = [...this.verdicts.values()].filter(map => map.get(issue.id) === "confirm").length;
    decorated.notAccurateCount = [...this.verdicts.values()].filter(map => map.get(issue.id) === "dispute").length;
    decorated.isUpvotedByMe = Boolean(userId && this.votes.get(userId)?.has(issue.id));
    decorated.isVerifiedByMe = Boolean(userId && this.verdicts.get(userId)?.get(issue.id) === "confirm");
    decorated.isNotAccurateByMe = Boolean(userId && this.verdicts.get(userId)?.get(issue.id) === "dispute");
    decorated.followersCount = [...this.follows.values()].filter(set => set.has(issue.id)).length;
    decorated.isFollowedByMe = Boolean(userId && this.follows.get(userId)?.has(issue.id));
    const counts = { confirmed: 0, unresolved: 0, review: 0 };
    for (const map of this.resolutionFeedback.values()) {
      const verdict = map.get(issue.id);
      if (verdict) counts[verdict] += 1;
    }
    decorated.resolutionFeedback = {
      ...counts,
      mine: userId ? this.resolutionFeedback.get(userId)?.get(issue.id) : undefined,
    };
    return decorated;
  }

  async saveIssue(issue: CivicIssue, reporterId?: string) {
    if (!this.pool) {
      const index = this.memoryIssues.findIndex(candidate => candidate.id === issue.id);
      if (index >= 0) this.memoryIssues[index] = clone(issue);
      else this.memoryIssues.unshift(clone(issue));
      if (reporterId) this.memoryReporters.set(issue.id, reporterId);
      return this.getIssue(issue.id, reporterId);
    }
    await this.pool.query(
      `INSERT INTO issues(
         id,reporter_id,title,description,image_url,status,category,address,location,analysis,timeline,
         additional_images,resolution_proof,created_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,ST_SetSRID(ST_MakePoint($9,$10),4326)::geography,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO UPDATE SET
         title=EXCLUDED.title,description=EXCLUDED.description,image_url=EXCLUDED.image_url,status=EXCLUDED.status,
         category=EXCLUDED.category,address=EXCLUDED.address,location=EXCLUDED.location,analysis=EXCLUDED.analysis,
         timeline=EXCLUDED.timeline,additional_images=EXCLUDED.additional_images,resolution_proof=EXCLUDED.resolution_proof,
         updated_at=now()`,
      [
        issue.id, reporterId || null, issue.title, issue.description, issue.imageUrl, issue.status, issue.category,
        issue.address, issue.lng, issue.lat, JSON.stringify(issue.analysis || null), JSON.stringify(issue.timeline || []),
        JSON.stringify(issue.additionalImages || []), JSON.stringify(issue.resolutionProof || null), issue.createdAt,
      ],
    );
    return this.getIssue(issue.id, reporterId);
  }

  async reporterIdForIssue(issueId: string) {
    if (!this.pool) return this.memoryReporters.get(issueId);
    const result = await this.pool.query("SELECT reporter_id::text AS id FROM issues WHERE id=$1", [issueId]);
    return result.rows[0]?.id as string | undefined;
  }

  async isReporter(issueId: string, userId: string) {
    return (await this.reporterIdForIssue(issueId)) === userId;
  }

  private async notificationAllowed(userId: string, kind: NotificationKind) {
    const preferences = await this.getNotificationPreferences(userId);
    if (kind === "admin") return preferences.adminUpdates;
    if (kind === "resolution") return preferences.resolutionRequests;
    return preferences.statusUpdates;
  }

  async notify(userId: string, title: string, message: string, issueId?: string, kind: NotificationKind = "status") {
    if (!(await this.notificationAllowed(userId, kind))) return undefined;
    if (!this.pool) {
      const notification: CivicNotification = {
        id: crypto.randomUUID(), issueId, title, message, createdAt: new Date().toISOString(), read: false,
      };
      this.memoryNotifications.set(userId, [notification, ...(this.memoryNotifications.get(userId) || [])]);
      return notification;
    }
    const result = await this.pool.query(
      `INSERT INTO notifications(user_id,issue_id,title,message) VALUES($1,$2,$3,$4)
       RETURNING id::text,issue_id AS "issueId",title,message,created_at AS "createdAt",is_read AS read`,
      [userId, issueId || null, title, message],
    );
    return result.rows[0] as CivicNotification;
  }

  async notifications(userId: string) {
    if (!this.pool) return (this.memoryNotifications.get(userId) || []).map(clone);
    const result = await this.pool.query(
      `SELECT id::text,issue_id AS "issueId",title,message,created_at AS "createdAt",is_read AS read
       FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 75`,
      [userId],
    );
    return result.rows as CivicNotification[];
  }

  async markNotificationRead(userId: string, id: string) {
    if (!this.pool) {
      const notification = (this.memoryNotifications.get(userId) || []).find(item => item.id === id);
      if (notification) notification.read = true;
      return Boolean(notification);
    }
    const result = await this.pool.query("UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2", [id, userId]);
    return Boolean(result.rowCount);
  }

  async markAllNotificationsRead(userId: string) {
    if (!this.pool) {
      for (const notification of this.memoryNotifications.get(userId) || []) notification.read = true;
      return true;
    }
    await this.pool.query("UPDATE notifications SET is_read=true WHERE user_id=$1", [userId]);
    return true;
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    if (!this.pool) return clone(this.memoryPreferences.get(userId) || DEFAULT_PREFERENCES);
    const result = await this.pool.query(
      `SELECT status_updates AS "statusUpdates",admin_updates AS "adminUpdates",
              resolution_requests AS "resolutionRequests"
       FROM notification_preferences WHERE user_id=$1`,
      [userId],
    );
    return result.rows[0] || { ...DEFAULT_PREFERENCES };
  }

  async setNotificationPreferences(userId: string, preferences: NotificationPreferences) {
    if (!this.pool) {
      this.memoryPreferences.set(userId, clone(preferences));
      return preferences;
    }
    const result = await this.pool.query(
      `INSERT INTO notification_preferences(user_id,status_updates,admin_updates,resolution_requests)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(user_id) DO UPDATE SET status_updates=EXCLUDED.status_updates,
         admin_updates=EXCLUDED.admin_updates,resolution_requests=EXCLUDED.resolution_requests,updated_at=now()
       RETURNING status_updates AS "statusUpdates",admin_updates AS "adminUpdates",
                 resolution_requests AS "resolutionRequests"`,
      [userId, preferences.statusUpdates, preferences.adminUpdates, preferences.resolutionRequests],
    );
    return result.rows[0] as NotificationPreferences;
  }

  async contributors(): Promise<ContributorSummary[]> {
    let summaries: ContributorSummary[];
    if (!this.pool) {
      summaries = [...this.users.values()].filter(user => user.role === "citizen").map(user => {
        const reports = [...this.memoryReporters.values()].filter(id => id === user.id).length;
        const verifications = this.verdicts.get(user.id)?.size || 0;
        const helpfulVotes = this.votes.get(user.id)?.size || 0;
        return {
          id: user.id, name: user.name, picture: user.picture, role: user.role,
          reports, verifications, helpfulVotes, score: reports * 5 + verifications * 2 + helpfulVotes,
        };
      });
    } else {
      const result = await this.pool.query(
        `SELECT u.id::text,u.name,u.picture,u.role,
          COUNT(DISTINCT i.id)::int reports,
          COUNT(DISTINCT v.issue_id)::int verifications,
          COUNT(DISTINCT vo.issue_id)::int "helpfulVotes",
          (COUNT(DISTINCT i.id)*5+COUNT(DISTINCT v.issue_id)*2+COUNT(DISTINCT vo.issue_id))::int score
         FROM users u
         LEFT JOIN issues i ON i.reporter_id=u.id
         LEFT JOIN verifications v ON v.user_id=u.id
         LEFT JOIN votes vo ON vo.user_id=u.id
         WHERE u.role='citizen' AND u.is_active=true
         GROUP BY u.id,u.name,u.picture,u.role
         HAVING COUNT(DISTINCT i.id)+COUNT(DISTINCT v.issue_id)+COUNT(DISTINCT vo.issue_id)>0
         ORDER BY score DESC LIMIT 12`,
      );
      summaries = result.rows as ContributorSummary[];
    }
    return summaries
      .filter(summary => summary.score > 0)
      .map(summary => ({ ...summary, badges: badgesFor(summary) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
  }

  async adminIds() {
    if (!this.pool) return [...this.users.values()].filter(user => user.role === "admin").map(user => user.id);
    const result = await this.pool.query("SELECT id::text FROM users WHERE role='admin' AND is_active=true");
    return result.rows.map((item: any) => item.id as string);
  }

  async toggleVote(issueId: string, userId: string) {
    if (!this.pool) {
      const set = this.votes.get(userId) || new Set<string>();
      set.has(issueId) ? set.delete(issueId) : set.add(issueId);
      this.votes.set(userId, set);
      return this.getIssue(issueId, userId);
    }
    const removed = await this.pool.query("DELETE FROM votes WHERE user_id=$1 AND issue_id=$2 RETURNING issue_id", [userId, issueId]);
    if (!removed.rowCount) await this.pool.query("INSERT INTO votes(user_id,issue_id) VALUES($1,$2)", [userId, issueId]);
    return this.getIssue(issueId, userId);
  }

  async setVerdict(issueId: string, userId: string, verdict: "confirm" | "dispute") {
    if (!this.pool) {
      const map = this.verdicts.get(userId) || new Map<string, "confirm" | "dispute">();
      map.get(issueId) === verdict ? map.delete(issueId) : map.set(issueId, verdict);
      this.verdicts.set(userId, map);
      return this.getIssue(issueId, userId);
    }
    const old = await this.pool.query("SELECT verdict FROM verifications WHERE user_id=$1 AND issue_id=$2", [userId, issueId]);
    if (old.rows[0]?.verdict === verdict) {
      await this.pool.query("DELETE FROM verifications WHERE user_id=$1 AND issue_id=$2", [userId, issueId]);
    } else {
      await this.pool.query(
        `INSERT INTO verifications(user_id,issue_id,verdict) VALUES($1,$2,$3)
         ON CONFLICT(user_id,issue_id) DO UPDATE SET verdict=EXCLUDED.verdict,updated_at=now()`,
        [userId, issueId, verdict],
      );
    }
    return this.getIssue(issueId, userId);
  }

  async toggleFollow(issueId: string, userId: string) {
    if (!this.pool) {
      const set = this.follows.get(userId) || new Set<string>();
      set.has(issueId) ? set.delete(issueId) : set.add(issueId);
      this.follows.set(userId, set);
      return this.getIssue(issueId, userId);
    }
    const removed = await this.pool.query("DELETE FROM issue_follows WHERE user_id=$1 AND issue_id=$2 RETURNING issue_id", [userId, issueId]);
    if (!removed.rowCount) await this.pool.query("INSERT INTO issue_follows(user_id,issue_id) VALUES($1,$2)", [userId, issueId]);
    return this.getIssue(issueId, userId);
  }

  async followerIds(issueId: string) {
    if (!this.pool) return [...this.follows.entries()].filter(([, set]) => set.has(issueId)).map(([userId]) => userId);
    const result = await this.pool.query("SELECT user_id::text AS id FROM issue_follows WHERE issue_id=$1", [issueId]);
    return result.rows.map((item: any) => item.id as string);
  }

  async setResolutionFeedback(issueId: string, userId: string, verdict: ResolutionVerdict) {
    if (!this.pool) {
      const map = this.resolutionFeedback.get(userId) || new Map<string, ResolutionVerdict>();
      map.set(issueId, verdict);
      this.resolutionFeedback.set(userId, map);
      return this.getIssue(issueId, userId);
    }
    await this.pool.query(
      `INSERT INTO resolution_feedback(user_id,issue_id,verdict) VALUES($1,$2,$3)
       ON CONFLICT(user_id,issue_id) DO UPDATE SET verdict=EXCLUDED.verdict,updated_at=now()`,
      [userId, issueId, verdict],
    );
    return this.getIssue(issueId, userId);
  }

  async addComment(issueId: string, user: AuthUser, text: string) {
    if (!this.pool) {
      const issue = this.memoryIssues.find(candidate => candidate.id === issueId);
      if (!issue) return undefined;
      const id = crypto.randomUUID();
      issue.comments = [...(issue.comments || []), { id, author: user.name, text, createdAt: new Date().toISOString() }];
      this.memoryCommentOwners.set(id, user.id);
      return this.getIssue(issueId, user.id);
    }
    await this.pool.query("INSERT INTO comments(issue_id,user_id,author,text) VALUES($1,$2,$3,$4)", [issueId, user.id, user.name, text]);
    return this.getIssue(issueId, user.id);
  }

  async moderateComment(commentId: string, hidden: boolean) {
    if (!this.pool) {
      let found = false;
      for (const issue of this.memoryIssues) {
        const comment = issue.comments?.find(item => item.id === commentId);
        if (comment) {
          found = true;
          if (hidden) issue.comments = issue.comments?.filter(item => item.id !== commentId);
        }
      }
      return found;
    }
    const result = await this.pool.query("UPDATE comments SET is_hidden=$2 WHERE id=$1", [commentId, hidden]);
    return Boolean(result.rowCount);
  }

  async deleteComment(commentId: string) {
    if (!this.pool) {
      for (const issue of this.memoryIssues) {
        const comment = issue.comments?.find(item => item.id === commentId);
        if (!comment) continue;
        issue.comments = issue.comments?.filter(item => item.id !== commentId);
        this.memoryCommentOwners.delete(commentId);
        return { issueId: issue.id };
      }
      return undefined;
    }
    const result = await this.pool.query(
      `DELETE FROM comments WHERE id=$1 RETURNING issue_id AS "issueId"`,
      [commentId],
    );
    return result.rows[0] as { issueId: string } | undefined;
  }

  async addAdditionalImage(issueId: string, userId: string, imageUrl: string) {
    const issue = await this.getIssue(issueId, userId);
    if (!issue) return undefined;
    issue.additionalImages = [...(issue.additionalImages || []), imageUrl].slice(-8);
    await this.saveIssue(issue);
    return this.getIssue(issueId, userId);
  }

  async removeAdditionalImage(issueId: string, index: number) {
    const issue = await this.getIssue(issueId);
    if (!issue || !issue.additionalImages?.[index]) return undefined;
    issue.additionalImages = issue.additionalImages.filter((_, currentIndex) => currentIndex !== index);
    await this.saveIssue(issue);
    return this.getIssue(issueId);
  }

  async nearby(lat: number, lng: number, meters = 250) {
    if (!this.pool) {
      return this.memoryIssues.filter(issue => issue.lat !== undefined && issue.lng !== undefined
        && Math.hypot((issue.lat - lat) * 111_000, (issue.lng - lng) * 102_000) <= meters);
    }
    const result = await this.pool.query(
      `SELECT *,ST_Y(location::geometry) lat,ST_X(location::geometry) lng,
        ST_Distance(location,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) distance_m
       FROM issues
       WHERE ST_DWithin(location,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography,$3)
       ORDER BY distance_m LIMIT 20`,
      [lat, lng, meters],
    );
    return Promise.all(result.rows.map(row => this.pgIssue(row)));
  }

  async audit(actorId: string, action: string, issueId?: string, metadata: unknown = {}) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO audit_log(actor_id,action,issue_id,metadata) VALUES($1,$2,$3,$4)",
        [actorId, action, issueId || null, JSON.stringify(metadata)],
      );
    }
  }
}
