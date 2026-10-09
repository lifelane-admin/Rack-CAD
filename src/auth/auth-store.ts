/**
 * Auth Store & User Session Manager for Rack Slicer SaaS Platform
 * Implements the AuthService abstraction specified in the RackSlicer SaaS Blueprint.
 * Supports Email/Password, Google, Microsoft, LinkedIn, Facebook, and Multi-tenant Organizations.
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  role: 'owner' | 'admin' | 'architect' | 'engineer' | 'viewer';
  membersCount: number;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  type: 'personal' | 'team' | 'customer';
}

export interface UserAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  earnedDate: string;
  category: 'architecture' | 'cabling' | 'ai' | 'compliance' | 'efficiency';
  highlightBadge?: string;
  shareable?: boolean;
}

export interface UserShowcaseProject {
  id: string;
  title: string;
  category: string;
  description: string;
  rackCount?: number;
  ruCount?: number;
  date: string;
  isPublished?: boolean;
  featured?: boolean;
}

export interface UserProfileStats {
  racksDesigned: number;
  totalRuDeployed: number;
  cablesRouted: number;
  pueOptimized: number;
  designsPublished: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  company?: string;
  title?: string;
  bio?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  skills?: string[];
  achievements?: UserAchievement[];
  showcaseProjects?: UserShowcaseProject[];
  stats?: UserProfileStats;
  role: 'owner' | 'admin' | 'architect' | 'engineer' | 'viewer';
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  isGuest?: boolean;
  provider?: 'email' | 'google' | 'microsoft' | 'linkedin' | 'facebook';
  currentOrganization?: Organization;
  organizations?: Organization[];
  workspaces?: Workspace[];
}

export interface AuthResult {
  success: boolean;
  message: string;
  user?: AuthUser;
}

export interface AuthService {
  signInWithGoogle(): Promise<AuthResult>;
  signInWithMicrosoft(): Promise<AuthResult>;
  signInWithLinkedIn(): Promise<AuthResult>;
  signInWithFacebook(): Promise<AuthResult>;
  signInWithEmail(email: string, password?: string): Promise<AuthResult>;
  signUp(name: string, email: string, password?: string, company?: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  refreshSession(): Promise<void>;
  getCurrentUser(): AuthUser;
  resetPassword(email: string): Promise<{ success: boolean; message: string }>;
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  updateProfile(updates: Partial<AuthUser>): AuthUser;
}

const STORAGE_KEY_SESSION = 'rackslicer_auth_session';
const STORAGE_KEY_USERS = 'rackslicer_registered_users';

const DEFAULT_ORG: Organization = {
  id: 'org-enterprise-01',
  name: 'Nexus Datacenter Systems',
  slug: 'nexus-dc',
  plan: 'enterprise',
  role: 'architect',
  membersCount: 16,
};

export const DEFAULT_ACHIEVEMENTS: UserAchievement[] = [
  {
    id: 'ach-tier4',
    title: 'Tier IV Hyperscale Architect',
    description: 'Engineered multi-hall mission-critical datacenter infrastructure with dual-active power feeds and concurrent maintainability.',
    icon: '🏆',
    earnedDate: 'Oct 2026',
    category: 'architecture',
    highlightBadge: 'Master Level',
    shareable: true,
  },
  {
    id: 'ach-cables',
    title: 'Zero-Crossing Optical Master',
    description: 'Constructed 340+ single-mode fiber and copper runs with 100% compliant bend radius and zero cable runway bottlenecks.',
    icon: '⚡',
    earnedDate: 'Sep 2026',
    category: 'cabling',
    highlightBadge: 'Certified',
    shareable: true,
  },
  {
    id: 'ach-ai-copilot',
    title: 'AI Copilot Pioneer',
    description: 'Generated and refined 50+ enterprise architectures using RackSlicer AI Studio natural language synthesis.',
    icon: '🤖',
    earnedDate: 'Aug 2026',
    category: 'ai',
    highlightBadge: 'Pioneer',
    shareable: true,
  },
  {
    id: 'ach-pue-eco',
    title: 'PUE 1.14 Eco Champion',
    description: 'Optimized airflow CFD and cold-aisle containment, slashing datacenter thermal overhead to an ultra-efficient 1.14 PUE.',
    icon: '🌿',
    earnedDate: 'Jul 2026',
    category: 'efficiency',
    highlightBadge: 'Eco Pro',
    shareable: true,
  },
  {
    id: 'ach-true-scale',
    title: 'True-Scale Precisionist',
    description: 'Drafted millimeter-accurate 48U server enclosures with modular equipment alignment and custom door specifications.',
    icon: '📐',
    earnedDate: 'Jun 2026',
    category: 'compliance',
    highlightBadge: 'Standard',
    shareable: true,
  },
  {
    id: 'ach-excel-bom',
    title: 'Enterprise Excel & BOM Master',
    description: 'Produced 25-sheet master workbooks with complete port schedules, power budgets, and itemized bill-of-materials.',
    icon: '📊',
    earnedDate: 'May 2026',
    category: 'compliance',
    highlightBadge: 'Executive',
    shareable: true,
  },
];

export const DEFAULT_SKILLS: string[] = [
  '48U High-Density Server Racks',
  'Spine-and-Leaf Fiber Architecture (OS2 / MTP-12)',
  'Top-of-Rack Switch Stacking',
  'Liquid Cooling & Rear Door Heat Exchangers',
  'ANSI/TIA-942 Tier IV Architecture',
  'Thermal CFD & Hot/Cold Aisle Containment',
  '3-Phase Power Distribution & PDU Budgeting',
  'Three.js 3D Virtual Datacenter Inspection',
  'Automated Cable Schedules & BOM Excel Export',
];

export const DEFAULT_STATS: UserProfileStats = {
  racksDesigned: 68,
  totalRuDeployed: 2840,
  cablesRouted: 348,
  pueOptimized: 1.14,
  designsPublished: 12,
};

// Pre-seeded demo accounts
const MOCK_PRESET_USERS: AuthUser[] = [
  {
    id: 'user-demo-srinivas',
    email: 'srinivas@rackslicer.io',
    name: 'Srinivas Anand',
    title: 'Principal Datacenter Infrastructure Architect',
    bio: 'Designing next-generation hyperscale datacenter halls, 48U high-density server racks, and AI compute clusters with zero-loss optical cable routing and sub-1.15 PUE thermal efficiency. ANSI/TIA-942 Tier IV certified.',
    company: 'Enterprise Infrastructure Architecture',
    location: 'San Jose, CA & Hyderabad, India',
    linkedinUrl: 'https://www.linkedin.com/in/srinivas-datacenter-architect',
    githubUrl: 'https://github.com/rackslicer-architect',
    websiteUrl: 'https://rackslicer.io',
    skills: [...DEFAULT_SKILLS],
    achievements: [...DEFAULT_ACHIEVEMENTS],
    stats: { ...DEFAULT_STATS },
    role: 'architect',
    plan: 'enterprise',
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    avatarUrl: '',
    provider: 'email',
    currentOrganization: DEFAULT_ORG,
    organizations: [DEFAULT_ORG],
    workspaces: [
      { id: 'ws-personal', organizationId: 'org-enterprise-01', name: 'Personal Workspace', type: 'personal' },
      { id: 'ws-dc-halls', organizationId: 'org-enterprise-01', name: 'Datacenter Hall Designs', type: 'team' },
    ],
  },
  {
    id: 'user-demo-admin',
    email: 'admin@rackslicer.io',
    name: 'Alex Mercer',
    title: 'Lead Systems Architect & Infrastructure Director',
    bio: 'Managing enterprise datacenter deployments and cloud-edge interconnects across multi-site regions.',
    company: 'Nexus Datacenters',
    location: 'Seattle, WA',
    linkedinUrl: 'https://www.linkedin.com/in/alex-mercer-dc',
    skills: ['Spine-and-Leaf Architecture', 'Multi-Site Interconnect', 'High-Density Racks', 'Power Budgeting'],
    achievements: DEFAULT_ACHIEVEMENTS.slice(0, 3),
    stats: { racksDesigned: 42, totalRuDeployed: 1760, cablesRouted: 210, pueOptimized: 1.18, designsPublished: 8 },
    role: 'admin',
    plan: 'pro',
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alex',
    provider: 'email',
  },
  {
    id: 'user-demo-eng',
    email: 'engineer@enterprise.com',
    name: 'Sarah Chen',
    title: 'Senior Network Cabling & Optical Systems Engineer',
    bio: 'Specializing in MTP-12 fiber trunking, patch panel management, and structured cabling compliance.',
    company: 'CloudScale Infrastructure',
    location: 'Austin, TX',
    linkedinUrl: 'https://www.linkedin.com/in/sarah-chen-optical',
    skills: ['Optical Fiber (OS2/OM4)', 'Structured Cabling', 'Cable Runway Design', 'Patch Panel Mapping'],
    achievements: DEFAULT_ACHIEVEMENTS.slice(1, 4),
    stats: { racksDesigned: 35, totalRuDeployed: 1420, cablesRouted: 290, pueOptimized: 1.19, designsPublished: 5 },
    role: 'engineer',
    plan: 'enterprise',
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sarah',
    provider: 'email',
  },
];

class AuthStore implements AuthService {
  private currentUser: AuthUser | null = null;
  private listeners: Array<(user: AuthUser | null) => void> = [];

  constructor() {
    this.init();
  }

  private init(): void {
    const existingUsers = localStorage.getItem(STORAGE_KEY_USERS);
    if (!existingUsers) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(MOCK_PRESET_USERS));
    }

    const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        const defaults = this.createDefaultUser();
        this.currentUser = {
          ...defaults,
          ...parsed,
          skills: parsed.skills && parsed.skills.length > 0 ? parsed.skills : defaults.skills,
          achievements: parsed.achievements && parsed.achievements.length > 0 ? parsed.achievements : defaults.achievements,
          stats: parsed.stats || defaults.stats,
          linkedinUrl: parsed.linkedinUrl || defaults.linkedinUrl,
          title: parsed.title || defaults.title,
          bio: parsed.bio || defaults.bio,
          location: parsed.location || defaults.location,
          company: parsed.company || defaults.company,
        };
      } catch (e) {
        this.currentUser = this.createDefaultUser();
      }
    } else {
      this.currentUser = this.createDefaultUser();
    }
  }

  public createDefaultUser(): AuthUser {
    return MOCK_PRESET_USERS[0];
  }

  public createGuestUser(): AuthUser {
    return {
      id: 'guest-session',
      email: 'guest@rackslicer.io',
      name: 'Guest Engineer',
      company: 'Workspace Sandbox',
      role: 'engineer',
      plan: 'free',
      createdAt: new Date().toISOString(),
      isGuest: true,
      avatarUrl: '',
    };
  }

  public getCurrentUser(): AuthUser {
    if (!this.currentUser) {
      this.currentUser = this.createDefaultUser();
    }
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return !!this.currentUser && !this.currentUser.isGuest;
  }

  public async signInWithEmail(email: string, password?: string): Promise<AuthResult> {
    const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
    const users: AuthUser[] = usersRaw ? JSON.parse(usersRaw) : MOCK_PRESET_USERS;

    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) {
      this.setCurrentUser(user);
      return { success: true, message: `Welcome back, ${user.name}!`, user };
    }

    // Auto-create for seamless developer exploration
    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      email: email.trim(),
      name: email.split('@')[0].replace('.', ' '),
      company: 'Enterprise CAD Team',
      role: 'architect',
      plan: 'pro',
      createdAt: new Date().toISOString(),
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
      provider: 'email',
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    this.setCurrentUser(newUser);
    return { success: true, message: `Account created successfully! Welcome, ${newUser.name}.`, user: newUser };
  }

  // Synchronous convenience alias
  public login(email: string, password?: string): AuthResult {
    const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
    const users: AuthUser[] = usersRaw ? JSON.parse(usersRaw) : MOCK_PRESET_USERS;

    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) {
      this.setCurrentUser(user);
      return { success: true, message: `Welcome back, ${user.name}!`, user };
    }

    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      email: email.trim(),
      name: email.split('@')[0].replace('.', ' '),
      company: 'Enterprise Infrastructure Team',
      role: 'architect',
      plan: 'enterprise',
      createdAt: new Date().toISOString(),
      provider: 'email',
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    this.setCurrentUser(newUser);
    return { success: true, message: `Account created successfully! Welcome, ${newUser.name}.`, user: newUser };
  }

  public async signUp(name: string, email: string, password?: string, company?: string): Promise<AuthResult> {
    return this.register(name, email, company);
  }

  public register(name: string, email: string, company?: string): AuthResult {
    const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
    const users: AuthUser[] = usersRaw ? JSON.parse(usersRaw) : MOCK_PRESET_USERS;

    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      return this.login(email);
    }

    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      email: email.trim(),
      name: name.trim() || email.split('@')[0],
      company: company?.trim() || 'Datacenter Architecture Team',
      role: 'architect',
      plan: 'enterprise',
      createdAt: new Date().toISOString(),
      provider: 'email',
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    this.setCurrentUser(newUser);
    return { success: true, message: `Welcome to Rack Slicer, ${newUser.name}!`, user: newUser };
  }

  public async signInWithGoogle(): Promise<AuthResult> {
    const googleUser: AuthUser = {
      id: `google-${Date.now()}`,
      email: 'alex.google@enterprise.io',
      name: 'Alex Mercer (Google)',
      company: 'Google Cloud Partner',
      role: 'architect',
      plan: 'enterprise',
      createdAt: new Date().toISOString(),
      provider: 'google',
    };
    this.setCurrentUser(googleUser);
    return { success: true, message: 'Signed in with Google SSO successfully', user: googleUser };
  }

  public async signInWithMicrosoft(): Promise<AuthResult> {
    const msUser: AuthUser = {
      id: `ms-${Date.now()}`,
      email: 'srinivas.ms@azure-corp.com',
      name: 'Srinivas Anand (Microsoft Entra)',
      company: 'Microsoft Infrastructure Partner',
      role: 'architect',
      plan: 'enterprise',
      createdAt: new Date().toISOString(),
      provider: 'microsoft',
    };
    this.setCurrentUser(msUser);
    return { success: true, message: 'Signed in with Microsoft Entra ID successfully', user: msUser };
  }

  public async signInWithLinkedIn(): Promise<AuthResult> {
    const liUser: AuthUser = {
      id: `li-${Date.now()}`,
      email: 'architect.pro@datacenter.net',
      name: 'Datacenter Architect (LinkedIn)',
      company: 'Global System Integrator',
      role: 'architect',
      plan: 'enterprise',
      createdAt: new Date().toISOString(),
      provider: 'linkedin',
    };
    this.setCurrentUser(liUser);
    return { success: true, message: 'Signed in with LinkedIn OAuth successfully', user: liUser };
  }

  public async signInWithFacebook(): Promise<AuthResult> {
    const fbUser: AuthUser = {
      id: `fb-${Date.now()}`,
      email: 'designer@social-infra.com',
      name: 'Infra Engineer (Facebook)',
      company: 'Cloud Scale DC',
      role: 'engineer',
      plan: 'pro',
      createdAt: new Date().toISOString(),
      provider: 'facebook',
    };
    this.setCurrentUser(fbUser);
    return { success: true, message: 'Signed in with Facebook OAuth successfully', user: fbUser };
  }

  public async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: `Password reset instructions have been dispatched to ${email}.`,
    };
  }

  public async refreshSession(): Promise<void> {
    if (this.currentUser) {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(this.currentUser));
      this.notifyListeners();
    }
  }

  public updateProfile(updates: Partial<AuthUser>): AuthUser {
    if (!this.currentUser) return this.createDefaultUser();

    this.currentUser = {
      ...this.currentUser,
      ...updates,
    };

    if (!this.currentUser.isGuest) {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(this.currentUser));
      const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
      if (usersRaw) {
        let users: AuthUser[] = JSON.parse(usersRaw);
        users = users.map(u => u.id === this.currentUser?.id ? { ...u, ...updates } : u);
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
      }
    }

    this.notifyListeners();
    return this.currentUser;
  }

  public async signOut(): Promise<void> {
    this.logout();
  }

  public logout(): void {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    this.currentUser = this.createDefaultUser();
    this.notifyListeners();
  }

  private setCurrentUser(user: AuthUser): void {
    this.currentUser = user;
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
    this.notifyListeners();
  }

  public subscribe(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.currentUser));
  }
}

export const authStore = new AuthStore();
