/**
 * Project Store — Manages SaaS Project Workspaces & Cloud Sync State
 */
import { authStore } from '../auth/auth-store';

export interface SaaSProject {
  id: string;
  userId: string;
  name: string;
  description?: string;
  category: 'rack' | 'datacenter' | 'flowchart' | 'cloud-aws' | 'cloud-azure' | 'cloud-gcp' | 'hybrid';
  dataJson: string; // Serialized project state
  updatedAt: string;
  createdAt: string;
  thumbnailSvg?: string;
  tags?: string[];
  isFavorite?: boolean;
  version: number;
}

const STORAGE_KEY_PROJECTS = 'rackslicer_projects_store';

// Default starter projects for new users
const SAMPLE_STARTER_PROJECTS: SaaSProject[] = [
  {
    id: 'proj-sample-01',
    userId: 'user-demo-admin',
    name: 'Enterprise Data Hall 42U Rack',
    description: 'High-density GPU computing rack with dual 30A PDUs and fiber optic trunking.',
    category: 'rack',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    tags: ['42U', 'Production', 'High Density'],
    isFavorite: true,
    version: 1,
  },
  {
    id: 'proj-sample-02',
    userId: 'user-demo-admin',
    name: 'ESD Raised Floor Data Hall Blueprint',
    description: '1500 sq ft ESD tile grid with hot/cold aisle containment design.',
    category: 'datacenter',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    tags: ['Datacenter', 'Containment'],
    isFavorite: false,
    version: 1,
  },
  {
    id: 'proj-sample-03',
    userId: 'user-demo-eng',
    name: 'AWS Hybrid Transit Gateway Network',
    description: 'Multi-VPC architecture connected to on-prem server racks via DirectConnect.',
    category: 'cloud-aws',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    tags: ['AWS', 'Hybrid Cloud', 'Security'],
    isFavorite: true,
    version: 2,
  },
];

class ProjectStore {
  private activeProjectId: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    const existing = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!existing) {
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(SAMPLE_STARTER_PROJECTS));
    }
  }

  public getAllProjects(): SaaSProject[] {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) return [];
    try {
      const all: SaaSProject[] = JSON.parse(raw);
      const user = authStore.getCurrentUser();
      // Guests see guest projects + sample starter projects
      if (user.isGuest) {
        return all;
      }
      return all.filter(p => p.userId === user.id || p.userId === 'user-demo-admin');
    } catch (e) {
      return [];
    }
  }

  public getProjectById(id: string): SaaSProject | null {
    const projects = this.getAllProjects();
    return projects.find(p => p.id === id) || null;
  }

  public saveProject(name: string, category: SaaSProject['category'], dataJson: string, description?: string): SaaSProject {
    const user = authStore.getCurrentUser();
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    const all: SaaSProject[] = raw ? JSON.parse(raw) : [];

    const now = new Date().toISOString();
    let project: SaaSProject;

    if (this.activeProjectId) {
      const index = all.findIndex(p => p.id === this.activeProjectId);
      if (index !== -1) {
        all[index] = {
          ...all[index],
          name,
          category,
          dataJson,
          description: description ?? all[index].description,
          updatedAt: now,
          version: (all[index].version || 1) + 1,
        };
        project = all[index];
      } else {
        project = this.createNewProjectObject(user.id, name, category, dataJson, description);
        all.push(project);
      }
    } else {
      project = this.createNewProjectObject(user.id, name, category, dataJson, description);
      all.push(project);
    }

    this.activeProjectId = project.id;
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(all));
    return project;
  }

  public createNewProject(name: string, category: SaaSProject['category'], dataJson: string = '{}'): SaaSProject {
    const user = authStore.getCurrentUser();
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    const all: SaaSProject[] = raw ? JSON.parse(raw) : [];

    const project = this.createNewProjectObject(user.id, name, category, dataJson);
    all.push(project);
    this.activeProjectId = project.id;

    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(all));
    return project;
  }

  private createNewProjectObject(userId: string, name: string, category: SaaSProject['category'], dataJson: string, description?: string): SaaSProject {
    const now = new Date().toISOString();
    return {
      id: `proj-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      name,
      description: description || 'CAD Layout Design',
      category,
      dataJson,
      createdAt: now,
      updatedAt: now,
      version: 1,
      tags: [category.toUpperCase()],
      isFavorite: false,
    };
  }

  public deleteProject(id: string): boolean {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) return false;
    let all: SaaSProject[] = JSON.parse(raw);
    all = all.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(all));
    if (this.activeProjectId === id) {
      this.activeProjectId = null;
    }
    return true;
  }

  public toggleFavorite(id: string): boolean {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) return false;
    const all: SaaSProject[] = JSON.parse(raw);
    const proj = all.find(p => p.id === id);
    if (proj) {
      proj.isFavorite = !proj.isFavorite;
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(all));
      return proj.isFavorite;
    }
    return false;
  }

  public getActiveProjectId(): string | null {
    return this.activeProjectId;
  }

  public setActiveProjectId(id: string | null): void {
    this.activeProjectId = id;
  }
}

export const projectStore = new ProjectStore();
