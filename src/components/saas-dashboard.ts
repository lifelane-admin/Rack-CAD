/**
 * SaaS Workspace Dashboard & Project Hub Component
 */
import { authStore } from '../auth/auth-store';
import { projectStore, SaaSProject } from '../storage/project-store';
import { showAuthModal } from './auth-modal';
import { showSubscriptionModal } from './subscription-modal';
import { showUserProfileModal } from './user-profile-modal';

export class SaaSWorkspaceDashboard {
  private container: HTMLElement | null = null;
  private currentFilterCategory: string = 'all';
  private searchQuery: string = '';
  private onOpenProjectCallback: (project: SaaSProject | null, category?: SaaSProject['category']) => void;

  constructor(onOpenProject: (project: SaaSProject | null, category?: SaaSProject['category']) => void) {
    this.onOpenProjectCallback = onOpenProject;
  }

  public show(): void {
    this.hide();

    const user = authStore.getCurrentUser();
    this.container = document.createElement('div');
    this.container.id = 'saas-dashboard-root';
    this.container.className = 'saas-dashboard-container';

    this.render();
    document.body.appendChild(this.container);
  }

  public hide(): void {
    const existing = document.getElementById('saas-dashboard-root');
    if (existing) existing.remove();
    this.container = null;
  }

  private render(): void {
    if (!this.container) return;

    const user = authStore.getCurrentUser();
    const projects = this.getFilteredProjects();

    this.container.innerHTML = `
      <!-- Top SaaS Header -->
      <header class="saas-dash-header">
        <div class="saas-dash-brand">
          <div style="width:34px; height:34px; background:linear-gradient(135deg, #38bdf8, #0284c7); border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:16px; color:#0b0f19;">RS</div>
          <span>Rack Slicer SaaS</span>
          <span class="badge">${user.plan.toUpperCase()} TIER</span>
        </div>

        <!-- Global Search Bar -->
        <div style="flex:0 1 420px; position:relative;">
          <input type="text" id="dash-search-input" class="saas-input" placeholder="🔍 Search projects, racks, or blueprints..." value="${this.searchQuery}" style="padding-left:14px; height:38px; border-radius:20px; font-size:13px; background:rgba(15,23,42,0.9);" />
        </div>

        <!-- Right Header User Menu -->
        <div style="display:flex; align-items:center; gap:14px;">
          <button id="dash-new-proj-btn" class="saas-btn-primary" style="padding:8px 16px; font-size:13px; display:flex; align-items:center; gap:6px;">
            <span>+</span> New Design Project
          </button>
          <button id="dash-upgrade-btn" class="saas-btn-secondary" style="padding:8px 14px; font-size:12px; border-color:rgba(56,189,248,0.3); color:#38bdf8;">
            ⚡ SaaS Tiers
          </button>

          <!-- Avatar & Dropdown Trigger -->
          <div id="dash-user-avatar-btn" class="saas-user-avatar" title="${user.name}">
            ${user.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <!-- Main Dashboard Content area -->
      <div class="saas-dash-content">
        
        <!-- Left Sidebar Navigation -->
        <aside class="saas-dash-sidebar">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:6px; padding:0 8px;">
            Workspace Views
          </div>
          <div class="saas-nav-item ${this.currentFilterCategory === 'all' ? 'active' : ''}" data-cat="all">
            <span>📁 All Projects</span>
          </div>
          <div class="saas-nav-item ${this.currentFilterCategory === 'rack' ? 'active' : ''}" data-cat="rack">
            <span>📦 Server Racks</span>
          </div>
          <div class="saas-nav-item ${this.currentFilterCategory === 'datacenter' ? 'active' : ''}" data-cat="datacenter">
            <span>🏢 Datacenter Halls</span>
          </div>
          <div class="saas-nav-item ${this.currentFilterCategory.startsWith('cloud') ? 'active' : ''}" data-cat="cloud">
            <span>☁ Cloud Architectures</span>
          </div>

          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b; margin:16px 0 6px; padding:0 8px;">
            Quick Launch Templates
          </div>
          <div class="saas-nav-item" id="nav-tpl-rack"><span>📦 42U Server Rack</span></div>
          <div class="saas-nav-item" id="nav-tpl-dc"><span>🏢 Raised Floor Hall</span></div>
          <div class="saas-nav-item" id="nav-tpl-aws"><span>🟧 AWS Topology</span></div>
          <div class="saas-nav-item" id="nav-tpl-azure"><span>🔷 Azure Network</span></div>
          <div class="saas-nav-item" id="nav-tpl-gcp"><span>🔴 GCP Cloud Hall</span></div>

          <div style="margin-top:auto; padding:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px;">
            <div style="font-size:11px; font-weight:700; color:#38bdf8;">Plan Storage Quota</div>
            <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">${projects.length} / 10 Racks Saved</div>
            <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin-top:6px; overflow:hidden;">
              <div style="width:${Math.min(100, (projects.length / 10) * 100)}%; height:100%; background:#38bdf8;"></div>
            </div>
          </div>
        </aside>

        <!-- Main Workspace Area -->
        <main class="saas-dash-main">
          
          <!-- Banner Greeting -->
          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 24px;">
            <div>
              <h1 style="margin:0 0 4px; font-size:24px; font-weight:800; color:#fff;">
                Welcome back, ${user.name}! 👋
              </h1>
              <p style="margin:0; font-size:13px; color:#94a3b8;">
                Manage your enterprise server racks, datacenter raised floors, and hybrid cloud topologies.
              </p>
            </div>
          </div>

          <!-- Project Cards Grid -->
          <div style="font-size:14px; font-weight:700; color:#cbd5e1; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <span>Recent Workspace Projects (${projects.length})</span>
          </div>

          ${projects.length === 0 ? `
            <div style="text-align:center; padding:60px 20px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:14px; margin-top:16px;">
              <div style="font-size:36px; margin-bottom:12px;">📂</div>
              <h3 style="margin:0 0 6px; font-size:16px; color:#fff;">No Projects Found</h3>
              <p style="margin:0 0 16px; font-size:13px; color:#94a3b8;">Create your first design project or start from a pre-built template.</p>
              <button id="empty-create-btn" class="saas-btn-primary" style="display:inline-block; width:auto; padding:10px 20px;">
                + Create New Rack Design
              </button>
            </div>
          ` : `
            <div class="saas-projects-grid">
              ${projects.map(p => this.renderProjectCard(p)).join('')}
            </div>
          `}
        </main>
      </div>
    `;

    this.attachEvents();
  }

  private renderProjectCard(p: SaaSProject): string {
    const iconMap: Record<string, string> = {
      rack: '📦',
      datacenter: '🏢',
      flowchart: '🔀',
      'cloud-aws': '🟧',
      'cloud-azure': '🔷',
      'cloud-gcp': '🔴',
      hybrid: '🌐',
    };

    const icon = iconMap[p.category] || '📦';
    const dateFormatted = new Date(p.updatedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <div class="saas-project-card" data-proj-id="${p.id}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="saas-card-icon">${icon}</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="proj-fav-btn" data-proj-id="${p.id}" style="background:none; border:none; color:${p.isFavorite ? '#f59e0b' : '#64748b'}; font-size:16px; cursor:pointer;" title="Favorite">
              ★
            </button>
            <button class="proj-delete-btn" data-proj-id="${p.id}" style="background:none; border:none; color:#64748b; font-size:14px; cursor:pointer;" title="Delete">
              🗑
            </button>
          </div>
        </div>

        <div>
          <h4 style="margin:0 0 6px; font-size:15px; font-weight:700; color:#ffffff;">${p.name}</h4>
          <p style="margin:0; font-size:12px; color:#8b949e; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
            ${p.description || 'CAD Design Workspace'}
          </p>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; pt-2; border-top:1px solid rgba(255,255,255,0.06); font-size:11px; color:#64748b;">
          <span class="saas-badge-tag">${p.category.toUpperCase()}</span>
          <span>Updated ${dateFormatted}</span>
        </div>
      </div>
    `;
  }

  private getFilteredProjects(): SaaSProject[] {
    let list = projectStore.getAllProjects();

    if (this.currentFilterCategory !== 'all') {
      if (this.currentFilterCategory === 'cloud') {
        list = list.filter(p => p.category.startsWith('cloud'));
      } else {
        list = list.filter(p => p.category === this.currentFilterCategory);
      }
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
    }

    return list;
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Search filter input
    const searchInput = this.container.querySelector('#dash-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.render();
      });
    }

    // Category Nav Filter Buttons
    this.container.querySelectorAll('.saas-nav-item[data-cat]').forEach(item => {
      item.addEventListener('click', () => {
        this.currentFilterCategory = (item as HTMLElement).dataset.cat || 'all';
        this.render();
      });
    });

    // Quick Template Nav Buttons
    this.container.querySelector('#nav-tpl-rack')?.addEventListener('click', () => this.openTemplate('rack'));
    this.container.querySelector('#nav-tpl-dc')?.addEventListener('click', () => this.openTemplate('datacenter'));
    this.container.querySelector('#nav-tpl-aws')?.addEventListener('click', () => this.openTemplate('cloud-aws'));
    this.container.querySelector('#nav-tpl-azure')?.addEventListener('click', () => this.openTemplate('cloud-azure'));
    this.container.querySelector('#nav-tpl-gcp')?.addEventListener('click', () => this.openTemplate('cloud-gcp'));

    // New project button
    this.container.querySelector('#dash-new-proj-btn')?.addEventListener('click', () => this.openTemplate('rack'));
    this.container.querySelector('#empty-create-btn')?.addEventListener('click', () => this.openTemplate('rack'));

    // SaaS Upgrade button
    this.container.querySelector('#dash-upgrade-btn')?.addEventListener('click', () => showSubscriptionModal());

    // User Avatar button
    this.container.querySelector('#dash-user-avatar-btn')?.addEventListener('click', () => {
      showUserProfileModal(() => this.render());
    });

    // Project Cards Click (Open CAD Editor)
    this.container.querySelectorAll('.saas-project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.proj-fav-btn') || (e.target as HTMLElement).closest('.proj-delete-btn')) {
          return;
        }
        const projId = (card as HTMLElement).dataset.projId;
        if (projId) {
          const proj = projectStore.getProjectById(projId);
          if (proj) {
            projectStore.setActiveProjectId(proj.id);
            this.hide();
            this.onOpenProjectCallback(proj);
          }
        }
      });
    });

    // Favorite toggle button
    this.container.querySelectorAll('.proj-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projId = (btn as HTMLElement).dataset.projId;
        if (projId) {
          projectStore.toggleFavorite(projId);
          this.render();
        }
      });
    });

    // Delete project button
    this.container.querySelectorAll('.proj-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projId = (btn as HTMLElement).dataset.projId;
        if (projId && confirm('Are you sure you want to delete this design project?')) {
          projectStore.deleteProject(projId);
          this.render();
        }
      });
    });
  }

  private openTemplate(category: SaaSProject['category']): void {
    const defaultName = category === 'rack' ? 'New Server Rack' :
      category === 'datacenter' ? 'New Datacenter Hall' :
      category === 'cloud-aws' ? 'AWS Cloud Architecture' :
      category === 'cloud-azure' ? 'Azure Network Diagram' :
      category === 'cloud-gcp' ? 'GCP Infrastructure' : 'New Design';

    const newProject = projectStore.createNewProject(defaultName, category);
    this.hide();
    this.onOpenProjectCallback(newProject, category);
  }
}
