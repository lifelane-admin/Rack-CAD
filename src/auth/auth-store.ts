/**
 * Auth Store & User Session Manager for Rack Slicer SaaS Platform
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  company?: string;
  role: 'admin' | 'engineer' | 'architect' | 'viewer';
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  isGuest?: boolean;
}

const STORAGE_KEY_SESSION = 'rackslicer_auth_session';
const STORAGE_KEY_USERS = 'rackslicer_registered_users';

// Pre-seeded demo accounts for quick testing
const MOCK_PRESET_USERS: AuthUser[] = [
  {
    id: 'user-demo-admin',
    email: 'admin@rackslicer.io',
    name: 'Alex Mercer',
    company: 'Nexus Datacenters',
    role: 'admin',
    plan: 'pro',
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alex',
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
  },
];

class AuthStore {
  private currentUser: AuthUser | null = null;
  private listeners: Array<(user: AuthUser | null) => void> = [];

  constructor() {
    this.init();
  }

  private init(): void {
    // Seed default registered users if not existing
    const existingUsers = localStorage.getItem(STORAGE_KEY_USERS);
    if (!existingUsers) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(MOCK_PRESET_USERS));
    }

    // Restore active session or default to Guest user
    const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);
    if (savedSession) {
      try {
        this.currentUser = JSON.parse(savedSession);
      } catch (e) {
        this.currentUser = this.createGuestUser();
      }
    } else {
      this.currentUser = this.createGuestUser();
    }
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
      this.currentUser = this.createGuestUser();
    }
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return !!this.currentUser && !this.currentUser.isGuest;
  }

  public login(email: string, password?: string): { success: boolean; message: string; user?: AuthUser } {
    const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
    const users: AuthUser[] = usersRaw ? JSON.parse(usersRaw) : MOCK_PRESET_USERS;

    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) {
      this.setCurrentUser(user);
      return { success: true, message: `Welcome back, ${user.name}!`, user };
    }

    // Auto-register convenience for dev demo if email isn't recognized
    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      email: email.trim(),
      name: email.split('@')[0].replace('.', ' '),
      company: 'Enterprise CAD Team',
      role: 'engineer',
      plan: 'free',
      createdAt: new Date().toISOString(),
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    this.setCurrentUser(newUser);
    return { success: true, message: `Account created successfully! Welcome, ${newUser.name}.`, user: newUser };
  }

  public register(name: string, email: string, company?: string): { success: boolean; message: string; user?: AuthUser } {
    const usersRaw = localStorage.getItem(STORAGE_KEY_USERS);
    const users: AuthUser[] = usersRaw ? JSON.parse(usersRaw) : MOCK_PRESET_USERS;

    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      return this.login(email);
    }

    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      email: email.trim(),
      name: name.trim() || email.split('@')[0],
      company: company?.trim() || 'Datacenter Team',
      role: 'engineer',
      plan: 'free',
      createdAt: new Date().toISOString(),
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name || email)}`,
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    this.setCurrentUser(newUser);
    return { success: true, message: `Welcome to Rack Slicer, ${newUser.name}!`, user: newUser };
  }

  public updateProfile(updates: Partial<AuthUser>): AuthUser {
    if (!this.currentUser) return this.createGuestUser();

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

  public logout(): void {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    this.currentUser = this.createGuestUser();
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
