/**
 * RackSlicer — Design Hub Domain Model & Community Types
 * Implements Section 10-35 of the Master Unified Product, UX & Design Hub Blueprint:
 * - Publication Classification & Access Control (Private / Invite-Only / Public)
 * - Multi-dimensional RackSlicer Architecture Score (AI Score)
 * - Community Rating & Written Reviews
 * - Threaded Technical Architecture Discussions
 * - Fork / Remix Attribution Lineage
 * - Social Share Previews & Open Graph Metadata
 * - Verifications & Contributor Badges
 */

export type PublicationClassification = 'private' | 'invite-only' | 'public';

export type DesignHubCategory =
  | 'Storage & HCI'
  | 'Cloud Architecture'
  | 'AI Infrastructure'
  | 'Datacenter'
  | 'Virtualization'
  | 'Microsoft Hybrid'
  | 'Networking'
  | 'Security & DR';

export type RankingSortTab =
  | 'trending'
  | 'top-rated'
  | 'most-forked'
  | 'most-viewed'
  | 'ai-recommended'
  | 'new';

export interface InvitedUser {
  emailOrUsername: string;
  role: 'viewer' | 'reviewer' | 'editor';
  canFork: boolean;
  canReshare: boolean;
  invitedAt: string;
}

export interface AccessHistoryEntry {
  classification: PublicationClassification;
  changedBy: string;
  timestamp: string;
  details: string;
}

export interface ArchitectureScoreBreakdown {
  overall: number; // 0-100
  architectureQuality: number;
  resilience: number;
  costEfficiency: number;
  scalability: number;
  networkArchitecture: number;
  storageDesign: number;
  security: number;
  documentation: number;
}

export interface CommunityReview {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number; // 1-5
  dimensions?: {
    quality: number;
    resilience: number;
    cost: number;
    scalability: number;
    docs: number;
  };
  comment: string;
  createdAt: string;
  likes: number;
}

export interface DiscussionReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  isAuthor: boolean;
  text: string;
  createdAt: string;
  likes: number;
}

export interface DiscussionThread {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  isAuthor: boolean;
  text: string;
  createdAt: string;
  likes: number;
  replies: DiscussionReply[];
  acceptedAnswer?: boolean;
}

export interface ForkLineage {
  originalDesignId: string;
  originalTitle: string;
  originalAuthor: string;
}

export interface ArchitectureVersion {
  version: string;
  changelog: string;
  createdAt: string;
  score: number;
}

export interface PublishedArchitecture {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: DesignHubCategory;
  tags: string[];
  classification: PublicationClassification;
  author: {
    id: string;
    name: string;
    username: string;
    title: string;
    avatar?: string;
    reputation: number;
    badges: string[];
  };
  version: string;
  versions: ArchitectureVersion[];
  forkLineage?: ForkLineage;
  license: string;
  thumbnailUrl: string;
  dataJson: string;
  targetCategory: 'rack' | 'datacenter' | 'flowchart' | 'cloud-aws' | 'cloud-azure' | 'cloud-gcp' | 'hybrid' | 'template' | 'cloud';

  // Metrics
  views: number;
  saves: number;
  forks: number;
  shares: number;
  isSaved?: boolean;
  isLiked?: boolean;

  // Scores & Rankings
  rackSlicerScore: ArchitectureScoreBreakdown;
  communityRating: {
    average: number;
    count: number;
    reviews: CommunityReview[];
  };
  discussions: DiscussionThread[];
  badges: string[];
  verification: 'community' | 'ai-validated' | 'verified' | 'expert-verified';

  // Community & Sharing Controls
  communitySettings: {
    allowRatings: boolean;
    allowReviews: boolean;
    allowDiscussions: boolean;
    allowFork: boolean;
    allowSocialSharing: boolean;
    includeAiScore: boolean;
  };
  invitedUsers?: InvitedUser[];
  accessHistory?: AccessHistoryEntry[];

  createdAt: string;
  updatedAt: string;
}
