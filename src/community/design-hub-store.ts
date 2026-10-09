/**
 * RackSlicer — Design Hub Store
 * Manages community-published infrastructure architectures, discovery rankings,
 * fork/remix lineage, discussions, ratings, and publication access control.
 */

import {
  PublishedArchitecture,
  PublicationClassification,
  GenerationSource,
  DesignHubCategory,
  RankingSortTab,
  CommunityReview,
  DiscussionThread,
  InvitedUser,
} from './design-hub-types';
import { getTemplatePayloadJson } from '../storage/template-data-generator';
import { projectStore, SaaSProject } from '../storage/project-store';
import { authStore } from '../auth/auth-store';
import EventBus from '../core/event-bus';

const STORAGE_KEY_DESIGN_HUB = 'rackslicer_design_hub_store_v1';

// Seed community reference architectures
const SEED_PUBLISHED_DESIGNS: PublishedArchitecture[] = [
  {
    id: 'pub-ceph-mesh-01',
    slug: '3-node-ceph-mesh',
    title: '3-Node Ceph Mesh Cluster',
    description: 'Direct point-to-point mesh cabling between 3 Proxmox nodes eliminating redundant 25GbE ToR switches while preserving dual-feed redundant power and sub-millisecond replication latency.',
    category: 'Storage & HCI',
    tags: ['Ceph', 'Proxmox', '25GbE', 'HCI', 'Mesh-Network', 'NVMe'],
    classification: 'public',
    generationSource: 'human-generated',
    author: {
      id: 'usr-srinivas-architect',
      name: 'Srinivas V.',
      username: 'sv_architect',
      title: 'Principal Infrastructure Architect',
      avatar: '/assets/dashboard/card-server-rack.jpg',
      reputation: 1840,
      badges: ['🏆 Top Rated', '🛡 Highly Resilient', '⚡ Power Optimized'],
    },
    version: 'v1.2',
    versions: [
      { version: 'v1.0', changelog: 'Initial 3-node 10GbE mesh design', createdAt: '2026-09-12T10:00:00Z', score: 87 },
      { version: 'v1.1', changelog: 'Upgraded to dual 25GbE CX-4 NICs and side-ear cable routing', createdAt: '2026-09-28T14:30:00Z', score: 90 },
      { version: 'v1.2', changelog: 'Added redundant Feed A/B power layout and PBS backup server', createdAt: '2026-10-04T09:15:00Z', score: 92 },
    ],
    license: 'RackSlicer Community License (RCL-1.0)',
    thumbnailUrl: '/assets/dashboard/card-server-rack.jpg',
    dataJson: getTemplatePayloadJson('tpl-ceph-mesh'),
    targetCategory: 'rack',
    views: 3420,
    saves: 482,
    forks: 188,
    shares: 114,
    isSaved: true,
    rackSlicerScore: {
      overall: 92,
      architectureQuality: 94,
      resilience: 95,
      costEfficiency: 98,
      scalability: 84,
      networkArchitecture: 93,
      storageDesign: 95,
      security: 91,
      documentation: 96,
    },
    communityRating: {
      average: 4.88,
      count: 64,
      reviews: [
        {
          id: 'rev-1',
          userId: 'usr-raj-k',
          userName: 'Rajesh Kumar',
          rating: 5,
          dimensions: { quality: 5, resilience: 5, cost: 5, scalability: 4, docs: 5 },
          comment: 'Eliminated the need for expensive top-of-rack switches. The direct mesh routing is rock solid under Ceph replication stress.',
          createdAt: '2026-10-06T12:00:00Z',
          likes: 24,
        },
        {
          id: 'rev-2',
          userId: 'usr-alex-m',
          userName: 'Alex Mercier',
          rating: 4.8,
          dimensions: { quality: 5, resilience: 4.8, cost: 5, scalability: 4, docs: 5 },
          comment: 'The side ear blade hole cable routing and Feed A/B color separation make this documentation ready for client signoff.',
          createdAt: '2026-10-07T08:30:00Z',
          likes: 18,
        },
      ],
    },
    discussions: [
      {
        id: 'disc-1',
        userId: 'usr-david-t',
        userName: 'David Thornton',
        isAuthor: false,
        text: 'Why did you route the cluster replication through left ear NIC1 instead of a dedicated rear slot?',
        createdAt: '2026-10-05T15:20:00Z',
        likes: 12,
        replies: [
          {
            id: 'rep-1',
            userId: 'usr-srinivas-architect',
            userName: 'Srinivas V.',
            isAuthor: true,
            text: 'Great question! Left ear S1-P1 enters directly into the 4-inch vertical cable manager, preventing cable droop across the center hot-aisle exhaust.',
            createdAt: '2026-10-05T16:05:00Z',
            likes: 19,
          },
        ],
        acceptedAnswer: true,
      },
    ],
    badges: ['★ AI Recommended', '🏆 Top Rated', '🛡 Highly Resilient', '⚡ Power Optimized'],
    verification: 'verified',
    communitySettings: {
      allowRatings: true,
      allowReviews: true,
      allowDiscussions: true,
      allowFork: true,
      allowSocialSharing: true,
      includeAiScore: true,
    },
    createdAt: '2026-09-12T10:00:00Z',
    updatedAt: '2026-10-08T18:00:00Z',
  },
  {
    id: 'pub-azure-hub-02',
    slug: 'azure-enterprise-landing-zone',
    title: 'Azure Hub-Spoke Enterprise Landing Zone',
    description: 'Mission-critical cloud architecture featuring Central Hub VNet, Azure Firewall Premium with TLS inspection, ExpressRoute gateway, and spoke containment for production SAP & database workloads.',
    category: 'Cloud Architecture',
    tags: ['Azure', 'Landing-Zone', 'Hub-Spoke', 'Firewall-Premium', 'ExpressRoute', 'Enterprise'],
    classification: 'public',
    generationSource: 'ai-generated',
    author: {
      id: 'usr-elena-cloud',
      name: 'Elena Rostova',
      username: 'elena_cloud',
      title: 'Lead Azure Cloud Solutions Architect',
      reputation: 2150,
      badges: ['☁ Cloud Ready', '🤖 AI Validated', '🏆 Top Rated'],
    },
    version: 'v2.1',
    versions: [
      { version: 'v1.0', changelog: 'Basic hub-spoke peering topology', createdAt: '2026-08-15T09:00:00Z', score: 88 },
      { version: 'v2.0', changelog: 'Added Azure Firewall Premium & Gateway Subnet zero-trust rules', createdAt: '2026-09-20T11:00:00Z', score: 94 },
    ],
    license: 'Creative Commons CC-BY-4.0',
    thumbnailUrl: '/assets/dashboard/card-aws-transit.jpg',
    dataJson: getTemplatePayloadJson('tpl-azure-hub-spoke'),
    targetCategory: 'cloud',
    views: 4890,
    saves: 720,
    forks: 310,
    shares: 245,
    isSaved: false,
    rackSlicerScore: {
      overall: 94,
      architectureQuality: 96,
      resilience: 96,
      costEfficiency: 88,
      scalability: 97,
      networkArchitecture: 98,
      storageDesign: 92,
      security: 98,
      documentation: 95,
    },
    communityRating: {
      average: 4.92,
      count: 92,
      reviews: [],
    },
    discussions: [],
    badges: ['★ AI Recommended', '☁ Cloud Ready', '🤖 AI Validated'],
    verification: 'verified',
    communitySettings: {
      allowRatings: true,
      allowReviews: true,
      allowDiscussions: true,
      allowFork: true,
      allowSocialSharing: true,
      includeAiScore: true,
    },
    createdAt: '2026-08-15T09:00:00Z',
    updatedAt: '2026-10-07T14:20:00Z',
  },
  {
    id: 'pub-h100-gpu-03',
    slug: 'nvidia-h100-ai-supercomputing-pod',
    title: 'NVIDIA H100 8-GPU Supercomputing AI Pod',
    description: 'High-density 48U rack housing Supermicro HGX H100 8-GPU node with dual Quantum-2 800Gb/s NDR InfiniBand switches, redundant 3-phase 30A PDUs, and in-rack CDU liquid manifold cooling.',
    category: 'AI Infrastructure',
    tags: ['NVIDIA', 'H100', 'InfiniBand', 'NDR-800G', 'Liquid-Cooling', 'AI-Cluster'],
    classification: 'public',
    generationSource: 'ai-generated',
    author: {
      id: 'usr-marcus-ai',
      name: 'Marcus Vance',
      username: 'vance_infra',
      title: 'HPC & AI Datacenter Engineer',
      reputation: 2940,
      badges: ['🚀 Most Forked', '🔥 Trending', '🛡 Highly Resilient'],
    },
    version: 'v1.4',
    versions: [
      { version: 'v1.0', changelog: 'Initial 4x H100 air-cooled baseline', createdAt: '2026-09-01T10:00:00Z', score: 89 },
      { version: 'v1.4', changelog: 'Upgraded to 8x HGX H100 + CDU liquid manifold loop', createdAt: '2026-10-02T16:00:00Z', score: 96 },
    ],
    license: 'RackSlicer Community License (RCL-1.0)',
    thumbnailUrl: '/assets/dashboard/card-dc-hall.jpg',
    dataJson: getTemplatePayloadJson('tpl-ai-gpu-pod'),
    targetCategory: 'rack',
    views: 6120,
    saves: 940,
    forks: 412,
    shares: 380,
    isSaved: true,
    rackSlicerScore: {
      overall: 96,
      architectureQuality: 98,
      resilience: 97,
      costEfficiency: 89,
      scalability: 96,
      networkArchitecture: 99,
      storageDesign: 95,
      security: 94,
      documentation: 98,
    },
    communityRating: {
      average: 4.96,
      count: 115,
      reviews: [],
    },
    discussions: [],
    badges: ['🔥 Trending', '🚀 Most Forked', '🤖 AI Validated'],
    verification: 'expert-verified',
    communitySettings: {
      allowRatings: true,
      allowReviews: true,
      allowDiscussions: true,
      allowFork: true,
      allowSocialSharing: true,
      includeAiScore: true,
    },
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-08T12:00:00Z',
  },
  {
    id: 'pub-proxmox-ceph-04',
    slug: 'proxmox-enterprise-hci-pod',
    title: '3-Node Proxmox VE + Ceph + PBS HCI Pod',
    description: 'Enterprise HCI cluster on 42U rack with dual Cisco Nexus 93180YC 25GbE ToR switches, dedicated Proxmox Backup Server, and redundant Feed A/B power delivery.',
    category: 'Virtualization',
    tags: ['Proxmox', 'Ceph', 'PBS', 'Cisco-Nexus', 'Dual-ToR', '25GbE'],
    classification: 'public',
    generationSource: 'human-generated',
    author: {
      id: 'usr-srinivas-architect',
      name: 'Srinivas V.',
      username: 'sv_architect',
      title: 'Principal Infrastructure Architect',
      reputation: 1840,
      badges: ['🏆 Top Rated', '🛡 Highly Resilient'],
    },
    version: 'v2.0',
    versions: [
      { version: 'v1.0', changelog: 'Initial 3-node switched setup', createdAt: '2026-09-18T11:00:00Z', score: 91 },
      { version: 'v2.0', changelog: 'Full Side Ear hole termination with top-row switch allocation', createdAt: '2026-10-08T15:00:00Z', score: 95 },
    ],
    license: 'RackSlicer Community License (RCL-1.0)',
    thumbnailUrl: '/assets/dashboard/card-esd-floor.jpg',
    dataJson: getTemplatePayloadJson('tpl-proxmox-ceph'),
    targetCategory: 'rack',
    views: 3950,
    saves: 580,
    forks: 230,
    shares: 160,
    isSaved: false,
    rackSlicerScore: {
      overall: 95,
      architectureQuality: 96,
      resilience: 98,
      costEfficiency: 92,
      scalability: 94,
      networkArchitecture: 97,
      storageDesign: 95,
      security: 93,
      documentation: 97,
    },
    communityRating: {
      average: 4.89,
      count: 78,
      reviews: [],
    },
    discussions: [],
    badges: ['★ AI Recommended', '🏆 Top Rated', '🛡 Highly Resilient'],
    verification: 'verified',
    communitySettings: {
      allowRatings: true,
      allowReviews: true,
      allowDiscussions: true,
      allowFork: true,
      allowSocialSharing: true,
      includeAiScore: true,
    },
    createdAt: '2026-09-18T11:00:00Z',
    updatedAt: '2026-10-08T16:00:00Z',
  },
  {
    id: 'pub-hyperv-s2d-05',
    slug: 'hyperv-2node-azure-arc-s2d',
    title: '2-Node Hyper-V Cluster + Azure Arc & S2D',
    description: 'High-availability Windows Server 2025 failover cluster with Storage Spaces Direct (S2D) local NVMe caching and Azure Arc connected gateway management.',
    category: 'Microsoft Hybrid',
    tags: ['Hyper-V', 'Azure-Arc', 'S2D', 'Windows-Server', 'Dell-PowerEdge', 'Hybrid'],
    classification: 'public',
    generationSource: 'human-generated',
    author: {
      id: 'usr-kavita-win',
      name: 'Kavita Sundaram',
      username: 'kavita_sysadmin',
      title: 'Enterprise Windows & Hybrid Systems Architect',
      reputation: 1620,
      badges: ['🛡 Highly Resilient', '🤖 AI Validated'],
    },
    version: 'v1.3',
    versions: [
      { version: 'v1.0', changelog: '2-Node S2D Baseline', createdAt: '2026-09-10T12:00:00Z', score: 88 },
      { version: 'v1.3', changelog: 'Added Azure Arc Edge Gateway appliance', createdAt: '2026-10-03T18:00:00Z', score: 91 },
    ],
    license: 'All Rights Reserved (View & Fork Only)',
    thumbnailUrl: '/assets/dashboard/card-esd-floor.jpg',
    dataJson: getTemplatePayloadJson('tpl-hyperv-cluster'),
    targetCategory: 'rack',
    views: 2840,
    saves: 390,
    forks: 145,
    shares: 98,
    isSaved: false,
    rackSlicerScore: {
      overall: 91,
      architectureQuality: 92,
      resilience: 94,
      costEfficiency: 89,
      scalability: 86,
      networkArchitecture: 93,
      storageDesign: 92,
      security: 91,
      documentation: 94,
    },
    communityRating: {
      average: 4.76,
      count: 42,
      reviews: [],
    },
    discussions: [],
    badges: ['🛡 Highly Resilient', '🤖 AI Validated'],
    verification: 'community',
    communitySettings: {
      allowRatings: true,
      allowReviews: true,
      allowDiscussions: true,
      allowFork: true,
      allowSocialSharing: true,
      includeAiScore: true,
    },
    createdAt: '2026-09-10T12:00:00Z',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'pub-aws-transit-06',
    slug: 'aws-multi-vpc-transit-gateway',
    title: 'AWS Hybrid Multi-VPC Transit Gateway',
    description: 'Enterprise cloud networking fabric routing 12 branch spoke VPCs, centralized egress inspection via dual FortiGate firewalls, and DirectConnect on-prem linkage.',
    category: 'Cloud Architecture',
    tags: ['AWS', 'Transit-Gateway', 'DirectConnect', 'Hybrid', 'FortiGate', 'Multi-VPC'],
    classification: 'public',
    generationSource: 'human-generated',
    author: {
      id: 'usr-liam-net',
      name: 'Liam Chen',
      username: 'liam_neteng',
      title: 'Cloud Network & Security Architect',
      reputation: 2310,
      badges: ['🌐 Network Optimized', '☁ Cloud Ready'],
    },
    version: 'v2.0',
    versions: [
      { version: 'v1.0', changelog: 'Single region TGW baseline', createdAt: '2026-08-20T08:00:00Z', score: 89 },
      { version: 'v2.0', changelog: 'Centralized security VPC inspection architecture', createdAt: '2026-09-25T14:00:00Z', score: 93 },
    ],
    license: 'Creative Commons CC-BY-4.0',
    thumbnailUrl: '/assets/dashboard/card-aws-transit.jpg',
    dataJson: getTemplatePayloadJson('tpl-aws-transit'),
    targetCategory: 'cloud',
    views: 3180,
    saves: 440,
    forks: 195,
    shares: 130,
    isSaved: false,
    rackSlicerScore: {
      overall: 93,
      architectureQuality: 95,
      resilience: 95,
      costEfficiency: 87,
      scalability: 96,
      networkArchitecture: 97,
      storageDesign: 88,
      security: 97,
      documentation: 93,
    },
    communityRating: {
      average: 4.82,
      count: 53,
      reviews: [],
    },
    discussions: [],
    badges: ['🌐 Network Optimized', '☁ Cloud Ready'],
    verification: 'verified',
    communitySettings: {
      allowRatings: true,
      allowReviews: true,
      allowDiscussions: true,
      allowFork: true,
      allowSocialSharing: true,
      includeAiScore: true,
    },
    createdAt: '2026-08-20T08:00:00Z',
    updatedAt: '2026-10-05T11:00:00Z',
  },
];

class DesignHubStore {
  private designs: PublishedArchitecture[] = [];

  constructor() {
    this.loadFromStorage();
  }

  public resetToSeeds(): void {
    this.designs = [...SEED_PUBLISHED_DESIGNS];
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DESIGN_HUB);
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored) && stored.length > 0) {
          // Merge seed designs to guarantee fresh updates
          const storedIds = new Set(stored.map((d: PublishedArchitecture) => d.id));
          const missing = SEED_PUBLISHED_DESIGNS.filter(s => !storedIds.has(s.id));
          const merged = [...stored, ...missing];
          for (const d of merged) {
            if (!d.generationSource) {
              const seed = SEED_PUBLISHED_DESIGNS.find(s => s.id === d.id);
              d.generationSource = seed ? seed.generationSource : 'human-generated';
            }
          }
          this.designs = merged;
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse Design Hub local storage:', e);
    }
    this.designs = [...SEED_PUBLISHED_DESIGNS];
    this.saveToStorage();
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_DESIGN_HUB, JSON.stringify(this.designs));
    } catch (e) {
      console.error('Failed to save Design Hub to localStorage:', e);
    }
  }

  public getAllDesigns(): PublishedArchitecture[] {
    return [...this.designs];
  }

  public getDesignById(id: string): PublishedArchitecture | null {
    return this.designs.find(d => d.id === id) || null;
  }

  public getDesignBySlug(slug: string): PublishedArchitecture | null {
    return this.designs.find(d => d.slug === slug) || null;
  }

  /**
   * Filter and rank designs based on search, category, and ranking tabs (Section 17 & 18)
   */
  public queryDesigns(
    tabOrOpts: RankingSortTab | { tab?: RankingSortTab; category?: string; search?: string } = 'trending',
    categoryArg: string = 'all',
    searchArg: string = '',
  ): PublishedArchitecture[] {
    let tab: RankingSortTab = 'trending';
    let category: string = 'all';
    let search: string = '';

    if (typeof tabOrOpts === 'object' && tabOrOpts !== null) {
      tab = tabOrOpts.tab || 'trending';
      category = tabOrOpts.category || 'all';
      search = tabOrOpts.search || '';
    } else {
      tab = tabOrOpts;
      category = categoryArg;
      search = searchArg;
    }

    let list = this.designs.filter(d => d.classification === 'public');

    // Category filter
    if (category && category !== 'all') {
      const catLower = category.toLowerCase();
      list = list.filter(d =>
        d.category.toLowerCase().includes(catLower) ||
        d.tags.some(t => t.toLowerCase().includes(catLower))
      );
    }

    // Natural-language search filter
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some(t => t.toLowerCase().includes(q)) ||
        d.author.name.toLowerCase().includes(q) ||
        d.author.username.toLowerCase().includes(q)
      );
    }

    // Ranking algorithm (Section 17: Configurable multi-factor ranking)
    switch (tab) {
      case 'trending':
        // Activity & recency weighted (views + forks * 3 + saves * 2)
        list.sort((a, b) => (b.views + b.forks * 3 + b.saves * 2) - (a.views + a.forks * 3 + a.saves * 2));
        break;
      case 'top-rated':
        // Highest community rating + review count confidence
        list.sort((a, b) => {
          const scoreA = a.communityRating.average * Math.log10(a.communityRating.count + 1);
          const scoreB = b.communityRating.average * Math.log10(b.communityRating.count + 1);
          return scoreB - scoreA;
        });
        break;
      case 'most-forked':
        list.sort((a, b) => b.forks - a.forks);
        break;
      case 'most-viewed':
        list.sort((a, b) => b.views - a.views);
        break;
      case 'ai-recommended':
        // Highest multi-dimensional RackSlicer Score
        list.sort((a, b) => b.rackSlicerScore.overall - a.rackSlicerScore.overall);
        break;
      case 'new':
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    return list;
  }

  /**
   * Fork & Customize an existing published architecture into user's editable workspace (Section 21)
   */
  public forkDesign(designId: string, customTitle?: string): SaaSProject {
    const design = this.getDesignById(designId);
    if (!design) throw new Error(`Design ${designId} not found`);

    // Increment fork count on design
    design.forks = (design.forks || 0) + 1;
    this.saveToStorage();

    // Create a new editable project in projectStore with attribution lineage
    const title = customTitle || `${design.title} (Fork)`;
    const desc = `Based on: "${design.title}" by @${design.author.username}. ${design.description}`;
    const targetCat = (design.targetCategory === 'cloud' ? 'cloud-aws' : design.targetCategory) as SaaSProject['category'];
    const newProj = projectStore.saveProject(title, targetCat, design.dataJson, desc);

    EventBus.emit('design:forked' as any, { designId, projectId: newProj.id });
    return newProj;
  }

  /**
   * Save / Toggle bookmark on a design
   */
  public toggleSaveDesign(designId: string): boolean {
    const design = this.getDesignById(designId);
    if (!design) return false;
    design.isSaved = !design.isSaved;
    design.saves += design.isSaved ? 1 : -1;
    this.saveToStorage();
    return !!design.isSaved;
  }

  /**
   * Increment view counter
   */
  public recordView(designId: string): void {
    const design = this.getDesignById(designId);
    if (design) {
      design.views++;
      this.saveToStorage();
    }
  }

  /**
   * Record social share
   */
  public recordShare(designId: string): void {
    const design = this.getDesignById(designId);
    if (design) {
      design.shares++;
      this.saveToStorage();
    }
  }

  /**
   * Add a community review with dimensional ratings (Section 16)
   */
  public addReview(
    designId: string,
    ratingOrReview: number | Omit<CommunityReview, 'id' | 'createdAt' | 'likes'>,
    commentText?: string
  ): CommunityReview {
    const design = this.getDesignById(designId);
    if (!design) throw new Error('Design not found');

    const currentUser = authStore.getCurrentUser();
    let reviewData: Omit<CommunityReview, 'id' | 'createdAt' | 'likes'>;

    if (typeof ratingOrReview === 'number') {
      reviewData = {
        userId: currentUser.id,
        userName: currentUser.name,
        rating: ratingOrReview,
        comment: commentText || 'Verified architecture blueprint.',
      };
    } else {
      reviewData = ratingOrReview;
    }

    const newRev: CommunityReview = {
      ...reviewData,
      id: `rev-${Date.now()}`,
      createdAt: new Date().toISOString(),
      likes: 0,
    };

    const prevCount = design.communityRating.count || 0;
    const prevAvg = design.communityRating.average || 5.0;
    const newCount = prevCount + 1;
    const newAvg = parseFloat(((prevAvg * prevCount + newRev.rating) / newCount).toFixed(2));

    design.communityRating.reviews.unshift(newRev);
    design.communityRating.count = newCount;
    design.communityRating.average = newAvg;

    this.saveToStorage();
    EventBus.emit('design:review-added' as any, { designId, review: newRev });
    return newRev;
  }

  /**
   * Add a technical discussion thread (Section 19)
   */
  public addDiscussion(designId: string, text: string): DiscussionThread {
    const design = this.getDesignById(designId);
    if (!design) throw new Error('Design not found');

    const currentUser = authStore.getCurrentUser();
    const newDisc: DiscussionThread = {
      id: `disc-${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      isAuthor: currentUser.id === design.author.id,
      text,
      createdAt: new Date().toISOString(),
      likes: 0,
      replies: [],
    };

    design.discussions.unshift(newDisc);
    this.saveToStorage();
    EventBus.emit('design:discussion-added' as any, { designId, discussion: newDisc });
    return newDisc;
  }

  /**
   * Reply to a discussion thread
   */
  public addReply(designId: string, discussionId: string, text: string): void {
    const design = this.getDesignById(designId);
    if (!design) return;

    const thread = design.discussions.find(d => d.id === discussionId);
    if (!thread) return;

    const currentUser = authStore.getCurrentUser();
    thread.replies.push({
      id: `rep-${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      isAuthor: currentUser.id === design.author.id,
      text,
      createdAt: new Date().toISOString(),
      likes: 0,
    });

    this.saveToStorage();
    EventBus.emit('design:discussion-updated' as any, { designId, discussionId });
  }

  /**
   * Upvote/like a discussion
   */
  public likeDiscussion(designId: string, discussionId: string): number {
    const design = this.getDesignById(designId);
    if (!design) return 0;

    const thread = design.discussions.find(d => d.id === discussionId);
    if (!thread) return 0;

    thread.likes = (thread.likes || 0) + 1;
    this.saveToStorage();
    return thread.likes;
  }

  /**
   * Publish a project to Design Hub with Publication Classification (Section 11, 12, 13)
   */
  public publishProject(
    project: SaaSProject,
    params: {
      title: string;
      description: string;
      category: DesignHubCategory;
      tags: string[];
      classification: PublicationClassification;
      generationSource?: GenerationSource;
      license: string;
      invitedUsers?: InvitedUser[];
      communitySettings: PublishedArchitecture['communitySettings'];
    }
  ): PublishedArchitecture {
    const currentUser = authStore.getCurrentUser();
    const slug = params.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const newDesign: PublishedArchitecture = {
      id: `pub-${Date.now()}`,
      slug: slug || `arch-${Date.now()}`,
      title: params.title,
      description: params.description,
      category: params.category,
      tags: params.tags,
      classification: params.classification,
      generationSource: params.generationSource || 'human-generated',
      author: {
        id: currentUser.id,
        name: currentUser.name,
        username: currentUser.email ? currentUser.email.split('@')[0] : 'architect',
        title: 'Infrastructure Architect',
        reputation: 100,
        badges: ['🤖 AI Validated'],
      },
      version: 'v1.0',
      versions: [
        { version: 'v1.0', changelog: 'Initial publication', createdAt: new Date().toISOString(), score: 90 }
      ],
      license: params.license,
      thumbnailUrl: project.thumbnailUrl || '/assets/dashboard/card-server-rack.jpg',
      dataJson: project.dataJson,
      targetCategory: project.category,
      views: 1,
      saves: 0,
      forks: 0,
      shares: 0,
      rackSlicerScore: {
        overall: 90,
        architectureQuality: 92,
        resilience: 91,
        costEfficiency: 89,
        scalability: 88,
        networkArchitecture: 90,
        storageDesign: 90,
        security: 89,
        documentation: 93,
      },
      communityRating: {
        average: 5.0,
        count: 0,
        reviews: [],
      },
      discussions: [],
      badges: ['🤖 AI Validated'],
      verification: 'ai-validated',
      communitySettings: params.communitySettings,
      invitedUsers: params.invitedUsers || [],
      accessHistory: [
        {
          classification: params.classification,
          changedBy: currentUser.name,
          timestamp: new Date().toISOString(),
          details: `Initial publication as ${params.classification.toUpperCase()}`,
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.designs.unshift(newDesign);
    this.saveToStorage();

    EventBus.emit('design:published' as any, newDesign);
    return newDesign;
  }
}

export const designHubStore = new DesignHubStore();
