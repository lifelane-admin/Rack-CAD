import { eventBus } from '../core/event-bus';
import { aiService } from '../ai/ai-service';
import { AIMessage, RackDiff } from '../ai/types';
import { modelRegistry } from '../ai/registry/model-registry';
import { DesignChangePreview, McpAuditLogEntry, McpExecutionMode } from '../mcp';
import { physicalInfrastructureModel } from '../model/physical-model';
import { InfrastructureCopilotEngine, CopilotResponse } from '../ai/copilot/copilot-engine';
import { ExcelExportEngine } from '../model/excel-export-engine';
import { stateManager } from '../core/state';
import { ChangeProposal } from '../model/types';

export class AIPanel {
  private el: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private thinkingEl: HTMLElement;
  private devConsoleEl: HTMLElement;
  private devStreamEl: HTMLElement;
  private messages: AIMessage[] = [];
  private streaming = false;
  private currentAssistantEl: HTMLElement | null = null;
  private pendingDiff: RackDiff | null = null;

  constructor() {
    this.el = this.buildDOM();
    document.body.appendChild(this.el);
    this.messagesEl = this.el.querySelector('.ai-messages')!;
    this.inputEl = this.el.querySelector('.ai-input-row input') as HTMLInputElement;
    this.sendBtn = this.el.querySelector('.ai-input-row button') as HTMLButtonElement;
    this.thinkingEl = this.el.querySelector('.ai-thinking')!;
    this.devConsoleEl = this.el.querySelector('.ai-mcp-dev-console')!;
    this.devStreamEl = this.el.querySelector('.ai-dev-console-stream')!;
    this.bindEvents();
    this.renderLandingPage();
  }

  private buildDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'ai-panel';
    div.id = 'ai-panel';
    div.innerHTML = `
      <div class="ai-panel-header">
        <span class="provider-dot" id="ai-dot"></span>
        <span id="ai-panel-provider">&#x2699; Rules</span>
        <button id="ai-panel-new-btn" class="ai-header-btn" title="Reset and return to AI Welcome screen">
          ✨ New
        </button>
        <button id="ai-panel-settings-btn" class="ai-header-btn" style="background:rgba(56,189,248,0.12); border-color:rgba(56,189,248,0.3); color:#38bdf8;" title="Dynamic AI Model Registry & Settings">
          ⚙️ Models & Keys
        </button>
        <button id="ai-panel-console-toggle-btn" class="ai-header-btn" style="background:rgba(168,85,247,0.12); border-color:rgba(168,85,247,0.3); color:#c084fc;" title="Toggle MCP Developer Audit Console">
          🛠️ MCP Console
        </button>
        <button id="ai-panel-studio-btn" class="ai-header-btn" style="background:rgba(8,120,255,0.15); border-color:rgba(8,120,255,0.3); color:#38bdf8;" title="Expand to Dedicated Full-Screen AI Studio">
          ✦ Full Studio
        </button>
        <span style="flex:1"></span>
        <button id="ai-panel-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px" title="Close AI Panel">&#x2715;</button>
      </div>

      <!-- MCP Mode Selector -->
      <div class="ai-mode-selector-bar">
        <span style="color:#64748b; font-size:10px; font-weight:700; letter-spacing:0.5px;">MODE:</span>
        <button class="ai-mode-pill active" data-mode="assisted" title="Assisted: AI previews changes, user confirms before applying">Assisted</button>
        <button class="ai-mode-pill" data-mode="advisory" title="Advisory: AI analyzes and recommends without applying">Advisory</button>
        <button class="ai-mode-pill" data-mode="autonomous" title="Controlled Autonomous: AI executes pre-approved changes directly">Autonomous</button>
      </div>

      <div class="ai-messages"></div>

      <div class="ai-thinking" style="display:none">
        <span>&#x25C9;</span> Thinking & Validating Design Rules...
      </div>

      <!-- MCP Developer Console Drawer -->
      <div class="ai-mcp-dev-console" style="display:none">
        <div class="ai-dev-console-header">
          <span>🛠️ MCP CONTROL PLANE AUDIT CONSOLE</span>
          <span style="flex:1"></span>
          <button id="ai-dev-console-clear">Clear</button>
          <button id="ai-dev-console-close">✕</button>
        </div>
        <div class="ai-dev-console-stream">
          <div style="color:#64748b; font-size:10px; font-style:italic;">Listening for live MCP tool invocations and audit events...</div>
        </div>
      </div>

      <div class="ai-input-row">
        <input type="text" placeholder="Ask AI Architect (e.g. 'Build 3-node Proxmox cluster with Ceph')..." />
        <button>&#x25B6;</button>
      </div>
    `;
    return div;
  }

  private bindEvents(): void {
    this.el.querySelector('#ai-panel-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('#ai-panel-studio-btn')?.addEventListener('click', () => {
      this.close();
      eventBus.emit('ai:studio-open' as any);
    });
    this.el.querySelector('#ai-panel-settings-btn')?.addEventListener('click', () => {
      eventBus.emit('ai:open-model-selector');
    });
    this.el.querySelector('#ai-panel-provider')?.addEventListener('click', () => {
      eventBus.emit('ai:open-model-selector');
    });

    this.el.querySelector('#ai-panel-new-btn')?.addEventListener('click', () => {
      this.messages = [];
      this.messagesEl.innerHTML = '';
      this.renderLandingPage();
    });

    // Developer Console Toggles
    const toggleBtn = this.el.querySelector('#ai-panel-console-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
      const isVisible = this.devConsoleEl.style.display !== 'none';
      this.devConsoleEl.style.display = isVisible ? 'none' : 'flex';
    });

    this.el.querySelector('#ai-dev-console-close')?.addEventListener('click', () => {
      this.devConsoleEl.style.display = 'none';
    });

    this.el.querySelector('#ai-dev-console-clear')?.addEventListener('click', () => {
      this.devStreamEl.innerHTML = '<div style="color:#64748b; font-size:10px; font-style:italic;">Console cleared.</div>';
    });

    // Execution Mode Selector
    this.el.querySelectorAll('.ai-mode-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this.el.querySelectorAll('.ai-mode-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const mode = pill.getAttribute('data-mode') as McpExecutionMode;
        if (mode) {
          aiService.setExecutionMode(mode);
          eventBus.emit('notification', { message: `MCP Mode set to: ${mode.toUpperCase()}`, type: 'info' });
        }
      });
    });

    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });

    eventBus.on('ai:mode-changed', (enabled) => {
      enabled ? this.open() : this.close();
    });

    // Listen for MCP Live Audit events
    eventBus.on('mcp:audit' as any, (entry: McpAuditLogEntry) => {
      this.appendDevConsoleEntry(entry);
    });

    // Listen for MCP Design Change Previews
    eventBus.on('ai:mcp-preview' as any, (preview: DesignChangePreview) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;

      const landing = this.messagesEl.querySelector('.ai-landing-view');
      if (landing) landing.remove();

      this.renderPreviewCard(preview);
    });

    // Listen for MCP Applied events
    eventBus.on('ai:mcp-applied' as any, ({ transactionId }: { transactionId: string }) => {
      const badge = document.createElement('div');
      badge.className = 'ai-applied-badge';
      badge.innerHTML = `<span style="color:#4ade80">✓ Changes Committed & Validated!</span> <span style="font-family:monospace; font-size:10px; color:#94a3b8;">(${transactionId})</span>`;
      this.messagesEl.appendChild(badge);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    const updateHeaderAndLanding = () => {
      const activeModel = modelRegistry.getActiveSelectedModel();
      const pName = activeModel?.providerId || (typeof (aiService as any).getActiveProvider === 'function' ? (aiService as any).getActiveProvider() : 'gemini');
      const labels: Record<string, string> = {
        gemini: '✨ Gemini',
        deepseek: '🐋 DeepSeek',
        openrouter: '🌐 OpenRouter',
        openai: '🟢 OpenAI',
        claude: '☁ Claude',
        local: '⚡ Local',
        rules: '⚙ Rules',
      };
      const el = document.getElementById('ai-panel-provider');
      if (el) {
        if (activeModel) {
          el.innerHTML = `${labels[activeModel.providerId] ?? activeModel.providerDisplayName} <span style="font-size:10px; color:#38bdf8; background:rgba(56,189,248,0.15); border-radius:3px; padding:1px 4px; margin-left:4px;">${activeModel.relativeGeneration || 'N'}</span>`;
        } else {
          el.innerHTML = labels[pName] ?? '⚙ Rules';
        }
        el.style.cursor = 'pointer';
        el.title = 'Click to open AI Model Registry & Settings';
      }

      if (this.messages.length === 0) {
        this.renderLandingPage();
      }
    };

    eventBus.on('ai:provider-changed', () => updateHeaderAndLanding());
    eventBus.on('ai:model-registry-updated', () => updateHeaderAndLanding());
    eventBus.on('ai:credentials-updated', () => updateHeaderAndLanding());
    eventBus.on('ai:connection-tested', () => updateHeaderAndLanding());

    eventBus.on('ai:stream-chunk', (_chunk) => {
      const landing = this.messagesEl.querySelector('.ai-landing-view');
      if (landing) landing.remove();

      if (!this.currentAssistantEl) {
        this.currentAssistantEl = document.createElement('div');
        this.currentAssistantEl.className = 'ai-msg assistant';
        this.currentAssistantEl.style.opacity = '0.7';
        this.currentAssistantEl.style.fontStyle = 'italic';
        this.currentAssistantEl.textContent = 'Synthesizing datacenter layout & validating rules...';
        this.messagesEl.appendChild(this.currentAssistantEl);
      }
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    eventBus.on('ai:stream-done', (rackDiff) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;

      const landing = this.messagesEl.querySelector('.ai-landing-view');
      if (landing) landing.remove();

      const explanation = rackDiff.explanation || '(no response)';

      if (this.currentAssistantEl) {
        this.currentAssistantEl.remove();
        this.currentAssistantEl = null;
      }

      const formattedEl = this.formatExplanation(explanation);
      this.messagesEl.appendChild(formattedEl);
      this.messages.push({ role: 'assistant', content: explanation });

      if (rackDiff.diff) {
        this.pendingDiff = rackDiff;
        aiService.applyRackDiff(rackDiff);
        this.showAppliedBadge(rackDiff);
      }
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    eventBus.on('ai:error', (msg) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;
      if (this.currentAssistantEl) {
        this.currentAssistantEl.remove();
        this.currentAssistantEl = null;
      }
      this.appendMessage('assistant', `⚠ Error: ${msg}`);
    });
  }

  private appendDevConsoleEntry(entry: McpAuditLogEntry): void {
    const item = document.createElement('div');
    item.className = `ai-dev-entry ${entry.success ? '' : 'error'}`;
    const timeStr = new Date(entry.timestamp).toLocaleTimeString();
    item.innerHTML = `
      <div class="ai-dev-entry-top">
        <span class="ai-dev-tool-badge">${entry.success ? '✓' : '✗'} ${entry.toolName}</span>
        <span class="ai-dev-time">${entry.durationMs}ms · ${timeStr}</span>
      </div>
      <div class="ai-dev-entry-details">
        <span style="color:#64748b;">${entry.requestId}</span> · ${JSON.stringify(entry.sanitizedArgs)}
      </div>
    `;
    this.devStreamEl.appendChild(item);
    this.devStreamEl.scrollTop = this.devStreamEl.scrollHeight;
  }

  private renderPreviewCard(preview: DesignChangePreview): void {
    const card = document.createElement('div');
    card.className = `ai-preview-card ${preview.requiresApproval ? 'requires-approval' : ''}`;

    const changesHtml = preview.changes.summary
      .map(s => {
        const isAdd = s.startsWith('+');
        return `<div class="ai-preview-change-item ${isAdd ? 'add' : 'remove'}">${s}</div>`;
      })
      .join('');

    const valBadgesHtml = preview.validation.checks
      .map(c => {
        const cls = c.status.toLowerCase();
        return `<div class="ai-val-badge ${cls}"><span>${c.status === 'PASS' ? '✓' : c.status === 'WARN' ? '⚠' : '✗'}</span> <strong>${c.title}:</strong> ${c.message}</div>`;
      })
      .join('');

    const primaryRack = preview.rackImpact[0];
    const rackUsageText = primaryRack ? `${primaryRack.usedUnitsAfter} / ${primaryRack.totalUnits}U (${primaryRack.utilizationPercent}%)` : 'N/A';
    const powerLoadText = `${(preview.powerImpact.estimatedLoadWatts / 1000).toFixed(2)} kW`;
    const feedsText = `A: ${preview.powerImpact.feedAWatts}W | B: ${preview.powerImpact.feedBWatts}W`;

    card.innerHTML = `
      <div class="ai-preview-header">
        <div class="ai-preview-title">
          <span>📋</span>
          <span>DESIGN CHANGE PREVIEW</span>
        </div>
        <span class="ai-preview-tx">${preview.transactionId}</span>
      </div>

      <div class="ai-preview-summary-text">"${preview.requestSummary}"</div>

      <div class="ai-preview-grid">
        <div class="ai-preview-metric-box">
          <span class="ai-metric-label">RACK CAPACITY</span>
          <span class="ai-metric-value">${rackUsageText}</span>
        </div>
        <div class="ai-preview-metric-box">
          <span class="ai-metric-label">POWER (LOAD)</span>
          <span class="ai-metric-value">${powerLoadText}</span>
        </div>
        <div class="ai-preview-metric-box">
          <span class="ai-metric-label">A/B FEEDS</span>
          <span class="ai-metric-value" style="font-size:11px;">${feedsText}</span>
        </div>
        <div class="ai-preview-metric-box">
          <span class="ai-metric-label">REDUNDANCY</span>
          <span class="ai-metric-value" style="color:#4ade80;">${preview.networkImpact.dualToRDetected ? 'Dual ToR (25G)' : 'Verified'}</span>
        </div>
      </div>

      <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; margin-top:2px;">PROPOSED CHANGES:</div>
      <div class="ai-preview-changes-list">
        ${changesHtml}
      </div>

      <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; margin-top:2px;">ENGINEERING VALIDATION:</div>
      <div class="ai-preview-validation-list">
        ${valBadgesHtml}
      </div>

      ${
        preview.requiresApproval
          ? `<div style="font-size:10.5px; color:#f59e0b; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.25); padding:4px 8px; border-radius:4px;">
               ⚠ Approval required: ${preview.approvalReasons.join(', ')}
             </div>`
          : ''
      }

      <div class="ai-preview-actions">
        <button class="btn-preview-apply" id="btn-apply-${preview.transactionId}">✓ APPLY CHANGES</button>
        <button class="btn-preview-modify" id="btn-mod-${preview.transactionId}">✏️ MODIFY</button>
        <button class="btn-preview-cancel" id="btn-cancel-${preview.transactionId}">✕ CANCEL</button>
      </div>
    `;

    // Bind preview buttons
    card.querySelector(`#btn-apply-${preview.transactionId}`)?.addEventListener('click', async () => {
      const btn = card.querySelector(`#btn-apply-${preview.transactionId}`) as HTMLButtonElement;
      if (btn) btn.disabled = true;
      await aiService.applyMcpTransaction(preview.transactionId, true);
    });

    card.querySelector(`#btn-mod-${preview.transactionId}`)?.addEventListener('click', () => {
      this.inputEl.value = `Modify: ${preview.requestSummary} with `;
      this.inputEl.focus();
    });

    card.querySelector(`#btn-cancel-${preview.transactionId}`)?.addEventListener('click', () => {
      card.remove();
      eventBus.emit('notification', { message: 'Design change preview dismissed.', type: 'info' });
    });

    this.messagesEl.appendChild(card);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderLandingPage(): void {
    if (this.messages.length > 0) return;

    const activeModel = modelRegistry.getActiveSelectedModel();
    const conn = activeModel
      ? modelRegistry.getConnectionStatus(activeModel.providerId)
      : { status: 'needs_key' as const, balanceStatus: 'unknown' as const, latencyMs: undefined, message: 'No Model Selected' };

    let badgeClass = 'badge-amber';
    let ledClass = 'led-amber';
    let statusText = 'API Key Required';

    if (conn.status === 'connected') {
      badgeClass = 'badge-green';
      ledClass = 'led-green';
      statusText = conn.latencyMs ? `Connected (${conn.latencyMs}ms)` : 'Connected';
    } else if (conn.status === 'low_balance') {
      badgeClass = 'badge-amber';
      ledClass = 'led-amber';
      statusText = 'Connected • Low Balance';
    } else if (conn.status === 'failed') {
      badgeClass = 'badge-red';
      ledClass = 'led-red';
      statusText = conn.balanceStatus === 'depleted' ? 'Zero Balance / Quota Exceeded' : (conn.message || 'Connection Failed');
    } else if (activeModel && modelRegistry.hasCredentials(activeModel.providerId)) {
      badgeClass = 'badge-green';
      ledClass = 'led-green';
      statusText = 'API Key Saved';
    }

    // Physical Infrastructure Model Metrics
    const racks = physicalInfrastructureModel.getRacks();
    const objects = physicalInfrastructureModel.getObjects();
    const ports = physicalInfrastructureModel.getPorts();
    const cables = physicalInfrastructureModel.getCables();
    const findings = physicalInfrastructureModel.validate();
    const totalWatts = objects.reduce((a, b) => a + (b.powerWatts || 0), 0);
    const totalU = racks.reduce((a, b) => a + b.rackSizeU, 0);
    const usedU = objects.reduce((a, b) => a + b.heightU, 0);
    const uPercent = totalU > 0 ? Math.round((usedU / totalU) * 100) : 0;

    const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = findings.filter(f => f.severity === 'HIGH').length;
    const mediumCount = findings.filter(f => f.severity === 'MEDIUM').length;

    let riskBadgeClass = 'healthy';
    let riskText = 'HEALTHY';
    if (criticalCount > 0) {
      riskBadgeClass = 'critical';
      riskText = 'CRITICAL RISK';
    } else if (highCount > 0) {
      riskBadgeClass = 'high';
      riskText = 'HIGH RISK';
    }

    this.messagesEl.innerHTML = `
      <div class="ai-landing-view">
        <div class="ai-landing-hero">
          <div class="ai-hero-icon">🏛️</div>
          <div class="ai-hero-title">RackSlicer AI Copilot</div>
          <div class="ai-hero-subtitle">
            Infrastructure Engineering Copilot grounded in the Physical Model.
          </div>
        </div>

        <!-- Section 41 Architecture Status Card -->
        <div class="ai-architecture-status-card">
          <div class="ai-arch-header-row">
            <span class="ai-arch-title">🏛️ CURRENT PHYSICAL INFRASTRUCTURE</span>
            <span class="ai-arch-risk-badge ${riskBadgeClass}">${riskText}</span>
          </div>
          <div class="ai-arch-metrics-grid">
            <div class="ai-arch-metric-box">
              <span class="label">RACKS</span>
              <span class="value">${racks.length}</span>
            </div>
            <div class="ai-arch-metric-box">
              <span class="label">CHASSIS</span>
              <span class="value">${objects.length}</span>
            </div>
            <div class="ai-arch-metric-box">
              <span class="label">PORTS</span>
              <span class="value">${ports.length}</span>
            </div>
            <div class="ai-arch-metric-box">
              <span class="label">POWER</span>
              <span class="value">${(totalWatts / 1000).toFixed(1)} kW</span>
            </div>
            <div class="ai-arch-metric-box">
              <span class="label">U OCCUPANCY</span>
              <span class="value">${uPercent}%</span>
            </div>
            <div class="ai-arch-metric-box">
              <span class="label">CABLES</span>
              <span class="value">${cables.length}</span>
            </div>
          </div>
          <div class="ai-arch-audit-summary">
            <span style="color:#f87171">🔴 ${criticalCount} Critical</span>
            <span style="color:#fb923c">🟠 ${highCount} High</span>
            <span style="color:#facc15">🟡 ${mediumCount} Medium</span>
          </div>
        </div>

        <!-- Active Model Showcase Card -->
        <div class="ai-landing-model-card">
          <div class="ai-model-card-top">
            <div style="flex:1; overflow:hidden;">
              <div class="ai-model-name">${activeModel?.displayName || 'Google Gemini 2.5 Pro'}</div>
              <div class="ai-model-provider-sub">
                ${activeModel?.providerDisplayName || 'Google AI'} · ${activeModel?.category === 'open_source' ? '🟢 Open Weights' : '🔵 Commercial API'}
              </div>
            </div>
            <div>
              <span class="provider-key-badge ${badgeClass}" id="landing-conn-pill">
                <span class="led-dot ${ledClass}"></span>
                <span>${statusText}</span>
              </span>
            </div>
          </div>

          <div style="font-size:11px; color:#94a3b8; display:flex; justify-content:space-between; margin-top:2px;">
            <span>Context: <strong>${activeModel?.contextWindow ? (activeModel.contextWindow / 1000).toFixed(0) + 'k' : '1M'}</strong></span>
            <span>Gen Slot: <strong>${activeModel?.relativeGeneration || 'N'}</strong></span>
            <span>Price: <strong>${activeModel?.pricing.inputPer1M ? '$' + activeModel.pricing.inputPer1M + '/1M' : (activeModel?.category === 'open_source' ? 'Free' : '$0.00')}</strong></span>
          </div>

          <div class="ai-model-actions-row">
            <button class="btn-ai-registry" id="landing-btn-registry" title="Explore and select models from the registry">
              🚀 Dynamic Registry ↗
            </button>
            <button class="btn-ai-key" id="landing-btn-keys" title="Configure API Keys and test connection">
              🔑 Keys & Providers
            </button>
          </div>
        </div>

        <!-- Section 37 Quick Engineering Copilot Actions -->
        <div class="ai-quick-prompts-section">
          <div class="ai-quick-header">⚡ ENGINEERING COPILOT ACTIONS</div>
          <div class="ai-quick-prompts-list">
            <button class="ai-prompt-chip" data-prompt="Analyze this infrastructure for physical single points of failure">
              <strong>🔍 Find SPOFs:</strong> Audit cabinet, power feeds & ToR network diversity
            </button>
            <button class="ai-prompt-chip" data-prompt="Optimize infrastructure to balance power and separate failure domains">
              <strong>⚖️ Optimize Infrastructure:</strong> Rebalance high-density servers and improve HA
            </button>
            <button class="ai-prompt-chip" data-prompt="Generate HLD for this infrastructure">
              <strong>📄 Generate HLD:</strong> High Level Architecture Design document
            </button>
            <button class="ai-prompt-chip" data-prompt="Generate BOM for this infrastructure">
              <strong>📋 Generate BOM:</strong> Bill of Materials with power and specs
            </button>
            <button class="ai-prompt-chip" id="chip-export-excel" data-prompt="Export engineering Excel schedule">
              <strong>📊 Export Engineering Excel:</strong> Full 20-sheet workbook (.xml)
            </button>
          </div>
        </div>
      </div>
    `;

    // Bind landing buttons
    this.messagesEl.querySelector('#landing-btn-registry')?.addEventListener('click', () => {
      eventBus.emit('ai:open-model-selector', { tab: 'models' });
    });

    this.messagesEl.querySelector('#landing-btn-keys')?.addEventListener('click', () => {
      eventBus.emit('ai:open-model-selector', { tab: 'providers' });
    });

    this.messagesEl.querySelectorAll('.ai-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          this.inputEl.value = prompt;
          this.sendMessage();
        }
      });
    });
  }

  private formatExplanation(raw: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-msg assistant';

    let text = raw;
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      if (cleaned.startsWith('{')) {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed.explanation === 'string') {
          text = parsed.explanation;
        }
      }
    } catch {
      // not JSON
    }

    const paragraphs = text.split('\n');
    paragraphs.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        container.appendChild(document.createElement('br'));
      } else if (trimmed.startsWith('•') || trimmed.startsWith('*') || trimmed.startsWith('-')) {
        const li = document.createElement('div');
        li.style.cssText = 'padding-left: 8px; margin-bottom: 4px; color: #e2e8f0; line-height: 1.4;';
        li.textContent = trimmed;
        container.appendChild(li);
      } else {
        const p = document.createElement('div');
        p.style.cssText = 'margin-bottom: 6px; font-weight: 500; color: #f1f5f9;';
        p.textContent = trimmed;
        container.appendChild(p);
      }
    });

    return container;
  }

  private showAppliedBadge(diff: RackDiff): void {
    const ops = diff.diff!;
    const parts: string[] = [];
    if (ops.addRacks?.length) parts.push(`${ops.addRacks.length} rack${ops.addRacks.length > 1 ? 's' : ''}`);
    if (ops.addDevices?.length) parts.push(`${ops.addDevices.length} device${ops.addDevices.length > 1 ? 's' : ''}`);
    if (ops.addCables?.length) parts.push(`${ops.addCables.length} cable${ops.addCables.length > 1 ? 's' : ''}`);
    if (ops.removeDevices?.length) parts.push(`removed ${ops.removeDevices.length} device${ops.removeDevices.length > 1 ? 's' : ''}`);
    if (ops.removeCables?.length) parts.push(`removed ${ops.removeCables.length} cable${ops.removeCables.length > 1 ? 's' : ''}`);

    const summary = parts.length ? parts.join(', ') : 'changes';
    eventBus.emit('notification', { message: `✓ Applied: ${summary}`, type: 'success' });

    const badge = document.createElement('div');
    badge.className = 'ai-applied-badge';
    badge.innerHTML = `<span style="color:#4ade80">✓ Applied to canvas:</span> ${summary}`;
    this.messagesEl.appendChild(badge);
  }

  private appendMessage(role: 'user' | 'assistant', content: string): void {
    const landing = this.messagesEl.querySelector('.ai-landing-view');
    if (landing) {
      landing.remove();
    }
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.textContent = content;
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderProposalCard(proposal: ChangeProposal): void {
    const card = document.createElement('div');
    card.className = 'ai-proposal-card';
    const fromStr = proposal.from ? `${proposal.from.rackId || ''} U${proposal.from.uStart || ''}` : 'Unassigned';
    const toStr = proposal.to ? `${proposal.to.rackId || ''} U${proposal.to.uStart || ''}` : 'Unassigned';

    card.innerHTML = `
      <div class="ai-proposal-header">
        <span>💡 AI RECOMMENDATION (${proposal.proposalId})</span>
        <span style="font-size:10px; background:#0284c7; color:#fff; padding:1px 6px; border-radius:10px;">${proposal.type}</span>
      </div>
      <div style="font-size:11px; color:#f1f5f9; font-weight:600; margin-bottom:6px;">
        ${proposal.reason}
      </div>
      <div class="ai-proposal-diff-box">
        <div class="ai-proposal-diff-row before">
          <strong>BEFORE:</strong> ${fromStr}
        </div>
        <div class="ai-proposal-diff-row proposed">
          <strong>PROPOSED:</strong> ${toStr}
        </div>
      </div>
      <div class="ai-proposal-impact">
        <strong>Impact:</strong> ${proposal.impact.summary}
      </div>
      <div class="ai-proposal-actions">
        <button class="btn-prop-apply" id="btn-prop-apply-${proposal.proposalId}">✓ APPLY CHANGE</button>
        <button class="btn-prop-reject" id="btn-prop-reject-${proposal.proposalId}">✕ REJECT</button>
      </div>
    `;

    card.querySelector(`#btn-prop-apply-${proposal.proposalId}`)?.addEventListener('click', () => {
      const res = physicalInfrastructureModel.applyProposal(proposal.proposalId);
      if (res.success) {
        stateManager.syncFromPhysicalModel();
        card.innerHTML = `<div style="color:#4ade80; font-size:11px; font-weight:700;">✓ Proposal ${proposal.proposalId} Applied to Physical Model & Re-rendered!</div>`;
        eventBus.emit('notification', { message: `Proposal ${proposal.proposalId} applied!`, type: 'success' });
      } else {
        eventBus.emit('notification', { message: `Failed to apply: ${res.errors.join(', ')}`, type: 'error' });
      }
    });

    card.querySelector(`#btn-prop-reject-${proposal.proposalId}`)?.addEventListener('click', () => {
      physicalInfrastructureModel.rejectProposal(proposal.proposalId);
      card.remove();
      eventBus.emit('notification', { message: `Proposal ${proposal.proposalId} rejected.`, type: 'info' });
    });

    this.messagesEl.appendChild(card);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.streaming) return;

    this.inputEl.value = '';
    this.appendMessage('user', text);
    this.messages.push({ role: 'user', content: text });
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(-20);
    }

    const tLower = text.toLowerCase();
    const isCopilotCommand =
      tLower.includes('spof') ||
      tLower.includes('ha') ||
      tLower.includes('single point') ||
      tLower.includes('optimiz') ||
      tLower.includes('balance') ||
      tLower.includes('hld') ||
      tLower.includes('lld') ||
      tLower.includes('bom') ||
      tLower.includes('implementation plan') ||
      tLower.includes('risk') ||
      tLower.includes('excel');

    if (tLower.includes('excel') || tLower.includes('spreadsheet')) {
      try {
        ExcelExportEngine.downloadEngineeringExcel(physicalInfrastructureModel);
        this.appendMessage('assistant', '📊 Generated and downloaded comprehensive 20-sheet Engineering Excel Workbook (.xml) from the canonical Physical Infrastructure Model.');
        eventBus.emit('notification', { message: 'Engineering Excel downloaded successfully!', type: 'success' });
        return;
      } catch (err: any) {
        this.appendMessage('assistant', `⚠️ Excel export failed: ${err.message}`);
        return;
      }
    }

    if (isCopilotCommand) {
      this.streaming = true;
      this.sendBtn.disabled = true;
      this.thinkingEl.style.display = 'flex';

      try {
        const res = await InfrastructureCopilotEngine.query(text);
        this.thinkingEl.style.display = 'none';
        this.sendBtn.disabled = false;
        this.streaming = false;

        const explanationEl = this.formatExplanation(res.markdown);
        this.messagesEl.appendChild(explanationEl);
        this.messages.push({ role: 'assistant', content: res.markdown });

        if (res.proposals && res.proposals.length > 0) {
          for (const prop of res.proposals) {
            physicalInfrastructureModel.registerProposal(prop);
            this.renderProposalCard(prop);
          }
        }
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        return;
      } catch (err: any) {
        console.warn('Copilot query error, falling back to AI chat:', err);
      }
    }

    this.streaming = true;
    this.sendBtn.disabled = true;
    this.thinkingEl.style.display = 'flex';

    await aiService.chat([...this.messages]);
  }

  open(): void { this.el.classList.add('open'); }
  close(): void {
    this.el.classList.remove('open');
    if (this.streaming) {
      this.streaming = false;
      this.sendBtn.disabled = false;
      this.thinkingEl.style.display = 'none';
    }
  }
}
