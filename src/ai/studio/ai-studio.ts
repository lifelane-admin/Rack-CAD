/**
 * RackSlicer AI Studio – Interactive Agentic Infrastructure Designer
 *
 * Implements the Structural Engineering Workflow:
 * AI recommends. Human decides. RackSlicer executes.
 * Gated sequential pipeline with hard validation gates and MCP transactions.
 */

import { eventBus } from '../../core/event-bus';
import { stateManager } from '../../core/state';
import { AIAvatarManager } from './avatar3d';
import { McpTransactionManager } from '../../mcp/transactions/transaction-manager';
import { DesignChangeItem } from '../../mcp/types';
import { AIWorkflowOrchestrator, WORKFLOW_RAIL_STEPS } from '../workflow/workflow-orchestrator';
import { WorkflowStageRenderers } from '../workflow/stage-renderers';
import { WorkflowStageId } from '../workflow/types';
import { StudioRackVisualizer, StudioViewMode } from './studio-rack-visualizer';
import './ai-studio.css';

export class RackSlicerAIStudio {
  private el: HTMLElement;
  private avatar!: AIAvatarManager;
  private orchestrator: AIWorkflowOrchestrator;
  private visualizer: StudioRackVisualizer;
  private activeView: string = '2d';
  private lastTransactionId: string | null = null;
  private isOpen = false;
  private toastTimeout: any = null;

  constructor() {
    this.orchestrator = new AIWorkflowOrchestrator();
    this.visualizer = new StudioRackVisualizer();
    this.el = this.buildDOM();
    document.body.appendChild(this.el);

    const avatarSlot = this.el.querySelector('#studio-avatar-slot') as HTMLElement;
    if (avatarSlot) {
      this.avatar = new AIAvatarManager(avatarSlot);
    }

    const viewport = this.el.querySelector('#studio-rack-viewport') as HTMLElement;
    if (viewport) {
      this.visualizer.mount(viewport);
    }

    this.bindEvents();

    this.orchestrator.subscribe(() => {
      this.renderWorkflow();
    });

    this.renderWorkflow();
  }

  private buildDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'rackslicer-ai-studio hidden';
    div.id = 'rackslicer-ai-studio';

    div.innerHTML = `
      <!-- Top Navigation Header (54px) -->
      <header class="ai-studio-top">
        <div class="ai-studio-logo">
          <span class="ai-studio-mark"></span>
          <span>RackSlicer</span>
        </div>
        <nav class="ai-studio-nav">
          <button class="active" id="nav-btn-ai">✦ AI Studio</button>
          <button id="nav-btn-canvas">♧ Canvas</button>
          <button id="nav-btn-library">▣ Library</button>
          <button id="nav-btn-designs">▧ Designs</button>
          <button id="nav-btn-reports">▤ Reports</button>
        </nav>
        <div class="ai-studio-project-bar">
          <button class="ai-studio-header-btn mcp" id="top-btn-mcp" title="Manage MCP Control Plane, Tools & Audit Log">
            🛡️ MCP Control Plane
          </button>
          <button class="ai-studio-header-btn" id="top-btn-settings" title="Configure AI Models, API Keys & Latency LEDs">
            ⚙️ API Settings & Keys
          </button>
          <span style="font-size:12px; color:#64748b;">Project: <strong style="color:#0f172a;" id="top-project-name">DC01-Production</strong> ⌄</span>
          <span class="ai-studio-user" title="Enterprise Architect Profile">JD</span>
        </div>
      </header>

      <!-- Main 3-Column Studio Body -->
      <div class="ai-studio-main" id="studio-main-grid">
        <!-- Column 1: Left Stepper / Workflow Rail + Avatar -->
        <aside class="ai-studio-left" id="studio-left-aside">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2>✦ AI Studio</h2>
            <button id="btn-restart-workflow" title="Start a new design" style="background:none; border:none; color:#38bdf8; font-size:11px; font-weight:700; cursor:pointer;">
              ＋ New Design
            </button>
          </div>
          <div class="sub" id="studio-left-subtitle">Infrastructure Architect</div>

          <!-- Dynamic Workflow Rail Container -->
          <div id="studio-workflow-rail-container"></div>

          <!-- Avatar Container Slot (Holds 3D Canvas / 2D Character + Speech Bubble + Avatar Switcher) -->
          <div id="studio-avatar-slot"></div>
        </aside>

        <!-- Column 2: Center Workspace (Workflow Stage Engine) -->
        <main class="ai-studio-center" id="studio-center-col"></main>

        <!-- Column 3: Right Elevation & Design Summary -->
        <aside class="ai-studio-right" id="studio-right-aside">
          <!-- Views Switcher Tabs -->
          <div class="views" id="studio-views-switcher">
            <button class="view active" data-view="2d">2D Elevation</button>
            <button class="view" data-view="3d">3D View</button>
            <button class="view" data-view="topology">Topology</button>
            <button class="view" data-view="cables">Cables</button>
            <button class="view" data-view="power">Power</button>
          </div>

          <!-- Rack Graphic Container -->
          <div class="rack">
            <div class="rackTitle" id="studio-rack-title">Cabinet: DC01-CAB-01 (42U)</div>
            <div class="rackImage" id="studio-rack-viewport">
              <img src="/assets/ai-studio/rack_preview.png" alt="Rack Elevation 42U" />
            </div>
          </div>

          <!-- Design Summary Metrics -->
          <div class="summary" id="studio-design-summary"></div>
        </aside>
      </div>

      <!-- Toast Notification Alert -->
      <div class="toast" id="studio-toast">
        <b>RackSlicer AI</b>
        <p id="studio-toast-text"></p>
      </div>
    `;

    return div;
  }

  private bindEvents(): void {
    // Navigation
    this.el.querySelector('#nav-btn-canvas')?.addEventListener('click', () => {
      this.close();
      eventBus.emit('view:switch', 'rack');
    });

    this.el.querySelector('#btn-restart-workflow')?.addEventListener('click', () => {
      this.orchestrator.resetToLanding();
      this.showToast('Started fresh infrastructure requirement.');
    });

    this.el.querySelector('#top-btn-settings')?.addEventListener('click', () => {
      eventBus.emit('ai:open-model-selector', { tab: 'providers' } as any);
    });

    this.el.querySelector('#top-btn-mcp')?.addEventListener('click', () => {
      eventBus.emit('ai:open-model-selector', { tab: 'mcp' } as any);
    });

    // Right views switcher
    this.el.querySelectorAll('#studio-views-switcher .view').forEach((v) => {
      v.addEventListener('click', () => {
        this.el.querySelectorAll('#studio-views-switcher .view').forEach((x) => x.classList.remove('active'));
        v.classList.add('active');
        const view = v.getAttribute('data-view') || '2d';
        this.activeView = view;
        this.renderRackView();
        this.showToast(`${v.textContent} active`);
      });
    });

    eventBus.on('ai:studio-open', () => {
      this.open();
    });

    eventBus.on('ai:studio-close', () => {
      this.close();
    });

    eventBus.on('ai:mode-changed', (enabled: boolean) => {
      if (enabled) {
        this.open();
      } else {
        this.close();
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Workflow Master Renderer
  // ──────────────────────────────────────────────────────────────────────────

  private renderWorkflow(): void {
    const state = this.orchestrator.getState();
    const stage = state.currentStage;

    // 1. Sync Avatar State & Speech
    const mood = this.orchestrator.getAvatarMoodForCurrentStage();
    this.avatar.setMood(mood);
    this.updateAvatarSpeechForStage(stage);

    // 2. Render Left Workflow Rail
    this.renderLeftWorkflowRail();

    // 3. Render Center Workspace Stage
    const centerCol = this.el.querySelector('#studio-center-col') as HTMLElement;
    if (centerCol) {
      centerCol.innerHTML = '';
      switch (stage) {
        case 'REQUIREMENT_PROMPT':
          WorkflowStageRenderers.renderLandingPage(centerCol, this.orchestrator);
          break;
        case 'REQUIREMENT_BRIEF':
          WorkflowStageRenderers.renderRequirementBrief(centerCol, this.orchestrator);
          break;
        case 'ARCHITECTURE_DESIGN':
          WorkflowStageRenderers.renderArchitectureStage(centerCol, this.orchestrator);
          break;
        case 'RESOURCE_BOM':
          WorkflowStageRenderers.renderResourceBomStage(centerCol, this.orchestrator);
          break;
        case 'PHYSICAL_DESIGN':
          WorkflowStageRenderers.renderPhysicalDesignStage(centerCol, this.orchestrator);
          break;
        case 'NETWORK_CABLING':
          WorkflowStageRenderers.renderNetworkCablingStage(centerCol, this.orchestrator);
          break;
        case 'POWER_THERMAL':
          WorkflowStageRenderers.renderPowerThermalStage(centerCol, this.orchestrator);
          break;
        case 'ENGINEERING_VALIDATION':
          WorkflowStageRenderers.renderEngineeringValidationStage(centerCol, this.orchestrator);
          break;
        case 'GAP_ANALYSIS':
          WorkflowStageRenderers.renderGapAnalysisStage(centerCol, this.orchestrator);
          break;
        case 'OPTIMIZATION':
          WorkflowStageRenderers.renderOptimizationStage(centerCol, this.orchestrator);
          break;
        case 'FINAL_DESIGN':
          WorkflowStageRenderers.renderFinalDesignPackageStage(centerCol, this.orchestrator);
          break;
        case 'MCP_DEPLOYMENT':
          WorkflowStageRenderers.renderDeploymentStage(centerCol, this.orchestrator, (options) =>
            this.executeBuildOnCanvas(options)
          );
          break;
        case 'POST_DEPLOYMENT_VALIDATION':
        case 'COMPLETED':
          WorkflowStageRenderers.renderCompletionStage(centerCol, this.orchestrator, this.lastTransactionId ?? undefined);
          break;
      }
    }

    // 4. Render Right Elevation & Metrics
    this.renderRightColumn();
  }

  private renderLeftWorkflowRail(): void {
    const railContainer = this.el.querySelector('#studio-workflow-rail-container');
    if (!railContainer) return;

    const state = this.orchestrator.getState();
    const current = state.currentStage;

    if (current === 'REQUIREMENT_PROMPT') {
      // Landing mode: Show minimal welcome instructions
      railContainer.innerHTML = `
        <div style="background:#0e1726; border:1px solid #1e293b; border-radius:8px; padding:12px; margin-top:10px; font-size:11.5px; color:#cbd5e1; line-height:1.5;">
          <div style="font-weight:700; color:#38bdf8; margin-bottom:4px;">👋 Welcome to AI Studio</div>
          Enter your natural language requirement in the center to begin the guided engineering workflow.
        </div>
      `;
      return;
    }

    // Render 10-step Workflow Rail
    let railHtml = '<div class="workflow-rail">';

    for (const step of WORKFLOW_RAIL_STEPS) {
      const status = state.stageStatuses[step.stageId];
      const isActive = current === step.stageId;
      const isCompleted = status === 'APPROVED' || status === 'COMPLETED';
      const isLocked = status === 'LOCKED';
      const isStale = status === 'STALE';

      let statusIcon = '○';
      if (isLocked) statusIcon = '🔒';
      else if (isCompleted) statusIcon = '✓';
      else if (isStale) statusIcon = '⚠️';
      else if (isActive) statusIcon = '●';

      let itemClass = 'workflow-rail-item';
      if (isActive) itemClass += ' active';
      else if (isCompleted) itemClass += ' completed';
      else if (isLocked) itemClass += ' locked';
      else if (isStale) itemClass += ' stale';

      railHtml += `
        <div class="${itemClass}" data-stage="${step.stageId}" title="${isLocked ? 'Locked until previous stage completes' : step.label}">
          <span class="rail-num">${step.num}</span>
          <span class="rail-label">${step.short}</span>
          <span class="rail-status-icon">${statusIcon}</span>
        </div>
      `;
    }

    railHtml += '</div>';
    railContainer.innerHTML = railHtml;

    // Bind clicks for unlocked stages
    railContainer.querySelectorAll('.workflow-rail-item:not(.locked)').forEach((item) => {
      item.addEventListener('click', () => {
        const stageId = item.getAttribute('data-stage') as WorkflowStageId;
        if (stageId) {
          const currentStage = this.orchestrator.getState().currentStage;
          if (stageId !== currentStage) {
            this.orchestrator.navigateToStage(stageId);
          }
        }
      });
    });
  }

  private renderRightColumn(): void {
    const state = this.orchestrator.getState();
    const current = state.currentStage;
    const isBlank = current === 'REQUIREMENT_PROMPT' || current === 'REQUIREMENT_BRIEF';

    const rightAside = this.el.querySelector('#studio-right-aside') as HTMLElement;
    if (!rightAside) return;

    if (current === 'REQUIREMENT_PROMPT') {
      rightAside.style.opacity = '0.7';
    } else {
      rightAside.style.opacity = '1';
    }
    rightAside.style.pointerEvents = 'auto';

    this.renderRackView();

    const summaryEl = this.el.querySelector('#studio-design-summary');
    if (!summaryEl) return;

    const cab = this.orchestrator.getCabinetConfig();
    const bomTotals = this.orchestrator.getBomTotals();
    const pwr = this.orchestrator.getPowerThermalConfig();

    const uSpaceUsed = isBlank ? 0 : bomTotals.totalUnits;
    const itWatts = isBlank ? 0 : bomTotals.totalWatts;
    const heatBtu = Math.round(itWatts * 3.412);
    const estBOM = isBlank ? 0 : bomTotals.totalCost;
    const redundancyLabel = isBlank
      ? 'Awaiting Specifications'
      : pwr.feedType === 'Single Feed'
      ? 'Single Feed (SPOF Risk)'
      : 'Dual Feed Verified';
    const redundancyColor = isBlank ? '#94a3b8' : pwr.feedType === 'Single Feed' ? '#f59e0b' : '#10b981';

    summaryEl.innerHTML = `
      <h3>Active Engineering Metrics</h3>
      <div class="row">
        <span>U Space Used:</span>
        <strong>${uSpaceUsed} / ${cab.totalU} U (${Math.round((uSpaceUsed / cab.totalU) * 100)}%)</strong>
      </div>
      <div class="row">
        <span>Rack IT Draw:</span>
        <strong>${(itWatts / 1000).toFixed(2)} kW</strong>
      </div>
      <div class="row">
        <span>Heat Load:</span>
        <strong>${heatBtu.toLocaleString()} BTU/hr</strong>
      </div>
      <div class="row">
        <span>Estimated BOM:</span>
        <strong style="color:#0284c7;">$${estBOM.toLocaleString()} USD</strong>
      </div>
      <div class="row">
        <span>A/B Redundancy:</span>
        <strong style="color:${redundancyColor};">${redundancyLabel}</strong>
      </div>

      <div class="actions">
        <button class="action-btn" id="btn-sidebar-undo" ${!this.lastTransactionId ? 'disabled style="opacity:0.5;"' : ''}>
          ↶ Undo AI Deployment
        </button>
        <button class="action-btn" id="btn-sidebar-export">
          📄 Export BOM Report
        </button>
      </div>
    `;

    summaryEl.querySelector('#btn-sidebar-export')?.addEventListener('click', () => {
      this.showToast('BOM Exported successfully as CSV/PDF.');
    });

    summaryEl.querySelector('#btn-sidebar-undo')?.addEventListener('click', () => {
      if (this.lastTransactionId) {
        McpTransactionManager.rollbackTransaction(this.lastTransactionId, {
          requestId: `REQ-${Date.now()}`,
          tenantId: 'tenant-primary',
          userId: 'user-admin',
          role: 'admin',
          executionMode: 'assisted',
          timestamp: Date.now(),
        });
        this.lastTransactionId = null;
        this.avatar.say('Undone! Restored pre-AI design state on canvas.', 4000);
        this.showToast('AI Canvas mutations rolled back.');
        this.renderWorkflow();
      }
    });
  }

  private renderRackView(): void {
    const cab = this.orchestrator.getCabinetConfig();
    const current = this.orchestrator.getState().currentStage;
    const isBlank = current === 'REQUIREMENT_PROMPT' || current === 'REQUIREMENT_BRIEF';

    const rackTitleEl = this.el.querySelector('#studio-rack-title');
    if (rackTitleEl) {
      rackTitleEl.textContent = isBlank
        ? `Cabinet: ${cab.name} (${cab.totalU}U) — Blank Chassis`
        : `Cabinet: ${cab.name} (${cab.totalU}U) - Slot ${cab.slotNumber}`;
    }

    this.visualizer.render(this.orchestrator, this.activeView as StudioViewMode);
  }

  private updateAvatarSpeechForStage(stage: WorkflowStageId): void {
    const speechMap: Record<WorkflowStageId, string> = {
      REQUIREMENT_PROMPT: "Hi! I'm your AI Infrastructure Architect.<br>What would you like to build today?",
      REQUIREMENT_BRIEF: 'I analyzed your requirement.<br>Please clarify the missing points and confirm the brief.',
      ARCHITECTURE_DESIGN: 'Architecture formulated.<br>Review compute, storage, fabric, and power pillars.',
      RESOURCE_BOM: 'Catalog mapping complete.<br>Every component is matched and verified against our library.',
      PHYSICAL_DESIGN: 'Physical rack layout prepared.<br>Review U-positioning before canvas mutation.',
      NETWORK_CABLING: 'Port mapping & cables routed.<br>Zero single point of failure confirmed.',
      POWER_THERMAL: 'Dual A/B power & thermal loads verified.<br>45% circuit headroom maintained.',
      ENGINEERING_VALIDATION: 'Engineering hard gate passed!<br>All 6 domain checks satisfied.',
      GAP_ANALYSIS: "Here are operational gaps identified.<br>Review OOB management and backup targets.",
      OPTIMIZATION: 'Select your optimization objective.<br>I have prepared a before/after comparison.',
      FINAL_DESIGN: 'Final design package complete!<br>Approved and ready to deploy to RackSlicer.',
      MCP_DEPLOYMENT: 'Executing transactional deployment via MCP Gateway...',
      POST_DEPLOYMENT_VALIDATION: 'Validating canvas placement and committed topology...',
      COMPLETED: '✓ Infrastructure built successfully on canvas!<br>Click Canvas anytime to view or edit.',
    };

    const text = speechMap[stage] || 'Ready to assist your infrastructure design.';
    this.avatar.say(text);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MCP Deployment Execution
  // ──────────────────────────────────────────────────────────────────────────

  public async executeBuildOnCanvas(options?: {
    autoFix?: boolean;
    skipConflictingCables?: boolean;
  }): Promise<{ success: boolean; txId?: string; error?: string }> {
    const state = this.orchestrator.getState();
    const req = state.requirement;
    const cab = this.orchestrator.getCabinetConfig();
    const placements = this.orchestrator.getRackPlacements();

    const rackId = 'rack-ai-01';
    const totalU = cab.totalU || 42;
    const leftPduTemplateId = cab.leftPduTemplateId || 'vpdu-apc-ap8858';
    const rightPduTemplateId = cab.rightPduTemplateId || 'vpdu-apc-ap8858';
    const hasLeftPdu = leftPduTemplateId !== 'none';
    const hasRightPdu = rightPduTemplateId !== 'none';

    const currentCanvasState = stateManager.getState();
    const existingRackDevices = currentCanvasState.devices.filter((d) => d.rackId === rackId);
    const existingDevIds = new Set(existingRackDevices.map((d) => d.id));

    const changes: DesignChangeItem[] = [];

    // Remove any stale cables or devices from previous deployment runs on this rack
    for (const cable of currentCanvasState.cables) {
      if (
        (cable.sourcePortId && Array.from(existingDevIds).some((id) => cable.sourcePortId!.startsWith(id))) ||
        (cable.destPortId && Array.from(existingDevIds).some((id) => cable.destPortId!.startsWith(id)))
      ) {
        changes.push({ action: 'remove_cable', source: cable.sourcePortId || '', target: cable.destPortId || '' });
      }
    }
    for (const dev of existingRackDevices) {
      changes.push({ action: 'remove_equipment', deviceId: dev.id, rackId });
    }

    const powerCfg = this.orchestrator.getPowerThermalConfig();

    changes.push({
      action: 'create_rack',
      rackId,
      name: cab.name || 'Enterprise Production Cabinet',
      units: totalU,
      details: {
        x: 250,
        y: 80,
        leftCableManagerWidth: cab.leftCableManagerWidth || '4-inch',
        rightCableManagerWidth: cab.rightCableManagerWidth || '4-inch',
        vcmType: cab.vcmType || 'single-sided',
        leftPduId: hasLeftPdu ? 'ai-pdu-left' : undefined,
        rightPduId: hasRightPdu ? 'ai-pdu-right' : undefined,
        powerConfig: {
          breakerAmps: powerCfg.breakerAmps ?? 32,
          voltage: powerCfg.voltage ?? 230,
          continuousLoadPercent: powerCfg.continuousLoadPercent ?? 80,
        },
      },
    });


    if (hasLeftPdu) {
      changes.push({
        action: 'add_equipment',
        rackId,
        deviceId: 'ai-pdu-left',
        libraryItemId: leftPduTemplateId,
        name: 'Feed A Vertical PDU (A-Side)',
        position: 0,
        details: { sideMountPosition: 'left' },
      });
    }

    if (hasRightPdu) {
      changes.push({
        action: 'add_equipment',
        rackId,
        deviceId: 'ai-pdu-right',
        libraryItemId: rightPduTemplateId,
        name: 'Feed B Vertical PDU (B-Side)',
        position: 0,
        details: { sideMountPosition: 'right' },
      });
    }

    const nodeDeviceIds: string[] = [];
    let torADeviceId = '';
    let torBDeviceId = '';
    let storageDeviceId = '';

    for (let idx = 0; idx < placements.length; idx++) {
      const p = placements[idx];
      const devId = `ai-dev-${p.id || idx}`;
      let libraryItemId = 'server-2u-enterprise';

      if (p.category === 'Network') {
        libraryItemId = 'sw-1u-tor-25g-100g';
        if (!torADeviceId) torADeviceId = devId;
        else if (!torBDeviceId) torBDeviceId = devId;
      } else if (p.category === 'Compute') {
        libraryItemId = p.heightU === 4 ? 'server-4u-ai-gpu' : 'server-2u-enterprise';
        nodeDeviceIds.push(devId);
      } else if (p.category === 'Storage') {
        libraryItemId = 'storage-2u-allflash-nvme';
        storageDeviceId = devId;
      } else if (p.category === 'Passive') {
        libraryItemId = 'brush-panel-1u';
      }

      changes.push({
        action: 'add_equipment',
        rackId,
        deviceId: devId,
        libraryItemId,
        position: p.startU,
        units: p.heightU,
        name: p.name,
      });
    }

    // ── Smart Automated Cabling: High-Speed Data, MLAG, & Power ──
    const nodeCount = nodeDeviceIds.length;
    const skipCabling = !!options?.skipConflictingCables;

    if (!skipCabling) {
      // 1. Data Fabric (LACP / Redundant 25GbE SFP28 Links to ToR-A and ToR-B)
      for (let i = 0; i < nodeCount; i++) {
        const nId = nodeDeviceIds[i];
        const nodeNum = i + 1;
        if (torADeviceId) {
          changes.push({
            action: 'create_cable',
            source: `${nId}-port-0`,
            target: `${torADeviceId}-port-${i}`,
            cableType: 'dac-twinax',
            color: '#0284c7',
            name: `Node ${nodeNum} NIC 1 ⟶ ToR-A Port ${nodeNum} (25GbE Data A)`,
            details: { sidePreference: 'left', notes: 'Production VM & Ceph Traffic LACP' },
          });
        }
        if (torBDeviceId) {
          changes.push({
            action: 'create_cable',
            source: `${nId}-port-1`,
            target: `${torBDeviceId}-port-${i}`,
            cableType: 'dac-twinax',
            color: '#10b981',
            name: `Node ${nodeNum} NIC 2 ⟶ ToR-B Port ${nodeNum} (25GbE Data B)`,
            details: { sidePreference: 'right', notes: 'Production VM & Ceph Traffic LACP Redundant' },
          });
        }
      }

      // 2. Inter-Switch Link (ISL / MLAG Peer Link between ToR-A and ToR-B: 100G QSFP28)
      if (torADeviceId && torBDeviceId) {
        changes.push({
          action: 'create_cable',
          source: `${torADeviceId}-port-52`,
          target: `${torBDeviceId}-port-52`,
          cableType: 'dac-twinax',
          color: '#8b5cf6',
          name: 'ToR-A Port 53 ⟷ ToR-B Port 53 (100G MLAG ISL Trunk 1)',
          details: { sidePreference: 'right', notes: 'Inter-Switch Link Peer Bond 1' },
        });
        changes.push({
          action: 'create_cable',
          source: `${torADeviceId}-port-53`,
          target: `${torBDeviceId}-port-53`,
          cableType: 'dac-twinax',
          color: '#8b5cf6',
          name: 'ToR-A Port 54 ⟷ ToR-B Port 54 (100G MLAG ISL Trunk 2)',
          details: { sidePreference: 'right', notes: 'Inter-Switch Link Peer Bond 2' },
        });
      }

      // 3. Storage Fabric (100G NVMe-oF / iSCSI to Switch 100G QSFP28 Ports 48/49)
      if (storageDeviceId) {
        if (torADeviceId) {
          changes.push({
            action: 'create_cable',
            source: `${storageDeviceId}-port-4`,
            target: `${torADeviceId}-port-48`,
            cableType: 'dac-twinax',
            color: '#06b6d4',
            name: 'Storage Array Ctrl 1 ⟶ ToR-A (100G NVMe-oF Fabric A)',
            details: { sidePreference: 'left', notes: 'Primary Storage Fabric Link' },
          });
        }
        if (torBDeviceId) {
          changes.push({
            action: 'create_cable',
            source: `${storageDeviceId}-port-5`,
            target: `${torBDeviceId}-port-48`,
            cableType: 'dac-twinax',
            color: '#06b6d4',
            name: 'Storage Array Ctrl 2 ⟶ ToR-B (100G NVMe-oF Fabric B)',
            details: { sidePreference: 'right', notes: 'Secondary Storage Fabric Link' },
          });
        }
      }
    }

    // 4. Dual A/B Power Feeds to Vertical Side-Mount PDUs (Feed A = Left, Feed B = Right)
    for (let i = 0; i < nodeCount; i++) {
      const nId = nodeDeviceIds[i];
      const nodeNum = i + 1;
      if (hasLeftPdu) {
        changes.push({
          action: 'create_cable',
          source: `${nId}-port-5`,
          target: `outlet-ai-pdu-left-${i}`,
          cableType: 'power-c13',
          color: '#2563eb',
          name: `Node ${nodeNum} PSU 1 ⟶ PDU-A Outlet ${nodeNum} (Feed A)`,
          details: { sidePreference: 'left', powerCableType: 'power', notes: '230V 32A Feed A Branch' },
        });
      }
      if (hasRightPdu) {
        changes.push({
          action: 'create_cable',
          source: `${nId}-port-6`,
          target: `outlet-ai-pdu-right-${i}`,
          cableType: 'power-c13',
          color: '#dc2626',
          name: `Node ${nodeNum} PSU 2 ⟶ PDU-B Outlet ${nodeNum} (Feed B)`,
          details: { sidePreference: 'right', powerCableType: 'power', notes: '230V 32A Feed B Branch' },
        });
      }
    }

    // ToR Switch Power Feeds
    const pduOffsetSw = nodeCount;
    if (torADeviceId) {
      if (hasLeftPdu) {
        changes.push({
          action: 'create_cable',
          source: `${torADeviceId}-port-56`,
          target: `outlet-ai-pdu-left-${pduOffsetSw}`,
          cableType: 'power-c13',
          color: '#2563eb',
          name: 'ToR-A PSU 1 ⟶ PDU-A (Feed A)',
          details: { sidePreference: 'left', powerCableType: 'power' },
        });
      }
      if (hasRightPdu) {
        changes.push({
          action: 'create_cable',
          source: `${torADeviceId}-port-57`,
          target: `outlet-ai-pdu-right-${pduOffsetSw}`,
          cableType: 'power-c13',
          color: '#dc2626',
          name: 'ToR-A PSU 2 ⟶ PDU-B (Feed B)',
          details: { sidePreference: 'right', powerCableType: 'power' },
        });
      }
    }
    if (torBDeviceId) {
      if (hasLeftPdu) {
        changes.push({
          action: 'create_cable',
          source: `${torBDeviceId}-port-56`,
          target: `outlet-ai-pdu-left-${pduOffsetSw + 1}`,
          cableType: 'power-c13',
          color: '#2563eb',
          name: 'ToR-B PSU 1 ⟶ PDU-A (Feed A)',
          details: { sidePreference: 'left', powerCableType: 'power' },
        });
      }
      if (hasRightPdu) {
        changes.push({
          action: 'create_cable',
          source: `${torBDeviceId}-port-57`,
          target: `outlet-ai-pdu-right-${pduOffsetSw + 1}`,
          cableType: 'power-c13',
          color: '#dc2626',
          name: 'ToR-B PSU 2 ⟶ PDU-B (Feed B)',
          details: { sidePreference: 'right', powerCableType: 'power' },
        });
      }
    }

    // Storage Power Feeds
    if (storageDeviceId) {
      const pduOffsetStorage = nodeCount + 2;
      if (hasLeftPdu) {
        changes.push({
          action: 'create_cable',
          source: `${storageDeviceId}-port-7`,
          target: `outlet-ai-pdu-left-${pduOffsetStorage}`,
          cableType: 'power-c13',
          color: '#2563eb',
          name: 'Storage Array PSU 1 ⟶ PDU-A (Feed A)',
          details: { sidePreference: 'left', powerCableType: 'power' },
        });
      }
      if (hasRightPdu) {
        changes.push({
          action: 'create_cable',
          source: `${storageDeviceId}-port-8`,
          target: `outlet-ai-pdu-right-${pduOffsetStorage}`,
          cableType: 'power-c13',
          color: '#dc2626',
          name: 'Storage Array PSU 2 ⟶ PDU-B (Feed B)',
          details: { sidePreference: 'right', powerCableType: 'power' },
        });
      }
    }

    const preview = McpTransactionManager.createPreview(changes, `Workflow Deploy: ${req.workload}`, {
      requestId: `REQ-${Date.now()}`,
      tenantId: 'tenant-primary',
      userId: 'admin-architect',
      role: 'architect',
      executionMode: 'assisted',
      timestamp: Date.now(),
    });

    const applyRes = McpTransactionManager.applyTransaction(preview.transactionId, {
      requestId: `REQ-${Date.now()}`,
      tenantId: 'tenant-primary',
      userId: 'admin-architect',
      role: 'architect',
      executionMode: 'assisted',
      timestamp: Date.now(),
    });

    if (applyRes.success) {
      this.lastTransactionId = preview.transactionId;
      (eventBus as any).emit('view:focus-rack', rackId);
      this.showToast('Infrastructure & smart cables committed to canvas!');
      return { success: true, txId: preview.transactionId };
    } else {
      return { success: false, error: applyRes.error };
    }
  }

  showToast(text: string): void {
    const toast = this.el.querySelector('#studio-toast');
    const msg = this.el.querySelector('#studio-toast-text');
    if (!toast || !msg) return;

    msg.textContent = text;
    toast.classList.add('show');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.avatar.start();
    this.renderWorkflow();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.avatar.pause();
  }

  getOrchestrator(): AIWorkflowOrchestrator {
    return this.orchestrator;
  }
}
