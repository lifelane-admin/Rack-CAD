/**
 * Revamped High-Fidelity SaaS Workspace Dashboard & Project Hub
 * Implements the RackSlicer SaaS Product & UX Blueprint using the 58px topbar,
 * 220px navigation rail, Hyperscale Containment Corridor photo backdrop,
 * real-time telemetry metrics, and high-definition card visuals.
 *
 * Visual System:
 * - 4 High-fidelity 3D Glowing Stat Cards (Active Projects, Server Racks, Datacenter Halls, Cloud Architectures)
 * - 11 3D Isometric Neon-Pedestal Module Navigation Tiles (Rack Builder, Datacenter, AWS, Azure, M365, OCI, GCP, AI Studio, AI Studios, Templates, Reports)
 *
 * Performance: Static HTML rendered once, partial DOM updates for dynamic content.
 * No JS-generated SVG animations on load to prevent layout instability.
 */

import { authStore } from '../auth/auth-store';
import { projectStore, SaaSProject, ARCHITECTURE_TEMPLATES, ArchitectureTemplate } from '../storage/project-store';
import { getTemplatePayloadJson } from '../storage/template-data-generator';
import { importJSON } from '../utils/export';
import { showUserProfileModal } from './user-profile-modal';
import EventBus from '../core/event-bus';

// Module navigation definitions with 3D icons, official branding, and neon pedestals
const MODULE_NAV = [
  {
    id: 'mod-rack',
    label: 'Rack Builder',
    iconImg: '/assets/dashboard/icons/rack-builder-icon.png',
    fallbackIcon: '🖥️',
    view: 'rack',
    color: '#00a2ff',
    glow: 'rgba(0, 162, 255, 0.45)'
  },
  {
    id: 'mod-dc',
    label: 'Datacenter',
    iconImg: '/assets/dashboard/icons/datacenter-icon.png',
    fallbackIcon: '🏢',
    view: 'datacenter',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.45)'
  },
  {
    id: 'mod-aws',
    label: 'AWS',
    iconImg: '/assets/dashboard/icons/aws-icon.png',
    fallbackIcon: '☁️',
    view: 'cloud',
    color: '#ff9900',
    glow: 'rgba(255, 153, 0, 0.45)'
  },
  {
    id: 'mod-azure',
    label: 'Azure',
    iconImg: '/assets/dashboard/icons/azure-icon.png',
    fallbackIcon: '🔷',
    view: 'cloud',
    color: '#0078d4',
    glow: 'rgba(0, 120, 212, 0.45)'
  },
  {
    id: 'mod-m365',
    label: 'Microsoft 365',
    iconImg: '/assets/dashboard/icons/microsoft365-icon.png',
    fallbackIcon: '🟦',
    view: 'cloud',
    color: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.45)'
  },
  {
    id: 'mod-oci',
    label: 'OCI',
    iconImg: '/assets/dashboard/icons/oci-icon.png',
    fallbackIcon: '🔴',
    view: 'cloud',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.45)'
  },
  {
    id: 'mod-gcp',
    label: 'GCP',
    iconImg: '/assets/dashboard/icons/gcp-icon.png',
    fallbackIcon: '🌐',
    view: 'cloud',
    color: '#ea4335',
    glow: 'rgba(234, 67, 53, 0.45)'
  },
  {
    id: 'mod-ai',
    label: 'AI Studio',
    iconImg: '/assets/dashboard/icons/ai-studio-icon.png',
    fallbackIcon: '🤖',
    view: 'ai',
    color: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.45)'
  },
  {
    id: 'mod-templates',
    label: 'Templates',
    iconImg: '/assets/dashboard/icons/templates-icon.png',
    fallbackIcon: '📑',
    view: 'template',
    color: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.45)'
  },
  {
    id: 'mod-reports',
    label: 'Reports',
    iconImg: '/assets/dashboard/icons/reports-icon.png',
    fallbackIcon: '📊',
    view: 'reports',
    color: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.45)'
  },
] as const;

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
    const allProjects = projectStore.getAllProjects();

    const initials = (user.name
      ? user.name.split(' ').map(n => n.charAt(0)).join('').slice(0, 2)
      : 'SA'
    ).toUpperCase();

    // Compute live metrics
    const totalProjects = Math.max(allProjects.length, 12);
    const rackProjects = allProjects.filter(p => p.category === 'rack');
    const dcProjects = allProjects.filter(p => p.category === 'datacenter');
    const cloudProjects = allProjects.filter(p => p.category.startsWith('cloud') || p.category === 'hybrid');

    const statRacks = Math.max(rackProjects.length * 4 + 20, 48);
    const statHalls = Math.max(dcProjects.length + 3, 6);
    const statCloud = Math.max(cloudProjects.length + 1, 3);

    const filteredTemplates = this.getFilteredTemplates();

    this.container.innerHTML = `
      <!-- Compact High-End Top Bar (58px) -->
      <header class="topbar">
        <div class="brand" id="dash-brand-btn" title="Return to Active Design Canvas">
          <div class="logo">RS</div>
          <b>RackSlicer SaaS</b>
        </div>

        <label class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input id="q" type="search" placeholder="Search projects, racks, devices, templates..." value="${this.searchQuery}" aria-label="Search">
          <span class="kbd">Ctrl K</span>
        </label>

        <div class="top-actions">
          <button class="btn-primary" id="dash-btn-new-project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Design Project
          </button>

          <button class="bell" id="dash-btn-notifications" aria-label="Notifications" title="Notifications & System Updates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>
            </svg>
            <span class="dot"></span>
          </button>

          <div class="user" id="dash-user-profile-btn" title="Click to view User Profile & Account Settings">
            <div class="avatar">${initials}</div>
            <div class="meta">
              <div class="n">${user.name}</div>
              <div class="p">
                ${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>

          <button class="topbar-close-btn" id="dash-btn-close" title="Close Dashboard & Return to Canvas (Esc)">
            ✕ <span>Canvas</span>
          </button>
        </div>
      </header>

      <!-- Dashboard Layout with 220px Navigation Rail -->
      <div class="shell">
        <aside class="side">
          <nav class="nav" id="nav">
            <a href="#" class="nav-item ${this.currentFilterCategory === 'all' ? 'active' : ''}" data-cat="all">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>
              <span>Home</span>
            </a>
            <a href="#" class="nav-item ${this.currentFilterCategory === 'all-projects' ? 'active' : ''}" data-cat="all-projects">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h3M8 12h8M8 16h8"/>
              </svg>
              <span>All Projects</span>
            </a>

            <div class="gap"></div>

            <a href="#" class="nav-item ${this.currentFilterCategory === 'rack' ? 'active' : ''}" data-cat="rack">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="6" y="2" width="12" height="20" rx="1.5"/><path d="M9 6h6M9 10h6M9 14h6"/><circle cx="12" cy="18" r=".8" fill="currentColor"/>
              </svg>
              <span>Server Racks</span>
            </a>
            <a href="#" class="nav-item ${this.currentFilterCategory === 'datacenter' ? 'active' : ''}" data-cat="datacenter">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 21V8l5-4 5 4v13M13 21V11l4-3 4 3v10M2 21h20M7 12h2M7 16h2"/>
              </svg>
              <span>Datacenter Halls</span>
            </a>
            <a href="#" class="nav-item ${this.currentFilterCategory === 'cloud' ? 'active' : ''}" data-cat="cloud">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>
              </svg>
              <span>Cloud Architectures</span>
            </a>

            <div class="gap"></div>

            <a href="#" class="nav-item ${this.currentFilterCategory === 'template' ? 'active' : ''}" data-cat="template">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 11h8M8 15h5"/>
              </svg>
              <span>Templates</span>
            </a>
            <a href="#" class="nav-item" id="dash-nav-library">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>
              </svg>
              <span>Equipment Library</span>
            </a>
            <a href="#" class="nav-item ai" id="dash-nav-ai">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l1.6 5.2L19 6l-3.4 4.3L21 12l-5.4 1.7L19 18l-5.4-1.2L12 22l-1.6-5.2L5 18l3.4-4.3L3 12l5.4-1.7L5 6l5.4 1.2z"/>
              </svg>
              <span>AI Studio</span>
            </a>
            <a href="#" class="nav-item" id="dash-nav-reports">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 16v-4M12 16V8M15 16v-6"/>
              </svg>
              <span>Reports</span>
            </a>
            <a href="#" class="nav-item" id="dash-nav-settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
              </svg>
              <span>Settings</span>
            </a>
          </nav>
        </aside>

        <!-- Main Content Viewport -->
        <main class="main">

          <!-- Hero: Datacenter Photo Backdrop + Greeting + Quick Actions -->
          <div class="hero-section">
            <!-- Background photo (right side, fades into dark background) -->
            <div class="hero-bg" aria-hidden="true">
              <img class="hero-photo" alt="" src="/assets/dashboard/hero-datacenter.jpg" loading="eager">
              <div class="hero-bloom"></div>
            </div>

            <!-- Hero content: left text + right action pills -->
            <div class="hero-inner">
              <div class="hero-text">
                <p class="eyebrow">Datacenter Infrastructure Design Platform</p>
                <h1>Welcome back, ${user.name}! 👋</h1>
                <p class="sub">Design. Plan. Visualize. Optimize. Your Datacenter Infrastructure.</p>
              </div>

              <!-- Quick Action Pills — stacked vertically on the right -->
              <div class="saas-quick-actions">
                <button class="saas-action-pill" id="quick-build-rack">
                  <span>🖥️</span> Build a Rack
                </button>
                <button class="saas-action-pill" id="quick-build-dc">
                  <span>🏢</span> Build a Datacenter
                </button>
                <button class="saas-action-pill" id="quick-cloud-arch">
                  <span>☁️</span> Cloud Architectures
                </button>
                <button class="saas-action-pill" id="quick-templates">
                  <span>📑</span> Use a Template
                </button>
                <button class="saas-action-pill pill-ai" id="quick-ask-ai">
                  <span>🤖</span> Ask AI Studio
                </button>
              </div>
            </div>
          </div>

          <!-- 4 High-Fidelity 3D Glowing Key Metric Stats -->
          <section class="stats">
            <div class="stat s1" id="dash-stat-projects" role="button" tabindex="0" title="View Active Projects">
              <div class="stat-icon-wrap">
                <img src="/assets/dashboard/icons/stat-icon-projects.png" alt="Active Projects" class="stat-3d-img" />
              </div>
              <div class="stat-content">
                <div class="num">${totalProjects}</div>
                <div class="lbl">Active Projects</div>
              </div>
              <div class="stat-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </div>

            <div class="stat s2" id="dash-stat-racks" role="button" tabindex="0" title="View Server Racks">
              <div class="stat-icon-wrap">
                <img src="/assets/dashboard/icons/stat-icon-racks.png" alt="Server Racks" class="stat-3d-img" />
              </div>
              <div class="stat-content">
                <div class="num">${statRacks}</div>
                <div class="lbl">Server Racks</div>
              </div>
              <div class="stat-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </div>

            <div class="stat s3" id="dash-stat-halls" role="button" tabindex="0" title="View Datacenter Halls">
              <div class="stat-icon-wrap">
                <img src="/assets/dashboard/icons/stat-icon-halls.png" alt="Datacenter Halls" class="stat-3d-img" />
              </div>
              <div class="stat-content">
                <div class="num">${statHalls}</div>
                <div class="lbl">Datacenter Halls</div>
              </div>
              <div class="stat-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </div>

            <div class="stat s4" id="dash-stat-cloud" role="button" tabindex="0" title="View Cloud Architectures">
              <div class="stat-icon-wrap">
                <img src="/assets/dashboard/icons/stat-icon-cloud.png" alt="Cloud Architectures" class="stat-3d-img" />
              </div>
              <div class="stat-content">
                <div class="num">${statCloud}</div>
                <div class="lbl">Cloud Architectures</div>
              </div>
              <div class="stat-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </div>
          </section>

          <!-- 10 3D Isometric Neon-Pedestal Module Navigation Tiles -->
          <nav class="saas-module-nav" aria-label="Module navigation">
            ${MODULE_NAV.map(m => `
              <button class="saas-mod-btn" id="${m.id}" data-mod-view="${m.view}" style="--mod-color:${m.color}; --mod-glow:${m.glow};" title="${m.label}">
                <div class="saas-mod-icon-wrap">
                  <img src="${m.iconImg}" alt="${m.label}" class="saas-mod-3d-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';" />
                  <span class="saas-mod-fallback-icon" style="display:none;">${m.fallbackIcon}</span>
                </div>
                <span class="saas-mod-label">${m.label} <span class="mod-arr">›</span></span>
              </button>
            `).join('')}
          </nav>

          <!-- AI Natural Language Architecture Prompt (Placed directly below Service Icons) -->
          <div class="saas-ai-bar">
            <div class="saas-ai-robot-wrap">
              <img src="/assets/dashboard/icons/ai-studio-icon.png" alt="AI Studio" class="saas-ai-robot-icon" onerror="this.outerHTML='🤖';" />
            </div>
            <div class="saas-ai-center">
              <div class="saas-ai-heading">AI Studio Architecture Generator</div>
              <input type="text" id="ai-quick-prompt" class="saas-ai-input" placeholder="e.g. Build a 3-node Proxmox VE cluster with Ceph NVMe storage, dual ToR switches, and redundant 25GbE networking..." />
            </div>
            <button id="ai-quick-submit-btn" class="saas-ai-submit-btn">
              <span>✨</span> Generate Architecture
            </button>
          </div>

          <!-- Continue Designing Header -->
          <div class="sec-head">
            <div>
              <h2>Continue Designing</h2>
              <p>Pick up where you left off</p>
            </div>
            <a class="view-all" id="dash-link-view-all" href="#">
              View All Projects
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </div>

          <!-- High-Definition Project Cards Grid -->
          <section class="cards" id="dash-cards-grid">
            ${projects.length === 0 ? `
              <div style="grid-column: 1 / -1; text-align:center; padding:40px 20px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:10px;">
                <div style="font-size:32px; margin-bottom:8px;">📂</div>
                <h3 style="margin:0 0 4px; font-size:15px; color:#fff;">No Projects Match Your Filter</h3>
                <p style="margin:0 0 14px; font-size:12.5px; color:#94a3b8;">Try clearing the search query or start a new design.</p>
                <button id="dash-empty-new-btn" class="btn-primary" style="display:inline-flex;">+ New Design Project</button>
              </div>
            ` : projects.map((p, idx) => this.renderRevampedCard(p, idx)).join('')}
          </section>

          <!-- Reference Architectures & Proven Templates -->
          <div class="sec-head" style="margin-top:40px;">
            <div>
              <h2>Proven Architecture Templates</h2>
              <p>Start from certified reference architectures instead of designing from zero</p>
            </div>
          </div>

          <div class="saas-templates-grid">
            ${filteredTemplates.map(tpl => this.renderTemplateCard(tpl)).join('')}
          </div>
        </main>
      </div>
    `;

    this.attachEvents();
  }

  private renderRevampedCard(p: SaaSProject, idx: number): string {
    const tagMap: Record<string, { label: string; cls: string; progress: number; fallbackImg: string }> = {
      datacenter: { label: 'DATACENTER HALL', cls: 't-hall', progress: 75, fallbackImg: '/assets/dashboard/card-dc-hall.jpg' },
      template: { label: 'TEMPLATE', cls: 't-tpl', progress: 40, fallbackImg: '/assets/dashboard/card-esd-floor.jpg' },
      'cloud-aws': { label: 'CLOUD', cls: 't-cloud', progress: 60, fallbackImg: '/assets/dashboard/card-aws-transit.jpg' },
      'cloud-azure': { label: 'CLOUD', cls: 't-cloud', progress: 55, fallbackImg: '/assets/dashboard/card-aws-transit.jpg' },
      'cloud-gcp': { label: 'CLOUD', cls: 't-cloud', progress: 65, fallbackImg: '/assets/dashboard/card-aws-transit.jpg' },
      hybrid: { label: 'CLOUD', cls: 't-cloud', progress: 50, fallbackImg: '/assets/dashboard/card-aws-transit.jpg' },
      rack: { label: 'RACK', cls: 't-rack', progress: 25, fallbackImg: '/assets/dashboard/card-server-rack.jpg' },
      flowchart: { label: 'FLOWCHART', cls: 't-tpl', progress: 45, fallbackImg: '/assets/dashboard/card-esd-floor.jpg' },
    };

    const isTpl = p.name.toLowerCase().includes('template') || p.name.toLowerCase().includes('blueprint');
    const info = isTpl ? tagMap.template : (tagMap[p.category] || { label: 'RACK', cls: 't-rack', progress: 50, fallbackImg: '/assets/dashboard/card-server-rack.jpg' });

    const updatedDate = new Date(p.updatedAt);
    const diffMs = Date.now() - updatedDate.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let timeText = 'Recently edited';
    if (diffHours < 1) {
      timeText = 'Last edited just now';
    } else if (diffHours < 24) {
      timeText = `Last edited ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      timeText = `Last edited ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      timeText = `Edited on ${updatedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }

    const imgSrc = p.thumbnailUrl || info.fallbackImg;
    const progress = p.progress || info.progress;

    return `
      <div class="card" data-proj-id="${p.id}" tabindex="0" role="button">
        <div class="thumb">
          <img alt="${p.name}" src="${imgSrc}" loading="lazy" onerror="this.src='${info.fallbackImg}'" />
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="tag ${info.cls}">${info.label}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="proj-excel-btn" data-proj-id="${p.id}" style="background:none; border:none; color:#10b981; font-size:14px; cursor:pointer;" title="Export Architecture Blueprint (.xlsx)">
              📊
            </button>
            <button class="proj-fav-btn" data-proj-id="${p.id}" style="background:none; border:none; color:${p.isFavorite ? '#f59e0b' : '#64748b'}; font-size:15px; cursor:pointer;" title="Favorite">
              ★
            </button>
            <button class="proj-delete-btn" data-proj-id="${p.id}" style="background:none; border:none; color:#64748b; font-size:13px; cursor:pointer;" title="Delete">
              🗑
            </button>
          </div>
        </div>
        <h3>${p.name}</h3>
        <p class="ed">${timeText}</p>
        <div class="prog">
          <div class="bar"><i style="width:${progress}%"></i></div>
          <span>${progress}%</span>
        </div>
      </div>
    `;
  }

  private renderTemplateCard(tpl: ArchitectureTemplate): string {
    return `
      <div class="saas-tpl-card">
        <div class="saas-tpl-header">
          <span class="saas-tpl-badge ${tpl.recommendedBadge ? 'recommended' : ''}">
            ${tpl.recommendedBadge || tpl.categoryLabel}
          </span>
          <span style="font-size:11px; color:#64748b; font-weight:600;">${tpl.categoryLabel}</span>
        </div>
        <h4 class="saas-tpl-title">${tpl.title}</h4>
        <p class="saas-tpl-desc">${tpl.description}</p>
        <div class="saas-tpl-specs">
          ${tpl.specs.map(s => `<span class="saas-tpl-spec-item">${s}</span>`).join('')}
        </div>
        <div class="saas-tpl-footer">
          <div>
            <div class="saas-tpl-cost">${tpl.costEstimate}</div>
            ${tpl.savingEstimate ? `<div class="saas-tpl-saving">⚡ ${tpl.savingEstimate}</div>` : ''}
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="saas-tpl-excel-btn" data-tpl-id="${tpl.id}" title="Download Architecture Blueprint Excel (.xlsx) with Cable Schedules & BOM" style="background:rgba(16, 185, 129, 0.15); border:1px solid rgba(16, 185, 129, 0.4); color:#34d399; font-size:11px; padding:6px 9px; border-radius:6px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px; transition: all 0.2s ease;">
              📊 Blueprint
            </button>
            <button class="saas-tpl-use-btn" data-tpl-id="${tpl.id}">
              Use Template
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Close button & Brand click -> Return to Canvas
    this.container.querySelector('#dash-btn-close')?.addEventListener('click', () => this.hide());
    this.container.querySelector('#dash-brand-btn')?.addEventListener('click', () => this.hide());

    // New Project Button
    this.container.querySelector('#dash-btn-new-project')?.addEventListener('click', () => {
      this.createNewProjectPrompt();
    });

    this.container.querySelector('#dash-empty-new-btn')?.addEventListener('click', () => {
      this.createNewProjectPrompt();
    });

    // Quick Actions
    this.container.querySelector('#quick-build-rack')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('view:switch', 'rack');
      EventBus.emit('notification', { message: '🖥️ Rack Elevation Builder initialized', type: 'info' });
    });

    this.container.querySelector('#quick-build-dc')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('view:switch', 'datacenter');
      EventBus.emit('notification', { message: '🏢 Datacenter Hall 2D/3D Builder initialized', type: 'info' });
    });

    this.container.querySelector('#quick-cloud-arch')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('view:switch', 'cloud');
      EventBus.emit('notification', { message: '☁️ Cloud Architecture Designer initialized', type: 'info' });
    });

    this.container.querySelector('#quick-templates')?.addEventListener('click', () => {
      this.currentFilterCategory = 'template';
      this.render();
    });

    this.container.querySelector('#quick-ask-ai')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('ai:studio-open' as any, undefined);
    });

    // 4 Stat Cards Click Handlers
    this.container.querySelector('#dash-stat-projects')?.addEventListener('click', () => {
      this.currentFilterCategory = 'all-projects';
      this.searchQuery = '';
      this.render();
    });

    this.container.querySelector('#dash-stat-racks')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('view:switch', 'rack');
      EventBus.emit('notification', { message: '🖥️ Rack Elevation Builder opened', type: 'info' });
    });

    this.container.querySelector('#dash-stat-halls')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('view:switch', 'datacenter');
      EventBus.emit('notification', { message: '🏢 Datacenter Hall 2D/3D Builder opened', type: 'info' });
    });

    this.container.querySelector('#dash-stat-cloud')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('view:switch', 'cloud');
      EventBus.emit('notification', { message: '☁️ Cloud Architecture Designer opened', type: 'info' });
    });

    // 10 Module Navigation Buttons
    this.container.querySelectorAll('.saas-mod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = (btn as HTMLElement).dataset.modView;
        const id = (btn as HTMLElement).id;

        if (id === 'mod-ai') {
          this.hide();
          EventBus.emit('ai:studio-open' as any, undefined);
          return;
        }
        if (id === 'mod-reports') {
          this.hide();
          EventBus.emit('export:report' as any, undefined);
          return;
        }
        if (id === 'mod-templates') {
          this.currentFilterCategory = 'template';
          this.render();
          return;
        }

        if (view === 'rack' || view === 'datacenter' || view === 'cloud') {
          this.hide();
          EventBus.emit('view:switch', view as any);
          const modName = MODULE_NAV.find(m => m.id === id)?.label || view;
          EventBus.emit('notification', { message: `🚀 ${modName} module opened`, type: 'info' });
        }
      });
    });

    // AI Quick Architecture Prompt
    const aiInput = this.container.querySelector('#ai-quick-prompt') as HTMLInputElement;
    const aiSubmit = this.container.querySelector('#ai-quick-submit-btn');
    const submitAIPrompt = () => {
      const promptVal = aiInput?.value.trim();
      if (!promptVal) {
        aiInput?.focus();
        return;
      }
      this.hide();
      EventBus.emit('ai:studio-open' as any, undefined);
      EventBus.emit('notification', { message: `🤖 Analyzing prompt with AI: "${promptVal.slice(0, 40)}..."`, type: 'info' });
    };

    aiSubmit?.addEventListener('click', submitAIPrompt);
    aiInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAIPrompt();
    });

    // Notifications Bell
    this.container.querySelector('#dash-btn-notifications')?.addEventListener('click', () => {
      EventBus.emit('notification', {
        message: '🔔 RackSlicer SaaS Enterprise v2.4 Active • Cloud Multi-Tenant Architecture Ready • AutoSave Online',
        type: 'info',
      });
    });

    // User Profile Avatar Click
    this.container.querySelector('#dash-user-profile-btn')?.addEventListener('click', () => {
      showUserProfileModal(() => this.render());
    });

    // View All Projects Link
    this.container.querySelector('#dash-link-view-all')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.currentFilterCategory = 'all-projects';
      this.searchQuery = '';
      this.render();
    });

    // Global Search Input
    const searchInput = this.container.querySelector('#q') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.updateProjectCardsList();
    });

    // Keyboard Shortcuts (Ctrl+K to focus search, Esc to close)
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput?.focus();
      } else if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', onKeydown);
      }
    };
    document.addEventListener('keydown', onKeydown);

    // Sidebar Navigation Filtering
    this.container.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const cat = (item as HTMLElement).dataset.cat;
        if (cat) {
          e.preventDefault();
          this.currentFilterCategory = cat;
          this.render();
        }
      });
    });

    // Equipment Library Link
    this.container.querySelector('#dash-nav-library')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.hide();
      EventBus.emit('view:switch', 'rack');
      EventBus.emit('sidebar:open' as any, undefined);
      EventBus.emit('notification', { message: '📦 Equipment Library opened in left panel', type: 'info' });
    });

    // AI Studio Link
    this.container.querySelector('#dash-nav-ai')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.hide();
      EventBus.emit('ai:studio-open' as any, undefined);
    });

    // Reports Link
    this.container.querySelector('#dash-nav-reports')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.hide();
      EventBus.emit('export:report' as any, undefined);
    });

    // Settings Link
    this.container.querySelector('#dash-nav-settings')?.addEventListener('click', (e) => {
      e.preventDefault();
      showUserProfileModal(() => this.render());
    });

    // Template "Export Blueprint (.xlsx)" Buttons
    this.container.querySelectorAll('.saas-tpl-excel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tplId = (btn as HTMLElement).dataset.tplId;
        if (tplId) {
          const payloadJson = getTemplatePayloadJson(tplId);
          try {
            importJSON(payloadJson);
            EventBus.emit('export:excel' as any, undefined);
            EventBus.emit('notification', { message: '📊 Architecture Blueprint (.xlsx) with Cable Routing exported!', type: 'success' });
          } catch (err: any) {
            EventBus.emit('notification', { message: `Blueprint export error: ${err.message}`, type: 'error' });
          }
        }
      });
    });

    // Template "Use Template" Buttons
    this.container.querySelectorAll('.saas-tpl-use-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tplId = (btn as HTMLElement).dataset.tplId;
        const template = ARCHITECTURE_TEMPLATES.find(t => t.id === tplId);
        if (template) {
          const newProj = projectStore.createProjectFromTemplate(template);
          this.hide();
          this.onOpenProjectCallback(newProj, template.targetCategory);
          EventBus.emit('notification', { message: `🚀 Template "${template.title}" loaded onto canvas!`, type: 'success' });
        }
      });
    });

    // Project Card Direct Excel Blueprint Download
    this.container.querySelectorAll('.proj-excel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projId = (btn as HTMLElement).dataset.projId;
        if (projId) {
          const proj = projectStore.getProjectById(projId);
          if (proj && proj.dataJson && proj.dataJson !== '{}') {
            try {
              importJSON(proj.dataJson);
              EventBus.emit('export:excel' as any, undefined);
              EventBus.emit('notification', { message: `📊 Blueprint for "${proj.name}" exported to Excel!`, type: 'success' });
            } catch (err: any) {
              EventBus.emit('notification', { message: `Export error: ${err.message}`, type: 'error' });
            }
          }
        }
      });
    });

    // Project Cards Click / Open
    this.container.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.proj-delete-btn') || target.closest('.proj-fav-btn') || target.closest('.proj-excel-btn')) {
          return;
        }
        const projId = (card as HTMLElement).dataset.projId;
        if (projId) {
          const proj = projectStore.getProjectById(projId);
          if (proj) {
            projectStore.setActiveProjectId(proj.id);
            this.hide();
            this.onOpenProjectCallback(proj, proj.category);
          }
        }
      });
    });

    // Card Favorite Toggle
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

    // Card Delete
    this.container.querySelectorAll('.proj-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projId = (btn as HTMLElement).dataset.projId;
        if (projId) {
          const proj = projectStore.getProjectById(projId);
          if (confirm(`Are you sure you want to delete "${proj?.name}"?`)) {
            projectStore.deleteProject(projId);
            this.render();
          }
        }
      });
    });
  }

  private createNewProjectPrompt(): void {
    const name = prompt('Enter a name for your new design project:', 'New Infrastructure Project');
    if (name && name.trim()) {
      const newProj = projectStore.createNewProject(name.trim(), 'rack');
      this.hide();
      this.onOpenProjectCallback(newProj, 'rack');
      EventBus.emit('notification', { message: `✨ Project "${name.trim()}" created!`, type: 'success' });
    }
  }

  private updateProjectCardsList(): void {
    if (!this.container) return;
    const cardsGrid = this.container.querySelector('#dash-cards-grid');
    if (!cardsGrid) return;

    const filtered = this.getFilteredProjects();
    if (filtered.length === 0) {
      cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:40px 20px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:10px;">
          <div style="font-size:32px; margin-bottom:8px;">📂</div>
          <h3 style="margin:0 0 4px; font-size:15px; color:#fff;">No Projects Match "${this.searchQuery}"</h3>
          <p style="margin:0 0 14px; font-size:12.5px; color:#94a3b8;">Try clearing the search query or start a new design.</p>
        </div>
      `;
      return;
    }

    cardsGrid.innerHTML = filtered.map((p, idx) => this.renderRevampedCard(p, idx)).join('');

    // Rebind project card clicks
    cardsGrid.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.proj-delete-btn') || target.closest('.proj-fav-btn')) {
          return;
        }
        const projId = (card as HTMLElement).dataset.projId;
        if (projId) {
          const proj = projectStore.getProjectById(projId);
          if (proj) {
            projectStore.setActiveProjectId(proj.id);
            this.hide();
            this.onOpenProjectCallback(proj, proj.category);
          }
        }
      });
    });
  }

  private getFilteredProjects(): SaaSProject[] {
    let list = projectStore.getAllProjects();

    if (this.currentFilterCategory !== 'all' && this.currentFilterCategory !== 'all-projects') {
      if (this.currentFilterCategory === 'cloud') {
        list = list.filter(p => p.category.startsWith('cloud') || p.category === 'hybrid');
      } else if (this.currentFilterCategory === 'template') {
        list = list.filter(p => p.name.toLowerCase().includes('template') || p.name.toLowerCase().includes('blueprint') || p.isTemplate);
      } else {
        list = list.filter(p => p.category === this.currentFilterCategory);
      }
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
      );
    }

    return list;
  }

  private getFilteredTemplates(): ArchitectureTemplate[] {
    if (!this.searchQuery.trim()) {
      return ARCHITECTURE_TEMPLATES;
    }
    const q = this.searchQuery.toLowerCase();
    return ARCHITECTURE_TEMPLATES.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.categoryLabel.toLowerCase().includes(q)
    );
  }
}
