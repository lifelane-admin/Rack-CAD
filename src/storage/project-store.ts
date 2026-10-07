/**
 * Project Store — Manages SaaS Project Workspaces, Cloud Sync State & Reference Templates
 * Implements Multi-tenant organization & project model specified in the RackSlicer SaaS Blueprint.
 */
import { authStore } from '../auth/auth-store';

export interface SaaSProject {
  id: string;
  userId: string;
  organizationId?: string;
  workspaceId?: string;
  name: string;
  description?: string;
  category: 'rack' | 'datacenter' | 'flowchart' | 'cloud-aws' | 'cloud-azure' | 'cloud-gcp' | 'hybrid' | 'template';
  dataJson: string; // Serialized project state
  updatedAt: string;
  createdAt: string;
  thumbnailUrl?: string;
  thumbnailSvg?: string;
  tags?: string[];
  isFavorite?: boolean;
  version: number;
  progress?: number;
  isTemplate?: boolean;
  costEstimate?: string;
  confidenceScore?: number;
}

const STORAGE_KEY_PROJECTS = 'rackslicer_projects_store';

// Default starter projects corresponding directly to the 4 visual reference assets
const SAMPLE_STARTER_PROJECTS: SaaSProject[] = [
  {
    id: 'proj-sample-01',
    userId: 'user-demo-srinivas',
    organizationId: 'org-enterprise-01',
    workspaceId: 'ws-dc-halls',
    name: 'Enterprise DC Hall v2.0',
    description: 'Hyperscale containment corridor with cold-aisle ceiling airflow and dual 30A PDU distribution.',
    category: 'datacenter',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    thumbnailUrl: '/assets/dashboard/card-dc-hall.jpg',
    tags: ['DATACENTER HALL', 'CONTAINMENT'],
    isFavorite: true,
    version: 2,
    progress: 75,
  },
  {
    id: 'proj-sample-02',
    userId: 'user-demo-srinivas',
    organizationId: 'org-enterprise-01',
    workspaceId: 'ws-personal',
    name: 'ESD Raised Floor Design',
    description: '1500 sq ft ESD tile grid with underfloor airflow dampers, cable trays, and rack footprints.',
    category: 'template',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    thumbnailUrl: '/assets/dashboard/card-esd-floor.jpg',
    tags: ['TEMPLATE', 'RAISED FLOOR'],
    isFavorite: false,
    version: 1,
    progress: 40,
    isTemplate: true,
  },
  {
    id: 'proj-sample-03',
    userId: 'user-demo-srinivas',
    organizationId: 'org-enterprise-01',
    workspaceId: 'ws-personal',
    name: 'AWS Hybrid Transit Gateway',
    description: 'Multi-VPC architecture connected to on-prem server racks via redundant AWS DirectConnect.',
    category: 'cloud-aws',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    thumbnailUrl: '/assets/dashboard/card-aws-transit.jpg',
    tags: ['CLOUD', 'TRANSIT GATEWAY'],
    isFavorite: true,
    version: 2,
    progress: 60,
  },
  {
    id: 'proj-sample-04',
    userId: 'user-demo-srinivas',
    organizationId: 'org-enterprise-01',
    workspaceId: 'ws-personal',
    name: 'New Server Rack – Branch',
    description: '42U edge datacenter rack with redundant Dell PowerEdge compute, Cisco ToR switches, and ATS.',
    category: 'rack',
    dataJson: '{}',
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    thumbnailUrl: '/assets/dashboard/card-server-rack.jpg',
    tags: ['RACK', '42U EDGE'],
    isFavorite: false,
    version: 1,
    progress: 25,
  },
];

export interface ArchitectureTemplate {
  id: string;
  title: string;
  category: 'virtualization' | 'storage' | 'network' | 'cloud' | 'microsoft' | 'ai-gpu' | 'backup-dr';
  categoryLabel: string;
  description: string;
  specs: string[];
  costEstimate: string;
  savingEstimate?: string;
  pros: string[];
  cons?: string[];
  recommendedBadge?: string;
  targetCategory: SaaSProject['category'];
}

export const ARCHITECTURE_TEMPLATES: ArchitectureTemplate[] = [
  {
    id: 'tpl-ceph-mesh',
    title: '3-Node Ceph — MESH Network (Cost-Optimized)',
    category: 'storage',
    categoryLabel: 'STORAGE & HCI',
    description: 'Direct point-to-point mesh cabling between 3 nodes eliminating redundant 25GbE ToR switches, saving ₹3,65,000.',
    specs: ['3x Storage Nodes', 'Dual 25GbE Mesh NICs', 'Zero Dedicated Switches', 'Redundant Replication'],
    costEstimate: '₹14,75,000',
    savingEstimate: 'Save ₹3,65,000 (20%)',
    pros: ['No ToR switch capital expenditure', 'Ultra-low latency direct replication', 'Ideal for 3-node edge cluster'],
    cons: ['Scalability limit to 3-5 nodes', 'Routing complexity compared to switched'],
    recommendedBadge: '★ AI Recommended',
    targetCategory: 'rack',
  },
  {
    id: 'tpl-hyperv-cluster',
    title: '2-Node Hyper-V Cluster + Azure Arc',
    category: 'microsoft',
    categoryLabel: 'MICROSOFT HYBRID',
    description: 'High-availability Windows Server 2025 failover cluster with Storage Spaces Direct (S2D) and cloud management.',
    specs: ['2x 2U Compute Nodes', 'Storage Spaces Direct', 'Dual 10GbE RDMA', 'Azure Arc Enabled'],
    costEstimate: '₹18,50,000',
    pros: ['Zero external SAN cost', 'Seamless Azure Portal governance', 'Automated VM live migration'],
    targetCategory: 'rack',
  },
  {
    id: 'tpl-proxmox-ceph',
    title: '3-Node Proxmox VE + Ceph + PBS',
    category: 'virtualization',
    categoryLabel: 'VIRTUALIZATION',
    description: 'Enterprise open-source HCI virtualization with native Ceph distributed storage and deduplicated PBS backup repository.',
    specs: ['3x Supermicro 1U Nodes', 'Ceph OSD NVMe Pool', 'Proxmox Backup Server', 'Dual 25GbE SFP28'],
    costEstimate: '₹12,80,000',
    savingEstimate: 'Save ₹8,40,000 vs VMware',
    pros: ['No hypervisor licensing tax', 'Native incremental backups', 'Full API automation'],
    recommendedBadge: 'Popular',
    targetCategory: 'rack',
  },
  {
    id: 'tpl-azure-hub-spoke',
    title: 'Azure Hub-Spoke Enterprise Landing Zone',
    category: 'cloud',
    categoryLabel: 'AZURE CLOUD',
    description: 'Secure multi-VNet cloud architecture with Azure Firewall, ExpressRoute gateway, and private endpoints.',
    specs: ['Central Hub VNet', '3x Spoke Workloads', 'Azure Firewall Premium', 'VPN / ExpressRoute'],
    costEstimate: '$1,850/mo',
    pros: ['Zero-Trust perimeter isolation', 'Centralized traffic inspection', 'Scalable to hundreds of VNets'],
    targetCategory: 'cloud-azure',
  },
  {
    id: 'tpl-aws-transit',
    title: 'AWS Multi-Account Transit Gateway',
    category: 'cloud',
    categoryLabel: 'AWS CLOUD',
    description: 'Hub-and-spoke multi-account AWS network architecture connecting production, staging, and shared services.',
    specs: ['AWS Transit Gateway', 'Direct Connect Gateway', 'Multi-AZ NAT Gateways', 'Security VPC'],
    costEstimate: '$1,420/mo',
    pros: ['Unified routing table', 'Cross-VPC isolation', 'Simplified hybrid connectivity'],
    targetCategory: 'cloud-aws',
  },
  {
    id: 'tpl-ai-gpu-pod',
    title: '8x NVIDIA H100 AI Training & Inference Pod',
    category: 'ai-gpu',
    categoryLabel: 'AI / GPU INFRASTRUCTURE',
    description: 'High-density 10.2 kW AI supercomputing rack with 800Gb/s Quantum-2 InfiniBand and liquid cooling manifolds.',
    specs: ['1x 4U 8x H100 Server', '400GbE / InfiniBand ToR', 'Dual 30A 3-Phase PDUs', 'Rear-Door Heat Exchanger'],
    costEstimate: '₹2,10,00,000',
    pros: ['Maximum compute density per U', 'Sub-microsecond RoCE v2 networking', 'Ready for LLM training'],
    recommendedBadge: 'High Density',
    targetCategory: 'rack',
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
    if (!raw) return SAMPLE_STARTER_PROJECTS;
    try {
      const all: SaaSProject[] = JSON.parse(raw);
      // Ensure the starter projects exist if storage was empty
      if (all.length === 0) {
        localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(SAMPLE_STARTER_PROJECTS));
        return SAMPLE_STARTER_PROJECTS;
      }
      return all;
    } catch (e) {
      return SAMPLE_STARTER_PROJECTS;
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
        all.unshift(project);
      }
    } else {
      project = this.createNewProjectObject(user.id, name, category, dataJson, description);
      all.unshift(project);
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
    all.unshift(project);
    this.activeProjectId = project.id;

    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(all));
    return project;
  }

  public createProjectFromTemplate(template: ArchitectureTemplate): SaaSProject {
    return this.createNewProject(template.title, template.targetCategory, '{}');
  }

  private createNewProjectObject(userId: string, name: string, category: SaaSProject['category'], dataJson: string, description?: string): SaaSProject {
    const now = new Date().toISOString();
    const user = authStore.getCurrentUser();

    // Map thumbnail image based on category
    let thumb = '/assets/dashboard/card-server-rack.jpg';
    if (category === 'datacenter') thumb = '/assets/dashboard/card-dc-hall.jpg';
    else if (category === 'template') thumb = '/assets/dashboard/card-esd-floor.jpg';
    else if (category.startsWith('cloud') || category === 'hybrid') thumb = '/assets/dashboard/card-aws-transit.jpg';

    return {
      id: `proj-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      organizationId: user.currentOrganization?.id || 'org-enterprise-01',
      workspaceId: 'ws-personal',
      name,
      description: description || 'Datacenter Architecture & CAD Design',
      category,
      dataJson,
      createdAt: now,
      updatedAt: now,
      version: 1,
      thumbnailUrl: thumb,
      tags: [category.toUpperCase()],
      isFavorite: false,
      progress: 30,
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
