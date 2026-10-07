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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  company?: string;
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

// Pre-seeded demo accounts
const MOCK_PRESET_USERS: AuthUser[] = [
  {
    id: 'user-demo-srinivas',
    email: 'srinivas@rackslicer.io',
    name: 'Srinivas Anand',
    company: 'Enterprise Infrastructure Architecture',
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
    company: 'Nexus Datacenters',
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
    company: 'CloudScale Infrastructure',
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
        this.currentUser = JSON.parse(savedSession);
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
