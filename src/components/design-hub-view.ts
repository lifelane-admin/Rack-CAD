/**
 * RackSlicer — Design Hub View Component
 * Master Unified Product Blueprint Section 10-35
 * Production Architecture Discovery, Benchmarking, Social Hub & Publishing
 */

import { designHubStore } from '../community/design-hub-store';
import {
  PublishedArchitecture,
  DesignHubCategory,
  RankingSortTab,
} from '../community/design-hub-types';
import { publishDesignModal } from './publish-design-modal';
import { socialShareModal } from './social-share-modal';
import { designDetailModal } from './design-detail-modal';
import EventBus from '../core/event-bus';

export class DesignHubView {
  private container: HTMLElement | null = null;
  private currentTab: RankingSortTab = 'trending';
  private currentCategory: DesignHubCategory | 'all' = 'all';
  private searchQuery: string = '';

  private readonly CATEGORIES: Array<DesignHubCategory | 'all'> = [
    'all',
    'Storage & HCI',
    'Cloud Architecture',
    'AI Infrastructure',
    'Datacenter',
    'Virtualization',
    'Microsoft Hybrid',
    'Networking',
    'Security & DR',
  ];

  private readonly RANKING_TABS: Array<{ id: RankingSortTab; label: string; icon: string }> = [
    { id: 'trending', label: 'Trending', icon: '🔥' },
    { id: 'top-rated', label: 'Top Rated', icon: '★' },
    { id: 'most-forked', label: 'Most Forked', icon: '🔀' },
    { id: 'most-viewed', label: 'Most Viewed', icon: '👁' },
    { id: 'ai-recommended', label: 'AI Recommended', icon: '🤖' },
    { id: 'new', label: 'New & Noteworthy', icon: '⚡' },
  ];

  public mount(target: HTMLElement): void {
    this.container = target;
    this.render();
    this.setupListeners();
  }

  public unmount(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  public render(): void {
    if (!this.container) return;

    const designs = designHubStore.queryDesigns({
      search: this.searchQuery,
      category: this.currentCategory,
      tab: this.currentTab,
    });

    const allDesigns = designHubStore.getAllDesigns();
    const totalForks = allDesigns.reduce((acc, d) => acc + (d.forks || 0), 0);
    const avgScore = Math.round(
      allDesigns.reduce((acc, d) => acc + d.rackSlicerScore.overall, 0) / (allDesigns.length || 1)
    );

    this.container.innerHTML = `
      <div class="design-hub-view">
        <!-- Hero Header -->
        <header class="dh-hero">
          <div class="dh-hero-content">
            <div class="dh-hero-badge">
              <span>🌐 Enterprise Architecture Intelligence & Community</span>
            </div>
            <h1 class="dh-hero-title">RackSlicer Design Hub</h1>
            <p class="dh-hero-desc">
              Discover, benchmark, fork, and publish production-grade enterprise infrastructure blueprints.
              Every architecture is AI-validated for high availability, power redundancy, and cabling integrity.
            </p>
          </div>
          <div class="dh-hero-actions">
            <button class="dh-btn-publish" id="dh-header-publish-btn">
              <span>🚀 Publish to Design Hub</span>
            </button>
          </div>
        </header>

        <!-- KPI Metrics Banner -->
        <div class="dh-kpi-bar">
          <div class="dh-kpi-card">
            <div class="dh-kpi-icon">🏛️</div>
            <div>
              <div class="dh-kpi-value">${allDesigns.length} Architectures</div>
              <div class="dh-kpi-label">Published Community Blueprints</div>
            </div>
          </div>

          <div class="dh-kpi-card">
            <div class="dh-kpi-icon">🤖</div>
            <div>
              <div class="dh-kpi-value">${avgScore}/100 AI Score</div>
              <div class="dh-kpi-label">Average Architecture Quality</div>
            </div>
          </div>

          <div class="dh-kpi-card">
            <div class="dh-kpi-icon">🔀</div>
            <div>
              <div class="dh-kpi-value">${totalForks.toLocaleString()} Forks</div>
              <div class="dh-kpi-label">Remixed & Customized Globally</div>
            </div>
          </div>

          <div class="dh-kpi-card">
            <div class="dh-kpi-icon">🛡️</div>
            <div>
              <div class="dh-kpi-value">100% Validated</div>
              <div class="dh-kpi-label">Dual-Feed Power & Mesh Topology</div>
            </div>
          </div>
        </div>

        <!-- Controls: Search & Ranking Tabs -->
        <div class="dh-controls">
          <div class="dh-search-sort-row">
            <div class="dh-search-box">
              <span class="dh-search-icon">🔍</span>
              <input type="text" id="dh-search-input" value="${this.searchQuery}" placeholder="Search Ceph, Proxmox, Azure Arc, NVIDIA H100, 25GbE mesh..." />
            </div>

            <!-- Ranking Tabs -->
            <div class="dh-ranking-tabs">
              ${this.RANKING_TABS.map(
                tab => `
                <button class="dh-tab-btn ${this.currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
                  <span>${tab.icon}</span>
                  <span>${tab.label}</span>
                </button>
              `
              ).join('')}
            </div>
          </div>

          <!-- Category Chips -->
          <div class="dh-category-chips">
            ${this.CATEGORIES.map(
              cat => `
              <button class="dh-chip ${this.currentCategory === cat ? 'active' : ''}" data-category="${cat}">
                ${cat === 'all' ? 'All Architectures' : cat}
              </button>
            `
            ).join('')}
          </div>
        </div>

        <!-- Architecture Grid -->
        <main class="dh-grid-container">
          ${
            designs.length === 0
              ? `
            <div class="dh-empty-state">
              <div class="dh-empty-icon">🔎</div>
              <div class="dh-empty-title">No matching architectures found</div>
              <div>Try adjusting your search terms or selecting a different category filter.</div>
            </div>
          `
              : `
            <div class="dh-grid">
              ${designs.map(d => this.renderCard(d)).join('')}
            </div>
          `
          }
        </main>
      </div>
    `;

    this.attachDomHandlers();
  }

  private renderCard(design: PublishedArchitecture): string {
    return `
      <article class="dh-card" data-design-id="${design.id}">
        <!-- Thumbnail Wrap -->
        <div class="dh-card-thumb-wrap">
          <img src="${design.thumbnailUrl}" class="dh-card-thumb" alt="${design.title}" loading="lazy" />
          
          <div class="dh-badge-row">
            <span class="dh-classification-badge ${design.classification}">
              ${design.classification === 'private' ? '🔒' : design.classification === 'invite-only' ? '👥' : '🌐'}
              ${design.classification}
            </span>
            <span class="dh-category-badge">${design.category}</span>
          </div>

          <div class="dh-score-badge" title="RackSlicer Architecture Intelligence Score">
            <span class="dh-score-lbl">AI Score</span>
            <span class="dh-score-val">${design.rackSlicerScore.overall}</span>
          </div>
        </div>

        <!-- Card Body -->
        <div class="dh-card-body">
          <h3 class="dh-card-title" data-action="open-detail">${design.title}</h3>
          <p class="dh-card-desc">${design.description}</p>

          ${
            design.forkLineage
              ? `
            <div class="dh-lineage">
              <span>🔀</span>
              <span>Based on: <strong>${design.forkLineage.originalTitle}</strong></span>
            </div>
          `
              : ''
          }

          <div class="dh-tags-row">
            ${design.tags.slice(0, 4).map(t => `<span class="dh-tag">#${t}</span>`).join('')}
          </div>

          <!-- Author & Community Stars -->
          <div class="dh-author-row">
            <div class="dh-author-info">
              <img src="${design.author.avatar || '/assets/dashboard/card-server-rack.jpg'}" class="dh-author-avatar" alt="${design.author.name}" />
              <span class="dh-author-name">@${design.author.username}</span>
            </div>
            <div class="dh-rating-stars">
              <span>★</span>
              <span>${design.communityRating.average.toFixed(1)}</span>
              <span class="dh-rating-count">(${design.communityRating.count})</span>
            </div>
          </div>
        </div>

        <!-- Metrics Bar -->
        <div class="dh-metrics-bar">
          <span class="dh-metric-item">👁 ${design.views.toLocaleString()}</span>
          <span class="dh-metric-item">🔀 ${design.forks.toLocaleString()}</span>
          <span class="dh-metric-item">🔖 ${design.saves.toLocaleString()}</span>
          <span class="dh-metric-item">↗ ${design.shares.toLocaleString()}</span>
        </div>

        <!-- Actions -->
        <div class="dh-card-actions">
          <button class="dh-btn-action primary" data-action="open-detail">
            <span>👁 Inspect</span>
          </button>
          <button class="dh-btn-action fork" data-action="fork">
            <span>🔀 Fork</span>
          </button>
        </div>
      </article>
    `;
  }

  private attachDomHandlers(): void {
    if (!this.container) return;

    // Publish button
    const pubBtn = this.container.querySelector('#dh-header-publish-btn');
    if (pubBtn) {
      pubBtn.addEventListener('click', () => {
        publishDesignModal.open();
      });
    }

    // Search input
    const searchInput = this.container.querySelector('#dh-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value;
        this.render();
      });
    }

    // Ranking tabs
    const tabButtons = this.container.querySelectorAll('.dh-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentTab = (btn.getAttribute('data-tab') as RankingSortTab) || 'trending';
        this.render();
      });
    });

    // Category chips
    const chipButtons = this.container.querySelectorAll('.dh-chip');
    chipButtons.forEach(chip => {
      chip.addEventListener('click', () => {
        this.currentCategory = (chip.getAttribute('data-category') as any) || 'all';
        this.render();
      });
    });

    // Card Actions
    const cards = this.container.querySelectorAll('.dh-card');
    cards.forEach(card => {
      const designId = card.getAttribute('data-design-id');
      if (!designId) return;

      const openElements = card.querySelectorAll('[data-action="open-detail"]');
      openElements.forEach(el => {
        el.addEventListener('click', () => {
          designDetailModal.open(designId);
        });
      });

      const forkBtn = card.querySelector('[data-action="fork"]');
      if (forkBtn) {
        forkBtn.addEventListener('click', e => {
          e.stopPropagation();
          try {
            const forked = designHubStore.forkDesign(designId);
            EventBus.emit('notification:show' as any, {
              type: 'success',
              title: 'Design Forked!',
              message: `Created editable copy in workspace: "${forked.name}"`,
            });
            EventBus.emit('project:load' as any, forked);
          } catch (err: any) {
            alert(`Could not fork design: ${err.message}`);
          }
        });
      }
    });
  }

  private setupListeners(): void {
    EventBus.on('design:published' as any, () => {
      this.render();
    });
    EventBus.on('design:updated' as any, () => {
      this.render();
    });
  }
}

export const designHubView = new DesignHubView();
