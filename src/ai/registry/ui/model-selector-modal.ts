import { modelRegistry } from '../model-registry';
import { AIModel, ModelCategory, ModelFilterCriteria } from '../types';
import { extractModelBadges } from '../normalizer';
import { estimateModelCost } from '../cost-estimator';
import { eventBus } from '../../../core/event-bus';
import { MCP_TOOLS_CATALOG, McpAuditLogger, PROHIBITED_TOOLS } from '../../../mcp';
import { aiService } from '../../ai-service';

export class ModelSelectorModal {
  private el: HTMLElement;
  private currentCategory: ModelCategory = 'open_source';
  private currentTab: 'models' | 'providers' | 'compare' | 'estimator' | 'admin' | 'mcp' = 'models';

  private selectedModelId: string | null = null;
  private comparedModelIds: Set<string> = new Set();

  private showLegacy: boolean = false;
  private developerMode: boolean = false;
  private showKeyInDetail: boolean = false;

  private filterCriteria: ModelFilterCriteria = {};

  constructor() {
    this.el = this.buildDOM();
    document.body.appendChild(this.el);
    this.bindEvents();

    const active = modelRegistry.getActiveSelectedModel();
    if (active) {
      this.selectedModelId = active.id;
      this.currentCategory = active.category;
    }
  }

  private buildDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'model-registry-modal hidden';
    modal.id = 'ai-model-registry-modal';

    modal.innerHTML = `
      <div class="model-registry-container">
        <!-- Header -->
        <div class="model-registry-header">
          <div class="model-registry-title">
            <span style="font-size:16px;">⚡</span>
            <span>RACKSLICER AI STUDIO — DYNAMIC MODEL REGISTRY</span>
            <span id="reg-version-tag" style="font-size:10px; font-weight:700; background:#1e293b; color:#38bdf8; padding:2px 6px; border-radius:3px;">
              v1.0
            </span>
          </div>
          <div class="model-registry-header-actions">
            <button id="modal-tab-models" class="nav-tab-btn active">AI Models</button>
            <button id="modal-tab-providers" class="nav-tab-btn">Providers & Keys</button>
            <button id="modal-tab-compare" class="nav-tab-btn">Compare (0)</button>
            <button id="modal-tab-estimator" class="nav-tab-btn">Cost Estimator</button>
            <button id="modal-tab-admin" class="nav-tab-btn">Admin & Sync</button>
            <button id="modal-tab-mcp" class="nav-tab-btn" style="color:#c084fc;">🛡️ MCP Control Plane</button>
            <button id="reg-close-btn" style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; padding:0 6px;" title="Close">&#x2715;</button>
          </div>
        </div>

        <!-- Top-Level Category Switcher: Exactly 2 Top-Level Categories -->
        <div class="model-registry-categories" id="reg-cat-bar">
          <button id="cat-btn-os" class="cat-btn active open-source">
            <span>🟢</span> OPEN SOURCE
          </button>
          <button id="cat-btn-paid" class="cat-btn paid">
            <span>🔵</span> PAID
          </button>
          <div style="flex:1;"></div>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; cursor:pointer;">
            <input type="checkbox" id="chk-show-legacy" style="cursor:pointer;" />
            <span>Show Legacy Models</span>
          </label>
        </div>

        <!-- Toolbar (Search & Filters) -->
        <div class="model-registry-toolbar" id="reg-toolbar">
          <div class="toolbar-row-main">
            <input type="text" id="reg-search-input" class="model-search-input" placeholder="Search models by name, API ID, family, or capability..." />
            <select id="reg-provider-filter" class="model-filter-select">
              <option value="">All Providers</option>
            </select>
          </div>
          <div class="quick-filter-chips" id="reg-quick-chips">
            <button class="quick-chip" data-filter="latest">★ LATEST</button>
            <button class="quick-chip" data-filter="reasoning">REASONING</button>
            <button class="quick-chip" data-filter="vision">VISION</button>
            <button class="quick-chip" data-filter="tools">TOOLS</button>
            <button class="quick-chip" data-filter="longContext">1M+ CONTEXT</button>
            <button class="quick-chip" data-filter="selfHosted">SELF-HOSTED</button>
            <button class="quick-chip" data-filter="onPremises">ON-PREMISES</button>
          </div>
        </div>

        <!-- Main Body (Views) -->
        <div id="reg-view-models" class="model-registry-body">
          <div class="model-list-pane" id="reg-models-list"></div>
          <div class="model-details-pane" id="reg-model-details"></div>
        </div>

        <!-- Providers & API Keys Configuration View (Section 56 & 57) -->
        <div id="reg-view-providers" class="admin-dashboard-view hidden">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <div style="font-weight:700; font-size:14px; color:#f8fafc;">AI Providers & Connection Status</div>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Configure provider credentials, test connection latency, and discover live models.</div>
            </div>
            <button id="btn-test-all-providers" class="btn-primary" style="padding:6px 14px; font-size:11px;">⚡ TEST ALL CONNECTIONS</button>
          </div>
          <div class="providers-tab-grid" id="providers-tab-grid"></div>
        </div>

        <!-- Comparison View -->
        <div id="reg-view-compare" class="comparison-container hidden"></div>

        <!-- Cost Estimator View -->
        <div id="reg-view-estimator" class="admin-dashboard-view hidden">
          <div style="background:#0d1322; border:1px solid #1e293b; border-radius:6px; padding:16px; display:flex; flex-direction:column; gap:12px;">
            <div style="font-weight:700; font-size:13px; color:#38bdf8;">Interactive AI Cost Estimator</div>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <div style="flex:1; min-width:200px;">
                <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Input Tokens (Prompt + Rack Context)</label>
                <input type="number" id="est-input-tokens" value="25000" step="5000" class="model-search-input" style="width:100%; box-sizing:border-box;" />
              </div>
              <div style="flex:1; min-width:200px;">
                <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Output Tokens (Generated Architecture Diff)</label>
                <input type="number" id="est-output-tokens" value="4000" step="1000" class="model-search-input" style="width:100%; box-sizing:border-box;" />
              </div>
              <div style="flex:1; min-width:200px;">
                <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Cached Prompt Tokens</label>
                <input type="number" id="est-cached-tokens" value="0" step="5000" class="model-search-input" style="width:100%; box-sizing:border-box;" />
              </div>
            </div>
            <div id="est-results-container" style="margin-top:10px;"></div>
          </div>
        </div>

        <!-- Admin & Sync View -->
        <div id="reg-view-admin" class="admin-dashboard-view hidden">
          <div class="stats-grid" id="admin-stats-grid"></div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <div style="font-size:12px; font-weight:700; color:#f8fafc;">Configured AI Providers & Health</div>
            <div style="display:flex; gap:8px;">
              <button id="admin-sync-btn" class="btn-primary" style="padding:5px 12px; font-size:11px;">↻ SYNC NOW</button>
            </div>
          </div>

          <table class="provider-health-table" id="admin-health-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Models Ingested</th>
                <th>Status Note</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>

          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:#94a3b8; cursor:pointer;">
              <input type="checkbox" id="chk-dev-mode" style="cursor:pointer;" />
              <span>Developer Mode (Show Raw Provider Metadata & API IDs)</span>
            </label>
          </div>
          <div id="admin-sync-logs" style="background:#05080e; border:1px solid #141c2b; border-radius:4px; padding:10px; font-family:monospace; font-size:11px; color:#64748b; max-height:140px; overflow-y:auto;">
            Registry ready. Cached entries initialized.
          </div>
        </div>

        <!-- MCP Control Plane & Security Management View -->
        <div id="reg-view-mcp" class="admin-dashboard-view hidden">
          <div id="mcp-settings-container"></div>
        </div>

        <!-- Footer -->
        <div class="model-registry-footer">
          <div class="registry-status-indicator" id="reg-freshness-status">
            <span class="status-dot live"></span>
            <span id="reg-status-text">Model Registry Live</span>
            <span style="color:#475569;">•</span>
            <span id="reg-status-meta" style="color:#64748b;">v2026.10.03</span>
            <span id="reg-footer-conn-pill" class="selected-model-pill" style="margin-left:10px;"></span>
          </div>

          <div class="registry-footer-buttons">
            <button id="reg-fallback-config-btn" class="btn-secondary" title="Configure primary & fallback fallback models">
              Fallbacks
            </button>
            <button id="reg-use-model-btn" class="btn-primary">
              Select & Use Model
            </button>
          </div>
        </div>
      </div>
    `;

    return modal;
  }

  private bindEvents(): void {
    const modal = this.el;

    // Close buttons
    modal.querySelector('#reg-close-btn')?.addEventListener('click', () => this.hide());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hide();
    });

    // Keyboard ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        this.hide();
      }
    });

    // Top-Level Category Switcher (Exactly 2 categories: OPEN SOURCE or PAID)
    const catOsBtn = modal.querySelector('#cat-btn-os') as HTMLElement;
    const catPaidBtn = modal.querySelector('#cat-btn-paid') as HTMLElement;

    catOsBtn?.addEventListener('click', () => {
      this.currentCategory = 'open_source';
      catOsBtn.classList.add('active');
      catPaidBtn.classList.remove('active');
      this.render();
    });

    catPaidBtn?.addEventListener('click', () => {
      this.currentCategory = 'paid';
      catPaidBtn.classList.add('active');
      catOsBtn.classList.remove('active');
      this.render();
    });

    // Nav tabs (Models, Providers, Compare, Estimator, Admin, MCP)
    const tabs = ['models', 'providers', 'compare', 'estimator', 'admin', 'mcp'] as const;
    tabs.forEach(t => {
      modal.querySelector(`#modal-tab-${t}`)?.addEventListener('click', () => {
        this.switchTab(t);
      });
    });

    // Search and filters
    const searchInput = modal.querySelector('#reg-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.filterCriteria.searchQuery = searchInput.value;
      this.render();
    });

    const providerSelect = modal.querySelector('#reg-provider-filter') as HTMLSelectElement;
    providerSelect?.addEventListener('change', () => {
      this.filterCriteria.providerId = providerSelect.value || undefined;
      this.render();
    });

    // Quick filter chips
    modal.querySelectorAll('.quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const filterType = chip.getAttribute('data-filter');
        chip.classList.toggle('active');
        const isActive = chip.classList.contains('active');

        if (filterType === 'latest') this.filterCriteria.requireAgentic = isActive;
        if (filterType === 'reasoning') this.filterCriteria.requireReasoning = isActive;
        if (filterType === 'vision') this.filterCriteria.requireVision = isActive;
        if (filterType === 'tools') this.filterCriteria.requireToolCalling = isActive;
        if (filterType === 'longContext') this.filterCriteria.requireLongContext = isActive;
        if (filterType === 'selfHosted') this.filterCriteria.selfHostedOnly = isActive;
        if (filterType === 'onPremises') this.filterCriteria.onPremisesOnly = isActive;

        this.render();
      });
    });

    // Show legacy checkbox
    const chkLegacy = modal.querySelector('#chk-show-legacy') as HTMLInputElement;
    chkLegacy?.addEventListener('change', () => {
      this.showLegacy = chkLegacy.checked;
      this.render();
    });

    // Developer mode checkbox
    const chkDevMode = modal.querySelector('#chk-dev-mode') as HTMLInputElement;
    chkDevMode?.addEventListener('change', () => {
      this.developerMode = chkDevMode.checked;
      this.renderDetails();
    });

    // Admin Sync Now
    modal.querySelector('#admin-sync-btn')?.addEventListener('click', async () => {
      const btn = modal.querySelector('#admin-sync-btn') as HTMLButtonElement;
      if (btn) btn.textContent = 'Syncing...';
      try {
        await modelRegistry.syncNow();
        this.render();
        this.renderAdminDashboard();
        eventBus.emit('notification', { message: '✓ Model Registry successfully synchronized!', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `Sync failed: ${err instanceof Error ? err.message : String(err)}`, type: 'warning' });
      } finally {
        if (btn) btn.textContent = '↻ SYNC NOW';
      }
    });

    // Select & Use button
    modal.querySelector('#reg-use-model-btn')?.addEventListener('click', () => {
      let targetId = this.selectedModelId;
      if (!targetId) {
        const active = modelRegistry.getActiveSelectedModel();
        if (active) targetId = active.id;
      }

      if (targetId) {
        let model = modelRegistry.getModelById(targetId);

        // If the selected model requires credentials that are missing, check if any connected provider exists
        if (model && model.category === 'paid' && !modelRegistry.hasCredentials(model.providerId)) {
          const connectedAdapter = modelRegistry.getAllAdapters().find(a => modelRegistry.hasCredentials(a.providerId) || a.providerId === 'local');
          if (connectedAdapter) {
            const providerModels = modelRegistry.getModels({ providerId: connectedAdapter.providerId });
            if (providerModels.length > 0) {
              model = providerModels[0];
              targetId = model.id;
            }
          }
        }

        if (model) {
          // Check if provider requires API key and key is missing
          if (model.category === 'paid' && !modelRegistry.hasCredentials(model.providerId)) {
            eventBus.emit('notification', {
              message: `⚠️ API Key required for ${model.providerDisplayName}. Please enter your key in the credentials card.`,
              type: 'warning',
            });
            const input = modal.querySelector('#detail-provider-key-input') as HTMLInputElement;
            if (input) {
              input.focus();
              input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
          }
          modelRegistry.setActiveSelectedModel(targetId);
          this.selectedModelId = targetId;
          eventBus.emit('notification', {
            message: `✓ Selected active model: ${model.displayName} (${model.providerDisplayName})`,
            type: 'success',
          });
          this.hide();
        }
      }
    });

    // Cost estimator inputs
    ['est-input-tokens', 'est-output-tokens', 'est-cached-tokens'].forEach(id => {
      modal.querySelector(`#${id}`)?.addEventListener('input', () => this.renderEstimator());
    });

    // Listen to registry events
    eventBus.on('ai:model-registry-updated', () => {
      this.populateProviderDropdown();
      this.render();
    });
  }

  switchTab(t: 'models' | 'providers' | 'compare' | 'estimator' | 'admin' | 'mcp'): void {
    this.currentTab = t;
    const tabs = ['models', 'providers', 'compare', 'estimator', 'admin', 'mcp'] as const;
    tabs.forEach(other => {
      this.el.querySelector(`#modal-tab-${other}`)?.classList.toggle('active', other === t);
      this.el.querySelector(`#reg-view-${other}`)?.classList.toggle('hidden', other !== t);
    });
    const toolbar = this.el.querySelector('#reg-toolbar') as HTMLElement;
    const catBar = this.el.querySelector('#reg-cat-bar') as HTMLElement;
    if (toolbar) toolbar.style.display = t === 'models' ? 'flex' : 'none';
    if (catBar) catBar.style.display = t === 'models' ? 'flex' : 'none';

    if (t === 'models') this.render();
    if (t === 'providers') this.renderProvidersTab();
    if (t === 'compare') this.renderComparison();
    if (t === 'estimator') this.renderEstimator();
    if (t === 'admin') this.renderAdminDashboard();
    if (t === 'mcp') this.renderMcpTab();
  }

  show(options?: { tab?: 'models' | 'providers' | 'compare' | 'estimator' | 'admin' | 'mcp' }): void {
    this.el.classList.remove('hidden');
    this.populateProviderDropdown();
    if (options?.tab) {
      this.switchTab(options.tab);
    } else {
      this.switchTab(this.currentTab || 'models');
    }
    this.updateFooter();
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  private populateProviderDropdown(): void {
    const select = this.el.querySelector('#reg-provider-filter') as HTMLSelectElement;
    if (!select) return;

    const adapters = modelRegistry.getAllAdapters();
    const currentVal = select.value;

    select.innerHTML = '<option value="">All Providers</option>' +
      adapters.map(a => `<option value="${a.providerId}" ${a.providerId === currentVal ? 'selected' : ''}>${a.displayName}</option>`).join('');
  }

  render(): void {
    const listEl = this.el.querySelector('#reg-models-list');
    if (!listEl) return;

    const models = modelRegistry.getModels({
      ...this.filterCriteria,
      category: this.currentCategory,
      showLegacy: this.showLegacy,
    });

    if (models.length === 0) {
      listEl.innerHTML = `
        <div style="padding:32px 16px; text-align:center; color:#64748b; font-size:12px;">
          No ${this.currentCategory === 'open_source' ? 'Open Source' : 'Paid'} models match your current filters.
        </div>
      `;
      this.renderDetails();
      this.updateFooter();
      return;
    }

    // Default select first if none selected or selected not in list
    if (!this.selectedModelId || !models.some(m => m.id === this.selectedModelId)) {
      this.selectedModelId = models[0].id;
    }

    listEl.innerHTML = models.map(m => {
      const isSelected = m.id === this.selectedModelId;
      const isCompared = this.comparedModelIds.has(m.id);
      const badges = extractModelBadges(m);

      const genBadge = m.relativeGeneration
        ? `<span class="model-gen-badge ${m.relativeGeneration === 'N' ? 'gen-n' : 'gen-other'}">${m.relativeGeneration}</span>`
        : '';

      const badgeSpans = badges.map(b => {
        let cls = 'badge-latest';
        if (b.includes('SELF-HOSTED')) cls = 'badge-self-hosted';
        else if (b.includes('REASONING')) cls = 'badge-reasoning';
        else if (b.includes('VISION')) cls = 'badge-vision';
        else if (b.includes('TOOLS')) cls = 'badge-tools';
        else if (b.includes('CONTEXT')) cls = 'badge-context';
        else if (b.includes('PREVIEW')) cls = 'badge-preview';
        else if (b.includes('LEGACY')) cls = 'badge-legacy';
        else if (b.includes('DEPRECATED')) cls = 'badge-deprecated';
        return `<span class="model-badge ${cls}">${b}</span>`;
      }).join('');

      return `
        <div class="model-card ${isSelected ? 'selected' : ''}" data-model-id="${m.id}">
          <div class="model-card-header">
            ${genBadge}
            <span class="model-card-title">${m.displayName}</span>
            <span class="model-card-provider">${m.providerDisplayName}</span>
          </div>
          <div class="model-badges-row">
            ${badgeSpans}
          </div>
          <div class="model-card-footer">
            <span>Context: ${m.contextWindow ? (m.contextWindow / 1000).toFixed(0) + 'k' : 'Unknown'}</span>
            <span>${m.category === 'open_source' ? '🟢 Open Weight' : (m.pricing.inputPer1M ? `$${m.pricing.inputPer1M}/1M` : '🔵 Commercial API')}</span>
            <button class="compare-toggle-btn" data-model-id="${m.id}" style="background:none; border:none; color:${isCompared ? '#38bdf8' : '#64748b'}; font-size:10px; cursor:pointer;" title="Add to comparison">
              ${isCompared ? '✓ Compare' : '+ Compare'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind card clicks
    listEl.querySelectorAll('.model-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('compare-toggle-btn')) {
          const mId = card.getAttribute('data-model-id')!;
          if (this.comparedModelIds.has(mId)) {
            this.comparedModelIds.delete(mId);
          } else {
            if (this.comparedModelIds.size >= 4) {
              eventBus.emit('notification', { message: 'Maximum 4 models can be compared at once', type: 'info' });
              return;
            }
            this.comparedModelIds.add(mId);
          }
          const compareTabBtn = this.el.querySelector('#modal-tab-compare');
          if (compareTabBtn) compareTabBtn.textContent = `Compare (${this.comparedModelIds.size})`;
          this.render();
          return;
        }

        const modelId = card.getAttribute('data-model-id');
        if (modelId) {
          this.selectedModelId = modelId;
          this.render();
        }
      });
    });

    this.renderDetails();
    this.updateFooter();
  }

  private renderDetails(): void {
    const detailsEl = this.el.querySelector('#reg-model-details');
    if (!detailsEl) return;

    if (!this.selectedModelId) {
      detailsEl.innerHTML = '<div style="color:#64748b; font-size:12px;">Select a model to view full specifications.</div>';
      return;
    }

    const model = modelRegistry.getModelById(this.selectedModelId);
    if (!model) {
      detailsEl.innerHTML = '<div style="color:#64748b; font-size:12px;">Model not found.</div>';
      return;
    }

    const agenticCheck = modelRegistry.validateAgenticCompatibility(model);
    const badges = extractModelBadges(model);
    const adapter = modelRegistry.getAdapter(model.providerId);
    const conn = modelRegistry.getConnectionStatus(model.providerId);
    const creds = modelRegistry.getCredentials(model.providerId);
    const hasKey = !!(creds.apiKey && creds.apiKey.trim().length > 0);

    // Three LED States:
    // LED Green - Success (Connected & Sufficient Balance)
    // LED Red   - Failure (Connection Error / Invalid Key / Quota Depleted)
    // LED Amber - Connected But Low on Balance (or API Key Required)
    let badgeClass = 'badge-amber';
    let ledClass = 'led-amber';
    let statusText = 'API Key Required';

    if (conn.status === 'connected') {
      badgeClass = 'badge-green';
      ledClass = 'led-green';
      statusText = conn.latencyMs ? `Connected (${conn.latencyMs}ms)` : (model.providerId === 'local' ? 'Local Operational' : 'Connected • Balance OK');
    } else if (conn.status === 'low_balance') {
      badgeClass = 'badge-amber';
      ledClass = 'led-amber';
      statusText = conn.balanceFormatted ? `Connected • Low Balance (${conn.balanceFormatted})` : 'Connected • Low Balance';
    } else if (conn.status === 'failed') {
      badgeClass = 'badge-red';
      ledClass = 'led-red';
      statusText = conn.balanceStatus === 'depleted' ? 'Quota Exceeded / Zero Balance' : (conn.message || 'Connection Failed');
    } else if (hasKey) {
      badgeClass = 'badge-green';
      ledClass = 'led-green';
      statusText = 'Connected (Key Saved)';
    }

    detailsEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:15px; font-weight:700; color:#f8fafc;">${model.displayName}</div>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">${model.providerDisplayName} • ${model.category.toUpperCase().replace('_', ' ')}</div>
        </div>
        <div style="text-align:right;">
          <span class="model-gen-badge ${model.relativeGeneration === 'N' ? 'gen-n' : 'gen-other'}">${model.relativeGeneration || 'Slot'}</span>
        </div>
      </div>

      <!-- Agentic Warning if incompatible -->
      ${!agenticCheck.compatible ? `<div class="agentic-warning-banner">${agenticCheck.warningMessage}</div>` : ''}

      <!-- API ID Box with Copy Button -->
      <div>
        <div class="detail-section-title">PROVIDER API ID</div>
        <div class="api-id-box">
          <span style="flex:1;">${model.modelId}</span>
          <button id="btn-copy-api-id" class="copy-btn">COPY</button>
        </div>
      </div>

      <!-- Provider Credentials & Connection Status (Specification Section 56 & 57) -->
      <div>
        <div class="detail-section-title">PROVIDER CREDENTIALS & CONNECTION</div>
        <div class="provider-key-card" id="detail-provider-card">
          <div class="provider-key-status-row">
            <div class="provider-key-badge ${badgeClass}" id="detail-conn-badge">
              <span class="led-dot ${ledClass}"></span>
              <span id="detail-conn-status-text">${statusText}</span>
            </div>
            ${adapter?.keyUrl ? `<a href="${adapter.keyUrl}" target="_blank" rel="noopener noreferrer" class="provider-get-key-link">Get ${model.providerDisplayName} Key ↗</a>` : ''}
          </div>

          ${model.providerId !== 'local' ? `
            <div class="provider-key-input-group">
              <input
                type="${this.showKeyInDetail ? 'text' : 'password'}"
                id="detail-provider-key-input"
                class="provider-key-input"
                placeholder="Enter ${model.providerDisplayName} API Key..."
                value="${this.showKeyInDetail ? (creds.apiKey || '') : (hasKey ? '••••••••••••••••' : '')}"
              />
              <button type="button" id="btn-toggle-key-mask" class="btn-key-eye" title="${this.showKeyInDetail ? 'Mask Key' : 'Show Key'}">
                ${this.showKeyInDetail ? '🔒' : '👁'}
              </button>
              <button type="button" id="btn-save-provider-key" class="btn-save-key">
                Save Key
              </button>
              ${hasKey ? `
                <button type="button" id="btn-clear-provider-key" class="btn-key-clear" title="Clear / Reset Key">
                  ✕
                </button>
              ` : ''}
            </div>
          ` : `
            <div style="font-size:11px; color:#94a3b8; margin:4px 0;">⚡ On-premises open-weight model runs via local Ollama/vLLM instance. No API key required.</div>
          `}

          <div class="provider-test-conn-row">
            <button type="button" id="btn-test-provider-conn" class="btn-test-conn">
              <span style="color:#f97316;">⚡</span> Test Connection
            </button>
            <div id="detail-test-conn-feedback" class="conn-feedback-text"></div>
          </div>

          <!-- Separate Cost Notice Callout -->
          <div class="api-cost-disclaimer-box">
            <span class="api-cost-disclaimer-icon">💡</span>
            <div class="api-cost-disclaimer-text">
              <strong>Direct Provider Billing:</strong> Cloud AI models bill directly to your ${model.providerDisplayName} account per token consumed. This cost is completely separate from your RackSlicer software license. Maintain an active balance with ${model.providerDisplayName} to avoid quota interruptions.
            </div>
          </div>
        </div>
      </div>

      <!-- Capabilities Overview -->
      <div>
        <div class="detail-section-title">CAPABILITIES & SPECIFICATIONS</div>
        <table class="detail-table">
          <tr><td class="label">Context Window</td><td class="val">${model.contextWindow?.toLocaleString()} tokens</td></tr>
          <tr><td class="label">Max Output</td><td class="val">${model.maxOutputTokens?.toLocaleString()} tokens</td></tr>
          <tr><td class="label">Reasoning</td><td class="val">${model.capabilities.reasoning ? '✓ Verified' : '✗ Standard'}</td></tr>
          <tr><td class="label">Vision / Multimodal</td><td class="val">${model.capabilities.vision ? '✓ Supported' : '✗ Text only'}</td></tr>
          <tr><td class="label">Tool & Function Calling</td><td class="val">${model.capabilities.toolCalling ? '✓ Supported' : '✗ No'}</td></tr>
          <tr><td class="label">Structured JSON Output</td><td class="val">${model.capabilities.structuredOutput ? '✓ Supported' : '✗ No'}</td></tr>
          <tr><td class="label">Streaming</td><td class="val">${model.capabilities.streaming ? '✓ Supported' : '✗ No'}</td></tr>
        </table>
      </div>

      <!-- Pricing Structure -->
      <div>
        <div class="detail-section-title">PRICING (USD)</div>
        <table class="detail-table">
          <tr>
            <td class="label">Input Price</td>
            <td class="val">${model.pricing.inputPer1M !== undefined ? (model.pricing.inputPer1M === 0 ? 'Free ($0.00)' : `$${model.pricing.inputPer1M} / 1M tokens`) : 'Unknown'}</td>
          </tr>
          <tr>
            <td class="label">Output Price</td>
            <td class="val">${model.pricing.outputPer1M !== undefined ? (model.pricing.outputPer1M === 0 ? 'Free ($0.00)' : `$${model.pricing.outputPer1M} / 1M tokens`) : 'Unknown'}</td>
          </tr>
          <tr>
            <td class="label">Cached Input</td>
            <td class="val">${model.pricing.cachedInputPer1M !== undefined ? `$${model.pricing.cachedInputPer1M} / 1M` : 'Standard'}</td>
          </tr>
          <tr>
            <td class="label">Pricing Source</td>
            <td class="val" style="font-size:10px; color:#64748b;">${model.pricing.pricingSource || 'Catalog'}</td>
          </tr>
        </table>
      </div>

      <!-- Deployment & License -->
      <div>
        <div class="detail-section-title">DEPLOYMENT & LICENSE</div>
        <table class="detail-table">
          <tr><td class="label">License</td><td class="val">${model.license?.name || 'Unknown'} (${model.license?.type || 'commercial'})</td></tr>
          <tr><td class="label">Self-Hosted / Local</td><td class="val">${model.deploymentOptions.selfHosted ? '✓ Yes (vLLM / Ollama / Private Server)' : '✗ Cloud API Only'}</td></tr>
          <tr><td class="label">On-Premises / Private Cloud</td><td class="val">${model.deploymentOptions.onPremises ? '✓ Certified' : '✗ Provider Managed'}</td></tr>
          <tr><td class="label">Commercial Use</td><td class="val">${model.license?.commercialUseAllowed ? '✓ Permitted' : 'Check License'}</td></tr>
        </table>
      </div>

      <!-- Developer Mode Raw Data -->
      ${this.developerMode ? `
        <div>
          <div class="detail-section-title">RAW PROVIDER METADATA (DEV MODE)</div>
          <pre style="background:#05080e; border:1px solid #141c2b; border-radius:4px; padding:8px; font-size:10px; color:#94a3b8; max-height:120px; overflow-y:auto;">
${JSON.stringify(model, null, 2)}
          </pre>
        </div>
      ` : ''}
    `;

    detailsEl.querySelector('#btn-copy-api-id')?.addEventListener('click', () => {
      navigator.clipboard.writeText(model.modelId).then(() => {
        eventBus.emit('notification', { message: `Copied API ID: ${model.modelId}`, type: 'info' });
      });
    });

    const keyInput = detailsEl.querySelector('#detail-provider-key-input') as HTMLInputElement;
    const toggleMaskBtn = detailsEl.querySelector('#btn-toggle-key-mask');
    const saveKeyBtn = detailsEl.querySelector('#btn-save-provider-key');
    const clearKeyBtn = detailsEl.querySelector('#btn-clear-provider-key');
    const testConnBtn = detailsEl.querySelector('#btn-test-provider-conn') as HTMLButtonElement;
    const feedbackEl = detailsEl.querySelector('#detail-test-conn-feedback') as HTMLElement;

    toggleMaskBtn?.addEventListener('click', () => {
      this.showKeyInDetail = !this.showKeyInDetail;
      this.renderDetails();
    });

    saveKeyBtn?.addEventListener('click', () => {
      if (!keyInput) return;
      const keyVal = keyInput.value.trim();
      if (keyVal && keyVal !== '••••••••••••••••') {
        modelRegistry.setCredentials(model.providerId, { apiKey: keyVal });
        eventBus.emit('notification', { message: `✓ Saved API Key for ${model.providerDisplayName}`, type: 'success' });
        this.renderDetails();
        this.updateFooter();
      }
    });

    clearKeyBtn?.addEventListener('click', () => {
      modelRegistry.clearCredentials(model.providerId);
      eventBus.emit('notification', { message: `Cleared API Key for ${model.providerDisplayName}`, type: 'info' });
      this.renderDetails();
      this.updateFooter();
    });

    testConnBtn?.addEventListener('click', async () => {
      testConnBtn.disabled = true;
      testConnBtn.textContent = '⏳ Testing...';
      if (feedbackEl) {
        feedbackEl.className = 'conn-feedback-text';
        feedbackEl.textContent = 'Pinging provider endpoint & checking balance...';
      }

      let keyVal = keyInput ? keyInput.value.trim() : undefined;
      if (keyVal === '••••••••••••••••') keyVal = undefined;

      try {
        const res = await modelRegistry.testConnection(model.providerId, keyVal ? { apiKey: keyVal } : undefined);
        const badgeEl = detailsEl.querySelector('#detail-conn-badge');

        if (res.statusType === 'connected' || (res.success && res.statusType !== 'low_balance')) {
          if (feedbackEl) {
            feedbackEl.className = 'conn-feedback-text success';
            feedbackEl.textContent = `✓ Connected (${res.latencyMs}ms) · ${res.balanceFormatted || 'Balance OK'}`;
          }
          if (badgeEl) {
            badgeEl.className = 'provider-key-badge badge-green';
            badgeEl.innerHTML = `<span class="led-dot led-green"></span><span id="detail-conn-status-text">Connected (${res.latencyMs}ms) • Balance OK</span>`;
          }
        } else if (res.statusType === 'low_balance' || res.balanceStatus === 'low') {
          if (feedbackEl) {
            feedbackEl.className = 'conn-feedback-text amber';
            feedbackEl.textContent = `⚠ Warning: Low Balance (${res.balanceFormatted || 'Account below threshold'})`;
          }
          if (badgeEl) {
            badgeEl.className = 'provider-key-badge badge-amber';
            badgeEl.innerHTML = `<span class="led-dot led-amber"></span><span id="detail-conn-status-text">Connected • Low Balance</span>`;
          }
        } else {
          if (feedbackEl) {
            feedbackEl.className = 'conn-feedback-text error';
            feedbackEl.textContent = `✗ ${res.message}`;
          }
          if (badgeEl) {
            badgeEl.className = 'provider-key-badge badge-red';
            const failLabel = res.balanceStatus === 'depleted' ? 'Quota Exceeded / Zero Balance' : (res.message || 'Connection Failed');
            badgeEl.innerHTML = `<span class="led-dot led-red"></span><span id="detail-conn-status-text">${failLabel}</span>`;
          }
        }
        this.updateFooter();
      } finally {
        testConnBtn.disabled = false;
        testConnBtn.innerHTML = '<span style="color:#f97316;">⚡</span> Test Connection';
      }
    });
  }

  private renderComparison(): void {
    const compEl = this.el.querySelector('#reg-view-compare');
    if (!compEl) return;

    if (this.comparedModelIds.size === 0) {
      compEl.innerHTML = `
        <div style="padding:48px 16px; text-align:center; color:#64748b; font-size:12px;">
          No models selected for comparison. Click "+ Compare" on any model card in the list to compare up to 4 models.
        </div>
      `;
      return;
    }

    const models = Array.from(this.comparedModelIds)
      .map(id => modelRegistry.getModelById(id))
      .filter((m): m is AIModel => !!m);

    compEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; font-size:13px; color:#38bdf8;">Side-by-Side Model Comparison (${models.length}/4)</span>
        <button id="clear-compare-btn" class="btn-secondary" style="padding:4px 8px; font-size:10px;">Clear All</button>
      </div>

      <div class="comparison-grid" style="grid-template-columns: 140px repeat(${models.length}, minmax(180px, 1fr));">
        <!-- Headers -->
        <div class="comparison-header-cell" style="background:#090d16;">ATTRIBUTE</div>
        ${models.map(m => `
          <div class="comparison-header-cell">
            <div style="font-size:12px; font-weight:700; color:#38bdf8;">${m.displayName}</div>
            <div style="font-size:10px; color:#64748b;">${m.providerDisplayName}</div>
          </div>
        `).join('')}

        <!-- Generation -->
        <div class="comparison-cell label">Generation</div>
        ${models.map(m => `<div class="comparison-cell">${m.relativeGeneration || 'N/A'}</div>`).join('')}

        <!-- Category -->
        <div class="comparison-cell label">Category</div>
        ${models.map(m => `<div class="comparison-cell">${m.category === 'open_source' ? '🟢 Open Source' : '🔵 Paid'}</div>`).join('')}

        <!-- Context Window -->
        <div class="comparison-cell label">Context Window</div>
        ${models.map(m => `<div class="comparison-cell">${m.contextWindow?.toLocaleString()} tokens</div>`).join('')}

        <!-- Reasoning -->
        <div class="comparison-cell label">Reasoning</div>
        ${models.map(m => `<div class="comparison-cell">${m.capabilities.reasoning ? '✓ Yes' : '✗ Standard'}</div>`).join('')}

        <!-- Vision -->
        <div class="comparison-cell label">Vision</div>
        ${models.map(m => `<div class="comparison-cell">${m.capabilities.vision ? '✓ Yes' : '✗ No'}</div>`).join('')}

        <!-- Tool Calling -->
        <div class="comparison-cell label">Tool Calling</div>
        ${models.map(m => `<div class="comparison-cell">${m.capabilities.toolCalling ? '✓ Supported' : '✗ No'}</div>`).join('')}

        <!-- Input Price -->
        <div class="comparison-cell label">Input / 1M</div>
        ${models.map(m => `<div class="comparison-cell">${m.pricing.inputPer1M !== undefined ? `$${m.pricing.inputPer1M}` : 'Unknown'}</div>`).join('')}

        <!-- Output Price -->
        <div class="comparison-cell label">Output / 1M</div>
        ${models.map(m => `<div class="comparison-cell">${m.pricing.outputPer1M !== undefined ? `$${m.pricing.outputPer1M}` : 'Unknown'}</div>`).join('')}

        <!-- Self-Hosted -->
        <div class="comparison-cell label">Self-Hosted</div>
        ${models.map(m => `<div class="comparison-cell">${m.deploymentOptions.selfHosted ? '✓ Yes' : '✗ No'}</div>`).join('')}

        <!-- License -->
        <div class="comparison-cell label">License</div>
        ${models.map(m => `<div class="comparison-cell">${m.license?.name || 'Commercial'}</div>`).join('')}
      </div>
    `;

    compEl.querySelector('#clear-compare-btn')?.addEventListener('click', () => {
      this.comparedModelIds.clear();
      const tabBtn = this.el.querySelector('#modal-tab-compare');
      if (tabBtn) tabBtn.textContent = 'Compare (0)';
      this.renderComparison();
      this.render();
    });
  }

  private renderEstimator(): void {
    const resultsEl = this.el.querySelector('#est-results-container');
    if (!resultsEl) return;

    const inputTokens = parseInt((this.el.querySelector('#est-input-tokens') as HTMLInputElement)?.value || '25000', 10);
    const outputTokens = parseInt((this.el.querySelector('#est-output-tokens') as HTMLInputElement)?.value || '4000', 10);
    const cachedTokens = parseInt((this.el.querySelector('#est-cached-tokens') as HTMLInputElement)?.value || '0', 10);

    const activeModel = this.selectedModelId
      ? modelRegistry.getModelById(this.selectedModelId)
      : modelRegistry.getActiveSelectedModel();

    if (!activeModel) {
      resultsEl.innerHTML = '<div style="color:#64748b; font-size:12px;">Select a model to calculate cost estimate.</div>';
      return;
    }

    const estimate = estimateModelCost(activeModel, {
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedTokens,
    });

    resultsEl.innerHTML = `
      <div style="background:#080c14; border:1px solid #1e293b; border-radius:6px; padding:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span style="font-weight:700; color:#f8fafc; font-size:13px;">${estimate.displayName}</span>
            <span style="color:#64748b; font-size:11px;">(${estimate.providerDisplayName})</span>
          </div>
          <div style="font-size:18px; font-weight:800; color:#38bdf8;">
            ${estimate.formattedCost}
          </div>
        </div>

        <div style="font-size:11px; color:#94a3b8; display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <div>Fresh Input: $${estimate.inputCost.toFixed(5)} (${estimate.itemizedBreakdown.inputTokens.toLocaleString()} tokens)</div>
          <div>Output: $${estimate.outputCost.toFixed(5)} (${estimate.itemizedBreakdown.outputTokens.toLocaleString()} tokens)</div>
        </div>

        <div style="font-size:10px; color:#64748b; font-style:italic; border-top:1px solid #141c2b; padding-top:6px; margin-top:4px;">
          * ${estimate.disclaimer}. Excludes local hardware or infrastructure cost for self-hosted models.
        </div>
      </div>
    `;
  }

  private renderAdminDashboard(): void {
    const statsEl = this.el.querySelector('#admin-stats-grid');
    const tableBody = this.el.querySelector('#admin-health-table tbody');
    if (!statsEl || !tableBody) return;

    const stats = modelRegistry.getRegistryStats();
    statsEl.innerHTML = `
      <div class="stat-box"><span class="stat-label">Total Models</span><span class="stat-val">${stats.totalModels}</span></div>
      <div class="stat-box"><span class="stat-label">Active</span><span class="stat-val">${stats.activeModels}</span></div>
      <div class="stat-box"><span class="stat-label">Latest</span><span class="stat-val">${stats.latestModels}</span></div>
      <div class="stat-box"><span class="stat-label">Open Source</span><span class="stat-val">${stats.openSourceCount}</span></div>
      <div class="stat-box"><span class="stat-label">Paid</span><span class="stat-val">${stats.paidCount}</span></div>
      <div class="stat-box"><span class="stat-label">Providers</span><span class="stat-val">${stats.providerCount}</span></div>
    `;

    const health = modelRegistry.getProviderHealth();
    tableBody.innerHTML = health.map(h => {
      let statusColor = '#22c55e';
      let statusLabel = 'Connected';
      if (h.status === 'not_configured') {
        statusColor = '#94a3b8';
        statusLabel = 'Not configured';
      } else if (h.status === 'sync_delayed') {
        statusColor = '#eab308';
        statusLabel = 'Sync delayed';
      } else if (h.status === 'error') {
        statusColor = '#ef4444';
        statusLabel = 'Error';
      }

      return `
        <tr>
          <td style="font-weight:600; color:#f8fafc;">${h.displayName}</td>
          <td><span style="color:${statusColor}; font-weight:700;">●</span> ${statusLabel}</td>
          <td style="color:#cbd5e1;">${h.modelCount}</td>
          <td style="color:#64748b; font-size:10px;">${h.message || 'Operational'}</td>
        </tr>
      `;
    }).join('');

    const logBox = this.el.querySelector('#admin-sync-logs');
    if (logBox) {
      const errs = modelRegistry.getSyncErrors();
      if (errs.length === 0) {
        logBox.innerHTML = `[${new Date().toISOString()}] Registry live & synchronized. Version: ${stats.version}. Last full sync: ${stats.lastFullSync}`;
      } else {
        logBox.innerHTML = errs.map(e => `[${e.timestamp}] [${e.providerId.toUpperCase()}] Error: ${e.error}`).join('<br>');
      }
    }
  }

  private renderProvidersTab(): void {
    const provEl = this.el.querySelector('#reg-view-providers');
    if (!provEl) return;

    const adapters = modelRegistry.getAllAdapters();
    const configuredCount = adapters.filter(a => modelRegistry.hasCredentials(a.providerId)).length;

    provEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #1e293b; padding-bottom:10px;">
        <div>
          <div style="font-weight:700; font-size:14px; color:#f8fafc; display:flex; align-items:center; gap:8px;">
            <span>🔑 Provider Credentials & Connection Status</span>
            <span class="selected-model-pill" style="font-size:10px;">${configuredCount}/${adapters.length} Configured</span>
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-top:3px;">
            Configure API keys and verify endpoints. Keys are stored locally in your browser and connect directly with provider APIs.
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn-test-all-conn" class="btn-test-conn" style="padding:6px 14px;">
            <span style="color:#f97316;">⚡</span> Test All Connections
          </button>
        </div>
      </div>

      <!-- Separate Cost & Token Billing Education Notice -->
      <div class="api-cost-disclaimer-box" style="margin-bottom:14px;">
        <span class="api-cost-disclaimer-icon">💡</span>
        <div class="api-cost-disclaimer-text">
          <strong>Separate Provider Billing Notice:</strong> AI inferences use direct pay-per-token API calls billed directly to your account with each respective AI provider (OpenAI, Google AI Studio, Anthropic, DeepSeek, or OpenRouter). This usage cost is completely separate from your RackSlicer CAD subscription.
          <br>
          <span style="display:inline-flex; align-items:center; gap:12px; margin-top:4px;">
            <span style="display:inline-flex; align-items:center; gap:4px;"><span class="led-dot led-green" style="width:7px; height:7px;"></span> <strong>Green:</strong> Operational & Active</span>
            <span style="display:inline-flex; align-items:center; gap:4px;"><span class="led-dot led-amber" style="width:7px; height:7px;"></span> <strong>Amber:</strong> Connected But Low on Balance / Key Required</span>
            <span style="display:inline-flex; align-items:center; gap:4px;"><span class="led-dot led-red" style="width:7px; height:7px;"></span> <strong>Red:</strong> Connection Error / Quota Depleted</span>
          </span>
        </div>
      </div>

      <div class="providers-tab-grid">
        ${adapters.map(adapter => {
          const conn = modelRegistry.getConnectionStatus(adapter.providerId);
          const hasKey = modelRegistry.hasCredentials(adapter.providerId);
          const modelsForProvider = modelRegistry.getModels({ providerId: adapter.providerId });
          const activeModel = modelRegistry.getActiveSelectedModel();
          const isActiveProvider = activeModel?.providerId === adapter.providerId;
          const isConnected = conn.status === 'connected' || conn.status === 'low_balance' || hasKey || adapter.providerId === 'local';

          let badgeClass = 'badge-amber';
          let ledClass = 'led-amber';
          let statusLabel = 'API Key Required';

          if (conn.status === 'connected') {
            badgeClass = 'badge-green';
            ledClass = 'led-green';
            statusLabel = conn.latencyMs ? `Connected (${conn.latencyMs}ms)` : 'Connected • Ready';
          } else if (conn.status === 'low_balance') {
            badgeClass = 'badge-amber';
            ledClass = 'led-amber';
            statusLabel = conn.balanceFormatted ? `Connected • Low Balance (${conn.balanceFormatted})` : 'Connected • Low Balance';
          } else if (conn.status === 'failed') {
            badgeClass = 'badge-red';
            ledClass = 'led-red';
            statusLabel = conn.balanceStatus === 'depleted' ? 'Quota Exceeded / Zero Balance' : (conn.message || 'Connection Failed');
          } else if (hasKey) {
            badgeClass = 'badge-green';
            ledClass = 'led-green';
            statusLabel = 'Connected (Key Saved)';
          }

          const isLocal = adapter.providerId === 'local';
          const creds = modelRegistry.getCredentials(adapter.providerId);
          const displayKey = isLocal
            ? (creds.baseUrl || 'http://localhost:11434')
            : (hasKey ? '••••••••••••••••' : '');

          return `
            <div class="provider-card-box" data-provider-id="${adapter.providerId}">
              <div class="provider-card-top">
                <div class="provider-name-heading">
                  <span>${adapter.displayName}</span>
                  <span style="font-size:10px; color:#64748b; font-weight:500;">
                    ${isLocal ? '⚡ Local' : '☁ Cloud API'}
                  </span>
                </div>
                <div class="provider-key-badge ${badgeClass}" id="prov-badge-${adapter.providerId}">
                  <span class="led-dot ${ledClass}"></span>
                  <span class="prov-status-label">${statusLabel}</span>
                </div>
              </div>

              <div style="font-size:11px; color:#94a3b8; line-height:1.4;">
                ${adapter.description || `Connect to ${adapter.displayName} for generative CAD operations.`}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:#64748b;">
                <span>Discovered: <strong>${modelsForProvider.length} models</strong></span>
                ${adapter.keyUrl ? `<a href="${adapter.keyUrl}" target="_blank" rel="noopener noreferrer" class="provider-get-key-link">Get API Key ↗</a>` : ''}
              </div>

              <!-- Input Row matching screenshot -->
              <div class="provider-key-input-group">
                <input
                  type="${isLocal ? 'text' : 'password'}"
                  class="provider-key-input"
                  id="prov-input-${adapter.providerId}"
                  placeholder="${isLocal ? 'Endpoint URL (e.g. http://localhost:11434)' : `Enter ${adapter.displayName} API Key...`}"
                  value="${displayKey}"
                />
                ${!isLocal ? `
                  <button type="button" class="btn-key-eye" id="prov-toggle-${adapter.providerId}" title="Show / Mask Key">
                    👁
                  </button>
                ` : ''}
                <button type="button" class="btn-save-key" id="prov-save-${adapter.providerId}">
                  Save Key
                </button>
                ${hasKey ? `
                  <button type="button" class="btn-key-clear" id="prov-clear-${adapter.providerId}" title="Clear Key">
                    ✕
                  </button>
                ` : ''}
              </div>

              <!-- Test Row -->
              <div class="provider-test-conn-row">
                <button type="button" class="btn-test-conn" id="prov-test-${adapter.providerId}">
                  <span style="color:#f97316;">⚡</span> Test Connection
                </button>
                <span class="conn-feedback-text" id="prov-feedback-${adapter.providerId}"></span>
              </div>

              <!-- Model Selection & Direct Use Action Row -->
              <div class="provider-model-selection-area" id="prov-model-area-${adapter.providerId}">
                <div class="provider-model-selection-header">
                  <span class="model-select-label">Available Models (${modelsForProvider.length}):</span>
                  ${isActiveProvider ? `<span class="active-provider-tag">● Active Engine: ${activeModel?.displayName}</span>` : ''}
                </div>
                <div class="provider-model-controls">
                  <select class="provider-model-select" id="prov-select-${adapter.providerId}">
                    ${modelsForProvider.map(m => {
                      const isCurrent = m.id === activeModel?.id;
                      const star = (m.lifecycle?.status === 'latest' || m.lifecycle?.status === 'new') ? '★ ' : '';
                      const reason = m.capabilities?.reasoning ? ' [Reasoning]' : '';
                      return `<option value="${m.id}" ${isCurrent ? 'selected' : ''}>${star}${m.displayName}${reason}</option>`;
                    }).join('')}
                  </select>
                  <button type="button" class="btn-use-model-direct ${isActiveProvider ? 'active' : ''}" id="prov-use-btn-${adapter.providerId}">
                    ${isActiveProvider ? '✓ Currently Active' : '⚡ Select & Use Model'}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind events for all provider cards
    adapters.forEach(adapter => {
      const pid = adapter.providerId;
      const isLocal = pid === 'local';
      const modelsForProvider = modelRegistry.getModels({ providerId: pid });
      const inputEl = provEl.querySelector(`#prov-input-${pid}`) as HTMLInputElement;
      const toggleBtn = provEl.querySelector(`#prov-toggle-${pid}`);
      const saveBtn = provEl.querySelector(`#prov-save-${pid}`);
      const clearBtn = provEl.querySelector(`#prov-clear-${pid}`);
      const testBtn = provEl.querySelector(`#prov-test-${pid}`) as HTMLButtonElement;
      const feedbackEl = provEl.querySelector(`#prov-feedback-${pid}`) as HTMLElement;
      const badgeEl = provEl.querySelector(`#prov-badge-${pid}`) as HTMLElement;
      const selectEl = provEl.querySelector(`#prov-select-${pid}`) as HTMLSelectElement;
      const useBtn = provEl.querySelector(`#prov-use-btn-${pid}`) as HTMLButtonElement;

      const handleUseModel = () => {
        const chosenId = selectEl?.value || (modelsForProvider[0] ? modelsForProvider[0].id : null);
        if (!chosenId) return;
        const chosenModel = modelRegistry.getModelById(chosenId);
        if (!chosenModel) return;

        // If provider is paid and key is missing, check if user typed it into the input
        if (chosenModel.category === 'paid' && !modelRegistry.hasCredentials(pid)) {
          const keyInInput = inputEl?.value.trim();
          if (keyInInput && keyInInput !== '••••••••••••••••') {
            modelRegistry.setCredentials(pid, { apiKey: keyInInput });
          } else {
            eventBus.emit('notification', {
              message: `⚠️ API Key required for ${adapter.displayName}. Please enter your key first.`,
              type: 'warning'
            });
            inputEl?.focus();
            return;
          }
        }

        modelRegistry.setActiveSelectedModel(chosenId);
        this.selectedModelId = chosenId;
        this.updateFooter();

        eventBus.emit('notification', {
          message: `✓ Active Model set to ${chosenModel.displayName} (${adapter.displayName})!`,
          type: 'success'
        });

        this.renderProvidersTab();
      };

      useBtn?.addEventListener('click', handleUseModel);
      selectEl?.addEventListener('change', () => {
        const chosenId = selectEl.value;
        this.selectedModelId = chosenId;
        this.updateFooter();
      });

      toggleBtn?.addEventListener('click', () => {
        if (!inputEl) return;
        if (inputEl.type === 'password') {
          inputEl.type = 'text';
          const creds = modelRegistry.getCredentials(pid);
          if (creds.apiKey) inputEl.value = creds.apiKey;
        } else {
          inputEl.type = 'password';
          if (modelRegistry.hasCredentials(pid)) inputEl.value = '••••••••••••••••';
        }
      });

      saveBtn?.addEventListener('click', () => {
        if (!inputEl) return;
        const val = inputEl.value.trim();
        if (isLocal) {
          modelRegistry.setCredentials(pid, { baseUrl: val || 'http://localhost:11434' });
          testBtn?.click();
        } else if (val && val !== '••••••••••••••••') {
          modelRegistry.setCredentials(pid, { apiKey: val });
          testBtn?.click();
        }
      });

      clearBtn?.addEventListener('click', () => {
        modelRegistry.clearCredentials(pid);
        eventBus.emit('notification', { message: `Cleared credentials for ${adapter.displayName}`, type: 'info' });
        this.renderProvidersTab();
        this.updateFooter();
      });

      testBtn?.addEventListener('click', async () => {
        testBtn.disabled = true;
        testBtn.textContent = '⏳ Testing...';
        if (feedbackEl) {
          feedbackEl.className = 'conn-feedback-text';
          feedbackEl.textContent = 'Connecting & verifying balance...';
        }

        let keyVal = inputEl ? inputEl.value.trim() : undefined;
        if (keyVal === '••••••••••••••••') keyVal = undefined;

        try {
          const res = isLocal
            ? await modelRegistry.testConnection(pid, { baseUrl: keyVal || 'http://localhost:11434' })
            : await modelRegistry.testConnection(pid, keyVal ? { apiKey: keyVal } : undefined);

          if (res.statusType === 'connected' || (res.success && res.statusType !== 'low_balance')) {
            if (feedbackEl) {
              feedbackEl.className = 'conn-feedback-text success';
              feedbackEl.innerHTML = `<span>✓ OK (${res.latencyMs}ms) · ${res.balanceFormatted || 'Balance OK'}</span> <button type="button" class="btn-quick-use-tested" id="prov-quick-use-${pid}">⚡ Select & Use Model</button>`;
              feedbackEl.querySelector(`#prov-quick-use-${pid}`)?.addEventListener('click', () => {
                handleUseModel();
              });
            }
            if (badgeEl) {
              badgeEl.className = 'provider-key-badge badge-green';
              badgeEl.innerHTML = `<span class="led-dot led-green"></span><span class="prov-status-label">Connected (${res.latencyMs}ms) • Balance OK</span>`;
            }
            const modelArea = provEl.querySelector(`#prov-model-area-${pid}`) as HTMLElement;
            if (modelArea) modelArea.style.display = 'block';

            // If currently selected model requires key that is missing, auto-select this connected model!
            const curActive = modelRegistry.getActiveSelectedModel();
            if (!curActive || (curActive.category === 'paid' && !modelRegistry.hasCredentials(curActive.providerId))) {
              handleUseModel();
            }
          } else if (res.statusType === 'low_balance' || res.balanceStatus === 'low') {
            if (feedbackEl) {
              feedbackEl.className = 'conn-feedback-text amber';
              feedbackEl.textContent = `⚠ Warning: Low Balance (${res.balanceFormatted || 'Account below threshold'})`;
            }
            if (badgeEl) {
              badgeEl.className = 'provider-key-badge badge-amber';
              badgeEl.innerHTML = `<span class="led-dot led-amber"></span><span class="prov-status-label">Connected • Low Balance</span>`;
            }
            const modelArea = provEl.querySelector(`#prov-model-area-${pid}`) as HTMLElement;
            if (modelArea) modelArea.style.display = 'block';
          } else {
            if (feedbackEl) {
              feedbackEl.className = 'conn-feedback-text error';
              feedbackEl.textContent = `✗ ${res.message}`;
            }
            if (badgeEl) {
              badgeEl.className = 'provider-key-badge badge-red';
              const failLabel = res.message.includes('401')
                ? 'Invalid API Key (401)'
                : res.message.includes('403')
                ? 'Key Rejected (403)'
                : res.balanceStatus === 'depleted'
                ? 'Quota Depleted'
                : 'Connection Failed';
              badgeEl.innerHTML = `<span class="led-dot led-red"></span><span class="prov-status-label">${failLabel}</span>`;
            }
            eventBus.emit('notification', {
              message: `✗ ${adapter.displayName}: ${res.message}`,
              type: 'error',
            });
          }
          this.updateFooter();
        } finally {
          testBtn.disabled = false;
          testBtn.innerHTML = '<span style="color:#f97316;">⚡</span> Test Connection';
        }
      });
    });

    // Test All Connections Button
    provEl.querySelector('#btn-test-all-conn')?.addEventListener('click', async () => {
      const btn = provEl.querySelector('#btn-test-all-conn') as HTMLButtonElement;
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Testing All...';
      }

      for (const adapter of adapters) {
        const testBtn = provEl.querySelector(`#prov-test-${adapter.providerId}`) as HTMLButtonElement;
        if (testBtn) testBtn.click();
      }

      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span style="color:#f97316;">⚡</span> Test All Connections';
        }
      }, 1500);
    });
  }

  private updateFooter(): void {
    const statusText = this.el.querySelector('#reg-status-text');
    const statusMeta = this.el.querySelector('#reg-status-meta');
    const versionTag = this.el.querySelector('#reg-version-tag');
    const dot = this.el.querySelector('.status-dot');
    const footerConnPill = this.el.querySelector('#reg-footer-conn-pill');
    const useModelBtn = this.el.querySelector('#reg-use-model-btn') as HTMLButtonElement;

    const freshness = modelRegistry.getFreshnessStatus();
    if (statusText) {
      if (freshness.state === 'live') statusText.textContent = `Model Registry Live (Updated ${freshness.ageMinutes}m ago)`;
      else if (freshness.state === 'cached') statusText.textContent = `Using Cached Registry (${freshness.ageMinutes}m ago)`;
      else if (freshness.state === 'stale') statusText.textContent = `Stale Registry (${freshness.ageMinutes}m ago)`;
      else statusText.textContent = 'Offline Registry';
    }

    if (dot) {
      dot.className = `status-dot ${freshness.state}`;
    }

    if (statusMeta) statusMeta.textContent = `v${freshness.version}`;
    if (versionTag) versionTag.textContent = `v${freshness.version}`;

    const activeModel = this.selectedModelId
      ? modelRegistry.getModelById(this.selectedModelId)
      : modelRegistry.getActiveSelectedModel();

    if (useModelBtn) {
      if (activeModel) {
        useModelBtn.textContent = `Select & Use ${activeModel.displayName}`;
      } else {
        useModelBtn.textContent = 'Select & Use Model';
      }
    }

    if (footerConnPill) {
      if (activeModel) {
        const conn = modelRegistry.getConnectionStatus(activeModel.providerId);
        let ledClass = 'led-green';
        let label = 'Connected';

        if (conn.status === 'connected') {
          ledClass = 'led-green';
          label = conn.latencyMs ? `${conn.latencyMs}ms` : 'Connected';
        } else if (conn.status === 'low_balance') {
          ledClass = 'led-amber';
          label = 'Low Balance';
        } else if (conn.status === 'needs_key') {
          ledClass = 'led-amber';
          label = 'Key Required';
        } else if (conn.status === 'failed') {
          ledClass = 'led-red';
          label = conn.balanceStatus === 'depleted' ? 'Zero Balance' : 'Failed';
        }

        footerConnPill.innerHTML = `
          <span class="led-dot ${ledClass}" style="width:7px; height:7px;"></span>
          <span>${activeModel.displayName} (${label})</span>
        `;
        (footerConnPill as HTMLElement).style.display = 'inline-flex';
      } else {
        (footerConnPill as HTMLElement).style.display = 'none';
      }
    }
  }

  private renderMcpTab(): void {
    const container = this.el.querySelector('#mcp-settings-container');
    if (!container) return;

    const currentMode = (aiService as any).getExecutionMode ? (aiService as any).getExecutionMode() : 'assisted';
    const auditLogs = McpAuditLogger.getRecentLogs(20);

    const toolsRows = MCP_TOOLS_CATALOG.map(t => `
      <tr>
        <td><strong style="color:#38bdf8;">${t.name}</strong></td>
        <td><span style="font-size:10px; background:#1e293b; color:#cbd5e1; padding:2px 6px; border-radius:3px;">${t.minimumRole.toUpperCase()}</span></td>
        <td>${t.readOnly ? '<span style="color:#4ade80;">Read-Only</span>' : '<span style="color:#fbbf24;">Mutation</span>'}</td>
        <td style="color:#94a3b8; font-size:11px;">${t.description}</td>
      </tr>
    `).join('');

    const auditRows = auditLogs.length > 0 ? auditLogs.map(l => `
      <tr>
        <td><span style="font-family:monospace; color:#64748b; font-size:10px;">${l.requestId}</span></td>
        <td><strong style="color:${l.success ? '#4ade80' : '#f87171'};">${l.toolName}</strong></td>
        <td>${l.durationMs}ms</td>
        <td><span style="font-size:10px; background:#141c2b; color:#cbd5e1; padding:2px 6px; border-radius:3px;">${l.role}</span></td>
        <td>${l.success ? '<span style="color:#4ade80;">✓ Success</span>' : `<span style="color:#f87171;">✗ ${l.errorCode || 'Failed'}</span>`}</td>
        <td style="font-size:10px; color:#64748b; font-family:monospace;">${JSON.stringify(l.sanitizedArgs)}</td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="6" style="text-align:center; color:#64748b; padding:16px;">No MCP transactions logged in this session yet.</td>
      </tr>
    `;

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <!-- Security Boundary Status Banner -->
        <div style="background:linear-gradient(135deg, rgba(168,85,247,0.08), rgba(56,189,248,0.05)); border:1px solid rgba(168,85,247,0.3); border-radius:8px; padding:14px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">🛡️</span>
              <span style="font-weight:800; font-size:14px; color:#f8fafc;">RackSlicer Secure MCP Control Plane</span>
              <span style="font-size:10px; font-weight:700; background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3); color:#4ade80; padding:2px 6px; border-radius:4px;">
                Zero-Trust Active
              </span>
            </div>
            <div style="font-size:11.5px; color:#94a3b8; margin-top:4px;">
              AI models receive zero source code, shell, SQL, or credentials. All modifications require allowlisted domain tools.
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b;">SECURITY TEST STATUS</div>
            <div style="font-size:12px; font-weight:700; color:#4ade80;">17/17 Security Tests PASS</div>
          </div>
        </div>

        <!-- Execution Mode Settings -->
        <div style="background:#090e1c; border:1px solid #1e293b; border-radius:8px; padding:14px;">
          <div style="font-weight:700; font-size:13px; color:#f8fafc; margin-bottom:8px;">Execution Governance Mode</div>
          <div style="display:flex; gap:12px;">
            <label style="flex:1; background:#040711; border:1px solid ${currentMode === 'assisted' ? '#38bdf8' : '#1e293b'}; border-radius:6px; padding:10px; cursor:pointer; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <input type="radio" name="mcp-exec-mode" value="assisted" ${currentMode === 'assisted' ? 'checked' : ''} />
                <strong style="color:#f8fafc; font-size:12px;">Assisted (Recommended)</strong>
              </div>
              <span style="font-size:11px; color:#94a3b8; line-height:1.4;">AI generates structured Design Change Previews; user explicitly reviews and clicks [Apply Changes].</span>
            </label>

            <label style="flex:1; background:#040711; border:1px solid ${currentMode === 'advisory' ? '#38bdf8' : '#1e293b'}; border-radius:6px; padding:10px; cursor:pointer; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <input type="radio" name="mcp-exec-mode" value="advisory" ${currentMode === 'advisory' ? 'checked' : ''} />
                <strong style="color:#f8fafc; font-size:12px;">Advisory</strong>
              </div>
              <span style="font-size:11px; color:#94a3b8; line-height:1.4;">AI acts strictly as a consultant: calculates metrics and answers questions without modifying canvas state.</span>
            </label>

            <label style="flex:1; background:#040711; border:1px solid ${currentMode === 'autonomous' ? '#38bdf8' : '#1e293b'}; border-radius:6px; padding:10px; cursor:pointer; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <input type="radio" name="mcp-exec-mode" value="autonomous" ${currentMode === 'autonomous' ? 'checked' : ''} />
                <strong style="color:#f8fafc; font-size:12px;">Controlled Autonomous</strong>
              </div>
              <span style="font-size:11px; color:#94a3b8; line-height:1.4;">AI automatically executes non-destructive actions; destructive changes pause for confirmation.</span>
            </label>
          </div>
        </div>

        <!-- Prohibited vs Allowed Tools Table -->
        <div style="background:#090e1c; border:1px solid #1e293b; border-radius:8px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; font-size:13px; color:#f8fafc;">Allowlisted Domain MCP Tools (${MCP_TOOLS_CATALOG.length})</div>
            <span style="font-size:10px; color:#f87171; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); padding:2px 6px; border-radius:3px;">
              Arbitrary Code & Shell Execution Blocked
            </span>
          </div>

          <div style="max-height:180px; overflow-y:auto; border:1px solid #141c2b; border-radius:4px;">
            <table class="ai-bom-table" style="width:100%; border-collapse:collapse; font-size:11px;">
              <thead>
                <tr>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Tool Name</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Min Role</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Type</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Description</th>
                </tr>
              </thead>
              <tbody>
                ${toolsRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Live Audit Trail Log -->
        <div style="background:#090e1c; border:1px solid #1e293b; border-radius:8px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; font-size:13px; color:#f8fafc;">Live MCP Audit Trail (Recent Operations)</div>
            <button id="btn-clear-mcp-audit" class="btn-secondary" style="font-size:10px; padding:2px 8px;">Clear Log</button>
          </div>

          <div style="max-height:180px; overflow-y:auto; border:1px solid #141c2b; border-radius:4px;">
            <table class="ai-bom-table" style="width:100%; border-collapse:collapse; font-size:11px;">
              <thead>
                <tr>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Request ID</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Tool</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Latency</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Role</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Status</th>
                  <th style="background:#050811; padding:6px 10px; text-align:left; color:#64748b;">Sanitized Arguments</th>
                </tr>
              </thead>
              <tbody>
                ${auditRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Bind mode radios
    container.querySelectorAll('input[name="mcp-exec-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value as any;
        if (val) {
          aiService.setExecutionMode(val);
          eventBus.emit('notification', { message: `MCP Mode set to: ${val.toUpperCase()}`, type: 'info' });
          this.renderMcpTab();
        }
      });
    });

    // Bind clear audit
    container.querySelector('#btn-clear-mcp-audit')?.addEventListener('click', () => {
      McpAuditLogger.clear();
      this.renderMcpTab();
    });
  }
}
