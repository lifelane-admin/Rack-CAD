/**
 * Revamped High-Fidelity SaaS Workspace Dashboard & Project Hub
 * Designed according to user experience specifications with photo-grade
 * datacenter perspective backdrop, real-time metrics, navigation rail, and project cards.
 */

import { authStore } from '../auth/auth-store';
import { projectStore, SaaSProject } from '../storage/project-store';
import { showUserProfileModal } from './user-profile-modal';
import EventBus from '../core/event-bus';

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
    this.initHeroRackAisle();
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

    // Compute stats
    const totalProjects = Math.max(allProjects.length, 12);
    const rackProjects = allProjects.filter(p => p.category === 'rack');
    const dcProjects = allProjects.filter(p => p.category === 'datacenter');
    const cloudProjects = allProjects.filter(p => p.category.startsWith('cloud') || p.category === 'hybrid');

    const statRacks = Math.max(rackProjects.length * 4 + 20, 48);
    const statHalls = Math.max(dcProjects.length + 3, 6);
    const statCloud = Math.max(cloudProjects.length + 1, 3);

    this.container.innerHTML = `
      <!-- Topbar Header (84px) -->
      <header class="topbar">
        <div class="brand" id="dash-brand-btn" title="Return to Active Design Canvas">
          <div class="logo">RS</div>
          <b>RackSlicer SaaS</b>
        </div>

        <!-- Global Search Input -->
        <label class="search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input id="q" type="search" placeholder="Search projects, racks, devices, templates..." value="${this.searchQuery}" aria-label="Search">
          <span class="kbd">Ctrl K</span>
        </label>

        <!-- Right Top Actions -->
        <div class="top-actions">
          <button class="btn-primary" id="dash-btn-new-project">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Design Project
          </button>

          <button class="bell" id="dash-btn-notifications" aria-label="Notifications" title="Notifications & System Updates">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- Close / Return Button -->
          <button class="topbar-close-btn" id="dash-btn-close" title="Close Dashboard & Return to Canvas (Esc)">
            ✕ <span>Canvas</span>
          </button>
        </div>
      </header>

      <!-- Main Shell with Navigation Rail & Content -->
      <div class="shell">
        <!-- Sidebar Navigation (260px) -->
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

        <!-- Main Dashboard Viewport -->
        <main class="main">
          <!-- Datacenter Aisle Backdrop -->
          <div class="hero-bg" aria-hidden="true">
            <div class="hero-bloom"></div>
            <svg viewBox="0 0 1000 470" preserveAspectRatio="xMaxYMin slice">
              <defs>
                <linearGradient id="rs-floor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#0a1a33"/>
                  <stop offset="1" stop-color="#040a15"/>
                </linearGradient>
                <linearGradient id="rs-rk" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="#0c1628"/>
                  <stop offset="1" stop-color="#132440"/>
                </linearGradient>
                <radialGradient id="rs-glow" cx=".6" cy=".1" r=".7">
                  <stop offset="0" stop-color="#1b6dff" stop-opacity=".45"/>
                  <stop offset="1" stop-color="#1b6dff" stop-opacity="0"/>
                </radialGradient>
              </defs>
              <rect width="1000" height="470" fill="#040a16"/>
              <rect width="1000" height="470" fill="url(#rs-glow)"/>
              <!-- ceiling light strips -->
              <g stroke="#43c8ff" stroke-width="5" stroke-linecap="round" opacity=".85">
                <path d="M520 40 L760 95"/>
                <path d="M640 18 L900 80"/>
                <path d="M780 10 L990 62"/>
              </g>
              <polygon points="300,470 1000,470 1000,330 520,300" fill="url(#rs-floor)"/>
              <g stroke="#1d4f8a" stroke-width="1" opacity=".5">
                <path d="M520 300 L1000 360"/>
                <path d="M480 330 L1000 410"/>
                <path d="M420 380 L1000 460"/>
              </g>
              <g id="rs-racks-aisle"></g>
            </svg>
          </div>

          <!-- Hero Greeting -->
          <section class="hero">
            <p class="eyebrow">DATACENTER INFRASTRUCTURE DESIGN PLATFORM</p>
            <h1>Welcome back, ${user.name}! 👋</h1>
            <p class="sub">Design. Plan. Visualize. Optimize. Your Datacenter Infrastructure.</p>
          </section>

          <!-- Real-Time Metrics Stats -->
          <section class="stats">
            <div class="stat s1">
              <div class="ic">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#e9f8ff">
                  <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
              </div>
              <div>
                <div class="num">${totalProjects}</div>
                <div class="lbl">Active Projects</div>
              </div>
            </div>

            <div class="stat s2">
              <div class="ic">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#eafff7" stroke-width="2">
                  <rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16"/>
                </svg>
              </div>
              <div>
                <div class="num">${statRacks}</div>
                <div class="lbl">Server Racks</div>
              </div>
            </div>

            <div class="stat s3">
              <div class="ic">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f1ecff" stroke-width="1.8">
                  <path d="M4 21V7l8-4 8 4v14M2 21h20M8 10v8M12 10v8M16 10v8"/>
                </svg>
              </div>
              <div>
                <div class="num">${statHalls}</div>
                <div class="lbl">Datacenter Halls</div>
              </div>
            </div>

            <div class="stat s4">
              <div class="ic">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff5e6">
                  <path d="M7 19h10a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6 10a4.5 4.5 0 0 0 1 9z"/>
                </svg>
              </div>
              <div>
                <div class="num">${statCloud}</div>
                <div class="lbl">Cloud Architectures</div>
              </div>
            </div>
          </section>

          <!-- Continue Designing Header -->
          <div class="sec-head">
            <div>
              <h2>Continue Designing</h2>
              <p>Pick up where you left off</p>
            </div>
            <a class="view-all" id="dash-link-view-all" href="#">
              View All Projects
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </a>
          </div>

          <!-- Project Cards Grid -->
          <section class="cards" id="dash-cards-grid">
            ${projects.length === 0 ? `
              <div style="grid-column: 1 / -1; text-align:center; padding:50px 20px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:14px;">
                <div style="font-size:36px; margin-bottom:12px;">📂</div>
                <h3 style="margin:0 0 6px; font-size:16px; color:#fff;">No Projects Match Your Search</h3>
                <p style="margin:0 0 16px; font-size:13px; color:#94a3b8;">Try clearing the search query or start a new design.</p>
                <button id="dash-empty-new-btn" class="btn-primary" style="display:inline-flex; height:42px; padding:0 18px; font-size:13px;">
                  + New Design Project
                </button>
              </div>
            ` : projects.map((p, idx) => this.renderRevampedCard(p, idx)).join('')}
          </section>
        </main>
      </div>
    `;

    this.attachEvents();
  }

  private renderRevampedCard(p: SaaSProject, idx: number): string {
    const tagMap: Record<string, { label: string; cls: string; progress: number }> = {
      datacenter: { label: 'DATACENTER HALL', cls: 't-hall', progress: 75 },
      template: { label: 'TEMPLATE', cls: 't-tpl', progress: 40 },
      'cloud-aws': { label: 'CLOUD', cls: 't-cloud', progress: 60 },
      'cloud-azure': { label: 'CLOUD', cls: 't-cloud', progress: 55 },
      'cloud-gcp': { label: 'CLOUD', cls: 't-cloud', progress: 65 },
      hybrid: { label: 'CLOUD', cls: 't-cloud', progress: 50 },
      rack: { label: 'RACK', cls: 't-rack', progress: 25 },
      flowchart: { label: 'FLOWCHART', cls: 't-tpl', progress: 45 },
    };

    const isTpl = p.name.toLowerCase().includes('template') || p.name.toLowerCase().includes('blueprint');
    const info = isTpl ? tagMap.template : (tagMap[p.category] || { label: 'RACK', cls: 't-rack', progress: 50 });

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

    const thumbSvg = this.generateCardThumbnailSvg(p.category, idx);

    return `
      <div class="card" data-proj-id="${p.id}" tabindex="0" role="button">
        <div class="thumb">
          ${thumbSvg}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="tag ${info.cls}">${info.label}</span>
          <div style="display:flex; gap:6px; align-items:center;">
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
          <div class="bar"><i style="width:${info.progress}%"></i></div>
          <span>${info.progress}%</span>
        </div>
      </div>
    `;
  }

  private generateCardThumbnailSvg(category: string, index: number): string {
    if (category === 'datacenter') {
      return `
        <svg viewBox="0 0 300 135" width="100%" height="100%">
          <rect width="300" height="135" fill="#081426"/>
          <path d="M0,135 L300,135 L300,90 L120,60 L0,90 Z" fill="#0d223f" opacity=".6"/>
          <g stroke="#1a3d6b" stroke-width="1">
            <line x1="60" y1="90" x2="180" y2="135"/>
            <line x1="120" y1="60" x2="240" y2="135"/>
            <line x1="180" y1="60" x2="300" y2="110"/>
          </g>
          <!-- Racks in Datacenter -->
          <rect x="25" y="45" width="35" height="75" fill="#0c1d33" stroke="#2563eb" stroke-width="1"/>
          <rect x="68" y="48" width="35" height="72" fill="#0c1d33" stroke="#2563eb" stroke-width="1"/>
          <rect x="111" y="52" width="35" height="68" fill="#0c1d33" stroke="#2563eb" stroke-width="1"/>
          <rect x="154" y="55" width="35" height="65" fill="#0c1d33" stroke="#2563eb" stroke-width="1"/>
          <rect x="197" y="58" width="35" height="62" fill="#0c1d33" stroke="#2563eb" stroke-width="1"/>
          <rect x="240" y="61" width="35" height="59" fill="#0c1d33" stroke="#2563eb" stroke-width="1"/>
          <!-- Server LEDs -->
          <circle cx="32" cy="55" r="2" fill="#38bdf8"/>
          <circle cx="75" cy="58" r="2" fill="#34d399"/>
          <circle cx="118" cy="62" r="2" fill="#38bdf8"/>
          <circle cx="161" cy="65" r="2" fill="#fbbf24"/>
          <circle cx="204" cy="68" r="2" fill="#38bdf8"/>
        </svg>
      `;
    } else if (category.startsWith('cloud') || category === 'hybrid') {
      return `
        <svg viewBox="0 0 300 135" width="100%" height="100%">
          <rect width="300" height="135" fill="#0b1329"/>
          <!-- Network Mesh Lines -->
          <line x1="60" y1="68" x2="150" y2="35" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3"/>
          <line x1="60" y1="68" x2="150" y2="100" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3"/>
          <line x1="150" y1="35" x2="240" y2="68" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3"/>
          <line x1="150" y1="100" x2="240" y2="68" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3"/>
          <!-- Cloud Nodes -->
          <rect x="35" y="48" width="50" height="40" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
          <text x="60" y="73" fill="#38bdf8" font-size="16" text-anchor="middle">☁</text>
          <rect x="125" y="15" width="50" height="40" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
          <text x="150" y="40" fill="#f59e0b" font-size="16" text-anchor="middle">⚡</text>
          <rect x="125" y="80" width="50" height="40" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
          <text x="150" y="105" fill="#10b981" font-size="16" text-anchor="middle">🔒</text>
          <rect x="215" y="48" width="50" height="40" rx="8" fill="#1e293b" stroke="#a855f7" stroke-width="1.5"/>
          <text x="240" y="73" fill="#a855f7" font-size="16" text-anchor="middle">🌐</text>
        </svg>
      `;
    } else {
      // Default: Server Rack Front Elevation
      return `
        <svg viewBox="0 0 300 135" width="100%" height="100%">
          <rect width="300" height="135" fill="#09111f"/>
          <!-- Central 42U Rack Outline -->
          <rect x="110" y="10" width="80" height="115" rx="3" fill="#111827" stroke="#38bdf8" stroke-width="1.5"/>
          <!-- Rack Units / Servers -->
          <rect x="115" y="18" width="70" height="12" rx="1.5" fill="#1f2937" stroke="#374151" stroke-width="1"/>
          <circle cx="123" cy="24" r="2" fill="#38bdf8"/>
          <circle cx="130" cy="24" r="2" fill="#10b981"/>
          <rect x="115" y="34" width="70" height="18" rx="1.5" fill="#1f2937" stroke="#374151" stroke-width="1"/>
          <circle cx="123" cy="43" r="2" fill="#38bdf8"/>
          <rect x="115" y="56" width="70" height="14" rx="1.5" fill="#1e3a5f" stroke="#2563eb" stroke-width="1"/>
          <circle cx="123" cy="63" r="2" fill="#60a5fa"/>
          <circle cx="178" cy="63" r="2" fill="#22c55e"/>
          <rect x="115" y="74" width="70" height="24" rx="1.5" fill="#1f2937" stroke="#374151" stroke-width="1"/>
          <circle cx="123" cy="86" r="2" fill="#fbbf24"/>
          <rect x="115" y="102" width="70" height="16" rx="1.5" fill="#1f2937" stroke="#374151" stroke-width="1"/>
          <circle cx="123" cy="110" r="2" fill="#10b981"/>
        </svg>
      `;
    }
  }

  private initHeroRackAisle(): void {
    if (!this.container) return;
    const g = this.container.querySelector('#rs-racks-aisle');
    if (!g) return;

    const NS = 'http://www.w3.org/2000/svg';
    const createEl = (tag: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, String(attrs[k]));
      return e;
    };

    for (let i = 0; i < 7; i++) {
      const s = 1 - i * 0.11;
      const x = 960 - i * 78 * s - i * 8;
      const h = 330 * s;
      const w = 70 * s;
      const y = 310 - h + i * 6;

      g.appendChild(createEl('rect', {
        x, y, width: w, height: h,
        fill: 'url(#rs-rk)', stroke: '#1e3a62', 'stroke-width': 1,
      }));
      g.appendChild(createEl('rect', {
        x: x + w * 0.86, y, width: w * 0.08, height: h,
        fill: '#2fb6ff', opacity: 0.7, class: 'led',
      }));

      const rows = Math.floor(h / 9);
      for (let r = 1; r < rows; r++) {
        g.appendChild(createEl('rect', {
          x: x + w * 0.12, y: y + r * 9, width: w * 0.62, height: 2.2, fill: '#173156',
        }));
        if ((r * 7 + i) % 5 === 0) {
          g.appendChild(createEl('circle', {
            cx: x + w * 0.18, cy: y + r * 9 + 1, r: 1.4,
            fill: (r + i) % 3 ? '#38c4ff' : '#29e3b0', class: 'led',
          }));
        }
      }
    }
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Close button & Brand click -> Return to Canvas
    this.container.querySelector('#dash-btn-close')?.addEventListener('click', () => this.hide());
    this.container.querySelector('#dash-brand-btn')?.addEventListener('click', () => this.hide());

    // New Project Button
    this.container.querySelector('#dash-btn-new-project')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('app:show-landing' as any, undefined);
    });

    this.container.querySelector('#dash-empty-new-btn')?.addEventListener('click', () => {
      this.hide();
      EventBus.emit('app:show-landing' as any, undefined);
    });

    // Notifications Bell
    this.container.querySelector('#dash-btn-notifications')?.addEventListener('click', () => {
      EventBus.emit('notification', {
        message: '🔔 You are running RackSlicer Cloud Edition v2.4 with AutoSave & Live Recovery enabled.',
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
        e.preventDefault();
        const cat = (item as HTMLElement).dataset.cat;
        if (cat) {
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
      EventBus.emit('notification', { message: '📦 Equipment & Device Library opened in left panel', type: 'info' });
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

    // Project Cards Click / Open
    this.container.querySelectorAll('.card').forEach(card => {
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

  private updateProjectCardsList(): void {
    if (!this.container) return;
    const cardsGrid = this.container.querySelector('#dash-cards-grid');
    if (!cardsGrid) return;

    const filtered = this.getFilteredProjects();
    if (filtered.length === 0) {
      cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:50px 20px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:14px;">
          <div style="font-size:36px; margin-bottom:12px;">📂</div>
          <h3 style="margin:0 0 6px; font-size:16px; color:#fff;">No Projects Match "${this.searchQuery}"</h3>
          <p style="margin:0 0 16px; font-size:13px; color:#94a3b8;">Try clearing the search query or start a new design.</p>
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
        list = list.filter(p => p.name.toLowerCase().includes('template') || p.name.toLowerCase().includes('blueprint'));
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
}
