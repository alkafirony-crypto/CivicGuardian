export type IssueSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type IssuePriority = 'Low' | 'Medium' | 'High' | 'Immediate';
export type IssueStatus = 'reported' | 'under_review' | 'verified' | 'assigned' | 'in_progress' | 'resolved' | 'rejected' | 'duplicate' | 'unable_to_verify';
export interface AppUser { id: string; email: string; name: string; picture?: string; role: 'citizen' | 'admin'; }

export interface CivicNotification {
  id: string;
  issueId?: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface ContributorSummary {
  id: string;
  name: string;
  picture?: string;
  role?: 'citizen' | 'admin';
  badges?: string[];
  reports: number;
  verifications: number;
  helpfulVotes: number;
  score: number;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: 'citizen' | 'admin';
  createdAt: string;
  lastLoginAt: string;
  reportCount: number;
  commentCount: number;
}

export interface AdminCommentSummary {
  id: string;
  issueId: string;
  issueTitle: string;
  author: string;
  text: string;
  createdAt: string;
}

export type ResolutionVerdict = 'confirmed' | 'unresolved' | 'review';

export interface ResolutionProof {
  afterImageUrl: string;
  note: string;
  submittedAt: string;
  submittedBy: string;
}

export interface ResolutionFeedbackSummary {
  confirmed: number;
  unresolved: number;
  review: number;
  mine?: ResolutionVerdict;
}

export interface DuplicateCandidate {
  issue: CivicIssue;
  distanceMeters: number;
  similarityScore: number;
  reasons: string[];
}

export interface NotificationPreferences {
  statusUpdates: boolean;
  adminUpdates: boolean;
  resolutionRequests: boolean;
}

export interface VisionAgentOutput {
  category: string;
  severity: IssueSeverity;
  confidence: number; // 0 - 100
  riskAssessment: string;
  summary: string;
}

export interface ResolutionAgentOutput {
  responsibleAuthority: string;
  recommendedAction: string;
  priority: IssuePriority;
  estimatedResolutionTime: string;
}

export interface PredictionAgentOutput {
  escalationProbability: number; // 0 - 100
  impactForecast: string;
  suggestedPreventiveAction: string;
  futureRisk?: string;
  infrastructureRisk?: string;
  estimatedPopulationImpact?: string;
  urgencyScore?: number;
}

export interface IssueAnalysis {
  vision: VisionAgentOutput;
  resolution: ResolutionAgentOutput;
  prediction: PredictionAgentOutput;
}

export interface TimelineEvent {
  status: IssueStatus;
  date: string;
  note: string;
}

export interface IssueComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface VerificationHistoryEvent {
  id: string;
  type: 'confirm' | 'dispute';
  user: string;
  timestamp: string;
}

export interface CivicIssue {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  status: IssueStatus;
  category: string;
  address: string;
  createdAt: string;
  upvotes: number;
  verifiedByCount: number;
  notAccurateCount?: number;
  isNotAccurateByMe?: boolean;
  isVerifiedByMe?: boolean;
  isUpvotedByMe?: boolean;
  lat?: number;
  lng?: number;
  timeline: TimelineEvent[];
  analysis?: IssueAnalysis;
  additionalImages?: string[];
  comments?: IssueComment[];
  verificationHistory?: VerificationHistoryEvent[];
  followersCount?: number;
  isFollowedByMe?: boolean;
  resolutionProof?: ResolutionProof;
  resolutionFeedback?: ResolutionFeedbackSummary;
}

export interface DashboardMetrics {
  totalIssues: number;
  resolvedIssues: number;
  averageConfidence: number;
  criticalCount: number;
  categoryDistribution: Record<string, number>;
  totalVerifiedCount?: number;
  totalPredictionsGenerated?: number;
}
