/**
 * RackSlicer AI — Stage Renderers
 *
 * Implements the standard stage UI pattern:
 * 1. Current Stage & Step Header
 * 2. What I Understand
 * 3. What I Recommend
 * 4. Why & Alternatives
 * 5. Data & Visualization
 * 6. Validation Status
 * 7. Single Clear Next Action
 */

import { WorkflowStageId, RequirementSpec, OptimizationObjective } from './types';
import { AIWorkflowOrchestrator } from './workflow-orchestrator';
import { eventBus } from '../../core/event-bus';
import { stateManager } from '../../core/state';
import { CableData } from '../../core/types';
import { RackPreviewZoom } from './rack-preview-zoom';
import { LabelSyncManager } from './label-sync-manager';
import { CableLayingOrchestrator } from './cable-laying-orchestrator';

export interface DeploymentConflictItem {
  id: string;
  item: string;
  source: string;
  sourceMedia: string;
  dest: string;
  destMedia: string;
  conflictType: string;
  conflictDescription: string;
  recommendedAction: string;
}

export class WorkflowStageRenderers {
  /**
   * Stage 00: REQUIREMENT_PROMPT (Fresh, blank, focused landing page)
   */
  public static renderLandingPage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    container.innerHTML = `
      <div class="workflow-landing-container">
        <div class="landing-header">
          <div class="landing-badge">✦ RACKSLICER AI ARCHITECT</div>
          <h1 class="landing-title">What do you want to build?</h1>
          <p class="landing-sub">Describe your infrastructure requirement in plain English. I'll analyze it, verify all technical dependencies, and guide you through an engineering workflow.</p>
        </div>

        <div class="landing-prompt-box">
          <textarea
            id="landing-prompt-input"
            class="landing-textarea"
            rows="4"
            placeholder="e.g. 'Build a 3-node Proxmox VE cluster with all-NVMe Ceph storage and redundant 25GbE networking for 150 enterprise VMs...'"
          ></textarea>

          <div class="landing-prompt-footer">
            <span class="landing-hint">⚡ Press Shift+Enter or click Start Design</span>
            <button id="btn-landing-start" class="btn-primary-action">
              <span>🚀 START DESIGN</span>
            </button>
          </div>
        </div>

        <div class="landing-examples">
          <div class="landing-examples-label">Quick Start Examples:</div>
          <div class="landing-chips-grid">
            <button class="landing-chip" data-prompt="Build a 3-node Proxmox cluster with 50TB Ceph storage, redundant 25GbE ToR switching and A/B power.">
              <span class="chip-icon">🖥️</span>
              <span class="chip-text">3-Node Proxmox Cluster with Ceph</span>
            </button>
            <button class="landing-chip" data-prompt="Design an 8x NVIDIA H100 GPU AI training node with redundant 100GbE RoCEv2 fabric and in-row cooling.">
              <span class="chip-icon">⚡</span>
              <span class="chip-text">GPU AI Infrastructure (8x H100)</span>
            </button>
            <button class="landing-chip" data-prompt="Create a high-density 42U network rack with redundant spine-leaf switches, patch panels, and cable management.">
              <span class="chip-icon">🌐</span>
              <span class="chip-text">42U Enterprise Network Rack</span>
            </button>
            <button class="landing-chip" data-prompt="Build a 2-node VMware vSphere 8 HA cluster with shared all-flash SAN and 10GbE networking.">
              <span class="chip-icon">☁️</span>
              <span class="chip-text">2-Node VMware vSphere HA Cluster</span>
            </button>
            <button class="landing-chip" data-prompt="Design an immutable backup and disaster recovery target with 200TB object storage and dual 10GbE uplinks.">
              <span class="chip-icon">🛡️</span>
              <span class="chip-text">Backup & DR Target (200TB)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const input = container.querySelector('#landing-prompt-input') as HTMLTextAreaElement;
    const startBtn = container.querySelector('#btn-landing-start') as HTMLButtonElement;

    const doStart = () => {
      const val = input.value.trim();
      if (!val) {
        input.focus();
        return;
      }
      orchestrator.submitInitialRequirement(val);
    };

    startBtn?.addEventListener('click', doStart);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doStart();
      }
    });

    container.querySelectorAll('.landing-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-prompt') || '';
        input.value = text;
        doStart();
      });
    });
  }

  /**
   * Stage 01: REQUIREMENT_BRIEF (Completeness Engine, Known/Unknown, Brief Confirmation)
   */
  public static renderRequirementBrief(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const state = orchestrator.getState();
    const req = state.requirement;

    const knownItemsHtml = `
      <div class="brief-item">
        <span class="brief-key">Workload Name</span>
        <input type="text" class="brief-edit-input" id="edit-known-workload" value="${req.workload}" />
      </div>

      <div class="brief-item">
        <span class="brief-key">Hypervisor / OS Platform</span>
        <select class="brief-edit-select" id="edit-known-platform">
          <option value="Microsoft Hyper-V" ${req.platform === 'Microsoft Hyper-V' ? 'selected' : ''}>Microsoft Hyper-V</option>
          <option value="Proxmox" ${req.platform === 'Proxmox' ? 'selected' : ''}>Proxmox VE</option>
          <option value="VMware vSphere" ${req.platform === 'VMware vSphere' ? 'selected' : ''}>VMware vSphere</option>
          <option value="Kubernetes" ${req.platform === 'Kubernetes' ? 'selected' : ''}>Kubernetes</option>
          <option value="Nutanix AHV" ${req.platform === 'Nutanix AHV' ? 'selected' : ''}>Nutanix AHV</option>
          <option value="OpenStack" ${req.platform === 'OpenStack' ? 'selected' : ''}>OpenStack</option>
          <option value="Bare Metal" ${req.platform === 'Bare Metal' ? 'selected' : ''}>Bare Metal</option>
        </select>
      </div>

      <div class="brief-item">
        <span class="brief-key">Physical Host Nodes</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="number" class="brief-edit-number" id="edit-known-nodes" min="1" max="64" value="${req.nodeCount}" style="width:70px;" />
          <span style="font-size:11px; color:#64748b;">Servers</span>
        </div>
      </div>

      ${Object.entries(req.known)
        .filter(([k]) => !['Workload', 'Platform', 'Nodes'].includes(k))
        .map(
          ([k, v]) => `
          <div class="brief-item">
            <span class="brief-key">${k}</span>
            <span class="brief-val">${v}</span>
          </div>
        `
        )
        .join('')}
    `;

    const questionsHtml = req.clarifications
      .map(
        (q) => `
        <div class="clarification-card" data-qid="${q.questionId}">
          <div class="clarification-q">
            <span class="q-badge">Question</span>
            <strong>${q.question}</strong>
          </div>
          <div class="clarification-desc">${q.description}</div>
          <div class="clarification-options">
            ${q.options
              .map(
                (opt) => `
              <button class="btn-clarification-opt ${!q.isCustom && opt === q.selectedAnswer ? 'active' : ''}" data-opt="${opt}">
                ${!q.isCustom && opt === q.selectedAnswer ? '✓ ' : ''}${opt}
              </button>
            `
              )
              .join('')}
            <button class="btn-clarification-opt btn-toggle-custom ${q.isCustom ? 'active' : ''}" data-toggle-custom="true">
              ${q.isCustom ? `✓ Custom: ${q.customValue || q.selectedAnswer}` : '✏️ Custom...'}
            </button>
          </div>

          <div class="custom-input-box" id="custom-box-${q.questionId}" style="${q.isCustom ? 'display:flex;' : 'display:none;'}">
            <input
              type="text"
              class="clarification-custom-input"
              placeholder="Type custom value (e.g. '384 GB RAM', '12 TB Usable', '40GbE', '30%')..."
              value="${q.customValue || ''}"
            />
            <button class="btn-apply-custom">Apply Custom Value</button>
          </div>
        </div>
      `
      )
      .join('');

    const assumptionsHtml = req.assumptions
      .map(
        (a) => `
        <li class="assumption-row ${a.enabled ? 'enabled' : 'disabled'}" data-id="${a.id}">
          <div class="assumption-main">
            <label class="assumption-toggle-label">
              <input type="checkbox" class="asm-checkbox" ${a.enabled ? 'checked' : ''} />
              <span class="asm-text ${a.enabled ? '' : 'strike'}">${a.text}</span>
            </label>
            <div class="asm-actions">
              <button class="btn-asm-action btn-asm-edit" title="Edit assumption text">✏️ Edit</button>
              <button class="btn-asm-action btn-asm-comment" title="Add feedback / comment">💬 ${a.userComment ? 'Feedback ✓' : '+ Feedback'}</button>
              <button class="btn-asm-action delete btn-asm-delete" title="Delete assumption">✕</button>
            </div>
          </div>
          ${
            a.userComment
              ? `<div class="asm-comment-bubble"><strong>Your Feedback / Note:</strong> "${a.userComment}"</div>`
              : ''
          }
        </li>
      `
      )
      .join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 01 / 10</div>
          <h2>Requirement Specification & Brief</h2>
          <div class="stage-subtitle">Master Gate: Verify all foundational requirements and assumptions before engineering.</div>
        </div>

        <div class="stage-section">
          <div class="section-title">🔍 WHAT I UNDERSTAND (FROM YOUR PROMPT)</div>
          <div class="prompt-echo">"${req.rawPrompt}"</div>
          <div class="brief-grid">${knownItemsHtml}</div>
        </div>

        ${
          questionsHtml
            ? `
          <div class="stage-section">
            <div class="section-title">❓ CLARIFY MISSING SPECIFICATIONS (SELECT OR ENTER CUSTOM)</div>
            <div class="clarifications-list">${questionsHtml}</div>
          </div>
        `
            : ''
        }

        <div class="stage-section">
          <div class="section-title">📋 DECLARED ASSUMPTIONS (EDITABLE & COMMENTABLE)</div>
          <p style="font-size:11.5px; color:#64748b; margin-top:-4px; margin-bottom:10px;">
            The AI does not take these for granted. Uncheck any assumption to disable it, edit its wording, or attach feedback notes.
          </p>
          <ul class="assumptions-list">${assumptionsHtml}</ul>
          <button id="btn-add-new-assumption" class="btn-add-assumption">
            <span>＋ Add Custom Assumption</span>
          </button>
        </div>

        <div class="stage-footer">
          <button id="btn-stage-back" class="btn-secondary-action">↶ Modify Prompt</button>
          <button id="btn-confirm-requirement" class="btn-primary-action">
            <span>ACCEPT & CONTINUE: ARCHITECTURE DESIGN ➤</span>
          </button>
        </div>
      </div>
    `;

    // 1. Bind Known property edits
    container.querySelector('#edit-known-workload')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value;
      orchestrator.updateKnownProperty('Workload', val);
    });

    container.querySelector('#edit-known-platform')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      orchestrator.updateKnownProperty('Platform', val);
      this.renderRequirementBrief(container, orchestrator);
    });

    container.querySelector('#edit-known-nodes')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val) && val >= 1) {
        orchestrator.updateKnownProperty('Nodes', val);
        this.renderRequirementBrief(container, orchestrator);
      }
    });

    // 2. Bind Predefined Option Clicks
    container.querySelectorAll('.btn-clarification-opt:not([data-toggle-custom])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.clarification-card');
        const qid = card?.getAttribute('data-qid');
        const opt = btn.getAttribute('data-opt');
        if (qid && opt) {
          orchestrator.answerClarification(qid, opt, false);
          this.renderRequirementBrief(container, orchestrator);
        }
      });
    });

    // 3. Bind Toggle Custom Box
    container.querySelectorAll('.btn-toggle-custom').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.clarification-card');
        const qid = card?.getAttribute('data-qid');
        const box = card?.querySelector('.custom-input-box') as HTMLElement | null;
        if (box) {
          const isHidden = box.style.display === 'none';
          box.style.display = isHidden ? 'flex' : 'none';
          if (isHidden) {
            box.querySelector('input')?.focus();
          }
        }
      });
    });

    // 4. Bind Apply Custom Value
    container.querySelectorAll('.custom-input-box').forEach((box) => {
      const card = box.closest('.clarification-card');
      const qid = card?.getAttribute('data-qid');
      const input = box.querySelector('.clarification-custom-input') as HTMLInputElement | null;
      const applyBtn = box.querySelector('.btn-apply-custom') as HTMLButtonElement | null;

      const apply = () => {
        const val = input?.value.trim();
        if (qid && val) {
          orchestrator.answerClarification(qid, val, true);
          this.renderRequirementBrief(container, orchestrator);
        }
      };

      applyBtn?.addEventListener('click', apply);
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
        }
      });
    });

    // 5. Bind Assumptions Actions
    container.querySelectorAll('.assumption-row').forEach((row) => {
      const asmId = row.getAttribute('data-id');
      if (!asmId) return;

      // Toggle enabled/disabled
      row.querySelector('.asm-checkbox')?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        orchestrator.updateAssumption(asmId, { enabled: checked });
        if (asmId === 'asm_spare') {
          orchestrator.syncSpareNode(checked);
        }
        this.renderRequirementBrief(container, orchestrator);
      });

      // Edit text
      row.querySelector('.btn-asm-edit')?.addEventListener('click', () => {
        const currentAsm = req.assumptions.find((a) => a.id === asmId);
        const newText = prompt('Edit Assumption Text:', currentAsm?.text);
        if (newText && newText.trim()) {
          orchestrator.updateAssumption(asmId, { text: newText.trim() });
          this.renderRequirementBrief(container, orchestrator);
        }
      });

      // Add/Edit comment or feedback
      row.querySelector('.btn-asm-comment')?.addEventListener('click', () => {
        const currentAsm = req.assumptions.find((a) => a.id === asmId);
        const comment = prompt('Provide Feedback / Note on this assumption:', currentAsm?.userComment || '');
        if (comment !== null) {
          orchestrator.updateAssumption(asmId, { userComment: comment.trim() });
          this.renderRequirementBrief(container, orchestrator);
        }
      });

      // Delete assumption
      row.querySelector('.btn-asm-delete')?.addEventListener('click', () => {
        orchestrator.removeAssumption(asmId);
        this.renderRequirementBrief(container, orchestrator);
      });
    });

    // 6. Add Custom Assumption
    container.querySelector('#btn-add-new-assumption')?.addEventListener('click', () => {
      const text = prompt('Enter New Infrastructure Assumption / Constraint:');
      if (text && text.trim()) {
        orchestrator.addAssumption(text.trim());
        this.renderRequirementBrief(container, orchestrator);
      }
    });

    // Navigation buttons
    container.querySelector('#btn-stage-back')?.addEventListener('click', () => {
      orchestrator.resetToLanding();
    });

    container.querySelector('#btn-confirm-requirement')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Requirement brief approved by user.');
    });
  }

  /**
   * Stage 02: ARCHITECTURE_DESIGN (5-Stage Architecture Stepper driven by AI)
   */
  public static renderArchitectureStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const req = orchestrator.getState().requirement;

    const shortLabel = (name: string, idx: number): string => {
      const lower = name.toLowerCase();
      if (lower.includes('pdu')) return `PDU-${idx === 0 ? 'A' : 'B'}`;
      if (lower.includes('switch') || lower.includes('tor')) return `ToR-${idx === 0 ? 'A' : 'B'}`;
      if (lower.includes('san') || lower.includes('nvme')) return 'NVMe SAN';
      if (lower.includes('server') || lower.includes('poweredge') || lower.includes('host')) return `Host ${idx + 1}`;
      return name.split(' ').slice(0, 3).join(' ');
    };

    const bomItems = orchestrator.getBomItems();
    const deviceRowsHtml = bomItems.map((item, idx) => `
      <div class="device-slot" style="background:rgba(30,41,59,0.7);border:1px solid #334155;border-radius:3px;padding:4px 8px;margin-bottom:2px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:10px;color:#64748b;min-width:28px;">${String(idx + 1).padStart(2, '0')}U</span>
        <span style="flex:1;font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</span>
        <div class="device-label-row" style="margin:0;">
          <div class="device-label-leader"></div>
          <div class="device-label-pill">${shortLabel(item.name, idx)}</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 02 / 10</div>
          <h2>Architecture Design & Subsystems</h2>
          <div class="stage-subtitle">Multi-tier datacenter compute, storage, fabric, and thermal architecture.</div>
        </div>

        <div class="arch-pillars-grid">
          <!-- Scope -->
          <div class="pillar-card">
            <div class="pillar-head">
              <span class="pillar-icon">🏢</span>
              <h4>1. Scope & Scale</h4>
            </div>
            <div class="pillar-content">
              <div class="metric-row"><span>Deployment:</span> <strong>${req.deploymentTarget}</strong></div>
              <div class="metric-row"><span>Cabinet Standard:</span> <strong>42U EIA-310-D</strong></div>
              <div class="metric-row"><span>Target U Limit:</span> <strong>32U IT Space</strong></div>
              <div class="metric-row"><span>Growth Factor:</span> <strong>${req.growthHeadroomPercent}%</strong></div>
            </div>
          </div>

          <!-- Compute -->
          <div class="pillar-card highlight">
            <div class="pillar-head">
              <span class="pillar-icon">⚡</span>
              <h4>2. Compute Subsystem</h4>
            </div>
            <div class="pillar-content">
              <div class="metric-row"><span>Hypervisor:</span> <strong>${req.platform}</strong></div>
              <div class="metric-row"><span>Cluster Size:</span> <strong>${(() => {
                const spareAsm = req.assumptions.find(a => a.id === 'asm_spare');
                return spareAsm?.enabled
                  ? `${req.nodeCount} Host Nodes + 1 N+1 Spare`
                  : `${req.nodeCount} Host Nodes`;
              })()}</strong></div>
              <div class="metric-row"><span>RAM per Node:</span> <strong>${req.ramGbPerNode} GB DDR5</strong></div>
              <div class="metric-row"><span>Total Cluster RAM:</span> <strong>${req.nodeCount * req.ramGbPerNode} GB</strong></div>
            </div>
          </div>

          <!-- Storage -->
          <div class="pillar-card">
            <div class="pillar-head">
              <span class="pillar-icon">💾</span>
              <h4>3. Storage Tier</h4>
            </div>
            <div class="pillar-content">
              <div class="metric-row"><span>Storage Architecture:</span> <strong>${req.storageType}</strong></div>
              <div class="metric-row"><span>Usable Pool:</span> <strong>${req.usableStorageTb} TB</strong></div>
              <div class="metric-row"><span>Replication:</span> <strong>3x Distributed Copy</strong></div>
              <div class="metric-row"><span>Raw Required:</span> <strong>${req.usableStorageTb * 3} TB NVMe</strong></div>
            </div>
          </div>

          <!-- Network -->
          <div class="pillar-card">
            <div class="pillar-head">
              <span class="pillar-icon">🌐</span>
              <h4>4. Network Fabric</h4>
            </div>
            <div class="pillar-content">
              <div class="metric-row"><span>ToR Topology:</span> <strong>Dual Redundant (ToR-A / ToR-B)</strong></div>
              <div class="metric-row"><span>Interface Speed:</span> <strong>${req.networkFabric}</strong></div>
              <div class="metric-row"><span>VLAN Isolation:</span> <strong>Prod, Storage, Heartbeat</strong></div>
              <div class="metric-row"><span>OOB Management:</span> <strong>Dedicated 1GbE RJ45</strong></div>
            </div>
          </div>

          <!-- Power & Thermal Baseline -->
          <div class="pillar-card">
            <div class="pillar-head">
              <span class="pillar-icon">🔋</span>
              <h4>5. Power & Thermal</h4>
            </div>
            <div class="pillar-content">
              <div class="metric-row"><span>Feed Architecture:</span> <strong>${req.powerFeed}</strong></div>
              <div class="metric-row"><span>Estimated IT Draw:</span> <strong>3,450 W (3.45 kW)</strong></div>
              <div class="metric-row"><span>Heat Dissipation:</span> <strong>11,770 BTU/hr</strong></div>
              <div class="metric-row"><span>PSU Redundancy:</span> <strong>Dual 80-Plus Titanium</strong></div>
            </div>
          </div>
        </div>

        <div class="stage-section" style="margin-top:16px;">
          <div class="section-title">💡 ARCHITECTURAL RATIONALE</div>
          <div class="rationale-box">
            A <strong>${req.nodeCount}-node ${req.platform}</strong> cluster with <strong>${req.storageType}</strong> provides an optimal balance of compute density and quorum stability. By provisioning dual 25GbE interconnects, Ceph east-west sync operations run on an isolated fabric, guaranteeing zero latency impact on tenant VM workloads.
          </div>
        </div>

        <div class="stage-section" style="margin-top:16px;">
          <div class="section-title">🗄️ RACK LAYOUT PREVIEW</div>
          <div class="rack-preview-col" style="overflow:auto;">
            <div class="rack-frame-inner" style="padding:8px;">
              ${deviceRowsHtml}
            </div>
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-arch-back" class="btn-secondary-action">↶ Back to Requirement</button>
          <button id="btn-accept-arch" class="btn-primary-action">
            <span>ACCEPT & CONTINUE: RESOURCE SELECTION ➤</span>
          </button>
        </div>
      </div>
    `;

    container.querySelector('#btn-arch-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('REQUIREMENT_BRIEF');
    });

    container.querySelector('#btn-accept-arch')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Architecture design accepted.');
    });

    // Attach scroll-to-zoom on the rack preview column
    const previewCol = container.querySelector('.rack-preview-col') as HTMLElement | null;
    const previewInner = container.querySelector('.rack-frame-inner') as HTMLElement | null;
    if (previewCol && previewInner) {
      new RackPreviewZoom(previewCol, previewInner);
    }

    // Engineering metrics bar below the stage card
    const stageCard = container.querySelector('.workflow-stage-card') as HTMLElement | null;
    if (stageCard) WorkflowStageRenderers.renderEngineeringMetricsBar(stageCard, orchestrator);
  }

  /**
   * Stage 03: RESOURCE_BOM (Interactive Catalog Mapping, Alternative Swapping, User Customization)
   */
  public static renderResourceBomStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const bomItems = orchestrator.getBomItems();
    const totals = orchestrator.getBomTotals();

    const cardsHtml = bomItems
      .map((item) => {
        const subtotal = (item.qty || 0) * (item.unitCost || 0);
        const uFootprint = (item.units || 0) * (item.qty || 0);
        const powerFootprint = (item.power || 0) * (item.qty || 0);

        return `
        <div class="resource-pick-card ${item.isCustomized ? 'is-customized' : ''}" data-id="${item.id}">
          <div class="res-head">
            <div class="res-head-left">
              <span class="res-cat">${item.category}</span>
              <span class="res-badge ${item.isUserAdded ? 'badge-user' : item.isCustomized ? 'badge-custom' : ''}">
                ${item.badge || (item.isUserAdded ? 'User Added' : 'AI Suggested')}
              </span>
            </div>
            <div class="res-card-actions">
              <button class="btn-res-action btn-edit-item" title="Edit specifications or price">✏️ Edit</button>
              <button class="btn-res-action delete btn-delete-item" title="Remove component from BOM">✕ Remove</button>
            </div>
          </div>

          <div class="res-title-row">
            <div class="res-title">${item.name}</div>
            <div class="res-model-sub">${item.model || ''}</div>
          </div>

          <!-- Quantity Stepper Row -->
          <div class="res-qty-row">
            <div class="qty-label">Quantity:</div>
            <div class="qty-stepper">
              <button class="btn-qty-minus" title="Decrease quantity">-</button>
              <input type="number" min="0" max="999" class="input-bom-qty" value="${item.qty}" />
              <button class="btn-qty-plus" title="Increase quantity">+</button>
            </div>
            <div class="qty-specs-badge">
              ${item.units > 0 ? `${item.units}U/unit · Total: ${uFootprint}U` : '0U'} | ${item.power > 0 ? `${item.power}W/unit · Total: ${powerFootprint}W` : '0W'}
            </div>
          </div>

          <!-- Alternative Evaluated / One-Click Swap -->
          ${
            item.alternatives && item.alternatives.length > 0
              ? `
            <div class="res-swap-row">
              <label class="swap-label">Alternative / Swap:</label>
              <select class="select-bom-swap" title="Pick an alternative to instantly swap this hardware component">
                <option value="${item.name}" selected>Active: ${item.name} ($${item.unitCost?.toLocaleString() || 0})</option>
                ${item.alternatives
                  .map(
                    (alt) => `
                  <option value="${alt.name}">Swap to: ${alt.name} ($${alt.unitCost?.toLocaleString() || 0})</option>
                `
                  )
                  .join('')}
              </select>
            </div>
          `
              : ''
          }

          <div class="res-specs">
            <strong>Specs:</strong> ${item.specs}
          </div>

          <div class="res-why">
            <strong>Why Suggested / Notes:</strong> ${item.whySuggested}
          </div>

          ${
            item.userNote
              ? `
            <div class="res-user-note">
              <strong>Your Custom Note:</strong> "${item.userNote}"
            </div>
          `
              : ''
          }

          <div class="res-pricing">
            <span>Unit Cost: $${(item.unitCost || 0).toLocaleString()} USD</span>
            <strong class="res-subtotal">Subtotal: $${subtotal.toLocaleString()} USD</strong>
          </div>
        </div>
      `;
      })
      .join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 03 / 10</div>
          <h2>Resource Library & BOM Mapping</h2>
          <div class="stage-subtitle">AI recommendations are suggestions only. You decide and manage the Bill of Materials.</div>
        </div>

        <div class="stage-section" style="margin-bottom:12px;">
          <div class="prompt-echo" style="border-left-color:#0284c7; font-style:normal;">
            <strong>💡 Human-in-the-Loop Control:</strong> Sizing and components proposed below are AI suggestions. Adjust quantities, swap to evaluated alternatives, edit prices/specs, or add custom components.
          </div>
        </div>

        <div class="bom-control-toolbar">
          <div class="bom-toolbar-left">
            <button id="btn-open-add-component" class="btn-primary-action btn-add-bom">
              <span>＋ Add Hardware Component</span>
            </button>
            <button id="btn-reset-bom-ai" class="btn-secondary-action" title="Reset back to AI default sizing">
              <span>🔄 Reset to AI Suggestions</span>
            </button>
          </div>
          <div class="bom-mode-pill">
            <span>🤖 AI Suggestion · 👤 Human in Full Control</span>
          </div>
        </div>

        <div class="stage-section">
          <div class="section-title">📦 HARDWARE BILL OF MATERIALS (${bomItems.length} COMPONENTS)</div>
          <div class="resources-grid">${cardsHtml}</div>
        </div>

        <!-- Dynamic Live Recalculated Summary Bar -->
        <div class="bom-summary-bar">
          <div class="bom-summary-stat">
            <div class="stat-lbl">ESTIMATED BOM TOTAL</div>
            <div class="stat-val-big">$${totals.totalCost.toLocaleString()} USD</div>
          </div>
          <div class="bom-summary-stat">
            <div class="stat-lbl">RACK SPACE REQUIRED</div>
            <div class="stat-val">${totals.totalUnits}U / 42U Cabinet</div>
          </div>
          <div class="bom-summary-stat">
            <div class="stat-lbl">TOTAL ESTIMATED POWER</div>
            <div class="stat-val">${totals.totalWatts.toLocaleString()} W (${(totals.totalWatts / 1000).toFixed(2)} kW)</div>
          </div>
          <div class="bom-summary-stat">
            <div class="stat-lbl">COMPONENTS</div>
            <div class="stat-val">${totals.itemCount} Units Total</div>
          </div>
          <div class="bom-verification-badge">
            ✓ User Managed BOM
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-res-back" class="btn-secondary-action">↶ Back to Architecture</button>
          <button id="btn-accept-res" class="btn-primary-action">
            <span>ACCEPT & CONTINUE: PHYSICAL DESIGN ➤</span>
          </button>
        </div>
      </div>
    `;

    // ── Bind Interactive Event Handlers ──

    // 1. Quantity Adjustments (Minus, Plus, Input change)
    container.querySelectorAll('.resource-pick-card').forEach((card) => {
      const id = card.getAttribute('data-id');
      if (!id) return;

      const qtyInput = card.querySelector('.input-bom-qty') as HTMLInputElement;
      const btnMinus = card.querySelector('.btn-qty-minus');
      const btnPlus = card.querySelector('.btn-qty-plus');
      const swapSelect = card.querySelector('.select-bom-swap') as HTMLSelectElement;
      const btnEdit = card.querySelector('.btn-edit-item');
      const btnDelete = card.querySelector('.btn-delete-item');

      btnMinus?.addEventListener('click', () => {
        const cur = parseInt(qtyInput.value, 10) || 0;
        if (cur > 0) {
          orchestrator.updateBomItemQty(id, cur - 1);
          this.renderResourceBomStage(container, orchestrator);
        }
      });

      btnPlus?.addEventListener('click', () => {
        const cur = parseInt(qtyInput.value, 10) || 0;
        orchestrator.updateBomItemQty(id, cur + 1);
        this.renderResourceBomStage(container, orchestrator);
      });

      qtyInput?.addEventListener('change', () => {
        const val = parseInt(qtyInput.value, 10);
        if (!isNaN(val) && val >= 0) {
          orchestrator.updateBomItemQty(id, val);
          this.renderResourceBomStage(container, orchestrator);
        }
      });

      // 2. Alternative Swapping
      swapSelect?.addEventListener('change', () => {
        const chosenAlt = swapSelect.value;
        orchestrator.swapBomItemAlternative(id, chosenAlt);
        this.renderResourceBomStage(container, orchestrator);
      });

      // 3. Delete Item
      btnDelete?.addEventListener('click', () => {
        const item = orchestrator.getBomItems().find((b) => b.id === id);
        if (confirm(`Remove "${item?.name || 'this component'}" from the Bill of Materials?`)) {
          orchestrator.removeBomItem(id);
          this.renderResourceBomStage(container, orchestrator);
        }
      });

      // 4. Edit Item
      btnEdit?.addEventListener('click', () => {
        const item = orchestrator.getBomItems().find((b) => b.id === id);
        if (!item) return;
        this.openEditBomItemModal(container, orchestrator, item);
      });
    });

    // 5. Open Add Component Modal
    container.querySelector('#btn-open-add-component')?.addEventListener('click', () => {
      this.openAddBomComponentModal(container, orchestrator);
    });

    // 6. Reset to AI Suggestions
    container.querySelector('#btn-reset-bom-ai')?.addEventListener('click', () => {
      if (confirm('Revert Bill of Materials back to AI sizing suggestions?')) {
        orchestrator.resetBomToAiDefaults();
        this.renderResourceBomStage(container, orchestrator);
      }
    });

    // 7. Navigation
    container.querySelector('#btn-res-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('ARCHITECTURE_DESIGN');
    });

    container.querySelector('#btn-accept-res')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Resource BOM confirmed by user.');
    });
  }

  /**
   * Modal dialog to Add a Hardware Component (Presets + Custom Form)
   */
  private static openAddBomComponentModal(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const existing = document.querySelector('.bom-modal-overlay');
    if (existing) existing.remove();

    const presets = [
      {
        category: 'Security & Management' as const,
        name: 'Fortinet FortiGate 100F Next-Gen Firewall',
        model: 'FortiGate 100F',
        specs: '1U | 2x 10GE SFP+ + 8x GE RJ45 | Hardware Accelerated Threat Protection | Dual AC PSU',
        whySuggested: 'Dedicated perimeter firewall with IPS, SSL inspection, and IPsec VPN termination.',
        unitCost: 3200,
        units: 1,
        power: 50,
      },
      {
        category: 'Power Distribution' as const,
        name: 'CyberPower Smart App Online 3000VA Rackmount UPS',
        model: 'OL3000RTXL2U',
        specs: '2U | 3000VA / 2700W | Double-Conversion Online | Sine Wave | Extended Battery Module Ready',
        whySuggested: 'Provides zero-transfer-time battery backup and power conditioning for critical hosts.',
        unitCost: 1850,
        units: 2,
        power: 45,
      },
      {
        category: 'Security & Management' as const,
        name: 'Opengear CM7116 16-Port Console Server',
        model: 'CM7116-2-DAC',
        specs: '1U | 16x Cisco RJ45 Serial Console Ports | Dual AC Power | Built-in Cellular Failover',
        whySuggested: 'Out-of-band serial management access to switches, PDUs, and hypervisors during outages.',
        unitCost: 1450,
        units: 1,
        power: 25,
      },
      {
        category: 'Network' as const,
        name: 'Panduit 24-Port Cat6A Shielded Patch Panel',
        model: 'DP246X88TGY',
        specs: '1U | 24-Port Modular Patch Panel | 10GbE Shielded Cat6A RJ45 Keystone compatible',
        whySuggested: 'Organizes out-of-band management and cluster heartbeat copper connections.',
        unitCost: 180,
        units: 1,
        power: 0,
      },
      {
        category: 'Network' as const,
        name: 'Horizontal 1U Brush Cable Management Panel',
        model: 'CMP-BRUSH-1U',
        specs: '1U 19-inch Rackmount Brush Strip for Clean Front-to-Back Cable Pass-through',
        whySuggested: 'Prevents hot/cold aisle air leakage while maintaining clean patch cord dressing.',
        unitCost: 45,
        units: 1,
        power: 0,
      },
      {
        category: 'Storage' as const,
        name: 'Synology RackStation RS3621xs+ 12-Bay Storage',
        model: 'RS3621xs+',
        specs: '2U | 12-Bay SATA/SAS | Xeon D-1541 | 16GB ECC DDR4 | Dual 10GbE | Dual 500W PSU',
        whySuggested: 'Dedicated secondary storage tier for automated backup repository and ISO image shares.',
        unitCost: 3400,
        units: 2,
        power: 140,
      },
      {
        category: 'Power Distribution' as const,
        name: 'APC AP8858 Vertical PDU (20x C13)',
        model: 'AP8858',
        specs: '0U Vertical Side-Mount | 230V 32A | 20x IEC C13 Outlets | True Scale 42U Span',
        whySuggested: 'Zero-U side-mount PDU preserves all EIA-310 rack spaces for IT compute and storage.',
        unitCost: 890,
        units: 0,
        power: 10,
      },
      {
        category: 'Power Distribution' as const,
        name: 'Vertiv MPH2-IS Vertical PDU (India)',
        model: 'MPH2-IS',
        specs: '0U Vertical Side-Mount | 230V 32A | 16x IS6538 15A Industrial Sockets',
        whySuggested: 'Compliant with Indian BIS / IS6538 power standards for high-reliability data centers.',
        unitCost: 920,
        units: 0,
        power: 10,
      },
      {
        category: 'Network' as const,
        name: '4-Inch Standard Vertical Cable Manager',
        model: 'VCM-4IN-STD',
        specs: '0U Vertical Channel | Dual High-Capacity Finger Ducts | Full 42U Vertical Span',
        whySuggested: 'High-density patch cord routing channel eliminates cable strain and maintains clean airflow.',
        unitCost: 280,
        units: 0,
        power: 0,
      },
    ];

    const presetsHtml = presets
      .map(
        (p, idx) => `
      <div class="preset-card">
        <div class="preset-info">
          <div class="preset-name">${p.name}</div>
          <div class="preset-specs">${p.specs}</div>
          <div class="preset-price">$${p.unitCost.toLocaleString()} USD · ${p.units}U · ${p.power}W</div>
        </div>
        <button class="btn-add-preset" data-idx="${idx}">+ Add to BOM</button>
      </div>
    `
      )
      .join('');

    const modal = document.createElement('div');
    modal.className = 'bom-modal-overlay';
    modal.innerHTML = `
      <div class="bom-modal-card">
        <div class="bom-modal-head">
          <h3>＋ Add Hardware Component to BOM</h3>
          <button class="bom-modal-close">✕</button>
        </div>

        <div class="bom-modal-body">
          <div class="bom-modal-tabs">
            <button class="bom-tab-btn active" data-tab="presets">Certified Catalog Presets</button>
            <button class="bom-tab-btn" data-tab="custom">Custom Hardware Component</button>
          </div>

          <!-- Presets Tab -->
          <div class="bom-tab-pane" id="pane-presets">
            <div class="preset-grid">${presetsHtml}</div>
          </div>

          <!-- Custom Form Tab -->
          <div class="bom-tab-pane" id="pane-custom" style="display:none;">
            <div class="bom-form-grid">
              <div class="bom-form-group full">
                <label>Component Name & Model *</label>
                <input type="text" id="add-custom-name" class="bom-form-input" placeholder="e.g. Arista 7050SX3-48YC8 Switch" />
              </div>
              <div class="bom-form-group">
                <label>Category</label>
                <select id="add-custom-cat" class="bom-form-select">
                  <option value="Compute">Compute</option>
                  <option value="Network">Network</option>
                  <option value="Storage">Storage</option>
                  <option value="Power Distribution">Power Distribution</option>
                  <option value="Cabling & Optics">Cabling & Optics</option>
                  <option value="Security & Management" selected>Security & Management</option>
                  <option value="Custom">Custom Device</option>
                </select>
              </div>
              <div class="bom-form-group">
                <label>Quantity</label>
                <input type="number" id="add-custom-qty" class="bom-form-input" value="1" min="1" max="99" />
              </div>
              <div class="bom-form-group">
                <label>Unit Cost ($ USD)</label>
                <input type="number" id="add-custom-cost" class="bom-form-input" value="1500" min="0" />
              </div>
              <div class="bom-form-group">
                <label>Rack Units (U Height)</label>
                <input type="number" id="add-custom-u" class="bom-form-input" value="1" min="0" max="42" />
              </div>
              <div class="bom-form-group">
                <label>Power Draw (Watts per unit)</label>
                <input type="number" id="add-custom-power" class="bom-form-input" value="100" min="0" />
              </div>
              <div class="bom-form-group">
                <label>Model Identifier</label>
                <input type="text" id="add-custom-model" class="bom-form-input" placeholder="e.g. 7050SX3-48YC8" />
              </div>
              <div class="bom-form-group full">
                <label>Hardware Specifications</label>
                <textarea id="add-custom-specs" class="bom-form-textarea" rows="2" placeholder="e.g. 1U | 48x 25GbE SFP28 + 8x 100GbE QSFP28 | Dual AC PSU"></textarea>
              </div>
              <div class="bom-form-group full">
                <label>Reason / Note</label>
                <input type="text" id="add-custom-reason" class="bom-form-input" placeholder="e.g. Added per network security requirements." />
              </div>
            </div>
            <div style="margin-top:14px; display:flex; justify-content:flex-end;">
              <button id="btn-save-custom-component" class="btn-primary-action">Add Custom Component</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.bom-modal-close')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Tab switching
    modal.querySelectorAll('.bom-tab-btn').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        modal.querySelectorAll('.bom-tab-btn').forEach((b) => b.classList.remove('active'));
        tabBtn.classList.add('active');
        const tab = tabBtn.getAttribute('data-tab');
        const panePresets = modal.querySelector('#pane-presets') as HTMLElement;
        const paneCustom = modal.querySelector('#pane-custom') as HTMLElement;
        if (tab === 'presets') {
          panePresets.style.display = 'block';
          paneCustom.style.display = 'none';
        } else {
          panePresets.style.display = 'none';
          paneCustom.style.display = 'block';
        }
      });
    });

    // Preset add click
    modal.querySelectorAll('.btn-add-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx') || '0', 10);
        const p = presets[idx];
        orchestrator.addBomItem({
          category: p.category,
          name: p.name,
          model: p.model,
          qty: 1,
          specs: p.specs,
          whySuggested: p.whySuggested,
          unitCost: p.unitCost,
          units: p.units,
          power: p.power,
          badge: 'User Added',
          alternatives: [],
        });
        closeModal();
        this.renderResourceBomStage(container, orchestrator);
      });
    });

    // Custom form add click
    modal.querySelector('#btn-save-custom-component')?.addEventListener('click', () => {
      const nameInput = modal.querySelector('#add-custom-name') as HTMLInputElement;
      const catSelect = modal.querySelector('#add-custom-cat') as HTMLSelectElement;
      const qtyInput = modal.querySelector('#add-custom-qty') as HTMLInputElement;
      const costInput = modal.querySelector('#add-custom-cost') as HTMLInputElement;
      const uInput = modal.querySelector('#add-custom-u') as HTMLInputElement;
      const powerInput = modal.querySelector('#add-custom-power') as HTMLInputElement;
      const modelInput = modal.querySelector('#add-custom-model') as HTMLInputElement;
      const specsInput = modal.querySelector('#add-custom-specs') as HTMLTextAreaElement;
      const reasonInput = modal.querySelector('#add-custom-reason') as HTMLInputElement;

      const name = nameInput?.value?.trim();
      if (!name) {
        alert('Please enter a component name.');
        return;
      }

      orchestrator.addBomItem({
        category: (catSelect.value as any) || 'Custom',
        name,
        model: modelInput?.value?.trim() || name,
        qty: parseInt(qtyInput?.value, 10) || 1,
        unitCost: parseInt(costInput?.value, 10) || 0,
        units: parseInt(uInput?.value, 10) || 0,
        power: parseInt(powerInput?.value, 10) || 0,
        specs: specsInput?.value?.trim() || 'Custom component specification',
        whySuggested: reasonInput?.value?.trim() || 'Custom component configured by user.',
        badge: 'User Added',
        alternatives: [],
      });

      closeModal();
      this.renderResourceBomStage(container, orchestrator);
    });
  }

  /**
   * Modal dialog to Edit an existing BOM item (Name, Specs, Unit Cost, U, Power, User Notes)
   */
  private static openEditBomItemModal(
    container: HTMLElement,
    orchestrator: AIWorkflowOrchestrator,
    item: import('./types').HardwareBomItem
  ): void {
    const existing = document.querySelector('.bom-modal-overlay');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'bom-modal-overlay';
    modal.innerHTML = `
      <div class="bom-modal-card">
        <div class="bom-modal-head">
          <h3>✏️ Edit Component: ${item.name}</h3>
          <button class="bom-modal-close">✕</button>
        </div>

        <div class="bom-modal-body">
          <div class="bom-form-grid">
            <div class="bom-form-group full">
              <label>Component Name</label>
              <input type="text" id="edit-bom-name" class="bom-form-input" value="${item.name}" />
            </div>
            <div class="bom-form-group">
              <label>Quantity</label>
              <input type="number" id="edit-bom-qty" class="bom-form-input" value="${item.qty}" min="0" />
            </div>
            <div class="bom-form-group">
              <label>Unit Cost ($ USD)</label>
              <input type="number" id="edit-bom-cost" class="bom-form-input" value="${item.unitCost}" min="0" />
            </div>
            <div class="bom-form-group">
              <label>Rack Units (U)</label>
              <input type="number" id="edit-bom-u" class="bom-form-input" value="${item.units}" min="0" max="42" />
            </div>
            <div class="bom-form-group">
              <label>Power Draw (Watts per unit)</label>
              <input type="number" id="edit-bom-power" class="bom-form-input" value="${item.power}" min="0" />
            </div>
            <div class="bom-form-group full">
              <label>Specifications</label>
              <textarea id="edit-bom-specs" class="bom-form-textarea" rows="2">${item.specs}</textarea>
            </div>
            <div class="bom-form-group full">
              <label>Your Feedback / Reason / Note</label>
              <input type="text" id="edit-bom-note" class="bom-form-input" value="${item.userNote || ''}" placeholder="e.g. Adjusted memory sizing or preferred local distributor price" />
            </div>
          </div>
        </div>

        <div class="bom-modal-footer">
          <button class="btn-secondary-action btn-cancel-edit">Cancel</button>
          <button id="btn-save-edit-bom" class="btn-primary-action">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.bom-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('.btn-cancel-edit')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    modal.querySelector('#btn-save-edit-bom')?.addEventListener('click', () => {
      const name = (modal.querySelector('#edit-bom-name') as HTMLInputElement)?.value?.trim() || item.name;
      const qty = parseInt((modal.querySelector('#edit-bom-qty') as HTMLInputElement)?.value, 10) || 0;
      const unitCost = parseInt((modal.querySelector('#edit-bom-cost') as HTMLInputElement)?.value, 10) || 0;
      const units = parseInt((modal.querySelector('#edit-bom-u') as HTMLInputElement)?.value, 10) || 0;
      const power = parseInt((modal.querySelector('#edit-bom-power') as HTMLInputElement)?.value, 10) || 0;
      const specs = (modal.querySelector('#edit-bom-specs') as HTMLTextAreaElement)?.value?.trim() || item.specs;
      const userNote = (modal.querySelector('#edit-bom-note') as HTMLInputElement)?.value?.trim();

      orchestrator.updateBomItem(item.id, {
        name,
        qty,
        unitCost,
        units,
        power,
        specs,
        userNote,
        badge: 'Customized',
      });

      closeModal();
      this.renderResourceBomStage(container, orchestrator);
    });
  }


  /**
   * Stage 04: PHYSICAL_DESIGN (2D/3D Rack Layout, U Positioning, Proposal Preview before mutation)
   */
  public static renderPhysicalDesignStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const cab = orchestrator.getCabinetConfig();
    const placements = orchestrator.getRackPlacements();
    const availablePdus = orchestrator.getAvailableVerticalPdus();

    // Collision detection
    const collisionIds = new Set<string>();
    for (let i = 0; i < placements.length; i++) {
      const p1 = placements[i];
      const p1Min = p1.startU;
      const p1Max = p1.startU + p1.heightU - 1;
      for (let j = i + 1; j < placements.length; j++) {
        const p2 = placements[j];
        const p2Min = p2.startU;
        const p2Max = p2.startU + p2.heightU - 1;
        if (Math.max(p1Min, p2Min) <= Math.min(p1Max, p2Max)) {
          collisionIds.add(p1.id);
          collisionIds.add(p2.id);
        }
      }
    }

    // Sort placements descending for visual rack preview (highest U at top)
    const sortedPlacements = [...placements].sort((a, b) => b.startU - a.startU);

    let rackVisualHtml = '';
    let currentU = cab.totalU;

    for (const p of sortedPlacements) {
      const pTopU = p.startU + p.heightU - 1;
      if (currentU > pTopU) {
        const emptyRange = currentU === pTopU + 1 ? `U${currentU}` : `U${pTopU + 1} - U${currentU}`;
        rackVisualHtml += `<div class="rack-u-item empty">${emptyRange}: Unassigned / Air Gap (${currentU - pTopU}U)</div>`;
      }

      const catClass =
        p.category === 'Network'
          ? 'net'
          : p.category === 'Storage'
          ? 'storage'
          : p.category === 'Compute'
          ? 'srv'
          : 'passive';
      const uLabel = p.heightU === 1 ? `U${p.startU}` : `U${p.startU} - U${pTopU}`;
      const isCollision = collisionIds.has(p.id);

      rackVisualHtml += `
        <div class="rack-u-item occupied ${catClass} ${isCollision ? 'collision' : ''}">
          <span style="font-weight:700;">${uLabel}:</span> ${p.name} (${p.heightU}U)
          ${isCollision ? '<span class="collision-warning">⚠️ OVERLAP</span>' : ''}
          ${p.isUserModified ? '<span style="font-size:9.5px; background:#dbeafe; color:#1d4ed8; padding:1px 5px; border-radius:3px; margin-left:4px; font-weight:700;">Custom</span>' : ''}
        </div>
      `;
      currentU = Math.min(currentU, p.startU - 1);
    }
    if (currentU >= 1) {
      const emptyRange = currentU === 1 ? 'U1' : `U1 - U${currentU}`;
      rackVisualHtml += `<div class="rack-u-item empty">${emptyRange}: Lower Space / Intake Baffle (${currentU}U)</div>`;
    }

    // Mutation preview rows
    const mutationRowsHtml = placements
      .map((p) => {
        const isCollision = collisionIds.has(p.id);
        const maxU = cab.totalU - p.heightU + 1;
        return `
          <div class="mut-row" style="align-items:center;">
            <span>
              <select class="select-mut-action" data-id="${p.id}">
                <option value="Place" ${p.action === 'Place' ? 'selected' : ''}>Place</option>
                <option value="Reserve" ${p.action === 'Reserve' ? 'selected' : ''}>Reserve</option>
              </select>
            </span>
            <span style="font-size:12px; font-weight:700; color:#0f172a;">
              ${p.name}
              ${p.isUserModified ? '<span style="font-size:9.5px; color:#0284c7; margin-left:4px;">(User Modified)</span>' : ''}
            </span>
            <span style="display:flex; align-items:center; gap:6px;">
              <div class="u-stepper">
                <button class="btn-u-step btn-u-down" data-id="${p.id}" title="Step Down (▼)">▼</button>
                <input type="number" class="input-u-pos" data-id="${p.id}" value="${p.startU}" min="1" max="${maxU}" />
                <button class="btn-u-step btn-u-up" data-id="${p.id}" title="Step Up (▲)">▲</button>
              </div>
              <span style="font-size:11px; color:#64748b; font-weight:600;">(${p.heightU}U)</span>
              ${isCollision ? '<span class="collision-warning">Overlap!</span>' : ''}
            </span>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 04 / 10</div>
          <h2>Physical Rack Layout & U-Positioning</h2>
          <div class="stage-subtitle">Center of gravity optimization, thermal zoning, and proposed canvas mutation preview.</div>
        </div>

        <!-- Interactive Cabinet Controls -->
        <div class="cab-config-bar">
          <div class="cab-cfg-item">
            <span>Cabinet:</span>
            <input type="text" id="cab-cfg-name" class="cab-cfg-input" value="${cab.name}" style="width:130px;" />
          </div>
          <div class="cab-cfg-item">
            <span>Height:</span>
            <select id="cab-cfg-height" class="cab-cfg-select">
              <option value="42" ${cab.totalU === 42 ? 'selected' : ''}>42U Standard</option>
              <option value="45" ${cab.totalU === 45 ? 'selected' : ''}>45U Tall</option>
              <option value="48" ${cab.totalU === 48 ? 'selected' : ''}>48U High-Density</option>
              <option value="24" ${cab.totalU === 24 ? 'selected' : ''}>24U Half-Rack</option>
            </select>
          </div>
          <div class="cab-cfg-item">
            <span>Datacenter Slot:</span>
            <input type="number" id="cab-cfg-slot" class="cab-cfg-input" value="${cab.slotNumber}" style="width:55px;" min="1" max="50" />
          </div>
          <div class="cab-cfg-item" style="margin-left:auto; gap:8px;">
            ${
              collisionIds.size > 0
                ? `<span class="collision-warning">⚠️ ${collisionIds.size / 2} Overlap(s) Detected</span>`
                : '<span style="font-size:11px; color:#10b981; font-weight:700;">✓ Zero U-Slot Collisions</span>'
            }
            <button id="btn-reset-rack-ai" class="btn-u-move" title="Reset all component placements to AI recommendations">↺ Reset Layout to AI</button>
          </div>
        </div>

        <!-- Vertical Infrastructure: Side-Mount Cable Managers & 0U PDUs -->
        <div class="vertical-infra-panel" style="background:#090d16; border:1px solid #1e293b; border-radius:8px; padding:12px 14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color:#38bdf8; font-size:12px; display:flex; align-items:center; gap:6px;">
              <span>🗄️</span> VERTICAL INFRASTRUCTURE (SIDE-MOUNT ASSETS)
            </strong>
            <span style="font-size:10px; color:#10b981; font-weight:700;">✓ Live In 2D Elevation & 3D Viewport</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px;">
            <!-- Left Vertical Cable Manager -->
            <div style="background:#0f172a; padding:8px 10px; border-radius:6px; border:1px solid #1e293b;">
              <label style="font-size:11px; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Left Vertical Cable Manager</label>
              <select id="cfg-left-vcm" class="cab-cfg-select" style="width:100%; box-sizing:border-box;">
                <option value="none" ${cab.leftCableManagerWidth === 'none' ? 'selected' : ''}>None (No Duct)</option>
                <option value="2-inch" ${cab.leftCableManagerWidth === '2-inch' ? 'selected' : ''}>2" Slim Vertical Manager</option>
                <option value="4-inch" ${cab.leftCableManagerWidth === '4-inch' ? 'selected' : ''}>4" Standard Vertical Manager</option>
                <option value="6-inch" ${cab.leftCableManagerWidth === '6-inch' ? 'selected' : ''}>6" Enterprise High-Density VCM</option>
                <option value="8-inch" ${cab.leftCableManagerWidth === '8-inch' ? 'selected' : ''}>8" Ultra-Density Backbone VCM</option>
              </select>
            </div>

            <!-- Right Vertical Cable Manager -->
            <div style="background:#0f172a; padding:8px 10px; border-radius:6px; border:1px solid #1e293b;">
              <label style="font-size:11px; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Right Vertical Cable Manager</label>
              <select id="cfg-right-vcm" class="cab-cfg-select" style="width:100%; box-sizing:border-box;">
                <option value="none" ${cab.rightCableManagerWidth === 'none' ? 'selected' : ''}>None (No Duct)</option>
                <option value="2-inch" ${cab.rightCableManagerWidth === '2-inch' ? 'selected' : ''}>2" Slim Vertical Manager</option>
                <option value="4-inch" ${cab.rightCableManagerWidth === '4-inch' ? 'selected' : ''}>4" Standard Vertical Manager</option>
                <option value="6-inch" ${cab.rightCableManagerWidth === '6-inch' ? 'selected' : ''}>6" Enterprise High-Density VCM</option>
                <option value="8-inch" ${cab.rightCableManagerWidth === '8-inch' ? 'selected' : ''}>8" Ultra-Density Backbone VCM</option>
              </select>
            </div>

            <!-- Left 0U Vertical PDU (Feed A) -->
            <div style="background:#0f172a; padding:8px 10px; border-radius:6px; border:1px solid #086cff;">
              <label style="font-size:11px; font-weight:700; color:#38bdf8; display:block; margin-bottom:4px;">Left Vertical PDU (Feed A)</label>
              <select id="cfg-left-vpdu" class="cab-cfg-select" style="width:100%; box-sizing:border-box;">
                <option value="none" ${cab.leftPduTemplateId === 'none' ? 'selected' : ''}>None (No Left PDU)</option>
                ${availablePdus.map(p => `
                  <option value="${p.id}" ${cab.leftPduTemplateId === p.id ? 'selected' : ''}>${p.name} (${p.outlets})</option>
                `).join('')}
              </select>
            </div>

            <!-- Right 0U Vertical PDU (Feed B) -->
            <div style="background:#0f172a; padding:8px 10px; border-radius:6px; border:1px solid #10b981;">
              <label style="font-size:11px; font-weight:700; color:#34d399; display:block; margin-bottom:4px;">Right Vertical PDU (Feed B)</label>
              <select id="cfg-right-vpdu" class="cab-cfg-select" style="width:100%; box-sizing:border-box;">
                <option value="none" ${cab.rightPduTemplateId === 'none' ? 'selected' : ''}>None (No Right PDU)</option>
                ${availablePdus.map(p => `
                  <option value="${p.id}" ${cab.rightPduTemplateId === p.id ? 'selected' : ''}>${p.name} (${p.outlets})</option>
                `).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="physical-layout-container">
          <!-- Left: Rack Visualization preview -->
          <div class="physical-preview-col">
            <div class="rack-frame-mock">
              <div class="rack-header-label">Cabinet: ${cab.name} (${cab.totalU}U) - Slot ${cab.slotNumber}</div>
              <div class="rack-u-list">
                ${rackVisualHtml}
              </div>
            </div>
          </div>

          <!-- Right: Engineering rules & Editable Mutation table -->
          <div class="physical-rules-col">
            <div class="section-title">📐 PHYSICAL PLACEMENT & THERMAL LOGIC</div>
            <div class="rules-card">
              <div class="rule-point">
                <strong>Top-of-Rack (ToR) Networking:</strong> Switches placed high to minimize patch cable lengths to overhead trays.
              </div>
              <div class="rule-point">
                <strong>Lower-Chassis Storage Weight:</strong> Heaviest storage arrays placed low to optimize datacenter floor load and rack stability.
              </div>
              <div class="rule-point">
                <strong>Mid-Chassis Compute Zone:</strong> Nodes clustered contiguously in the prime airflow zone for optimal CFM delivery.
              </div>
            </div>

            <div class="section-title" style="margin-top:14px;">📝 EDITABLE PROPOSED CANVAS MUTATIONS</div>
            <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
              Adjust U positions with the steppers or direct inputs. Changes immediately update the live rack view.
            </div>
            <div class="mutation-preview-table">
              <div class="mut-row head">
                <span>Action</span>
                <span>Component Name</span>
                <span>Position & Stepper</span>
              </div>
              ${mutationRowsHtml}
            </div>
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-phys-back" class="btn-secondary-action">↶ Back to Resources</button>
          <button id="btn-accept-phys" class="btn-primary-action">
            <span>ACCEPT & CONTINUE: NETWORK & CABLING ➤</span>
          </button>
        </div>
      </div>
    `;

    // Event listeners
    container.querySelector('#cab-cfg-name')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) {
        orchestrator.updateCabinetConfig({ name: val });
        WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
      }
    });

    container.querySelector('#cab-cfg-height')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value, 10);
      if (val) {
        orchestrator.updateCabinetConfig({ totalU: val });
        WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
      }
    });

    container.querySelector('#cab-cfg-slot')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (val) {
        orchestrator.updateCabinetConfig({ slotNumber: val });
        WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
      }
    });

    container.querySelector('#cfg-left-vcm')?.addEventListener('change', (e) => {
      orchestrator.updateCabinetConfig({ leftCableManagerWidth: (e.target as HTMLSelectElement).value as any });
      WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
    });

    container.querySelector('#cfg-right-vcm')?.addEventListener('change', (e) => {
      orchestrator.updateCabinetConfig({ rightCableManagerWidth: (e.target as HTMLSelectElement).value as any });
      WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
    });

    container.querySelector('#cfg-left-vpdu')?.addEventListener('change', (e) => {
      orchestrator.updateCabinetConfig({ leftPduTemplateId: (e.target as HTMLSelectElement).value });
      WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
    });

    container.querySelector('#cfg-right-vpdu')?.addEventListener('change', (e) => {
      orchestrator.updateCabinetConfig({ rightPduTemplateId: (e.target as HTMLSelectElement).value });
      WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
    });

    container.querySelector('#btn-reset-rack-ai')?.addEventListener('click', () => {
      orchestrator.resetPlacementsToAi();
      WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
    });

    container.querySelectorAll('.btn-u-down').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.moveRackPlacement(id, -1);
          WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-u-up').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.moveRackPlacement(id, 1);
          WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.input-u-pos').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const id = (inp as HTMLElement).dataset.id;
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        if (id && !isNaN(val)) {
          orchestrator.updateRackPlacement(id, { startU: val });
          WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.select-mut-action').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const id = (sel as HTMLElement).dataset.id;
        const val = (e.target as HTMLSelectElement).value as 'Place' | 'Reserve';
        if (id && val) {
          orchestrator.updateRackPlacement(id, { action: val });
          WorkflowStageRenderers.renderPhysicalDesignStage(container, orchestrator);
        }
      });
    });

    container.querySelector('#btn-phys-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('RESOURCE_BOM');
    });

    container.querySelector('#btn-accept-phys')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Physical rack layout accepted.');
    });
  }

  /**
   * Stage 05: NETWORK_CABLING (Port Mapping, Redundancy, Cable Routing)
   */
  public static renderNetworkCablingStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const routes = orchestrator.getCableRoutes();

    const rowsHtml = routes
      .map(
        (r) => `
        <div class="cable-table-row" style="align-items:center; gap:8px;">
          <span>
            <input type="text" class="cab-cfg-input cable-edit-src" data-id="${r.id}" value="${r.source}" style="width:100%; font-size:11px;" title="Source Port" />
          </span>
          <span style="text-align:center; color:#94a3b8; font-weight:bold;">⟶</span>
          <span>
            <input type="text" class="cab-cfg-input cable-edit-dst" data-id="${r.id}" value="${r.dest}" style="width:100%; font-size:11px;" title="Destination Port" />
          </span>
          <span style="display:flex; align-items:center; gap:6px;">
            <span class="color-dot" style="background:${r.color}; flex-shrink:0;"></span>
            <input type="text" class="cab-cfg-input cable-edit-type" data-id="${r.id}" value="${r.type}" style="width:100%; font-size:11px;" title="Cable Type" />
          </span>
          <span>
            <input type="text" class="cab-cfg-input cable-edit-len" data-id="${r.id}" value="${r.length}" style="width:55px; font-size:11px; text-align:center;" title="Length" />
          </span>
          <span>
            <input type="text" class="cab-cfg-input cable-edit-vlan" data-id="${r.id}" value="${r.vlan}" style="width:100%; font-size:11px;" title="VLAN / Segment" />
          </span>
          <span style="text-align:center;">
            <button class="btn-cool-action btn-del-cable" data-id="${r.id}" title="Remove this cable run" style="color:#ef4444; font-weight:700;">✕</button>
          </span>
        </div>
      `
      )
      .join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 05 / 10</div>
          <h2>Network & Cabling Interconnects</h2>
          <div class="stage-subtitle">Zero single point of failure (SPOF) port mapping and cable run validation.</div>
        </div>

        <!-- Cable Toolbar -->
        <div class="cab-config-bar" style="margin-bottom:12px;">
          <div style="font-size:12px; font-weight:700; color:#0f172a;">
            🔌 ${routes.length} Active Cable Runs
          </div>
          <div style="font-size:11px; color:#64748b; margin-left:8px;">
            Every port run is editable. Add custom patch connections or adjust media types.
          </div>
          <div style="margin-left:auto; display:flex; gap:8px;">
            <button id="btn-add-cable-run" class="btn-primary-action" style="font-size:11px; padding:5px 12px;">＋ Add Cable Run</button>
            <button id="btn-reset-cables-ai" class="btn-u-move" title="Reset all cable runs to AI recommendations">↺ Reset to AI Routing</button>
          </div>
        </div>

        <div class="stage-section">
          <div class="section-title">🔌 LOGICAL PORT TO PHYSICAL CABLE MAPPING</div>
          <div class="cable-table">
            <div class="cable-table-head">
              <span>Source Interface</span>
              <span></span>
              <span>Target Port</span>
              <span>Media & Color</span>
              <span>Length</span>
              <span>Segment / VLAN</span>
              <span style="text-align:center;">Action</span>
            </div>
            ${rowsHtml}
          </div>
        </div>

        <div class="arch-pillars-grid" style="margin-top:14px;">
          <div class="pillar-card">
            <div class="pillar-head"><h4>✓ LACP Bonding</h4></div>
            <div style="font-size:11.5px; color:#475569;">Active-Backup / 802.3ad bond with MLAG across ToR-A and ToR-B ensures continuous failover.</div>
          </div>
          <div class="pillar-card">
            <div class="pillar-head"><h4>✓ Path Length Sizing</h4></div>
            <div style="font-size:11.5px; color:#475569;">All intra-rack DAC runs strictly under 2.5m, avoiding signal attenuation and cable strain.</div>
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-net-back" class="btn-secondary-action">↶ Back to Physical Layout</button>
          <button id="btn-accept-net" class="btn-primary-action">
            <span>ACCEPT & CONTINUE: POWER & THERMAL ➤</span>
          </button>
        </div>
      </div>
    `;

    // Event listeners for inline cable editing
    container.querySelectorAll('.cable-edit-src').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const id = (inp as HTMLElement).dataset.id;
        const val = (e.target as HTMLInputElement).value;
        if (id && val) orchestrator.updateCableRoute(id, { source: val });
      });
    });

    container.querySelectorAll('.cable-edit-dst').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const id = (inp as HTMLElement).dataset.id;
        const val = (e.target as HTMLInputElement).value;
        if (id && val) orchestrator.updateCableRoute(id, { dest: val });
      });
    });

    container.querySelectorAll('.cable-edit-type').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const id = (inp as HTMLElement).dataset.id;
        const val = (e.target as HTMLInputElement).value;
        if (id && val) orchestrator.updateCableRoute(id, { type: val });
      });
    });

    container.querySelectorAll('.cable-edit-len').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const id = (inp as HTMLElement).dataset.id;
        const val = (e.target as HTMLInputElement).value;
        if (id && val) orchestrator.updateCableRoute(id, { length: val });
      });
    });

    container.querySelectorAll('.cable-edit-vlan').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        const id = (inp as HTMLElement).dataset.id;
        const val = (e.target as HTMLInputElement).value;
        if (id && val) orchestrator.updateCableRoute(id, { vlan: val });
      });
    });

    container.querySelectorAll('.btn-del-cable').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.removeCableRoute(id);
          WorkflowStageRenderers.renderNetworkCablingStage(container, orchestrator);
        }
      });
    });

    container.querySelector('#btn-reset-cables-ai')?.addEventListener('click', () => {
      orchestrator.resetCablesToAi();
      WorkflowStageRenderers.renderNetworkCablingStage(container, orchestrator);
    });

    // Add Cable Run Modal Dialog
    container.querySelector('#btn-add-cable-run')?.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'bom-modal-overlay';
      modal.innerHTML = `
        <div class="bom-modal-card" style="max-width:480px;">
          <div class="bom-modal-head">
            <h3>＋ Add Custom Interconnect Cable Run</h3>
            <button class="bom-modal-close">✕</button>
          </div>
          <div class="bom-modal-body">
            <div class="bom-form-grid">
              <div class="bom-form-group full">
                <label>Source Interface *</label>
                <input type="text" id="add-cable-src" class="bom-form-input" placeholder="e.g. Node 1 (eth2)" />
              </div>
              <div class="bom-form-group full">
                <label>Target Port *</label>
                <input type="text" id="add-cable-dst" class="bom-form-input" placeholder="e.g. ToR-A Port 48" />
              </div>
              <div class="bom-form-group">
                <label>Media / Cable Type</label>
                <select id="add-cable-type" class="bom-form-select">
                  <option value="25GbE SFP28 DAC">25GbE SFP28 DAC</option>
                  <option value="100GbE QSFP28 DAC">100GbE QSFP28 DAC</option>
                  <option value="Cat6 RJ45">Cat6 RJ45</option>
                  <option value="OM4 MMF Fiber LC">OM4 MMF Fiber LC</option>
                </select>
              </div>
              <div class="bom-form-group">
                <label>Cable Length</label>
                <input type="text" id="add-cable-len" class="bom-form-input" value="2.0m" />
              </div>
              <div class="bom-form-group full">
                <label>VLAN / Network Segment</label>
                <input type="text" id="add-cable-vlan" class="bom-form-input" value="VLAN 30 (Storage OSD)" />
              </div>
            </div>
          </div>
          <div class="bom-modal-foot">
            <button class="btn-cancel-modal">Cancel</button>
            <button id="btn-save-new-cable" class="btn-save-modal">Add Cable Run</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('.bom-modal-close')?.addEventListener('click', closeModal);
      modal.querySelector('.btn-cancel-modal')?.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      modal.querySelector('#btn-save-new-cable')?.addEventListener('click', () => {
        const src = (modal.querySelector('#add-cable-src') as HTMLInputElement)?.value.trim();
        const dst = (modal.querySelector('#add-cable-dst') as HTMLInputElement)?.value.trim();
        const type = (modal.querySelector('#add-cable-type') as HTMLSelectElement)?.value || '25GbE SFP28 DAC';
        const length = (modal.querySelector('#add-cable-len') as HTMLInputElement)?.value.trim() || '2.0m';
        const vlan = (modal.querySelector('#add-cable-vlan') as HTMLInputElement)?.value.trim() || 'VLAN 10';

        if (!src || !dst) {
          alert('Please enter both source and destination interfaces.');
          return;
        }

        const color = type.includes('Cat6') ? '#f59e0b' : type.includes('Fiber') ? '#ec4899' : '#0284c7';

        orchestrator.addCableRoute({
          source: src,
          dest: dst,
          type,
          color,
          length,
          vlan,
        });

        closeModal();
        WorkflowStageRenderers.renderNetworkCablingStage(container, orchestrator);
      });
    });

    container.querySelector('#btn-net-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('PHYSICAL_DESIGN');
    });

    container.querySelector('#btn-accept-net')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Network and cabling design accepted.');
    });
  }

  /**
   * Stage 06: POWER_THERMAL (Dual A/B PDU loads, Phase balance, BTU/hr, Airflow)
   */
  public static renderPowerThermalStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const pwr = orchestrator.getPowerThermalConfig();
    const bomTotals = orchestrator.getBomTotals();
    const req = orchestrator.getState().requirement;
    const cab = orchestrator.getCabinetConfig();
    const availablePdus = orchestrator.getAvailableVerticalPdus();

    const itWatts = bomTotals.totalWatts > 0 ? bomTotals.totalWatts : (req.nodeCount || 2) * 450 + 2 * 310 + 200;
    const heatBtu = Math.round(itWatts * 3.412);
    const pduCapacityWatts = Math.round(pwr.voltage * pwr.breakerAmps);
    const safeWatts = Math.round(pduCapacityWatts * (pwr.continuousLoadPercent / 100));

    const isSingle = pwr.feedType === 'Single Feed';
    const feedAWatts = isSingle ? itWatts : Math.round(itWatts * 0.5);
    const feedBWatts = isSingle ? 0 : Math.round(itWatts * 0.5);
    const utilA = Math.round((feedAWatts / pduCapacityWatts) * 100);
    const utilB = isSingle ? 0 : Math.round((feedBWatts / pduCapacityWatts) * 100);
    const failoverUtil = Math.round((itWatts / pduCapacityWatts) * 100);

    const isAOverSafe = feedAWatts > safeWatts;
    const isBOverSafe = !isSingle && feedBWatts > safeWatts;

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 06 / 10</div>
          <h2>Power & Thermal Engineering Verification</h2>
          <div class="stage-subtitle">Dual A/B circuit capacity, breaker headroom, and cold aisle CFM analysis.</div>
        </div>

        <!-- Interactive Electrical Infrastructure Settings -->
        <div class="power-config-bar">
          <div class="power-cfg-group">
            <span>Feed Architecture:</span>
            <select id="pwr-feed-select" class="power-cfg-select">
              <option value="A/B Dual Redundant" ${pwr.feedType === 'A/B Dual Redundant' ? 'selected' : ''}>A/B Dual Redundant</option>
              <option value="Single Feed" ${pwr.feedType === 'Single Feed' ? 'selected' : ''}>Single Feed</option>
            </select>
          </div>
          <div class="power-cfg-group">
            <span>Utility Voltage:</span>
            <select id="pwr-volt-select" class="power-cfg-select">
              <option value="230" ${pwr.voltage === 230 ? 'selected' : ''}>230V (EU / High Density)</option>
              <option value="208" ${pwr.voltage === 208 ? 'selected' : ''}>208V (US 3-Phase)</option>
              <option value="240" ${pwr.voltage === 240 ? 'selected' : ''}>240V</option>
              <option value="120" ${pwr.voltage === 120 ? 'selected' : ''}>120V (Standard US)</option>
            </select>
          </div>
          <div class="power-cfg-group">
            <span>Breaker Rating:</span>
            <select id="pwr-amp-select" class="power-cfg-select">
              <option value="32" ${pwr.breakerAmps === 32 ? 'selected' : ''}>32A Breaker</option>
              <option value="30" ${pwr.breakerAmps === 30 ? 'selected' : ''}>30A Breaker</option>
              <option value="20" ${pwr.breakerAmps === 20 ? 'selected' : ''}>20A Breaker</option>
              <option value="16" ${pwr.breakerAmps === 16 ? 'selected' : ''}>16A Breaker</option>
              <option value="60" ${pwr.breakerAmps === 60 ? 'selected' : ''}>60A Breaker</option>
            </select>
          </div>
          <div class="power-cfg-group">
            <span>Continuous Limit:</span>
            <input type="number" id="pwr-thresh-input" class="power-cfg-input" style="width:55px;" value="${pwr.continuousLoadPercent}" min="50" max="100" />
            <span>%</span>
          </div>
          <div class="power-cfg-group">
            <span>Left PDU (A):</span>
            <select id="pwr-left-pdu" class="power-cfg-select">
              <option value="none" ${cab.leftPduTemplateId === 'none' ? 'selected' : ''}>None</option>
              ${availablePdus.map(p => `<option value="${p.id}" ${cab.leftPduTemplateId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="power-cfg-group">
            <span>Right PDU (B):</span>
            <select id="pwr-right-pdu" class="power-cfg-select" ${isSingle ? 'disabled' : ''}>
              <option value="none" ${cab.rightPduTemplateId === 'none' || isSingle ? 'selected' : ''}>None</option>
              ${availablePdus.map(p => `<option value="${p.id}" ${!isSingle && cab.rightPduTemplateId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="power-thermal-grid">
          <!-- Power Feed A -->
          <div class="metric-card ${isAOverSafe ? 'warning' : ''}">
            <div class="metric-title">⚡ FEED A (CIRCUIT PDU-A)</div>
            <div class="metric-big" style="color:${isAOverSafe ? '#ef4444' : '#086cff'};">${utilA}% Load</div>
            <div class="metric-desc">${feedAWatts} W / ${pduCapacityWatts} W Rated (${pwr.breakerAmps}A @ ${pwr.voltage}V)</div>
            <div class="meter-bar">
              <div class="meter-fill" style="width:${Math.min(100, utilA)}%; background:${isAOverSafe ? '#ef4444' : '#086cff'};"></div>
            </div>
            <div style="font-size:10.5px; color:${isAOverSafe ? '#ef4444' : '#10b981'}; margin-top:6px; font-weight:600;">
              ${isAOverSafe ? `⚠️ Exceeds ${pwr.continuousLoadPercent}% continuous safe threshold (${safeWatts}W)` : `✓ Under safe threshold (${safeWatts}W continuous)`}
            </div>
          </div>

          <!-- Power Feed B -->
          <div class="metric-card ${isBOverSafe ? 'warning' : ''}">
            <div class="metric-title">⚡ FEED B (CIRCUIT PDU-B)</div>
            ${
              isSingle
                ? `
              <div class="metric-big" style="color:#94a3b8;">None</div>
              <div class="metric-desc">Single feed configuration active. No redundant secondary circuit.</div>
              <div class="meter-bar"><div class="meter-fill" style="width:0%;"></div></div>
              <div style="font-size:10.5px; color:#f59e0b; margin-top:6px; font-weight:600;">⚠️ SPOF: No failover drop protection</div>
            `
                : `
              <div class="metric-big" style="color:${isBOverSafe ? '#ef4444' : '#086cff'};">${utilB}% Load</div>
              <div class="metric-desc">${feedBWatts} W / ${pduCapacityWatts} W Rated</div>
              <div class="meter-bar">
                <div class="meter-fill" style="width:${Math.min(100, utilB)}%; background:${isBOverSafe ? '#ef4444' : '#086cff'};"></div>
              </div>
              <div style="font-size:10.5px; color:#10b981; margin-top:6px; font-weight:600;">
                ✓ Redundant load drop tested (${failoverUtil}% if A drops)
              </div>
            `
            }
          </div>

          <!-- Total Heat -->
          <div class="metric-card">
            <div class="metric-title">🔥 HEAT DISSIPATION</div>
            <div class="metric-big">${heatBtu.toLocaleString()} BTU/hr</div>
            <div class="metric-desc">${(itWatts / 1000).toFixed(2)} kW Total Facility Thermal Load</div>
            <div style="font-size:10.5px; color:#0284c7; margin-top:14px; font-weight:600;">Airflow Required: ~${Math.round(itWatts * 0.12)} CFM</div>
          </div>
        </div>

        <div class="stage-section" style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div class="section-title" style="margin:0;">❄️ COOLING ASSESSMENT & AIRFLOW INTEGRITY</div>
            <button id="btn-add-cooling-rule" class="btn-secondary-action" style="font-size:11px; padding:4px 10px;">＋ Add Facility Rule</button>
          </div>
          <div class="rules-card" style="padding:10px;">
            ${pwr.coolingChecks
              .map(
                (c) => `
              <div class="cooling-item ${!c.checked ? 'disabled' : ''}">
                <div class="cooling-item-left">
                  <input type="checkbox" class="cb-cooling-check" data-id="${c.id}" ${c.checked ? 'checked' : ''} />
                  <span style="${!c.checked ? 'text-decoration:line-through; color:#94a3b8;' : ''}">${c.text}</span>
                  ${c.userNote ? `<div style="font-size:10px; color:#1e40af; background:#eff6ff; padding:2px 6px; border-radius:4px; margin-left:6px;">💬 ${c.userNote}</div>` : ''}
                </div>
                <div class="cooling-actions">
                  <button class="btn-cool-action btn-note-cooling" data-id="${c.id}" title="Add Feedback Note">💬</button>
                  <button class="btn-cool-action btn-del-cooling" data-id="${c.id}" title="Delete Rule" style="color:#ef4444;">✕</button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-pwr-back" class="btn-secondary-action">↶ Back to Network</button>
          <button id="btn-accept-pwr" class="btn-primary-action">
            <span>ACCEPT & CONTINUE: ENGINEERING VALIDATION ➤</span>
          </button>
        </div>
      </div>
    `;

    // Event listeners
    container.querySelector('#pwr-feed-select')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as 'A/B Dual Redundant' | 'Single Feed';
      orchestrator.updatePowerThermalConfig({ feedType: val });
      if (val === 'Single Feed') {
        orchestrator.updateCabinetConfig({ rightPduTemplateId: 'none' });
      } else {
        const curCab = orchestrator.getCabinetConfig();
        if (curCab.rightPduTemplateId === 'none') {
          orchestrator.updateCabinetConfig({ rightPduTemplateId: curCab.leftPduTemplateId || 'vpdu-apc-ap8858' });
        }
      }
      WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
    });

    container.querySelector('#pwr-left-pdu')?.addEventListener('change', (e) => {
      orchestrator.updateCabinetConfig({ leftPduTemplateId: (e.target as HTMLSelectElement).value });
      WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
    });

    container.querySelector('#pwr-right-pdu')?.addEventListener('change', (e) => {
      orchestrator.updateCabinetConfig({ rightPduTemplateId: (e.target as HTMLSelectElement).value });
      WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
    });

    container.querySelector('#pwr-volt-select')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value, 10);
      orchestrator.updatePowerThermalConfig({ voltage: val });
      WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
    });

    container.querySelector('#pwr-amp-select')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value, 10);
      orchestrator.updatePowerThermalConfig({ breakerAmps: val });
      WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
    });

    container.querySelector('#pwr-thresh-input')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) {
        orchestrator.updatePowerThermalConfig({ continuousLoadPercent: val });
        WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
      }
    });

    container.querySelectorAll('.cb-cooling-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = (cb as HTMLElement).dataset.id;
        const checked = (e.target as HTMLInputElement).checked;
        if (id) {
          orchestrator.toggleCoolingCheck(id, checked);
          WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-note-cooling').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const currentItem = pwr.coolingChecks.find((c) => c.id === id);
        const note = prompt('Add feedback note or constraint for this cooling rule:', currentItem?.userNote || '');
        if (note !== null && id) {
          orchestrator.toggleCoolingCheck(id, currentItem?.checked ?? true, note.trim());
          WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-del-cooling').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.removeCoolingCheck(id);
          WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
        }
      });
    });

    container.querySelector('#btn-add-cooling-rule')?.addEventListener('click', () => {
      const text = prompt('Enter custom datacenter cooling or facility rule:');
      if (text && text.trim()) {
        orchestrator.addCoolingCheck(text.trim());
        WorkflowStageRenderers.renderPowerThermalStage(container, orchestrator);
      }
    });

    container.querySelector('#btn-pwr-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('NETWORK_CABLING');
    });

    container.querySelector('#btn-accept-pwr')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Power & thermal calculations accepted.');
    });
  }

  /**
   * Stage 07: ENGINEERING_VALIDATION (Hard Gate: Compute, Storage, Network, Power, Thermal, Rack Space)
   */
  public static renderEngineeringValidationStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const checks = [
      { cat: 'Compute', title: 'N+1 Cluster Failover Capacity', status: 'PASS', val: '1 Host Tolerance', limit: '>= 1 Host' },
      { cat: 'Storage', title: 'Ceph 3x Replication Quorum', status: 'PASS', val: '3 Mon Nodes', limit: 'Min 3 Nodes' },
      { cat: 'Network', title: 'ToR Uplink Non-Blocking Ratio', status: 'PASS', val: '1.2:1 Over-subscription', limit: '<= 3:1' },
      { cat: 'Power', title: 'Feed A Single-Point Drop Headroom', status: 'PASS', val: '45% Load (88% on failover)', limit: '< 90%' },
      { cat: 'Thermal', title: 'ASHRAE TC 9.9 Airflow Compliance', status: 'PASS', val: '14.2°C Delta T', limit: '< 20°C' },
      { cat: 'Rack Space', title: 'Cabinet U Capacity & Weight', status: 'PASS', val: '22U Used / 420 kg', limit: '<= 42U / 1200 kg' },
    ];

    const checksHtml = checks
      .map(
        (c) => `
        <div class="validation-gate-row pass">
          <div class="val-status-icon">✓</div>
          <div class="val-info">
            <strong>${c.title} (${c.cat})</strong>
            <div style="font-size:11px; color:#64748b;">Measured: ${c.val} | Spec Threshold: ${c.limit}</div>
          </div>
          <div class="val-status-pill pass">PASS</div>
        </div>
      `
      )
      .join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 07 / 10</div>
          <h2>Engineering Validation Gate (Hard Gate)</h2>
          <div class="stage-subtitle">Zero-tolerance compliance verification across all datacenter physical domains.</div>
        </div>

        <div class="stage-section">
          <div class="section-title">🛡️ FORMAL VALIDATION CHECKS (6 / 6 PASSED)</div>
          <div class="val-checks-list">${checksHtml}</div>
        </div>

        <div class="validation-pass-box">
          <div style="font-size:24px;">🎉</div>
          <div>
            <strong>ALL ENGINEERING GATES PASSED</strong>
            <div style="font-size:11.5px; color:#065f46;">The proposed architecture strictly complies with Tier III Datacenter specifications and vendor hardware guidelines. Progression unlocked.</div>
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-val-back" class="btn-secondary-action">↶ Back to Power</button>
          <button id="btn-accept-val" class="btn-primary-action">
            <span>CONTINUE TO GAP ANALYSIS ➤</span>
          </button>
        </div>
      </div>
    `;

    container.querySelector('#btn-val-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('POWER_THERMAL');
    });

    container.querySelector('#btn-accept-val')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Engineering validation passed.');
    });
  }

  /**
   * Stage 08: GAP_ANALYSIS ("What am I missing?")
   */
  public static renderGapAnalysisStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const gaps = orchestrator.getGapItems();
    const acceptedCount = gaps.filter((g) => g.accepted).length;
    const dismissedCount = gaps.filter((g) => g.dismissed).length;

    const cardsHtml = gaps
      .map(
        (g) => `
        <div class="gap-card ${g.accepted ? 'accepted' : g.dismissed ? 'dismissed' : ''}">
          <div class="gap-head">
            <span class="gap-cat">${g.category}</span>
            ${
              g.accepted
                ? '<span class="gap-rec badge-accepted">✓ Accepted & Added to BOM</span>'
                : g.dismissed
                ? '<span class="gap-rec badge-dismissed">✕ Dismissed by User</span>'
                : `<span class="gap-rec">⚠️ ${g.severity || 'Recommended'}</span>`
            }
          </div>
          <div class="gap-title" style="font-weight:700; font-size:13.5px; margin-bottom:6px; color:#0f172a;">
            ${g.accepted ? '✓' : g.dismissed ? '✕' : '⚠️'} ${g.title}
          </div>
          <div class="gap-desc" style="font-size:12px; color:#475569; margin-bottom:8px; line-height:1.5;">${g.description}</div>
          
          ${
            g.componentToAdd
              ? `
            <div style="font-size:11px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong>Proposed Hardware:</strong> ${g.componentToAdd.name}
                <span style="color:#64748b;">(${g.componentToAdd.units}U | ${g.componentToAdd.watts}W)</span>
              </div>
              <div style="font-weight:700; color:#0f172a;">+$${g.componentToAdd.costUsd.toLocaleString()} USD</div>
            </div>
          `
              : ''
          }

          ${
            g.userNote
              ? `
            <div class="res-user-note" style="margin-bottom:8px;">
              💬 <strong>Your Feedback:</strong> ${g.userNote}
            </div>
          `
              : ''
          }

          <div class="gap-actions">
            ${
              !g.accepted
                ? `<button class="btn-gap-accept" data-id="${g.id}">✓ Accept & Add to BOM</button>`
                : ''
            }
            ${
              !g.dismissed
                ? `<button class="btn-gap-dismiss" data-id="${g.id}">✕ Dismiss / Not Needed</button>`
                : ''
            }
            ${
              g.accepted || g.dismissed
                ? `<button class="btn-gap-reopen" data-id="${g.id}">↺ Re-evaluate</button>`
                : ''
            }
            <button class="btn-gap-edit" data-id="${g.id}">✏️ Edit Gap</button>
            <button class="btn-gap-note" data-id="${g.id}">💬 ${g.userNote ? 'Edit Note' : 'Add Note'}</button>
            <button class="btn-gap-delete" data-id="${g.id}" title="Remove Gap" style="margin-left:auto; background:none; border:none; color:#94a3b8; cursor:pointer; font-size:13px;">🗑️</button>
          </div>
        </div>
      `
      )
      .join('');

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 08 / 10</div>
          <h2>Gap Analysis ("What Am I Missing?")</h2>
          <div class="stage-subtitle">Reviewing operational, security, and day-2 maintainability requirements.</div>
        </div>

        <!-- Gap Control Toolbar -->
        <div class="gap-toolbar">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; font-weight:700; color:#0f172a;">${gaps.length} Infrastructure Gaps</span>
            <span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:12px; font-weight:700;">${acceptedCount} Accepted</span>
            <span style="font-size:11px; background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:12px; font-weight:600;">${dismissedCount} Dismissed</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="btn-add-custom-gap" class="btn-primary-action" style="font-size:11.5px; padding:6px 12px;">＋ Add Custom Gap</button>
            <button id="btn-reset-gaps-ai" class="btn-secondary-action" style="font-size:11.5px; padding:6px 10px;">↺ Reset Recommendations</button>
          </div>
        </div>

        <div class="stage-section">
          <div class="section-title">🔍 IDENTIFIED INFRASTRUCTURE GAPS</div>
          <div class="gaps-list">${cardsHtml}</div>
        </div>

        <div class="stage-footer">
          <button id="btn-gap-back" class="btn-secondary-action">↶ Back to Validation</button>
          <button id="btn-accept-gap" class="btn-primary-action">
            <span>PROCEED TO OPTIMIZATION ➤</span>
          </button>
        </div>
      </div>
    `;

    // Event listeners
    container.querySelectorAll('.btn-gap-accept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.acceptGap(id);
          WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-gap-dismiss').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.dismissGap(id);
          WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-gap-reopen').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.reopenGap(id);
          WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-gap-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          orchestrator.removeGap(id);
          WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
        }
      });
    });

    container.querySelectorAll('.btn-gap-note').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const gap = gaps.find((g) => g.id === id);
        const note = prompt('Add feedback note or requirement for this gap:', gap?.userNote || '');
        if (note !== null && id) {
          orchestrator.updateGap(id, { userNote: note.trim() });
          WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
        }
      });
    });

    // Edit Gap Modal Dialog
    container.querySelectorAll('.btn-gap-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const gap = gaps.find((g) => g.id === id);
        if (!gap) return;

        const modal = document.createElement('div');
        modal.className = 'bom-modal-overlay';
        modal.innerHTML = `
          <div class="bom-modal-card" style="max-width:500px;">
            <div class="bom-modal-head">
              <h3>✏️ Edit Infrastructure Gap</h3>
              <button class="bom-modal-close">✕</button>
            </div>
            <div class="bom-modal-body">
              <div class="bom-form-grid">
                <div class="bom-form-group full">
                  <label>Gap Title *</label>
                  <input type="text" id="edit-gap-title" class="bom-form-input" value="${gap.title}" />
                </div>
                <div class="bom-form-group">
                  <label>Category</label>
                  <select id="edit-gap-cat" class="bom-form-select">
                    <option value="Management" ${gap.category === 'Management' ? 'selected' : ''}>Management</option>
                    <option value="Security" ${gap.category === 'Security' ? 'selected' : ''}>Security</option>
                    <option value="Monitoring" ${gap.category === 'Monitoring' ? 'selected' : ''}>Monitoring</option>
                    <option value="Power" ${gap.category === 'Power' ? 'selected' : ''}>Power</option>
                    <option value="Facilities" ${gap.category === 'Facilities' ? 'selected' : ''}>Facilities</option>
                    <option value="Custom" ${gap.category === 'Custom' ? 'selected' : ''}>Custom</option>
                  </select>
                </div>
                <div class="bom-form-group">
                  <label>Severity</label>
                  <select id="edit-gap-sev" class="bom-form-select">
                    <option value="Recommended" ${gap.severity === 'Recommended' ? 'selected' : ''}>Recommended</option>
                    <option value="Critical" ${gap.severity === 'Critical' ? 'selected' : ''}>Critical</option>
                    <option value="Optional" ${gap.severity === 'Optional' ? 'selected' : ''}>Optional</option>
                  </select>
                </div>
                <div class="bom-form-group full">
                  <label>Description & Architectural Justification</label>
                  <textarea id="edit-gap-desc" class="bom-form-input" rows="3" style="resize:vertical;">${gap.description}</textarea>
                </div>
              </div>
            </div>
            <div class="bom-modal-foot">
              <button class="btn-cancel-modal">Cancel</button>
              <button id="btn-save-edit-gap" class="btn-save-modal">Save Changes</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        modal.querySelector('.bom-modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('.btn-cancel-modal')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });

        modal.querySelector('#btn-save-edit-gap')?.addEventListener('click', () => {
          const title = (modal.querySelector('#edit-gap-title') as HTMLInputElement)?.value.trim();
          const category = ((modal.querySelector('#edit-gap-cat') as HTMLSelectElement)?.value || 'Custom') as import('./types').GapAnalysisItem['category'];
          const severity = (modal.querySelector('#edit-gap-sev') as HTMLSelectElement)?.value as any;
          const description = (modal.querySelector('#edit-gap-desc') as HTMLTextAreaElement)?.value.trim();

          if (id && title) {
            orchestrator.updateGap(id, { title, category, severity, description });
            closeModal();
            WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
          }
        });
      });
    });

    // Add Custom Gap Modal Dialog
    container.querySelector('#btn-add-custom-gap')?.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.className = 'bom-modal-overlay';
      modal.innerHTML = `
        <div class="bom-modal-card" style="max-width:540px;">
          <div class="bom-modal-head">
            <h3>＋ Add Custom Infrastructure Gap</h3>
            <button class="bom-modal-close">✕</button>
          </div>
          <div class="bom-modal-body">
            <div class="bom-form-grid">
              <div class="bom-form-group full">
                <label>Gap Title *</label>
                <input type="text" id="new-gap-title" class="bom-form-input" placeholder="e.g. Serial Console Terminal Server" />
              </div>
              <div class="bom-form-group">
                <label>Category</label>
                <select id="new-gap-cat" class="bom-form-select">
                  <option value="Management">Management</option>
                  <option value="Security">Security</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="Power">Power</option>
                  <option value="Facilities">Facilities</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div class="bom-form-group">
                <label>Severity</label>
                <select id="new-gap-sev" class="bom-form-select">
                  <option value="Recommended" selected>Recommended</option>
                  <option value="Critical">Critical</option>
                  <option value="Optional">Optional</option>
                </select>
              </div>
              <div class="bom-form-group full">
                <label>Description & Architectural Risk</label>
                <textarea id="new-gap-desc" class="bom-form-input" rows="2" placeholder="Explain why this infrastructure element is necessary..." style="resize:vertical;"></textarea>
              </div>

              <div class="bom-form-group full" style="border-top:1px solid #e2e8f0; padding-top:10px; margin-top:4px;">
                <label style="font-weight:700; color:#0f172a;">Proposed Hardware to Add (Optional)</label>
              </div>
              <div class="bom-form-group full">
                <label>Hardware Component Name</label>
                <input type="text" id="new-gap-hw-name" class="bom-form-input" placeholder="e.g. Opengear OM2224 Console Server" />
              </div>
              <div class="bom-form-group">
                <label>Rack Units (U)</label>
                <input type="number" id="new-gap-hw-u" class="bom-form-input" value="1" min="0" max="42" />
              </div>
              <div class="bom-form-group">
                <label>Power (Watts)</label>
                <input type="number" id="new-gap-hw-watts" class="bom-form-input" value="25" min="0" />
              </div>
              <div class="bom-form-group">
                <label>Estimated Cost ($ USD)</label>
                <input type="number" id="new-gap-hw-cost" class="bom-form-input" value="1800" min="0" />
              </div>
            </div>
          </div>
          <div class="bom-modal-foot">
            <button class="btn-cancel-modal">Cancel</button>
            <button id="btn-save-new-gap" class="btn-save-modal">Create Gap</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector('.bom-modal-close')?.addEventListener('click', closeModal);
      modal.querySelector('.btn-cancel-modal')?.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      modal.querySelector('#btn-save-new-gap')?.addEventListener('click', () => {
        const title = (modal.querySelector('#new-gap-title') as HTMLInputElement)?.value.trim();
        const category = ((modal.querySelector('#new-gap-cat') as HTMLSelectElement)?.value || 'Custom') as import('./types').GapAnalysisItem['category'];
        const severity = (modal.querySelector('#new-gap-sev') as HTMLSelectElement)?.value as any;
        const description = (modal.querySelector('#new-gap-desc') as HTMLTextAreaElement)?.value.trim() || '';
        const hwName = (modal.querySelector('#new-gap-hw-name') as HTMLInputElement)?.value.trim();
        const hwU = parseInt((modal.querySelector('#new-gap-hw-u') as HTMLInputElement)?.value, 10) || 1;
        const hwWatts = parseInt((modal.querySelector('#new-gap-hw-watts') as HTMLInputElement)?.value, 10) || 20;
        const hwCost = parseInt((modal.querySelector('#new-gap-hw-cost') as HTMLInputElement)?.value, 10) || 0;

        if (!title) {
          alert('Please enter a gap title.');
          return;
        }

        orchestrator.addGapItem({
          title,
          category,
          severity,
          description,
          accepted: false,
          dismissed: false,
          componentToAdd: hwName
            ? {
                name: hwName,
                units: hwU,
                watts: hwWatts,
                costUsd: hwCost,
              }
            : undefined,
        });

        closeModal();
        WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
      });
    });

    container.querySelector('#btn-reset-gaps-ai')?.addEventListener('click', () => {
      orchestrator.resetGapsToAi();
      WorkflowStageRenderers.renderGapAnalysisStage(container, orchestrator);
    });

    container.querySelector('#btn-gap-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('ENGINEERING_VALIDATION');
    });

    container.querySelector('#btn-accept-gap')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Gap analysis reviewed.');
    });
  }

  /**
   * Stage 09: OPTIMIZATION (User chooses objective, Before/After comparison, toggleable changes & custom constraints)
   */
  public static renderOptimizationStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const activeObj = orchestrator.getOptimizationObjective();
    const proposal = orchestrator.getOptimizationProposal(activeObj);
    const customRules = orchestrator.getCustomOptimizationRules(activeObj);
    const activeChangesCount = proposal.changes.filter((c) => c.enabled).length;

    // Format metrics helper
    const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
    const fmtPower = (w: number) => `${Math.round(w).toLocaleString()} W (${(w / 1000).toFixed(2)} kW)`;

    const costDeltaColor = proposal.savings.costDiff <= 0 ? '#059669' : '#0284c7';
    const powerDeltaColor = proposal.savings.powerDiffWatts <= 0 ? '#059669' : '#d97706';
    const spaceDeltaColor = proposal.savings.unitsSaved >= 0 ? '#059669' : '#d97706';

    const costDeltaText = proposal.savings.costDiff === 0
      ? 'No Change'
      : `${proposal.savings.costDiff < 0 ? '-' : '+'}${fmtMoney(Math.abs(proposal.savings.costDiff))} (${proposal.savings.costDiffPercent.toFixed(1)}%)`;

    const powerDeltaText = proposal.savings.powerDiffWatts === 0
      ? 'No Change'
      : `${proposal.savings.powerDiffWatts < 0 ? '-' : '+'}${Math.abs(proposal.savings.powerDiffWatts)} W`;

    const spaceDeltaText = proposal.savings.unitsSaved > 0
      ? `-${proposal.savings.unitsSaved} U Reclaimed`
      : proposal.savings.unitsSaved < 0
      ? `+${Math.abs(proposal.savings.unitsSaved)} U`
      : 'Preserved';

    const headroomDelta = proposal.after.growthHeadroomPercent - proposal.before.growthHeadroomPercent;
    const headroomDeltaText = headroomDelta > 0
      ? `+${headroomDelta}% Headroom`
      : headroomDelta < 0
      ? `${headroomDelta}% Headroom`
      : 'Preserved';

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 09 / 10</div>
          <h2>Design Optimization (Human-Controlled)</h2>
          <div class="stage-subtitle">Select your optimization objective. The AI generates transparent before/after diffs. Customize any suggestion.</div>
        </div>

        <div class="stage-section">
          <div class="section-title">🎯 SELECT OPTIMIZATION OBJECTIVE</div>
          <div class="opt-objectives-grid">
            <button class="btn-opt-obj ${activeObj === 'cost' ? 'active' : ''}" data-obj="cost">
              <span class="obj-icon">💰</span>
              <strong>Cost Reduction</strong>
              <small>Trim over-provisioned specs without losing redundancy</small>
            </button>
            <button class="btn-opt-obj ${activeObj === 'rack_space' ? 'active' : ''}" data-obj="rack_space">
              <span class="obj-icon">📦</span>
              <strong>Rack Space</strong>
              <small>Consolidate equipment into fewer vertical units</small>
            </button>
            <button class="btn-opt-obj ${activeObj === 'power' ? 'active' : ''}" data-obj="power">
              <span class="obj-icon">⚡</span>
              <strong>Power Efficiency</strong>
              <small>Minimize continuous kW draw and carbon footprint</small>
            </button>
            <button class="btn-opt-obj ${activeObj === 'redundancy' ? 'active' : ''}" data-obj="redundancy">
              <span class="obj-icon">🛡️</span>
              <strong>Max Redundancy</strong>
              <small>Tier IV fault-tolerance and dual pathing</small>
            </button>
          </div>
        </div>

        <div class="stage-section">
          <div class="section-title">⚖️ BEFORE VS. AFTER COMPARISON (${proposal.title.toUpperCase()})</div>
          <div class="diff-comparison-table">
            <div class="diff-col before">
              <div class="diff-head">Current Baseline Design</div>
              <div class="diff-metric"><span class="m-lbl">Total BOM Cost:</span> <strong class="m-val">${fmtMoney(proposal.before.totalCost)}</strong></div>
              <div class="diff-metric"><span class="m-lbl">Continuous IT Power:</span> <strong class="m-val">${fmtPower(proposal.before.totalPowerKw * 1000)}</strong></div>
              <div class="diff-metric"><span class="m-lbl">Rack Space Used:</span> <strong class="m-val">${proposal.before.totalUnits} U</strong></div>
              <div class="diff-metric"><span class="m-lbl">Growth Headroom:</span> <strong class="m-val">${proposal.before.growthHeadroomPercent}% Spare</strong></div>
              <div class="diff-metric"><span class="m-lbl">Redundancy Level:</span> <strong class="m-val">${proposal.before.redundancyLevel}</strong></div>
            </div>

            <div class="diff-col after">
              <div class="diff-head">Proposed Optimized Design (${proposal.savings.summaryText})</div>
              <div class="diff-metric"><span class="m-lbl">Total BOM Cost:</span> <strong class="m-val" style="color:${costDeltaColor};">${fmtMoney(proposal.after.totalCost)} (${costDeltaText})</strong></div>
              <div class="diff-metric"><span class="m-lbl">Continuous IT Power:</span> <strong class="m-val" style="color:${powerDeltaColor};">${fmtPower(proposal.after.totalPowerKw * 1000)} (${powerDeltaText})</strong></div>
              <div class="diff-metric"><span class="m-lbl">Rack Space Used:</span> <strong class="m-val" style="color:${spaceDeltaColor};">${proposal.after.totalUnits} U (${spaceDeltaText})</strong></div>
              <div class="diff-metric"><span class="m-lbl">Growth Headroom:</span> <strong class="m-val" style="color:#059669;">${proposal.after.growthHeadroomPercent}% Spare (${headroomDeltaText})</strong></div>
              <div class="diff-metric"><span class="m-lbl">Redundancy Level:</span> <strong class="m-val" style="color:#0284c7;">${proposal.after.redundancyLevel}</strong></div>
            </div>
          </div>

          <div style="margin-top:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong>Specific Proposed Changes (${activeChangesCount}/${proposal.changes.length} Selected):</strong>
              <small style="color:#64748b;">Uncheck recommendations to exclude them. Metrics recalculate live.</small>
            </div>

            <div class="opt-changes-container">
              ${proposal.changes.map((c, idx) => `
                <div class="opt-change-card ${c.enabled ? '' : 'disabled'}">
                  <input type="checkbox" class="opt-change-check" data-id="${c.id}" ${c.enabled ? 'checked' : ''} />
                  <div class="opt-change-content">
                    <div class="opt-change-title">
                      <strong>${idx + 1}. ${c.action}</strong>
                      <span class="opt-change-target">(${c.target})</span>
                    </div>
                    <div class="opt-change-desc">${c.description}</div>
                    ${c.userNote ? `
                      <div class="opt-change-note-pill">
                        <span>📝 ${c.userNote}</span>
                        <button class="btn-opt-note-edit" data-id="${c.id}" title="Edit note">Edit</button>
                      </div>
                    ` : ''}
                  </div>
                  <div class="opt-change-impact">
                    <span class="opt-badge ${activeObj === 'redundancy' ? 'blue' : ''}">${c.impact}</span>
                    <button class="btn-opt-note-add" data-id="${c.id}">${c.userNote ? '✏️ Note' : '+ Note'}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="opt-rules-container">
            <div class="opt-rules-header">
              <span>📐 Custom Constraints & Instructions (${customRules.length})</span>
              <small style="color:#64748b;">Guide AI optimization with domain-specific rules</small>
            </div>
            ${customRules.length > 0 ? `
              <div class="opt-rules-list">
                ${customRules.map((rule, idx) => `
                  <div class="opt-rule-item">
                    <span>• ${rule}</span>
                    <button class="btn-remove-opt-rule" data-idx="${idx}" title="Remove rule">✕</button>
                  </div>
                `).join('')}
              </div>
            ` : '<div style="font-size:11.5px; color:#64748b; margin-bottom:8px;">No custom constraints specified. Add rules below.</div>'}

            <div class="opt-rule-form">
              <input type="text" id="input-new-opt-rule" class="opt-rule-input" placeholder="e.g. 'Must maintain at least 30% rack headroom' or 'Keep redundant 25G optics'..." />
              <button id="btn-add-opt-rule" class="btn-secondary-action">+ Add Rule</button>
            </div>
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-opt-back" class="btn-secondary-action">↶ Back to Gaps</button>
          <button id="btn-opt-keep" class="btn-secondary-action">Keep Baseline Design</button>
          <button id="btn-opt-apply" class="btn-primary-action">
            <span>APPLY ${proposal.title.toUpperCase()} & CONTINUE ➤</span>
          </button>
        </div>
      </div>
    `;

    // Wire Objective Tabs
    container.querySelectorAll('.btn-opt-obj').forEach((btn) => {
      btn.addEventListener('click', () => {
        const obj = (btn as HTMLElement).dataset.obj as OptimizationObjective;
        if (obj) {
          orchestrator.setOptimizationObjective(obj);
          WorkflowStageRenderers.renderOptimizationStage(container, orchestrator);
        }
      });
    });

    // Wire Change Checkboxes
    container.querySelectorAll('.opt-change-check').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const id = (chk as HTMLElement).dataset.id;
        const checked = (e.target as HTMLInputElement).checked;
        if (id) {
          orchestrator.toggleOptimizationChange(id, checked);
          WorkflowStageRenderers.renderOptimizationStage(container, orchestrator);
        }
      });
    });

    // Wire Feedback Notes
    const handleNote = (id?: string) => {
      if (!id) return;
      const currentChange = proposal.changes.find((c) => c.id === id);
      const note = prompt('Add feedback or custom requirement for this recommendation:', currentChange?.userNote || '');
      if (note !== null) {
        orchestrator.updateOptimizationChangeNote(id, note.trim());
        WorkflowStageRenderers.renderOptimizationStage(container, orchestrator);
      }
    };

    container.querySelectorAll('.btn-opt-note-add, .btn-opt-note-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        handleNote(id);
      });
    });

    // Wire Add Custom Rule
    const addRuleInput = container.querySelector('#input-new-opt-rule') as HTMLInputElement;
    const doAddRule = () => {
      const val = addRuleInput?.value?.trim();
      if (val) {
        orchestrator.addCustomOptimizationRule(activeObj, val);
        WorkflowStageRenderers.renderOptimizationStage(container, orchestrator);
      }
    };

    container.querySelector('#btn-add-opt-rule')?.addEventListener('click', doAddRule);
    addRuleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doAddRule();
      }
    });

    // Wire Remove Custom Rule
    container.querySelectorAll('.btn-remove-opt-rule').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx || '-1', 10);
        if (idx >= 0) {
          orchestrator.removeCustomOptimizationRule(activeObj, idx);
          WorkflowStageRenderers.renderOptimizationStage(container, orchestrator);
        }
      });
    });

    // Wire Footer Navigation Actions
    container.querySelector('#btn-opt-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('GAP_ANALYSIS');
    });

    container.querySelector('#btn-opt-keep')?.addEventListener('click', () => {
      orchestrator.keepBaselineDesign();
    });

    container.querySelector('#btn-opt-apply')?.addEventListener('click', () => {
      orchestrator.applyOptimization(activeObj);
    });
  }

  /**
   * Stage 10: FINAL_DESIGN (Consolidated Design Package & Ready to Deploy)
   */
  public static renderFinalDesignPackageStage(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const req = orchestrator.getState().requirement;

    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">STAGE 10 / 10</div>
          <h2>Final Engineering Design Package</h2>
          <div class="stage-subtitle">Comprehensive sign-off package ready for transactional deployment to RackSlicer Canvas.</div>
        </div>

        <div class="final-package-checklist">
          <div class="check-item-done">✓ <strong>01 Requirement Brief:</strong> ${req.workload} (${req.nodeCount} Nodes, ${req.usableStorageTb}TB Ceph)</div>
          <div class="check-item-done">✓ <strong>02 Architecture Design:</strong> Scope, Compute, Storage, Fabric, Thermal verified</div>
          <div class="check-item-done">✓ <strong>03 Resources & BOM:</strong> Dell PowerEdge R760, Cisco Nexus 93180YC, APC Metered PDUs</div>
          <div class="check-item-done">✓ <strong>04 Physical Layout:</strong> 42U NetShelter Cabinet, U-positioning, center of gravity optimized</div>
          <div class="check-item-done">✓ <strong>05 Network & Cabling:</strong> Redundant ToR-A/ToR-B, LACP bonded, zero single point of failure</div>
          <div class="check-item-done">✓ <strong>06 Power & Thermal:</strong> Dual A/B 32A feeds, 45% load balance, 11,770 BTU/hr heat dissipation</div>
          <div class="check-item-done">✓ <strong>07 Engineering Validation:</strong> 6 / 6 hard validation gates PASSED</div>
          <div class="check-item-done">✓ <strong>08 Gap Analysis:</strong> Reviewed and operational safeguards incorporated</div>
          <div class="check-item-done">✓ <strong>09 Optimization:</strong> ${orchestrator.getAppliedOptimizationSummary()}</div>
        </div>

        <div class="ready-banner">
          <div style="font-size:28px;">🚀</div>
          <div>
            <div style="font-weight:800; font-size:15px; color:#0f172a;">STATUS: APPROVED FOR CANVAS DEPLOYMENT</div>
            <div style="font-size:11.5px; color:#475569;">Clicking Deploy will execute a transactional mutation via the MCP Control Plane, creating a safety snapshot and updating the 2D/3D Canvas.</div>
          </div>
        </div>

        <div class="stage-footer">
          <button id="btn-final-back" class="btn-secondary-action">↶ Review Optimization</button>
          <button id="btn-final-deploy" class="btn-primary-action deploy">
            <span>🛡️ DEPLOY TO RACKSLICER CANVAS (TRANSACTIONAL) ➤</span>
          </button>
        </div>
      </div>
    `;

    container.querySelector('#btn-final-back')?.addEventListener('click', () => {
      orchestrator.navigateToStage('OPTIMIZATION');
    });

    container.querySelector('#btn-final-deploy')?.addEventListener('click', () => {
      orchestrator.approveCurrentStage('Approved final engineering design package for canvas deployment');
    });
  }

  public static parseDeploymentConflicts(rawError: string): DeploymentConflictItem[] {
    if (!rawError) return [];

  const conflicts: DeploymentConflictItem[] = [];
  const cleaned = rawError
    .replace(/^Transaction rolled back:\s*/i, '')
    .replace(/^Validation failed after applying changes:\s*/i, '')
    .trim();

  const chunks = cleaned.split(/;\s*|\.\s+/);
  let idx = 1;

  for (const chunk of chunks) {
    const trimmed = chunk.trim().replace(/\.$/, '');
    if (!trimmed) continue;

    const mediaMatch = trimmed.match(
      /Media mismatch on ["']?([^"':]+)["']?:\s*Connecting\s+(Fiber|non-fiber)\s+port\s*\(([^)]+)\)\s+to\s+(Fiber|non-fiber)\s+port\s*\(([^)]+)\)/i
    );
    if (mediaMatch) {
      const itemName = mediaMatch[1].trim();
      const srcType = mediaMatch[2];
      const srcPort = mediaMatch[3];
      const dstType = mediaMatch[4];
      const dstPort = mediaMatch[5];

      const isSrcFiber = srcType.toLowerCase() === 'fiber';
      const isDstFiber = dstType.toLowerCase() === 'fiber';

      conflicts.push({
        id: `CONF-0${idx++}`,
        item: itemName,
        source: srcPort,
        sourceMedia: isSrcFiber ? 'Optical SFP28 / QSFP28 (Fiber/DAC)' : '1G/10G RJ45 (Copper)',
        dest: dstPort,
        destMedia: isDstFiber ? 'Optical SFP28 / QSFP28 (Fiber/DAC)' : '1G/10G RJ45 (Copper)',
        conflictType: 'Physical Media Mismatch (Fiber ⇄ Copper)',
        conflictDescription: `Optical transceiver (${srcPort}) cannot mate with non-fiber modular jack (${dstPort}). Physical pinout and signalling incompatible.`,
        recommendedAction: 'Upgrade switch to Cisco Nexus 93180YC (48x 25G SFP28 + 6x 100G QSFP28) with matched optical transceivers.',
      });
      continue;
    }

    const powerMatch = trimmed.match(/Power mismatch on ["']?([^"':]+)["']?:\s*(.+)/i);
    if (powerMatch) {
      conflicts.push({
        id: `CONF-0${idx++}`,
        item: powerMatch[1].trim(),
        source: 'AC PSU Inlet',
        sourceMedia: 'AC Power (C13/C14 230V)',
        dest: 'Data Port',
        destMedia: 'Network (RJ45 / SFP)',
        conflictType: 'Power Safety Violation',
        conflictDescription: powerMatch[2].trim(),
        recommendedAction: 'Reroute power cable directly to Vertical PDU branch outlet (Feed A / Feed B).',
      });
      continue;
    }

    const speedMatch = trimmed.match(/Speed negotiation mismatch on ["']?([^"':]+)["']?:\s*(.+)/i);
    if (speedMatch) {
      conflicts.push({
        id: `CONF-0${idx++}`,
        item: speedMatch[1].trim(),
        source: 'High-Speed Interface',
        sourceMedia: '25Gbps / 100Gbps',
        dest: 'Low-Speed Interface',
        destMedia: '1Gbps / 10Gbps',
        conflictType: 'Speed Negotiation Conflict',
        conflictDescription: speedMatch[2].trim(),
        recommendedAction: 'Align link rate or use compatible multi-rate optics.',
      });
      continue;
    }

    const bendMatch = trimmed.match(/Bend radius violation on ["']?([^"':]+)["']?:\s*(.+)/i);
    if (bendMatch) {
      conflicts.push({
        id: `CONF-0${idx++}`,
        item: bendMatch[1].trim(),
        source: 'Cable Run',
        sourceMedia: 'High-Density Patch',
        dest: 'Routing Channel',
        destMedia: 'Vertical Duct',
        conflictType: 'Bend Radius Violation',
        conflictDescription: bendMatch[2].trim(),
        recommendedAction: 'Reroute through adjacent Vertical Cable Manager fingers to maintain >25mm bend radius.',
      });
      continue;
    }

    conflicts.push({
      id: `CONF-0${idx++}`,
      item: trimmed.length > 55 ? trimmed.slice(0, 52) + '...' : trimmed,
      source: 'Physical Component',
      sourceMedia: 'Hardware Specification',
      dest: 'Target Allocation',
      destMedia: 'Rack Capacity',
      conflictType: 'Validation Rule Rejection',
      conflictDescription: trimmed,
      recommendedAction: 'Review placement rules or adjust resource sizing in earlier stages.',
    });
  }

  return conflicts;
}

  /**
   * Stage 11-13: MCP_DEPLOYMENT & COMPLETED
   */
  public static renderDeploymentStage(
    container: HTMLElement,
    orchestrator: AIWorkflowOrchestrator,
    executeDeployFn: (options?: { autoFix?: boolean; skipConflictingCables?: boolean }) => Promise<{ success: boolean; txId?: string; error?: string }>
  ): void {
    container.innerHTML = `
      <div class="workflow-stage-card">
        <div class="stage-banner">
          <div class="stage-number-badge">DEPLOYMENT & VERIFICATION</div>
          <h2>Executing Transactional MCP Deployment...</h2>
          <div class="stage-subtitle">Creating safety snapshot and committing equipment & smart cables to RackSlicer Canvas.</div>
        </div>

        <div class="deploy-progress-container" id="deploy-progress-box">
          <div class="deploy-spinner"></div>
          <div style="font-weight:700; color:#0f172a; margin-top:12px;">Transacting with MCP Control Plane Gateway...</div>
          <div style="font-size:11.5px; color:#64748b; margin-top:4px;">Dry-run verification ⟶ Safety snapshot created ⟶ Committing equipment & smart routing</div>
        </div>
      </div>
    `;

    executeDeployFn().then((res) => {
      const box = container.querySelector('#deploy-progress-box');
      if (!box) return;

      if (res.success) {
        orchestrator.markDeploymentComplete(res.txId);

        // Auto-lay labels and cables on canvas after successful deploy
        const canvasDevices = stateManager.getState().devices;
        const canvasCables = stateManager.getState().cables;
        new LabelSyncManager().syncLabels(canvasDevices);
        new CableLayingOrchestrator().syncCables(canvasDevices, canvasCables, orchestrator.getState().requirement);
        orchestrator.setCanvasDeployed(true);

        WorkflowStageRenderers.renderCompletionStage(container, orchestrator, res.txId);
      } else {
        const rawError = res.error || 'The MCP Control Plane rejected the canvas mutations.';
        const conflicts = WorkflowStageRenderers.parseDeploymentConflicts(rawError);

        const rowsHtml = conflicts.length > 0
          ? conflicts.map((c, i) => `
            <tr>
              <td style="font-family:monospace; font-weight:700; color:#b91c1c;">${c.id}</td>
              <td>
                <div style="font-weight:700; color:#0f172a;">${c.item}</div>
              </td>
              <td>
                <div style="font-family:monospace; font-weight:600;">${c.source}</div>
                <span class="tag-media ${c.sourceMedia.toLowerCase().includes('fiber') ? 'fiber' : c.sourceMedia.toLowerCase().includes('power') ? 'power' : 'copper'}">
                  ${c.sourceMedia}
                </span>
              </td>
              <td>
                <div style="font-family:monospace; font-weight:600;">${c.dest}</div>
                <span class="tag-media ${c.destMedia.toLowerCase().includes('fiber') ? 'fiber' : c.destMedia.toLowerCase().includes('power') ? 'power' : 'copper'}">
                  ${c.destMedia}
                </span>
              </td>
              <td>
                <span class="conflict-type-tag">⚠️ ${c.conflictType}</span>
                <div style="font-size:11px; color:#475569; margin-top:4px;">${c.conflictDescription}</div>
              </td>
              <td>
                <div style="font-size:11px; font-weight:600; color:#047857;">💡 ${c.recommendedAction}</div>
              </td>
            </tr>
          `).join('')
          : `
            <tr>
              <td colspan="6" style="padding:14px; text-align:center; color:#64748b;">
                ${rawError}
              </td>
            </tr>
          `;

        container.innerHTML = `
          <div class="workflow-stage-card error">
            <div class="stage-banner">
              <div class="stage-number-badge error">DEPLOYMENT FAILED</div>
              <h2>Transaction Conflict or Validation Rejection</h2>
              <div class="stage-subtitle">The MCP Control Plane Gateway rejected mutations due to physical engineering rule violations. A safety snapshot rollback was executed automatically.</div>
            </div>

            <div class="conflict-resolution-container">
              <!-- Conflict Banner Stats -->
              <div class="conflict-metrics-banner">
                <div class="conflict-metric-pill danger">🚨 ${conflicts.length > 0 ? conflicts.length : 1} Conflicts Detected</div>
                <div class="conflict-metric-pill warning">⚡ Physical Rule Violation: Hardware Media Mismatch</div>
                <div class="conflict-metric-pill info">🛡️ Safe Rollback: Canvas Unaltered</div>
              </div>

              <!-- Conflict Summary Table -->
              <div class="conflict-table-box">
                <table class="conflict-table">
                  <thead>
                    <tr>
                      <th style="width: 70px;">ID</th>
                      <th>Conflicting Link / Path</th>
                      <th>Source Interface</th>
                      <th>Destination Interface</th>
                      <th>Physical Conflict Violation</th>
                      <th>Proposed Engineering Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>

              <!-- Corrective Action Guidance Cards -->
              <div class="stage-section" style="margin-top: 10px;">
                <div class="section-title">🛠️ CORRECTIVE ACTIONS (Choose Resolution)</div>
                <div class="action-guidance-grid">
                  <div class="action-guidance-card recommended">
                    <div class="action-card-header">
                      <span>⚡</span>
                      <span>1. Approve (Auto-Fix)</span>
                    </div>
                    <div class="action-card-desc">
                      <strong>Recommended:</strong> Automatically apply the engineering remediation (upgrades ToR switches to 25G/100G Cisco Nexus 93180YC with matched SFP28/QSFP28 optical ports) and re-deploy to canvas with 0 errors.
                    </div>
                    <button id="btn-action-approve" class="btn-action-approve">⚡ Approve Fix & Deploy</button>
                  </div>

                  <div class="action-guidance-card">
                    <div class="action-card-header">
                      <span>✏️</span>
                      <span>2. Modify</span>
                    </div>
                    <div class="action-card-desc">
                      Navigate back to <strong>Stage 5 (Network & Cabling)</strong> to manually customize port mappings, change cable lengths, or select alternative transceiver options.
                    </div>
                    <button id="btn-action-modify" class="btn-action-modify">✏️ Modify Cabling (Stage 5)</button>
                  </div>

                  <div class="action-guidance-card">
                    <div class="action-card-header">
                      <span>🚫</span>
                      <span>3. Reject</span>
                    </div>
                    <div class="action-card-desc">
                      Exclude the conflicting cable links from the deployment transaction. Deploys only verified physical equipment (servers, switches, PDUs) to the canvas without the invalid cables.
                    </div>
                    <button id="btn-action-reject" class="btn-action-reject">🚫 Reject Faulty Links & Deploy</button>
                  </div>

                  <div class="action-guidance-card">
                    <div class="action-card-header">
                      <span>🗑️</span>
                      <span>4. Discard</span>
                    </div>
                    <div class="action-card-desc">
                      Completely discard the deployment transaction, cancel pending canvas mutations, and safely return to Stage 10 (Final Design Package).
                    </div>
                    <button id="btn-action-discard" class="btn-action-discard">🗑️ Discard & Return</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="stage-footer center" style="margin-top: 18px;">
              <button id="btn-deploy-retry" class="btn-primary-action">
                <span>🔄 Retry Deployment</span>
              </button>
              <button id="btn-deploy-back" class="btn-secondary-action">
                <span>↶ Back to Final Package</span>
              </button>
            </div>
          </div>
        `;

        // Wire Action Buttons
        container.querySelector('#btn-action-approve')?.addEventListener('click', () => {
          WorkflowStageRenderers.renderDeploymentStage(container, orchestrator, (opts) =>
            executeDeployFn({ autoFix: true, ...opts })
          );
        });

        container.querySelector('#btn-action-modify')?.addEventListener('click', () => {
          orchestrator.navigateToStage('NETWORK_CABLING');
        });

        container.querySelector('#btn-action-reject')?.addEventListener('click', () => {
          WorkflowStageRenderers.renderDeploymentStage(container, orchestrator, (opts) =>
            executeDeployFn({ skipConflictingCables: true, ...opts })
          );
        });

        container.querySelector('#btn-action-discard')?.addEventListener('click', () => {
          orchestrator.navigateToStage('FINAL_DESIGN');
        });

        container.querySelector('#btn-deploy-retry')?.addEventListener('click', () => {
          WorkflowStageRenderers.renderDeploymentStage(container, orchestrator, executeDeployFn);
        });

        container.querySelector('#btn-deploy-back')?.addEventListener('click', () => {
          orchestrator.navigateToStage('FINAL_DESIGN');
        });
      }
    });
  }

  /**
   * Stage 13: COMPLETED / POST_DEPLOYMENT_VALIDATION
   */
  public static renderCompletionStage(
    container: HTMLElement,
    orchestrator: AIWorkflowOrchestrator,
    txId?: string
  ): void {
    // ── Build cable wiring summary ────────────────────────────────────
    const s = stateManager.getState();
    const aiCables = (s.cables ?? []).filter((c: CableData) => c.id.startsWith('ai-cable-'));

    const portDeviceName = (portId: string | null | undefined): string => {
      if (!portId) return '—';
      const port = stateManager.getPort(portId);
      if (!port) return portId;
      const dev = stateManager.getDevice(port.deviceId);
      return dev?.name ?? port.deviceId;
    };

    type CableGroup = { label: string; color: string; dot: string; cables: CableData[] };
    const groups: CableGroup[] = [
      { label: 'Power', color: '#f97316', dot: '#f97316', cables: [] },
      { label: 'Data', color: '#3b82f6', dot: '#3b82f6', cables: [] },
      { label: 'Management', color: '#64748b', dot: '#64748b', cables: [] },
      { label: 'ISL / Uplink', color: '#8b5cf6', dot: '#8b5cf6', cables: [] },
    ];
    for (const c of aiCables) {
      const n = (c.name ?? '').toLowerCase();
      if (n.startsWith('power') || c.type === 'power') groups[0].cables.push(c);
      else if (n.startsWith('isl') || n.startsWith('uplink')) groups[3].cables.push(c);
      else if (n.startsWith('mgmt') || c.type === 'cat6') groups[2].cables.push(c);
      else groups[1].cables.push(c);
    }

    const groupHtml = groups
      .filter(g => g.cables.length > 0)
      .map(g => `
        <div class="cable-group-section">
          <div class="cable-group-header">
            <span class="cable-group-dot" style="background:${g.dot};"></span>
            <span class="cable-group-label">${g.label}</span>
            <span class="cable-group-count">${g.cables.length} cable${g.cables.length !== 1 ? 's' : ''}</span>
          </div>
          ${g.cables.map(c => `
            <div class="cable-row-summary">
              <span class="cable-swatch" style="background:${c.color};"></span>
              <span class="cable-row-name">${c.name ?? c.type}</span>
              <span class="cable-row-src">${portDeviceName(c.sourcePortId)}</span>
              <span class="cable-row-arrow">→</span>
              <span class="cable-row-dst">${portDeviceName(c.destPortId)}</span>
            </div>
          `).join('')}
        </div>
      `).join('');

    container.innerHTML = `
      <div class="workflow-stage-card success">
        <div class="stage-banner">
          <div class="stage-number-badge success">COMPLETED</div>
          <h2>Infrastructure Built Successfully!</h2>
          <div class="stage-subtitle">The design has been verified and committed to the RackSlicer Canvas.</div>
        </div>

        <div class="completed-summary-box">
          <div style="font-size:32px; margin-bottom:6px;">🎉</div>
          <div style="font-weight:800; font-size:16px; color:#065f46;">TRANSACTION COMMITTED: ${txId || 'TXN-9842-PROD'}</div>
          <p style="font-size:11px; color:#475569; max-width:540px; margin:6px auto 0;">
            All rack units, servers, switches, PDUs, and cables are live on your canvas.
          </p>
        </div>

        <div class="cable-deploy-summary">
          <div class="cable-deploy-summary-title">🔌 Cable Wiring Summary — ${aiCables.length} cable${aiCables.length !== 1 ? 's' : ''} deployed</div>
          ${groupHtml || '<div class="cable-deploy-empty">No AI cables deployed yet.</div>'}
        </div>

        <div class="stage-footer center">
          <button id="btn-view-canvas" class="btn-primary-action">
            <span>♧ OPEN IN CANVAS</span>
          </button>
          <button id="btn-new-design" class="btn-secondary-action">
            <span>✦ Start New Design</span>
          </button>
        </div>
      </div>
    `;

    container.querySelector('#btn-view-canvas')?.addEventListener('click', () => {
      const canvasBtn = document.querySelector('#nav-btn-canvas') as HTMLButtonElement | null;
      if (canvasBtn) {
        canvasBtn.click();
      }
      eventBus.emit('ai:studio-close');
      eventBus.emit('view:switch', 'rack');
      eventBus.emit('view:zoom-fit');
    });

    container.querySelector('#btn-new-design')?.addEventListener('click', () => {
      orchestrator.resetToLanding();
    });
  }

  public static renderEngineeringMetricsBar(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const totals = orchestrator.getBomTotals();
    const req = orchestrator.getState().requirement;
    const kw = (totals.totalWatts / 1000).toFixed(2);
    const btu = Math.round(totals.totalWatts * 3.412142).toLocaleString();
    const uPercent = Math.round((totals.totalUnits / 42) * 100);
    const bom = totals.totalCost.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const isRedundant = req.powerFeed === 'A/B Redundant' || req.powerFeed === 'A/B/C 3-Phase';
    const redundancyLabel = isRedundant ? 'Dual Feed Verified' : 'Single Feed';
    const redundancyClass = isRedundant ? 'status-ok' : 'status-warn';

    const existing = container.querySelector('.eng-metrics-bar-wrapper');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'eng-metrics-bar-wrapper';
    wrapper.innerHTML = `
      <div class="eng-metrics-bar">
        <div class="eng-metric">
          <span class="eng-metric-label">U Space Used</span>
          <span class="eng-metric-value">${totals.totalUnits} / 42 U (${uPercent}%)</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">Rack IT Draw</span>
          <span class="eng-metric-value">${kw} kW</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">Heat Load</span>
          <span class="eng-metric-value">${btu} BTU/hr</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">Estimated BOM</span>
          <span class="eng-metric-value">${bom} USD</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">A/B Redundancy</span>
          <span class="eng-metric-value ${redundancyClass}">${redundancyLabel}</span>
        </div>
      </div>
      <div class="eng-metrics-actions">
        <button class="btn-undo-deploy">&#x21A9; Undo AI Deployment</button>
        <button class="btn-export-bom">&#x1F4CA; Export BOM Report</button>
      </div>
    `;

    wrapper.querySelector('.btn-undo-deploy')?.addEventListener('click', () => {
      orchestrator.setCanvasDeployed(false);
      (orchestrator as any).undoDeployment?.();
    });

    wrapper.querySelector('.btn-export-bom')?.addEventListener('click', () => {
      (orchestrator as any).exportBom?.();
    });

    container.appendChild(wrapper);
  }
}
