/**
 * RackSlicer AI — AI Engineering Workflow Orchestrator
 *
 * Implements the State Machine, Stage Locking, Dependency Invalidation,
 * Stage-Aware MCP Permissions, and Decision History.
 */

import {
  WorkflowStageId,
  StageStatus,
  StageCompletionContract,
  RequirementSpec,
  HardwareBomItem,
  HardwareAlternative,
  RackPlacementItem,
  RackCabinetConfig,
  CableRouteItem,
  PowerThermalConfig,
  CoolingCheckItem,
  GapAnalysisItem,
  WorkflowStateData,
  DecisionLogEntry,
  OptimizationObjective,
  OptimizationProposal,
  OptimizationChangeItem,
} from './types';
import { RequirementCompletenessEngine } from './requirement-engine';

export const WORKFLOW_STAGES_ORDER: WorkflowStageId[] = [
  'REQUIREMENT_PROMPT',
  'REQUIREMENT_BRIEF',
  'ARCHITECTURE_DESIGN',
  'RESOURCE_BOM',
  'PHYSICAL_DESIGN',
  'NETWORK_CABLING',
  'POWER_THERMAL',
  'ENGINEERING_VALIDATION',
  'GAP_ANALYSIS',
  'OPTIMIZATION',
  'FINAL_DESIGN',
  'MCP_DEPLOYMENT',
  'POST_DEPLOYMENT_VALIDATION',
  'COMPLETED',
];

export const WORKFLOW_RAIL_STEPS: { stageId: WorkflowStageId; num: number; label: string; short: string }[] = [
  { stageId: 'REQUIREMENT_BRIEF', num: 1, label: 'Requirement Brief', short: 'Requirement' },
  { stageId: 'ARCHITECTURE_DESIGN', num: 2, label: 'Architecture Design', short: 'Architecture' },
  { stageId: 'RESOURCE_BOM', num: 3, label: 'Resource & BOM Engine', short: 'Resources' },
  { stageId: 'PHYSICAL_DESIGN', num: 4, label: 'Physical Design & Rack', short: 'Physical' },
  { stageId: 'NETWORK_CABLING', num: 5, label: 'Network & Cabling', short: 'Network' },
  { stageId: 'POWER_THERMAL', num: 6, label: 'Power & Thermal', short: 'Power & Heat' },
  { stageId: 'ENGINEERING_VALIDATION', num: 7, label: 'Engineering Validation', short: 'Validation' },
  { stageId: 'GAP_ANALYSIS', num: 8, label: 'Gap Analysis ("What\'s Missing")', short: 'Gaps' },
  { stageId: 'OPTIMIZATION', num: 9, label: 'Design Optimization', short: 'Optimization' },
  { stageId: 'FINAL_DESIGN', num: 10, label: 'Final Package & Deploy', short: 'Deploy' },
];

export class AIWorkflowOrchestrator {
  private state: WorkflowStateData;
  private listeners: ((state: WorkflowStateData) => void)[] = [];

  constructor() {
    this.state = this.loadPersistedState() || this.createInitialState();
  }

  private createInitialState(): WorkflowStateData {
    const stageStatuses = {} as Record<WorkflowStageId, StageStatus>;
    const stageContracts = {} as Record<WorkflowStageId, StageCompletionContract>;

    for (const stage of WORKFLOW_STAGES_ORDER) {
      stageStatuses[stage] = stage === 'REQUIREMENT_PROMPT' ? 'READY' : 'LOCKED';
      stageContracts[stage] = {
        stageId: stage,
        title: this.getStageTitle(stage),
        shortLabel: this.getStageShortLabel(stage),
        status: stage === 'REQUIREMENT_PROMPT' ? 'READY' : 'LOCKED',
        version: 'v1.0',
        assumptions: [],
        recommendations: [],
      };
    }

    const initialReq = RequirementCompletenessEngine.parsePrompt('');
    const defaultBom = this.generateDefaultBom(initialReq);
    const defaultCab: RackCabinetConfig = { name: 'DC01-CAB-01', totalU: 42, slotNumber: 1 };

    return {
      currentStage: 'REQUIREMENT_PROMPT',
      stageStatuses,
      stageContracts,
      requirement: initialReq,
      bomItems: defaultBom,
      rackPlacements: this.generateDefaultRackPlacements(defaultBom, defaultCab.totalU),
      cabinetConfig: defaultCab,
      cableRoutes: this.generateDefaultCableRoutes(initialReq, defaultBom),
      powerThermalConfig: this.generateDefaultPowerThermalConfig(initialReq),
      gapItems: this.generateDefaultGaps(),
      decisionHistory: [],
      lastModifiedTimestamp: Date.now(),
      activeOptimizationObjective: 'cost',
      optimizationState: {
        activeObjective: 'cost',
        changesEnabled: {},
        userNotes: {},
        customRules: {
          cost: [],
          rack_space: [],
          power: [],
          redundancy: [],
        },
      },
    };
  }



  public getState(): WorkflowStateData {
    return this.state;
  }

  public subscribe(listener: (state: WorkflowStateData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.state.lastModifiedTimestamp = Date.now();
    this.persistState();
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage Navigation & Gating
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Checks if a stage is currently unlocked and viewable.
   */
  public isStageUnlocked(stage: WorkflowStageId): boolean {
    if (stage === 'REQUIREMENT_PROMPT') return true;
    const currentIndex = WORKFLOW_STAGES_ORDER.indexOf(this.state.currentStage);
    const targetIndex = WORKFLOW_STAGES_ORDER.indexOf(stage);
    if (targetIndex >= 0 && targetIndex <= currentIndex) return true;
    const status = this.state.stageStatuses[stage];
    return status !== 'LOCKED';
  }

  /**
   * User navigates to a specific stage.
   * Backward navigation to previously reached stages is always permitted.
   */
  public navigateToStage(targetStage: WorkflowStageId): boolean {
    const currentIndex = WORKFLOW_STAGES_ORDER.indexOf(this.state.currentStage);
    const targetIndex = WORKFLOW_STAGES_ORDER.indexOf(targetStage);

    if (targetIndex > currentIndex && !this.isStageUnlocked(targetStage)) {
      console.warn(`[Workflow] Cannot jump ahead to locked stage: ${targetStage}`);
      return false;
    }

    this.state.currentStage = targetStage;
    if (this.state.stageStatuses[targetStage] === 'LOCKED') {
      this.state.stageStatuses[targetStage] = 'WAITING_FOR_USER';
    }
    this.notify();
    return true;
  }

  /**
   * Resets workflow to fresh, blank landing page.
   */
  public resetToLanding(): void {
    this.state = this.createInitialState();
    this.notify();
  }

  /**
   * Submits user's initial requirement prompt on the landing page.
   */
  public submitInitialRequirement(prompt: string): void {
    const spec = RequirementCompletenessEngine.parsePrompt(prompt);
    this.state.requirement = spec;
    this.state.bomItems = this.generateDefaultBom(spec);
    const cab = this.state.cabinetConfig || { name: 'DC01-CAB-01', totalU: 42, slotNumber: 1 };
    this.state.cabinetConfig = cab;
    this.state.rackPlacements = this.generateDefaultRackPlacements(this.state.bomItems, cab.totalU);
    this.state.cableRoutes = this.generateDefaultCableRoutes(spec, this.state.bomItems);
    this.state.powerThermalConfig = this.generateDefaultPowerThermalConfig(spec);
    this.state.gapItems = this.generateDefaultGaps();

    // Transition to REQUIREMENT_BRIEF
    this.state.stageStatuses['REQUIREMENT_PROMPT'] = 'COMPLETED';
    this.state.stageStatuses['REQUIREMENT_BRIEF'] = 'WAITING_FOR_USER';
    this.state.currentStage = 'REQUIREMENT_BRIEF';

    this.recordDecision('REQUIREMENT_PROMPT', 'APPROVED', 'Initial requirement submitted');
    this.notify();
  }



  /**
   * Updates requirement answers to clarifying questions (with custom value support).
   */
  public answerClarification(questionId: string, answer: string, isCustom = false): void {
    const current = this.state.requirement;
    const answers: Record<string, string> = {};
    const customFlags: Record<string, boolean> = {};

    for (const q of current.clarifications) {
      answers[q.questionId] = q.selectedAnswer || '';
      customFlags[q.questionId] = !!q.isCustom;
    }
    answers[questionId] = answer;
    customFlags[questionId] = isCustom;

    this.state.requirement = RequirementCompletenessEngine.applyClarifications(current, answers, customFlags);
    this.notify();
  }

  /**
   * Updates an assumption (toggle enabled/disabled, edit text, add user comment/feedback).
   */
  public updateAssumption(assumptionId: string, updates: Partial<import('./types').AssumptionItem>): void {
    this.state.requirement = RequirementCompletenessEngine.updateAssumption(
      this.state.requirement,
      assumptionId,
      updates
    );
    this.notify();
  }

  /**
   * Adds a new custom assumption.
   */
  public addAssumption(text: string): void {
    this.state.requirement = RequirementCompletenessEngine.addAssumption(this.state.requirement, text);
    this.notify();
  }

  /**
   * Removes an assumption.
   */
  public removeAssumption(assumptionId: string): void {
    this.state.requirement = RequirementCompletenessEngine.removeAssumption(this.state.requirement, assumptionId);
    this.notify();
  }

  /**
   * Directly updates a known property (e.g. user changing Platform or Node count).
   */
  public updateKnownProperty(key: string, value: string | number): void {
    this.state.requirement = RequirementCompletenessEngine.updateKnownProperty(
      this.state.requirement,
      key,
      value
    );
    this.notify();
  }

  /**
   * User Approves the Current Stage and advances to the next stage.
   */
  public approveCurrentStage(notes?: string): boolean {
    const current = this.state.currentStage;
    const currentIndex = WORKFLOW_STAGES_ORDER.indexOf(current);

    // Mark current as APPROVED / COMPLETED
    this.state.stageStatuses[current] = 'APPROVED';
    const contract = this.state.stageContracts[current];
    contract.status = 'APPROVED';
    contract.userDecision = 'APPROVED';
    contract.completedTimestamp = Date.now();

    this.recordDecision(current, 'APPROVED', notes);

    // Unlock next stage
    if (currentIndex < WORKFLOW_STAGES_ORDER.length - 1) {
      const nextStage = WORKFLOW_STAGES_ORDER[currentIndex + 1];
      this.state.stageStatuses[nextStage] = 'IN_PROGRESS';
      this.state.currentStage = nextStage;
      this.notify();
      return true;
    }

    this.notify();
    return true;
  }

  /**
   * Completes deployment and marks the workflow as finished without re-triggering deployment steps.
   */
  public markDeploymentComplete(txId?: string): void {
    this.state.stageStatuses['MCP_DEPLOYMENT'] = 'COMPLETED';
    this.state.stageStatuses['POST_DEPLOYMENT_VALIDATION'] = 'COMPLETED';
    this.state.stageStatuses['COMPLETED'] = 'COMPLETED';
    if (this.state.stageContracts['MCP_DEPLOYMENT']) {
      this.state.stageContracts['MCP_DEPLOYMENT'].status = 'COMPLETED';
    }
    if (this.state.stageContracts['POST_DEPLOYMENT_VALIDATION']) {
      this.state.stageContracts['POST_DEPLOYMENT_VALIDATION'].status = 'COMPLETED';
    }
    if (this.state.stageContracts['COMPLETED']) {
      this.state.stageContracts['COMPLETED'].status = 'COMPLETED';
    }
    this.state.currentStage = 'COMPLETED';
    this.recordDecision('MCP_DEPLOYMENT', 'APPROVED', `Transaction ${txId || 'committed'} deployed cleanly to canvas`);
    this.notify();
  }

  /**
   * Invalidate downstream stages when an earlier approved stage is modified.
   */
  public modifyApprovedStage(stage: WorkflowStageId, notes?: string): void {
    const stageIndex = WORKFLOW_STAGES_ORDER.indexOf(stage);

    // Bump version for this stage
    const contract = this.state.stageContracts[stage];
    const verNum = parseFloat(contract.version.replace('v', '')) + 0.1;
    contract.version = `v${verNum.toFixed(1)}`;
    contract.status = 'IN_PROGRESS';
    this.state.stageStatuses[stage] = 'IN_PROGRESS';
    this.state.currentStage = stage;

    this.recordDecision(stage, 'MODIFIED', notes || `Modified ${stage}, invalidated downstream`);

    // Invalidate downstream stages to STALE
    for (let i = stageIndex + 1; i < WORKFLOW_STAGES_ORDER.length; i++) {
      const downstream = WORKFLOW_STAGES_ORDER[i];
      const curStatus = this.state.stageStatuses[downstream];
      if (
        curStatus === 'APPROVED' ||
        curStatus === 'COMPLETED' ||
        curStatus === 'IN_PROGRESS' ||
        curStatus === 'WAITING_FOR_USER'
      ) {
        this.state.stageStatuses[downstream] = 'STALE';
        this.state.stageContracts[downstream].status = 'STALE';
      }
    }

    this.notify();
  }

  /**
   * Record a formal decision into the tamper-evident audit history.
   */
  private recordDecision(
    stageId: WorkflowStageId,
    decision: 'APPROVED' | 'MODIFIED' | 'REVERTED',
    notes?: string
  ): void {
    const entry: DecisionLogEntry = {
      stageId,
      version: this.state.stageContracts[stageId]?.version || 'v1.0',
      user: 'Administrator (Architect)',
      timestamp: Date.now(),
      decision,
      notes,
    };
    this.state.decisionHistory.push(entry);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage-Aware MCP Permissions
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Validates whether a specific MCP tool is allowed during the current workflow stage.
   */
  public isToolAllowedInCurrentStage(toolName: string): boolean {
    const allowed = this.getAllowedToolsForStage(this.state.currentStage);
    return allowed.includes('*') || allowed.includes(toolName);
  }

  public getAllowedToolsForStage(stage: WorkflowStageId): string[] {
    switch (stage) {
      case 'REQUIREMENT_PROMPT':
      case 'REQUIREMENT_BRIEF':
        return ['analyze_requirement', 'ask_requirement_question', 'summarize_requirement'];
      case 'ARCHITECTURE_DESIGN':
        return ['calculate_compute', 'calculate_storage', 'design_network', 'design_power', 'calculate_thermal', 'generate_bom'];
      case 'RESOURCE_BOM':
        return ['search_library', 'get_equipment', 'compare_equipment', 'select_resource'];
      case 'PHYSICAL_DESIGN':
        return ['create_rack', 'place_equipment', 'move_equipment', 'validate_layout'];
      case 'NETWORK_CABLING':
        return ['get_ports', 'connect_ports', 'create_cable', 'route_cable', 'validate_network'];
      case 'POWER_THERMAL':
        return ['configure_power', 'add_pdu', 'connect_power', 'calculate_heat_load'];
      case 'ENGINEERING_VALIDATION':
        return ['validate_design', 'validate_network', 'validate_power', 'validate_cooling', 'validate_capacity', 'identify_gaps'];
      case 'GAP_ANALYSIS':
      case 'OPTIMIZATION':
        return ['optimize_design', 'optimize_cabling', 'optimize_power', 'optimize_rack_space', 'optimize_cost'];
      case 'FINAL_DESIGN':
        return ['get_bom', 'validate_design'];
      case 'MCP_DEPLOYMENT':
      case 'POST_DEPLOYMENT_VALIDATION':
      case 'COMPLETED':
        return ['preview_design_changes', 'apply_design_changes', 'rollback_design_changes', 'get_current_design'];
      default:
        return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Avatar Workflow Mood Mapping
  // ──────────────────────────────────────────────────────────────────────────

  public getAvatarMoodForCurrentStage(): 'idle' | 'analyzing' | 'thinking' | 'celebrating' | 'alert' {
    switch (this.state.currentStage) {
      case 'REQUIREMENT_PROMPT':
        return 'idle'; // Listening
      case 'REQUIREMENT_BRIEF':
      case 'ARCHITECTURE_DESIGN':
        return 'thinking'; // Architecting
      case 'RESOURCE_BOM':
      case 'PHYSICAL_DESIGN':
      case 'NETWORK_CABLING':
        return 'idle'; // Explaining
      case 'POWER_THERMAL':
        return 'thinking'; // Calculating
      case 'ENGINEERING_VALIDATION':
        return 'analyzing'; // Inspecting
      case 'GAP_ANALYSIS':
        return 'idle'; // Reviewing
      case 'OPTIMIZATION':
        return 'thinking'; // Optimizing
      case 'FINAL_DESIGN':
        return 'idle'; // Reviewing package
      case 'MCP_DEPLOYMENT':
        return 'thinking'; // Executing
      case 'POST_DEPLOYMENT_VALIDATION':
        return 'analyzing'; // Verifying
      case 'COMPLETED':
        return 'celebrating'; // Celebrating success
      default:
        return 'idle';
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Persistence
  // ──────────────────────────────────────────────────────────────────────────

  private persistState(): void {
    try {
      localStorage.setItem('rackslicer_ai_workflow_state', JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to persist workflow state to localStorage:', e);
    }
  }

  private loadPersistedState(): WorkflowStateData | null {
    try {
      const raw = localStorage.getItem('rackslicer_ai_workflow_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        const req = parsed.requirement || RequirementCompletenessEngine.parsePrompt('');
        if (!parsed.bomItems || parsed.bomItems.length === 0) {
          parsed.bomItems = this.generateDefaultBom(req);
        }
        if (!parsed.cabinetConfig) {
          parsed.cabinetConfig = { name: 'DC01-CAB-01', totalU: 42, slotNumber: 1 };
        }
        if (!parsed.rackPlacements || parsed.rackPlacements.length === 0) {
          parsed.rackPlacements = this.generateDefaultRackPlacements(parsed.bomItems, parsed.cabinetConfig.totalU);
        }
        if (!parsed.cableRoutes || parsed.cableRoutes.length === 0) {
          parsed.cableRoutes = this.generateDefaultCableRoutes(req, parsed.bomItems);
        }
        if (!parsed.powerThermalConfig) {
          parsed.powerThermalConfig = this.generateDefaultPowerThermalConfig(req);
        }
        if (!parsed.gapItems || parsed.gapItems.length === 0) {
          parsed.gapItems = this.generateDefaultGaps();
        }
        if (!parsed.optimizationState) {
          parsed.optimizationState = {
            activeObjective: parsed.activeOptimizationObjective || 'cost',
            changesEnabled: {},
            userNotes: {},
            customRules: {
              cost: [],
              rack_space: [],
              power: [],
              redundancy: [],
            },
          };
        }
        if (!parsed.activeOptimizationObjective) {
          parsed.activeOptimizationObjective = parsed.optimizationState.activeObjective || 'cost';
        }
        return parsed;
      }
    } catch {
      // Ignored
    }
    return null;
  }


  // ──────────────────────────────────────────────────────────────────────────
  // BOM & Resource Management (Human in Control, AI Suggests)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generates default suggested BOM items derived from requirement specification.
   */
  public generateDefaultBom(req: RequirementSpec): HardwareBomItem[] {
    const nodeCount = req.nodeCount || 2;
    const ram = req.ramGbPerNode || 128;
    const isHyperV = req.platform === 'Microsoft Hyper-V';
    const isProxmox = req.platform === 'Proxmox';
    const isVmware = req.platform === 'VMware vSphere';
    const platformLabel = req.platform || 'Enterprise Cluster';

    return [
      {
        id: 'bom-compute-primary',
        category: 'Compute',
        name: 'Dell PowerEdge R760',
        model: 'PowerEdge R760 2U Rack Server',
        qty: nodeCount,
        specs: `2U | 2x Intel Xeon Silver 4410Y (24C/48T) | ${ram}GB DDR5-4800 | 4x 25GbE SFP28 | Dual 1100W Titanium PSU`,
        whySuggested: `Certified for ${platformLabel}. Native iDRAC9 telemetry, dual redundant PSUs, optimized CPU cores per host.`,
        unitCost: 6450,
        units: 2,
        power: 450,
        badge: 'AI Recommended',
        alternatives: [
          {
            name: 'HPE ProLiant DL380 Gen11',
            specs: `2U | 2x Intel Xeon Silver 4410Y | ${ram}GB DDR5 | 4x 25GbE | Dual 1000W PSU (iLO 6 Advanced)`,
            unitCost: 6870,
            units: 2,
            power: 460,
            reason: 'HPE enterprise platform with Silicon Root of Trust and iLO 6 management.',
          },
          {
            name: 'Supermicro SuperServer 2024US-TRT',
            specs: `2U | Dual AMD EPYC 9124 16-Core | ${ram}GB DDR5 | 2x 25GbE + 2x 10GbE | Dual 1200W PSU`,
            unitCost: 5920,
            units: 2,
            power: 430,
            reason: 'High density compute value with lower initial hardware acquisition cost.',
          },
          {
            name: 'Lenovo ThinkSystem SR650 V3',
            specs: `2U | 2x Intel Xeon Silver 4410Y | ${ram}GB DDR5 | 4x 25GbE | Dual 1100W PSU (XClarity)`,
            unitCost: 6600,
            units: 2,
            power: 450,
            reason: 'Lenovo enterprise reliability with XClarity deployment automation.',
          },
        ],
      },
      {
        id: 'bom-network-primary',
        category: 'Network',
        name: 'Cisco Nexus 93180YC-FX3',
        model: 'Nexus 93180YC-FX3',
        qty: 2,
        specs: '1U | 48x 10/25GbE SFP28 + 6x 40/100GbE QSFP28 Uplinks | Dual AC PSU | Cloud Scale ASIC',
        whySuggested: 'Ultra-low latency cut-through fabric switch. Provides non-blocking 25GbE interconnects for cluster & VM traffic.',
        unitCost: 8900,
        units: 1,
        power: 310,
        badge: 'Enterprise Standard',
        alternatives: [
          {
            name: 'Arista 7050SX3-48YC8',
            specs: '1U | 48x 25GbE SFP28 + 8x 100GbE QSFP28 | EOS Operating System | Dual AC PSU',
            unitCost: 8450,
            units: 1,
            power: 290,
            reason: 'Arista EOS programmable automation and robust EVPN-VXLAN telemetry.',
          },
          {
            name: 'Dell PowerSwitch S5248F-ON',
            specs: '1U | 48x 25GbE SFP28 + 4x 100GbE + 2x 28GbE | OS10 Open Networking | Dual PSU',
            unitCost: 7800,
            units: 1,
            power: 320,
            reason: 'Lower cost open-networking switch, native SmartFabric integration with Dell compute.',
          },
          {
            name: 'Juniper QFX5120-48Y',
            specs: '1U | 48x 25GbE SFP28 + 8x 100GbE QSFP28 | Junos OS | Dual AC PSU',
            unitCost: 8700,
            units: 1,
            power: 310,
            reason: 'Carrier-grade Junos stability with rich EVPN/MPLS feature set.',
          },
        ],
      },
      {
        id: 'bom-storage-primary',
        category: 'Storage',
        name: req.storageType?.includes('SAN') ? 'Pure Storage FlashArray //X10 R3' : 'Enterprise NVMe U.2 SSD Tier (7.68TB)',
        model: req.storageType?.includes('SAN') ? 'FlashArray //X10' : 'U.2 PCIe 4.0 NVMe 7.68TB',
        qty: req.storageType?.includes('SAN') ? 1 : Math.max(4, nodeCount * 4),
        specs: req.storageType?.includes('SAN')
          ? '3U Active-Active SAN Controller | 33TB Raw NVMe | 16/32G FC + 25GbE iSCSI | 99.9999% Availability'
          : 'U.2 PCIe 4.0 NVMe | 7.68TB per drive | 3 DWPD Endurance | Power Loss Protection',
        whySuggested: req.storageType?.includes('SAN')
          ? 'Ultra-reliable dedicated shared SAN array, ideal for enterprise clustering with sub-millisecond latencies.'
          : 'High write endurance for distributed storage WAL/DB and OSD pools. Guaranteed zero IOPS bottleneck.',
        unitCost: req.storageType?.includes('SAN') ? 24500 : 820,
        units: req.storageType?.includes('SAN') ? 3 : 0,
        power: req.storageType?.includes('SAN') ? 600 : 14,
        badge: req.storageType?.includes('SAN') ? 'HA SAN Tier' : 'High Endurance NVMe',
        alternatives: [
          {
            name: 'Micron 9400 PRO U.3 NVMe SSD (7.68TB)',
            specs: 'U.3 PCIe 4.0 NVMe | 7.68TB | 1 DWPD Read-Intensive | PLP',
            unitCost: 790,
            units: 0,
            power: 15,
            reason: 'High density NVMe tier with lower cost per terabyte for read-heavy workloads.',
          },
          {
            name: 'Solidigm D5-P5336 QLC NVMe (15.36TB)',
            specs: 'U.2 PCIe 4.0 QLC NVMe | 15.36TB | Massive Capacity | PLP',
            unitCost: 1290,
            units: 0,
            power: 16,
            reason: 'Double capacity per drive bay, cutting total physical drives required.',
          },
          {
            name: 'Dell PowerStore 500T Shared SAN/NAS',
            specs: '2U Dual Controller | 25-96TB NVMe All-Flash | Unified SAN/NAS block storage',
            unitCost: 22800,
            units: 2,
            power: 550,
            reason: 'Cost-effective entry enterprise SAN for Hyper-V or VMware clusters.',
          },
        ],
      },
      {
        id: 'bom-power-primary',
        category: 'Power Distribution',
        name: 'APC AP8858 Vertical PDU',
        model: 'AP8858',
        qty: req.powerFeed === 'Single Feed' ? 1 : 2,
        specs: '0U Vertical Side-Mount | 230V 32A | 20x IEC C13 Outlets | True Scale 42U Span',
        whySuggested: 'Side-mount vertical 0U chassis provides branch circuit metering without consuming rack units.',
        unitCost: 890,
        units: 0,
        power: 10,
        badge: req.powerFeed === 'Single Feed' ? 'Single Feed PDU' : 'A/B Redundant Feed',
        alternatives: [
          {
            name: 'APC AP8868 Vertical PDU',
            specs: '0U Vertical Side-Mount | 208V 30A | 24x C19 Outlets | High-Current Compute',
            unitCost: 1150,
            units: 0,
            power: 15,
            reason: 'High-density C19 receptacles support high-draw AI accelerators and GPU server blades.',
          },
          {
            name: 'APC AP8853 Vertical PDU',
            specs: '0U Vertical Side-Mount | 230V 32A | 16x C13 + 2x C19 Outlets | Mixed Load',
            unitCost: 980,
            units: 0,
            power: 10,
            reason: 'Combination C13/C19 outlets accommodate both standard servers and heavy SAN storage.',
          },
          {
            name: 'Vertiv MPH2-IS Vertical PDU (India)',
            specs: '0U Vertical Side-Mount | 230V 32A | 16x IS6538 15A Sockets | BIS Compliant',
            unitCost: 920,
            units: 0,
            power: 10,
            reason: 'Complies with Indian Bureau of Indian Standards (BIS) IS6538 data center requirements.',
          },
          {
            name: 'Legrand LCS3 Vertical PDU (India)',
            specs: '0U Vertical Side-Mount | 230V 32A | 24x IS6538 5A Outlets | BIS Certified',
            unitCost: 860,
            units: 0,
            power: 10,
            reason: 'High-count Indian 5A sockets for standard compute density and network appliances.',
          },
          {
            name: 'Generic NEMA Vertical PDU',
            specs: '0U Vertical Side-Mount | 120V 20A | 24x NEMA 5-15 Receptacles',
            unitCost: 650,
            units: 0,
            power: 10,
            reason: 'Standard North American 120V NEMA 5-15 wall plug compatibility.',
          },
        ],
      },
      {
        id: 'bom-cabling-primary',
        category: 'Cabling & Optics',
        name: 'Amphenol 25GbE SFP28 Direct Attach Copper (2m)',
        model: 'SFP28 Passive DAC Cable (2m)',
        qty: nodeCount * 4 + 4,
        specs: 'Passive Twinax DAC | 25Gbps Line Rate | 30AWG | EEPROM Auto-Negotiation',
        whySuggested: 'Zero optical conversion latency, <0.1W power per link, highly durable for in-rack top-of-rack connections.',
        unitCost: 55,
        units: 0,
        power: 2,
        badge: 'Low Latency DAC',
        alternatives: [
          {
            name: 'Cisco Active Optical Cable (AOC) SFP28 (5m)',
            specs: 'Active Optical Cable | 25Gbps | Lightweight Flexible Fiber | 5 Meter Reach',
            unitCost: 120,
            units: 0,
            power: 4,
            reason: 'Flexible lightweight routing for inter-rack cabling or distances beyond 3 meters.',
          },
          {
            name: 'FS.com 25GBASE-SR SFP28 Transceiver + OM4 LC Patch',
            specs: '850nm MMF Transceiver (up to 100m) + 2m Aqua OM4 LC Duplex Fiber Patch Cable',
            unitCost: 75,
            units: 0,
            power: 3,
            reason: 'Modular transceiver configuration allowing custom cable lengths or patch panels.',
          },
        ],
      },
    ];
  }

  /**
   * Retrieves active BOM items.
   */
  public getBomItems(): HardwareBomItem[] {
    if (!this.state.bomItems || this.state.bomItems.length === 0) {
      this.state.bomItems = this.generateDefaultBom(this.state.requirement);
    }
    return this.state.bomItems;
  }

  /**
   * Updates quantity of a BOM item.
   */
  public updateBomItemQty(id: string, qty: number): void {
    const item = this.getBomItems().find((b) => b.id === id);
    if (!item) return;
    item.qty = Math.max(0, qty);
    item.isCustomized = true;
    this.notify();
  }

  /**
   * Swaps a BOM item with one of its evaluated alternatives.
   */
  public swapBomItemAlternative(id: string, selectedAltName: string): void {
    const items = this.getBomItems();
    const item = items.find((b) => b.id === id);
    if (!item) return;

    if (item.name === selectedAltName) return;

    const altIndex = item.alternatives.findIndex((a) => a.name === selectedAltName);
    if (altIndex === -1) return;

    const chosenAlt = item.alternatives[altIndex];

    // Preserve previous component as an alternative in the list
    const oldPrimaryAsAlt: HardwareAlternative = {
      name: item.name,
      specs: item.specs,
      unitCost: item.unitCost,
      units: item.units,
      power: item.power,
      reason: item.whySuggested,
    };

    // Swap values
    item.name = chosenAlt.name;
    item.model = chosenAlt.name;
    item.specs = chosenAlt.specs;
    item.unitCost = chosenAlt.unitCost;
    item.units = chosenAlt.units;
    item.power = chosenAlt.power;
    item.whySuggested = chosenAlt.reason || `Alternative selected by user to replace ${oldPrimaryAsAlt.name}.`;
    item.badge = 'User Selected';
    item.isCustomized = true;

    // Replace the chosen alternative in the array with the old item
    item.alternatives.splice(altIndex, 1, oldPrimaryAsAlt);

    // If this was a PDU swap, also sync cabinetConfig active vertical PDUs
    if (item.category === 'Power Distribution') {
      const matchPdu = this.getAvailableVerticalPdus().find(
        (vp) => item.name.toLowerCase().includes(vp.name.toLowerCase()) || vp.name.toLowerCase().includes(item.name.toLowerCase())
      );
      if (matchPdu) {
        this.updateCabinetConfig({
          leftPduTemplateId: matchPdu.id,
          rightPduTemplateId: this.state.powerThermalConfig?.feedType === 'Single Feed' ? 'none' : matchPdu.id,
        });
      }
    }

    this.notify();
  }

  /**
   * Updates properties of an existing BOM item.
   */
  public updateBomItem(id: string, updates: Partial<HardwareBomItem>): void {
    const item = this.getBomItems().find((b) => b.id === id);
    if (!item) return;
    Object.assign(item, updates, { isCustomized: true });
    this.notify();
  }

  /**
   * Adds a new custom or catalog BOM item.
   */
  public addBomItem(newItem: Omit<HardwareBomItem, 'id'>): void {
    const id = `bom-custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fullItem: HardwareBomItem = {
      ...newItem,
      id,
      isUserAdded: true,
      isCustomized: true,
      alternatives: newItem.alternatives || [],
    };
    this.getBomItems().push(fullItem);
    this.notify();
  }

  /**
   * Removes an item from the BOM.
   */
  public removeBomItem(id: string): void {
    this.state.bomItems = this.getBomItems().filter((b) => b.id !== id);
    this.notify();
  }

  /**
   * Resets BOM to AI suggestions based on current requirement spec.
   */
  public resetBomToAiDefaults(): void {
    this.state.bomItems = this.generateDefaultBom(this.state.requirement);
    this.notify();
  }

  /**
   * Calculates live totals for the user-managed BOM.
   */
  public getBomTotals(): { totalCost: number; totalUnits: number; totalWatts: number; itemCount: number } {
    const items = this.getBomItems();
    let totalCost = 0;
    let totalUnits = 0;
    let totalWatts = 0;
    let itemCount = 0;

    for (const item of items) {
      const q = item.qty || 0;
      totalCost += q * (item.unitCost || 0);
      totalUnits += q * (item.units || 0);
      totalWatts += q * (item.power || 0);
      itemCount += q;
    }

    return { totalCost, totalUnits, totalWatts, itemCount };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 04: Physical Layout & Cabinet Management
  // ──────────────────────────────────────────────────────────────────────────

  public generateDefaultRackPlacements(bom: HardwareBomItem[], totalU = 42): RackPlacementItem[] {
    const placements: RackPlacementItem[] = [];

    // ToR switches at top
    const switchItem = bom.find((b) => b.category === 'Network' && b.qty > 0 && b.units > 0);
    const switchQty = switchItem ? switchItem.qty : 2;
    const switchName = switchItem ? switchItem.name : 'Cisco Nexus 93180YC-FX3';

    if (switchQty >= 1) {
      placements.push({
        id: 'place-tor-a',
        componentId: switchItem?.id,
        name: `ToR Switch A: ${switchName}`,
        action: 'Place',
        startU: totalU,
        heightU: 1,
        category: 'Network',
      });
    }
    if (switchQty >= 2) {
      placements.push({
        id: 'place-tor-b',
        componentId: switchItem?.id,
        name: `ToR Switch B: ${switchName}`,
        action: 'Place',
        startU: totalU - 1,
        heightU: 1,
        category: 'Network',
      });
    }

    // Brush cable manager
    placements.push({
      id: 'place-brush-mgr',
      name: '1U Horizontal Brush Cable Manager',
      action: 'Place',
      startU: totalU - 2,
      heightU: 1,
      category: 'Passive',
    });

    // Custom items (e.g. Firewall, Console Server)
    const customItems = bom.filter(
      (b) =>
        !['Compute', 'Network', 'Storage', 'Cabling & Optics', 'Power Distribution'].includes(b.category) &&
        b.qty > 0 &&
        b.units > 0
    );
    let nextTopU = totalU - 3;
    for (const c of customItems) {
      for (let i = 0; i < c.qty; i++) {
        placements.push({
          id: `place-custom-${c.id}-${i}`,
          componentId: c.id,
          name: `${c.name}${c.qty > 1 ? ` #${i + 1}` : ''}`,
          action: 'Place',
          startU: Math.max(1, nextTopU),
          heightU: c.units,
          category: c.category,
        });
        nextTopU -= c.units;
      }
    }

    // Compute nodes (mid rack)
    const computeItem = bom.find((b) => b.category === 'Compute' && b.qty > 0);
    const computeName = computeItem ? computeItem.name : 'Dell PowerEdge R760';
    const computeCount = computeItem ? computeItem.qty : 2;
    const serverU = computeItem?.units || 2;
    const baseComputeStart = Math.min(22, totalU - 8);

    for (let i = 0; i < computeCount; i++) {
      placements.push({
        id: `place-node-${i + 1}`,
        componentId: computeItem?.id,
        name: `${computeName} Node ${i + 1}`,
        action: 'Place',
        startU: baseComputeStart - i * serverU,
        heightU: serverU,
        category: 'Compute',
      });
    }

    // Storage tier at U4
    const storageItem = bom.find((b) => b.category === 'Storage' && b.qty > 0 && b.units > 0);
    const storageName = storageItem ? storageItem.name : 'Ceph Shared NVMe Tier';
    const storageU = storageItem?.units || 2;
    placements.push({
      id: 'place-storage',
      componentId: storageItem?.id,
      name: storageName,
      action: 'Place',
      startU: 4,
      heightU: storageU,
      category: 'Storage',
    });

    return placements;
  }

  public getRackPlacements(): RackPlacementItem[] {
    if (!this.state.rackPlacements || this.state.rackPlacements.length === 0) {
      const cab = this.getCabinetConfig();
      this.state.rackPlacements = this.generateDefaultRackPlacements(this.getBomItems(), cab.totalU);
    }
    return this.state.rackPlacements;
  }

  public updateRackPlacement(id: string, updates: Partial<RackPlacementItem>): void {
    const item = this.getRackPlacements().find((p) => p.id === id);
    if (!item) return;
    Object.assign(item, updates, { isUserModified: true });
    this.notify();
  }

  public moveRackPlacement(id: string, delta: number): void {
    const item = this.getRackPlacements().find((p) => p.id === id);
    if (!item) return;
    const cab = this.getCabinetConfig();
    const newStartU = Math.max(1, Math.min(cab.totalU - item.heightU + 1, item.startU + delta));
    item.startU = newStartU;
    item.isUserModified = true;
    this.notify();
  }

  public getCabinetConfig(): RackCabinetConfig {
    if (!this.state.cabinetConfig) {
      this.state.cabinetConfig = {
        name: 'DC01-CAB-01',
        totalU: 42,
        slotNumber: 1,
        leftCableManagerWidth: '4-inch',
        rightCableManagerWidth: '4-inch',
        vcmType: 'single-sided',
        leftPduTemplateId: 'vpdu-apc-ap8858',
        rightPduTemplateId: 'vpdu-apc-ap8858',
      };
    } else {
      if (this.state.cabinetConfig.leftCableManagerWidth === undefined) {
        this.state.cabinetConfig.leftCableManagerWidth = '4-inch';
      }
      if (this.state.cabinetConfig.rightCableManagerWidth === undefined) {
        this.state.cabinetConfig.rightCableManagerWidth = '4-inch';
      }
      if (!this.state.cabinetConfig.vcmType) {
        this.state.cabinetConfig.vcmType = 'single-sided';
      }
      if (!this.state.cabinetConfig.leftPduTemplateId) {
        this.state.cabinetConfig.leftPduTemplateId = 'vpdu-apc-ap8858';
      }
      if (!this.state.cabinetConfig.rightPduTemplateId) {
        this.state.cabinetConfig.rightPduTemplateId =
          this.state.powerThermalConfig?.feedType === 'Single Feed' ? 'none' : 'vpdu-apc-ap8858';
      }
    }
    return this.state.cabinetConfig;
  }

  public getAvailableVerticalPdus(): Array<{ id: string; name: string; specs: string; outlets: string }> {
    return [
      { id: 'vpdu-apc-ap8858', name: 'APC AP8858 Vertical PDU', specs: '0U Vertical | 230V 32A | 20x C13 Outlets', outlets: '20x C13' },
      { id: 'vpdu-apc-ap8868', name: 'APC AP8868 Vertical PDU', specs: '0U Vertical | 208V 30A | 24x C19 Outlets', outlets: '24x C19' },
      { id: 'vpdu-apc-ap8853', name: 'APC AP8853 Vertical PDU', specs: '0U Vertical | 230V 32A | 16x C13 + 2x C19', outlets: '16x C13 + 2x C19' },
      { id: 'vpdu-vertiv-is', name: 'Vertiv MPH2-IS Vertical PDU (India)', specs: '0U Vertical | 230V 32A | 16x IS6538 15A', outlets: '16x IS 15A' },
      { id: 'vpdu-legrand-is', name: 'Legrand LCS3 Vertical PDU (India)', specs: '0U Vertical | 230V 32A | 24x IS6538 5A', outlets: '24x IS 5A' },
      { id: 'vpdu-nema', name: 'Generic NEMA Vertical PDU', specs: '0U Vertical | 120V 20A | 24x NEMA 5-15', outlets: '24x NEMA 5-15' },
      { id: 'vpdu-uk', name: 'Generic UK Vertical PDU', specs: '0U Vertical | 230V 32A | 16x BS1363 Outlets', outlets: '16x BS1363' },
    ];
  }

  public updateCabinetConfig(updates: Partial<RackCabinetConfig>): void {
    this.state.cabinetConfig = { ...this.getCabinetConfig(), ...updates };
    this.notify();
  }

  public resetPlacementsToAi(): void {
    const cab = this.getCabinetConfig();
    this.state.rackPlacements = this.generateDefaultRackPlacements(this.getBomItems(), cab.totalU);
    this.notify();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 05: Network & Cabling
  // ──────────────────────────────────────────────────────────────────────────

  public generateDefaultCableRoutes(req: RequirementSpec, bom: HardwareBomItem[]): CableRouteItem[] {
    const routes: CableRouteItem[] = [];
    const computeItem = bom.find((b) => b.category === 'Compute' && b.qty > 0);
    const nodeCount = computeItem ? computeItem.qty : req.nodeCount || 2;

    for (let i = 1; i <= nodeCount; i++) {
      routes.push({
        id: `cable-eth0-node-${i}`,
        source: `Node ${i} (eth0)`,
        dest: `ToR-A Port ${i}`,
        type: '25GbE SFP28 DAC',
        color: '#0284c7',
        length: '2.0m',
        vlan: 'VLAN 10 (VM Prod)',
      });
      routes.push({
        id: `cable-eth1-node-${i}`,
        source: `Node ${i} (eth1)`,
        dest: `ToR-B Port ${i}`,
        type: '25GbE SFP28 DAC',
        color: '#10b981',
        length: '2.0m',
        vlan: 'VLAN 20 (Ceph Sync)',
      });
      routes.push({
        id: `cable-idrac-node-${i}`,
        source: `Node ${i} (iDRAC)`,
        dest: `Mgmt Switch Port ${i}`,
        type: 'Cat6 RJ45',
        color: '#f59e0b',
        length: '2.5m',
        vlan: 'VLAN 99 (OOB/iDRAC)',
      });
    }

    return routes;
  }

  public getCableRoutes(): CableRouteItem[] {
    if (!this.state.cableRoutes || this.state.cableRoutes.length === 0) {
      this.state.cableRoutes = this.generateDefaultCableRoutes(this.state.requirement, this.getBomItems());
    }
    return this.state.cableRoutes;
  }

  public updateCableRoute(id: string, updates: Partial<CableRouteItem>): void {
    const route = this.getCableRoutes().find((r) => r.id === id);
    if (!route) return;
    Object.assign(route, updates, { isUserModified: true });
    this.notify();
  }

  public addCableRoute(route: Omit<CableRouteItem, 'id'>): void {
    const id = `cable-user-${Date.now()}`;
    this.getCableRoutes().push({ ...route, id, isUserModified: true });
    this.notify();
  }

  public removeCableRoute(id: string): void {
    this.state.cableRoutes = this.getCableRoutes().filter((r) => r.id !== id);
    this.notify();
  }

  public resetCablesToAi(): void {
    this.state.cableRoutes = this.generateDefaultCableRoutes(this.state.requirement, this.getBomItems());
    this.notify();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 06: Power & Thermal
  // ──────────────────────────────────────────────────────────────────────────

  public generateDefaultPowerThermalConfig(req: RequirementSpec): PowerThermalConfig {
    return {
      feedType: req.powerFeed === 'Single Feed' ? 'Single Feed' : 'A/B Dual Redundant',
      voltage: 230,
      breakerAmps: 32,
      continuousLoadPercent: 80,
      ambientTempC: 22,
      coolingChecks: [
        {
          id: 'cool-doors',
          text: 'Perforated Front/Rear Doors: 80% open area ensures unobstructed cold air intake.',
          checked: true,
        },
        {
          id: 'cool-blanking',
          text: 'Blanking Panels: 1U blanking panels deployed in all unused bays to eliminate hot exhaust recirculation.',
          checked: true,
        },
        {
          id: 'cool-ashrae',
          text: 'Thermal Headroom: Calculated Delta T complies with ASHRAE Class A1 Enterprise Datacenter standards.',
          checked: true,
        },
      ],
    };
  }

  public getPowerThermalConfig(): PowerThermalConfig {
    if (!this.state.powerThermalConfig) {
      this.state.powerThermalConfig = this.generateDefaultPowerThermalConfig(this.state.requirement);
    }
    return this.state.powerThermalConfig;
  }

  public updatePowerThermalConfig(updates: Partial<PowerThermalConfig>): void {
    this.state.powerThermalConfig = { ...this.getPowerThermalConfig(), ...updates };
    this.notify();
  }

  public toggleCoolingCheck(checkId: string, checked: boolean, note?: string): void {
    const cfg = this.getPowerThermalConfig();
    const item = cfg.coolingChecks.find((c) => c.id === checkId);
    if (!item) return;
    item.checked = checked;
    if (note !== undefined) item.userNote = note;
    this.notify();
  }

  public addCoolingCheck(text: string): void {
    const cfg = this.getPowerThermalConfig();
    cfg.coolingChecks.push({
      id: `cool-custom-${Date.now()}`,
      text,
      checked: true,
    });
    this.notify();
  }

  public removeCoolingCheck(checkId: string): void {
    const cfg = this.getPowerThermalConfig();
    cfg.coolingChecks = cfg.coolingChecks.filter((c) => c.id !== checkId);
    this.notify();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 08: Gap Analysis ("What Am I Missing?")
  // ──────────────────────────────────────────────────────────────────────────

  public generateDefaultGaps(): GapAnalysisItem[] {
    return [
      {
        id: 'gap_oob',
        title: 'Dedicated Out-of-Band (OOB/iDRAC) Management Switch',
        category: 'Management',
        severity: 'Recommended',
        description: 'Production server iDRAC ports should not be co-mingled with data plane switches. Recommending a 1U 24-Port 1GbE dedicated management switch.',
        accepted: false,
        dismissed: false,
        componentToAdd: {
          name: 'Cisco Catalyst 1000 24-Port 1G Mgmt Switch',
          units: 1,
          watts: 35,
          costUsd: 1250,
        },
      },
      {
        id: 'gap_backup',
        title: 'Immutable Ransomware Backup Appliance Target',
        category: 'Security',
        severity: 'Recommended',
        description: 'The current cluster does not define an external backup target for VM snapshot retention and off-site replication.',
        accepted: false,
        dismissed: false,
        componentToAdd: {
          name: 'Synology RS3621xs+ 12-Bay Immutable Backup Storage',
          units: 2,
          watts: 140,
          costUsd: 3400,
        },
      },
      {
        id: 'gap_telemetry',
        title: 'Hardware Environment & Temperature Probes',
        category: 'Monitoring',
        severity: 'Recommended',
        description: 'Recommending APC environmental sensors for top/middle/bottom rack intake temperature monitoring.',
        accepted: false,
        dismissed: false,
        componentToAdd: {
          name: 'APC AP9335T Temperature & Humidity Probe Kit',
          units: 0,
          watts: 5,
          costUsd: 220,
        },
      },
    ];
  }

  public getGapItems(): GapAnalysisItem[] {
    if (!this.state.gapItems || this.state.gapItems.length === 0) {
      this.state.gapItems = this.generateDefaultGaps();
    }
    return this.state.gapItems;
  }

  public acceptGap(id: string): void {
    const gaps = this.getGapItems();
    const gap = gaps.find((g) => g.id === id);
    if (!gap) return;
    gap.accepted = true;
    gap.dismissed = false;

    // If gap has componentToAdd, add it to BOM
    if (gap.componentToAdd) {
      const existing = this.getBomItems().find((b) => b.name === gap.componentToAdd!.name);
      if (!existing) {
        this.addBomItem({
          name: gap.componentToAdd.name,
          model: gap.componentToAdd.name,
          category: (gap.category === 'Management' ? 'Network' : gap.category === 'Security' ? 'Storage' : 'Custom') as any,
          qty: 1,
          unitCost: gap.componentToAdd.costUsd,
          units: gap.componentToAdd.units,
          power: gap.componentToAdd.watts,
          specs: `${gap.componentToAdd.units}U | Added from Gap Analysis: ${gap.title}`,
          whySuggested: `Accepted gap recommendation: ${gap.title}`,
          badge: 'Gap Accepted',
          alternatives: [],
        });
      }
    }
    this.notify();
  }

  public dismissGap(id: string): void {
    const gaps = this.getGapItems();
    const gap = gaps.find((g) => g.id === id);
    if (!gap) return;
    gap.dismissed = true;
    gap.accepted = false;
    this.notify();
  }

  public reopenGap(id: string): void {
    const gaps = this.getGapItems();
    const gap = gaps.find((g) => g.id === id);
    if (!gap) return;
    gap.accepted = false;
    gap.dismissed = false;
    this.notify();
  }

  public updateGap(id: string, updates: Partial<GapAnalysisItem>): void {
    const gap = this.getGapItems().find((g) => g.id === id);
    if (!gap) return;
    Object.assign(gap, updates);
    this.notify();
  }

  public addGapItem(gap: {
    title: string;
    category?: GapAnalysisItem['category'];
    description: string;
    severity?: GapAnalysisItem['severity'];
    userNote?: string;
    accepted?: boolean;
    dismissed?: boolean;
    componentToAdd?: GapAnalysisItem['componentToAdd'];
  }): void {
    const id = `gap-custom-${Date.now()}`;
    this.getGapItems().push({
      id,
      title: gap.title,
      category: gap.category || 'Custom',
      severity: gap.severity || 'Recommended',
      description: gap.description,
      accepted: gap.accepted || false,
      dismissed: gap.dismissed || false,
      userNote: gap.userNote,
      componentToAdd: gap.componentToAdd,
    });
    this.notify();
  }

  public removeGap(id: string): void {
    this.state.gapItems = this.getGapItems().filter((g) => g.id !== id);
    this.notify();
  }

  public resetGapsToAi(): void {
    this.state.gapItems = this.generateDefaultGaps();
    this.notify();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 09: Design Optimization (Human-Controlled Multi-Objective Engine)
  // ──────────────────────────────────────────────────────────────────────────

  public getOptimizationObjective(): OptimizationObjective {
    return this.state.optimizationState?.activeObjective || this.state.activeOptimizationObjective || 'cost';
  }

  public setOptimizationObjective(objective: OptimizationObjective): void {
    if (!this.state.optimizationState) {
      this.state.optimizationState = {
        activeObjective: objective,
        changesEnabled: {},
        userNotes: {},
        customRules: { cost: [], rack_space: [], power: [], redundancy: [] },
      };
    }
    this.state.optimizationState.activeObjective = objective;
    this.state.activeOptimizationObjective = objective;
    this.notify();
  }

  public toggleOptimizationChange(changeId: string, enabled: boolean): void {
    if (!this.state.optimizationState) {
      this.state.optimizationState = {
        activeObjective: 'cost',
        changesEnabled: {},
        userNotes: {},
        customRules: { cost: [], rack_space: [], power: [], redundancy: [] },
      };
    }
    this.state.optimizationState.changesEnabled[changeId] = enabled;
    this.notify();
  }

  public updateOptimizationChangeNote(changeId: string, note: string): void {
    if (!this.state.optimizationState) {
      this.state.optimizationState = {
        activeObjective: 'cost',
        changesEnabled: {},
        userNotes: {},
        customRules: { cost: [], rack_space: [], power: [], redundancy: [] },
      };
    }
    this.state.optimizationState.userNotes[changeId] = note;
    this.notify();
  }

  public addCustomOptimizationRule(objective: OptimizationObjective, rule: string): void {
    if (!rule || !rule.trim()) return;
    if (!this.state.optimizationState) {
      this.state.optimizationState = {
        activeObjective: objective,
        changesEnabled: {},
        userNotes: {},
        customRules: { cost: [], rack_space: [], power: [], redundancy: [] },
      };
    }
    if (!this.state.optimizationState.customRules[objective]) {
      this.state.optimizationState.customRules[objective] = [];
    }
    this.state.optimizationState.customRules[objective].push(rule.trim());
    this.notify();
  }

  public removeCustomOptimizationRule(objective: OptimizationObjective, ruleIndex: number): void {
    if (!this.state.optimizationState?.customRules?.[objective]) return;
    this.state.optimizationState.customRules[objective].splice(ruleIndex, 1);
    this.notify();
  }

  public getCustomOptimizationRules(objective: OptimizationObjective): string[] {
    return this.state.optimizationState?.customRules?.[objective] || [];
  }

  public getOptimizationProposal(targetObjective?: OptimizationObjective): OptimizationProposal {
    const objective = targetObjective || this.getOptimizationObjective();
    const bomTotals = this.getBomTotals();
    const totalCost = bomTotals.totalCost || 51450;
    const totalWatts = bomTotals.totalWatts || 3450;
    const totalUnits = bomTotals.totalUnits || 22;
    const cabinetTotalU = this.state.cabinetConfig?.totalU || 42;
    const growthHeadroomPercent = Math.max(0, Math.round(((cabinetTotalU - totalUnits) / cabinetTotalU) * 100));
    const heatLoadBtu = Math.round(totalWatts * 3.412142);
    const redundancyLevel = 'Tier III (N+1)';

    const defaultChangesMap: Record<OptimizationObjective, OptimizationChangeItem[]> = {
      cost: [
        {
          id: 'opt-cost-uplinks',
          action: 'Replace 100GbE QSFP28 uplink cards with 25GbE SFP28 dual-port adapters',
          target: 'Compute & ToR Uplinks',
          description: 'Right-sizes inter-switch uplinks to 25GbE active-active, which meets throughput SLAs while cutting transceiver & PCIe card costs.',
          impact: 'Saves $2,400 CapEx',
          enabled: true,
          costImpactUsd: -2400,
          powerImpactWatts: -40,
          ruImpact: 0,
        },
        {
          id: 'opt-cost-psu',
          action: 'Right-size power supply units from 1400W to 1100W Titanium 80-Plus',
          target: 'Compute Server PSUs',
          description: 'Replaces oversized 1400W supplies with 1100W Titanium 80-Plus units, operating right at the 50% peak efficiency curve.',
          impact: 'Saves $1,150 CapEx; improves low-load efficiency',
          enabled: true,
          costImpactUsd: -1150,
          powerImpactWatts: -130,
          ruImpact: 0,
        },
        {
          id: 'opt-cost-cables',
          action: 'Standardize intra-rack patch cables to 2m DAC twinax bundles',
          target: 'Intra-Rack Patch Cabling',
          description: 'Direct Attach Copper (DAC) provides zero optical transceiver overhead, identical latency (<0.1µs), and lower component failure rate.',
          impact: 'Saves $1,300 CapEx',
          enabled: true,
          costImpactUsd: -1300,
          powerImpactWatts: -100,
          ruImpact: 0,
        },
      ],
      rack_space: [
        {
          id: 'opt-space-nodes',
          action: 'Consolidate standalone 2U compute nodes into high-density 2U 4-node chassis',
          target: 'Compute Cluster Nodes',
          description: 'Swaps individual 2U servers with a 2U multi-node chassis (e.g. Dell C6620 / Supermicro BigTwin), cutting compute vertical footprint by 50%.',
          impact: 'Reclaims 4U vertical space',
          enabled: true,
          costImpactUsd: 800,
          powerImpactWatts: -60,
          ruImpact: -4,
        },
        {
          id: 'opt-space-patch',
          action: 'Adopt 0.5U / 1U ultra-compact patch panels and high-density 48-port ToR switch',
          target: 'Patch Field & Switching',
          description: 'Consolidates patch fields into high-density angled panels, freeing up 2U of horizontal rack real estate.',
          impact: 'Reclaims 2U network space',
          enabled: true,
          costImpactUsd: -300,
          powerImpactWatts: -20,
          ruImpact: -2,
        },
        {
          id: 'opt-space-vcm',
          action: 'Relocate horizontal cable managers and PDUs into zero-U vertical infrastructure channels',
          target: 'Cable Management & Power Distribution',
          description: 'Eliminates 2U horizontal duct pass-throughs by routing all intra-rack bundles through the vertical side channels.',
          impact: 'Reclaims 2U horizontal space',
          enabled: true,
          costImpactUsd: -500,
          powerImpactWatts: 0,
          ruImpact: -2,
        },
      ],
      power: [
        {
          id: 'opt-power-titanium',
          action: 'Upgrade server PSUs to 96% Titanium Certified Hot-Plug Redundant Units',
          target: 'Server Power Supplies',
          description: 'Maximizes power conversion efficiency under normal 40-60% load, lowering continuous power consumption.',
          impact: 'Reduces continuous draw by 280 W; saves ~$290/yr',
          enabled: true,
          costImpactUsd: 1200,
          powerImpactWatts: -280,
          ruImpact: 0,
        },
        {
          id: 'opt-power-cstates',
          action: 'Deploy dynamic CPU C-state power profiles & Energy-Efficient Ethernet (EEE 802.3az)',
          target: 'CPU & Network PHYs',
          description: 'Enables advanced BIOS autonomous frequency scaling and low-power idle link state during non-peak hours.',
          impact: 'Reduces idle draw by 190 W; zero hardware cost',
          enabled: true,
          costImpactUsd: 0,
          powerImpactWatts: -190,
          ruImpact: 0,
        },
        {
          id: 'opt-power-containment',
          action: 'Equip blanking panels & cold-aisle brush containment to eliminate thermal recirculation',
          target: 'Cabinet Airflow & Thermal Seals',
          description: 'Prevents heated exhaust air from recirculating back to server air intakes, reducing CRAC cooling fan work.',
          impact: 'Drops intake temp by 2.8°C; saves 1,602 BTU/hr cooling load',
          enabled: true,
          costImpactUsd: 450,
          powerImpactWatts: -50,
          ruImpact: 0,
        },
      ],
      redundancy: [
        {
          id: 'opt-redundancy-ats',
          action: 'Dual-cord all single-power devices via 1U Automatic Transfer Switch (ATS) & dedicated redundant feeds',
          target: 'A/B Power Pathing',
          description: 'Provides seamless fast-transfer (<8ms) power failover between Feed A and Feed B for single-corded network appliances.',
          impact: 'True A/B independent power pathing for all active devices',
          enabled: true,
          costImpactUsd: 1800,
          powerImpactWatts: 40,
          ruImpact: 1,
        },
        {
          id: 'opt-redundancy-mlag',
          action: 'Implement MLAG / EVPN multi-chassis link aggregation across redundant ToR switches',
          target: 'ToR Switches & Uplinks',
          description: 'Enables non-blocking active-active forwarding across both top-of-rack switches with zero-downtime hitless failover.',
          impact: 'Hitless switch failover & active-active dual uplinks',
          enabled: true,
          costImpactUsd: 600,
          powerImpactWatts: 30,
          ruImpact: 0,
        },
        {
          id: 'opt-redundancy-hotspare',
          action: 'Add dedicated N+1 hot-spare compute node ready for instant cluster failover',
          target: 'Compute Hypervisor Nodes',
          description: 'Pre-provisions an identical node in standby mode, guaranteeing instant failover without VM throttling.',
          impact: 'Full N+1 survivability; allows maintenance without VM eviction',
          enabled: true,
          costImpactUsd: 8900,
          powerImpactWatts: 310,
          ruImpact: 2,
        },
      ],
      cooling: [],
      performance: [],
      cabling: [],
      maintainability: [],
    };

    const changes = (defaultChangesMap[objective] || defaultChangesMap.cost).map((ch) => {
      const isEnabled = this.state.optimizationState?.changesEnabled[ch.id] !== undefined
        ? !!this.state.optimizationState.changesEnabled[ch.id]
        : ch.enabled;
      const userNote = this.state.optimizationState?.userNotes[ch.id];
      return {
        ...ch,
        enabled: isEnabled,
        userNote,
      };
    });

    let costDiff = 0;
    let powerDiffWatts = 0;
    let ruDiff = 0;

    for (const ch of changes) {
      if (ch.enabled) {
        costDiff += ch.costImpactUsd;
        powerDiffWatts += ch.powerImpactWatts;
        ruDiff += ch.ruImpact;
      }
    }

    const afterCost = Math.max(0, totalCost + costDiff);
    const afterWatts = Math.max(0, totalWatts + powerDiffWatts);
    const afterUnits = Math.max(1, Math.min(cabinetTotalU, totalUnits + ruDiff));
    const afterHeadroom = Math.max(0, Math.round(((cabinetTotalU - afterUnits) / cabinetTotalU) * 100));
    const afterHeatBtu = Math.round(afterWatts * 3.412142);
    const afterRedundancy = objective === 'redundancy' && changes.some((c) => c.id === 'opt-redundancy-hotspare' && c.enabled)
      ? 'Tier IV (2N Fault-Tolerant)'
      : redundancyLevel;

    const titles: Record<OptimizationObjective, { title: string; subtitle: string }> = {
      cost: { title: 'Cost Optimization', subtitle: 'Trim over-provisioned specs without losing redundancy' },
      rack_space: { title: 'Rack Space Optimization', subtitle: 'Consolidate equipment into fewer vertical units' },
      power: { title: 'Power Efficiency Optimization', subtitle: 'Minimize continuous kW draw and carbon footprint' },
      redundancy: { title: 'Max Redundancy Optimization', subtitle: 'Tier IV fault-tolerance and dual pathing' },
      cooling: { title: 'Cooling Optimization', subtitle: 'Thermal management' },
      performance: { title: 'Performance Optimization', subtitle: 'Throughput and latency' },
      cabling: { title: 'Cabling Optimization', subtitle: 'Structured cabling' },
      maintainability: { title: 'Maintainability Optimization', subtitle: 'Serviceability' },
    };

    let summaryText = '';
    if (objective === 'cost') {
      summaryText = costDiff < 0
        ? `Savings: $${Math.abs(costDiff).toLocaleString()} / ${Math.abs((costDiff / totalCost) * 100).toFixed(1)}%`
        : `Cost Delta: +$${costDiff.toLocaleString()}`;
    } else if (objective === 'rack_space') {
      summaryText = ruDiff < 0
        ? `Space Reclaimed: ${Math.abs(ruDiff)} U (${Math.abs(Math.round((ruDiff / totalUnits) * 100))}% denser)`
        : `Space Delta: +${ruDiff} U`;
    } else if (objective === 'power') {
      summaryText = powerDiffWatts < 0
        ? `Power Reduced: ${Math.abs(powerDiffWatts)} W (-${Math.abs((powerDiffWatts / totalWatts) * 100).toFixed(1)}%) • Saves ~$${Math.round(Math.abs(powerDiffWatts) * 8760 * 0.12 / 1000)}/yr`
        : `Power Delta: +${powerDiffWatts} W`;
    } else if (objective === 'redundancy') {
      summaryText = 'Fault Tolerance: Elevated to Tier IV (Zero Single Point of Failure)';
    } else {
      summaryText = 'Optimization Diff Calculated';
    }

    return {
      objective,
      title: titles[objective]?.title || 'Design Optimization',
      subtitle: titles[objective]?.subtitle,
      before: {
        totalCost,
        totalUnits,
        totalPowerKw: parseFloat((totalWatts / 1000).toFixed(2)),
        heatLoadBtu,
        redundancyLevel,
        growthHeadroomPercent,
      },
      after: {
        totalCost: afterCost,
        totalUnits: afterUnits,
        totalPowerKw: parseFloat((afterWatts / 1000).toFixed(2)),
        heatLoadBtu: afterHeatBtu,
        redundancyLevel: afterRedundancy,
        growthHeadroomPercent: afterHeadroom,
      },
      savings: {
        costDiff,
        costDiffPercent: totalCost > 0 ? (costDiff / totalCost) * 100 : 0,
        powerDiffWatts,
        unitsSaved: -ruDiff,
        coolingBtuSaved: heatLoadBtu - afterHeatBtu,
        summaryText,
      },
      changes,
    };
  }

  public applyOptimization(objective?: OptimizationObjective): void {
    const activeObj = objective || this.getOptimizationObjective();
    const proposal = this.getOptimizationProposal(activeObj);

    if (!this.state.optimizationState) {
      this.state.optimizationState = {
        activeObjective: activeObj,
        changesEnabled: {},
        userNotes: {},
        customRules: { cost: [], rack_space: [], power: [], redundancy: [] },
      };
    }
    this.state.optimizationState.appliedObjective = activeObj;
    this.state.optimizationState.appliedSavingsSummary = proposal.savings.summaryText;
    this.state.appliedOptimizationObjective = activeObj;

    // Apply specific changes to BOM if applicable
    if (activeObj === 'redundancy') {
      const hotspareChange = proposal.changes.find((c) => c.id === 'opt-redundancy-hotspare');
      if (hotspareChange?.enabled) {
        const existingSpare = this.getBomItems().find((b) => b.name.includes('N+1 Standby Node'));
        if (!existingSpare) {
          this.addBomItem({
            name: 'Dell PowerEdge R760 (N+1 Standby Node)',
            model: 'PowerEdge R760 Hot Spare',
            category: 'Compute',
            qty: 1,
            unitCost: 8900,
            units: 2,
            power: 310,
            specs: '2U | 2x Xeon Silver 4410Y | 128GB DDR5 | Standby Hot-Spare Node',
            whySuggested: 'Added from Max Redundancy Optimization (Tier IV zero-downtime failover)',
            badge: 'Redundancy N+1',
            alternatives: [],
          });
        }
      }
    } else if (activeObj === 'cost') {
      const dacChange = proposal.changes.find((c) => c.id === 'opt-cost-cables');
      if (dacChange?.enabled) {
        const cableBom = this.getBomItems().find((b) => b.category === 'Cabling & Optics');
        if (cableBom) {
          cableBom.specs = '10x 2m 25GbE SFP28 Passive DAC Twinax Bundles (Standardized)';
          cableBom.unitCost = 35;
          cableBom.badge = 'Cost-Optimized';
        }
      }
    }

    if (this.state.currentStage === 'OPTIMIZATION') {
      this.approveCurrentStage(`Applied ${proposal.title}: ${proposal.savings.summaryText}`);
    } else {
      this.state.stageStatuses['OPTIMIZATION'] = 'APPROVED';
      this.state.stageStatuses['FINAL_DESIGN'] = 'IN_PROGRESS';
      this.state.currentStage = 'FINAL_DESIGN';
      this.recordDecision('OPTIMIZATION', 'APPROVED', `Applied ${proposal.title}: ${proposal.savings.summaryText}`);
      this.notify();
    }
  }

  public keepBaselineDesign(): void {
    if (!this.state.optimizationState) {
      this.state.optimizationState = {
        activeObjective: 'cost',
        changesEnabled: {},
        userNotes: {},
        customRules: { cost: [], rack_space: [], power: [], redundancy: [] },
      };
    }
    this.state.optimizationState.appliedObjective = undefined;
    this.state.optimizationState.appliedSavingsSummary = 'Baseline configuration preserved (no automated changes)';
    this.state.appliedOptimizationObjective = undefined;

    if (this.state.currentStage === 'OPTIMIZATION') {
      this.approveCurrentStage('Kept baseline design without optimization.');
    } else {
      this.state.stageStatuses['OPTIMIZATION'] = 'APPROVED';
      this.state.stageStatuses['FINAL_DESIGN'] = 'IN_PROGRESS';
      this.state.currentStage = 'FINAL_DESIGN';
      this.recordDecision('OPTIMIZATION', 'APPROVED', 'Kept baseline design without optimization.');
      this.notify();
    }
  }

  public getAppliedOptimizationSummary(): string {
    const applied = this.state.optimizationState?.appliedObjective || this.state.appliedOptimizationObjective;
    if (!applied) {
      return this.state.optimizationState?.appliedSavingsSummary || 'Baseline configuration preserved (no automated changes)';
    }

    const labels: Record<OptimizationObjective, string> = {
      cost: 'Cost Reduction',
      rack_space: 'Rack Space Consolidation',
      power: 'Power Efficiency Tuning',
      redundancy: 'Max Redundancy (Tier IV)',
      cooling: 'Cooling Optimization',
      performance: 'Performance Tuning',
      cabling: 'Cabling Optimization',
      maintainability: 'Maintainability Optimization',
    };

    const summary = this.state.optimizationState?.appliedSavingsSummary || '';
    return `${labels[applied] || applied} applied (${summary})`;
  }

  private getStageTitle(stage: WorkflowStageId): string {
    const titles: Record<WorkflowStageId, string> = {

      REQUIREMENT_PROMPT: 'Requirement Prompt',
      REQUIREMENT_BRIEF: 'Requirement Brief & Clarifications',
      ARCHITECTURE_DESIGN: 'Architecture Design',
      RESOURCE_BOM: 'Resource & BOM Engine',
      PHYSICAL_DESIGN: 'Physical Rack Layout',
      NETWORK_CABLING: 'Network & Cabling Interconnects',
      POWER_THERMAL: 'Power & Thermal Verification',
      ENGINEERING_VALIDATION: 'Engineering Validation Gate',
      GAP_ANALYSIS: 'Gap Analysis ("What Am I Missing?")',
      OPTIMIZATION: 'Design Optimization',
      FINAL_DESIGN: 'Final Design Package',
      MCP_DEPLOYMENT: 'MCP Transactional Deployment',
      POST_DEPLOYMENT_VALIDATION: 'Post-Deployment Validation',
      COMPLETED: 'Infrastructure Successfully Built',
    };
    return titles[stage] || stage;
  }

  private getStageShortLabel(stage: WorkflowStageId): string {
    const labels: Record<WorkflowStageId, string> = {
      REQUIREMENT_PROMPT: 'Prompt',
      REQUIREMENT_BRIEF: 'Requirement',
      ARCHITECTURE_DESIGN: 'Architecture',
      RESOURCE_BOM: 'Resources',
      PHYSICAL_DESIGN: 'Physical',
      NETWORK_CABLING: 'Network',
      POWER_THERMAL: 'Power',
      ENGINEERING_VALIDATION: 'Validation',
      GAP_ANALYSIS: 'Gaps',
      OPTIMIZATION: 'Optimize',
      FINAL_DESIGN: 'Final Package',
      MCP_DEPLOYMENT: 'Deploy',
      POST_DEPLOYMENT_VALIDATION: 'Verify',
      COMPLETED: 'Done',
    };
    return labels[stage] || stage;
  }
}
