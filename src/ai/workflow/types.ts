/**
 * RackSlicer AI — Structural Engineering Workflow Types
 *
 * Gated infrastructure engineering workflow:
 * AI recommends. Human decides. RackSlicer executes.
 */

export type WorkflowStageId =
  | 'REQUIREMENT_PROMPT'
  | 'REQUIREMENT_BRIEF'
  | 'ARCHITECTURE_DESIGN'
  | 'RESOURCE_BOM'
  | 'PHYSICAL_DESIGN'
  | 'NETWORK_CABLING'
  | 'POWER_THERMAL'
  | 'ENGINEERING_VALIDATION'
  | 'GAP_ANALYSIS'
  | 'OPTIMIZATION'
  | 'FINAL_DESIGN'
  | 'MCP_DEPLOYMENT'
  | 'POST_DEPLOYMENT_VALIDATION'
  | 'COMPLETED';

export type StageStatus =
  | 'LOCKED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_USER'
  | 'APPROVED'
  | 'COMPLETED'
  | 'FAILED'
  | 'STALE';

export interface StageCompletionContract {
  stageId: WorkflowStageId;
  title: string;
  shortLabel: string;
  status: StageStatus;
  version: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  assumptions?: string[];
  recommendations?: string[];
  validationErrors?: string[];
  userDecision?: 'PENDING' | 'APPROVED' | 'MODIFIED' | 'REJECTED';
  completedTimestamp?: number;
}

export interface AssumptionItem {
  id: string;
  text: string;
  enabled: boolean;
  category?: 'capacity' | 'power' | 'redundancy' | 'facility' | 'custom';
  userComment?: string;
}

export interface RequirementSpec {
  rawPrompt: string;
  workload: string;
  platform: 'Proxmox' | 'VMware vSphere' | 'Microsoft Hyper-V' | 'Kubernetes' | 'Nutanix AHV' | 'OpenStack' | 'Bare Metal' | 'Other';
  nodeCount: number;
  cpuCoresPerNode?: number;
  ramGbPerNode: number;
  storageType: 'Ceph All-NVMe' | 'Ceph Hybrid' | 'SAN iSCSI' | 'SAN FC' | 'NVMe-oF' | 'Local ZFS' | 'Local Storage';
  usableStorageTb: number;
  networkFabric: '25GbE Redundant' | '100GbE Spine-Leaf' | '10GbE Standard' | 'InfiniBand' | 'Custom';
  availability: 'Standard' | 'High Availability (N+1)' | 'Fault Tolerant (2N)' | 'Disaster Recovery Ready';
  powerFeed: 'Single Feed' | 'A/B Redundant' | 'A/B/C 3-Phase';
  growthHeadroomPercent: number;
  deploymentTarget: 'Primary DC' | 'Colocation' | 'Edge / Branch' | 'Private Cloud';
  isComplete: boolean;
  known: Record<string, string | number>;
  unknown: string[];
  assumptions: AssumptionItem[];
  clarifications: {
    questionId: string;
    question: string;
    description: string;
    options: string[];
    selectedAnswer?: string;
    customValue?: string;
    isCustom?: boolean;
  }[];
}

export interface ValidationCheckItem {
  id: string;
  category: 'Compute' | 'Storage' | 'Network' | 'Power' | 'Thermal' | 'Rack Space';
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  metric: string;
  threshold: string;
  details: string;
  correctionProposal?: string;
}

export interface GapAnalysisItem {
  id: string;
  category: 'Security' | 'Management' | 'Backup' | 'Monitoring' | 'High Availability' | 'Growth' | 'Power' | 'Facilities' | 'Custom';
  title: string;
  description: string;
  severity: 'Recommended' | 'Important' | 'Optional' | 'Critical';
  accepted: boolean;
  dismissed: boolean;
  userNote?: string;
  componentToAdd?: {
    name: string;
    units: number;
    watts: number;
    costUsd: number;
  };
}

export type OptimizationObjective =
  | 'cost'
  | 'rack_space'
  | 'power'
  | 'cooling'
  | 'performance'
  | 'cabling'
  | 'redundancy'
  | 'maintainability';

export interface OptimizationChangeItem {
  id: string;
  action: string;
  target: string;
  description: string;
  impact: string;
  enabled: boolean;
  costImpactUsd: number;
  powerImpactWatts: number;
  ruImpact: number;
  userNote?: string;
}

export interface OptimizationProposal {
  objective: OptimizationObjective;
  title: string;
  subtitle?: string;
  before: {
    totalCost: number;
    totalUnits: number;
    totalPowerKw: number;
    heatLoadBtu: number;
    redundancyLevel: string;
    growthHeadroomPercent: number;
  };
  after: {
    totalCost: number;
    totalUnits: number;
    totalPowerKw: number;
    heatLoadBtu: number;
    redundancyLevel: string;
    growthHeadroomPercent: number;
  };
  savings: {
    costDiff: number;
    costDiffPercent: number;
    powerDiffWatts: number;
    unitsSaved: number;
    coolingBtuSaved?: number;
    summaryText: string;
  };
  changes: OptimizationChangeItem[];
}

export interface HardwareAlternative {
  name: string;
  specs: string;
  unitCost: number;
  units: number;
  power: number;
  reason?: string;
}

export interface HardwareBomItem {
  id: string;
  category: 'Compute' | 'Network' | 'Storage' | 'Power Distribution' | 'Cabling & Optics' | 'Security & Management' | 'Custom';
  name: string;
  model: string;
  qty: number;
  specs: string;
  whySuggested: string;
  alternatives: HardwareAlternative[];
  unitCost: number;
  units: number; // rack units U
  power: number; // watts per unit
  badge: string;
  isUserAdded?: boolean;
  isCustomized?: boolean;
  userNote?: string;
}

export interface RackPlacementItem {
  id: string;
  componentId?: string;
  name: string;
  action: 'Place' | 'Reserve' | 'Baffle';
  startU: number;
  heightU: number;
  category: string;
  isUserModified?: boolean;
}

export interface RackCabinetConfig {
  name: string;
  totalU: number;
  slotNumber: number;
  leftCableManagerWidth?: 'none' | '2-inch' | '4-inch' | '6-inch' | '8-inch';
  rightCableManagerWidth?: 'none' | '2-inch' | '4-inch' | '6-inch' | '8-inch';
  vcmType?: 'single-sided' | 'double-sided';
  leftPduTemplateId?: string;
  rightPduTemplateId?: string;
}

export interface CableRouteItem {
  id: string;
  source: string;
  dest: string;
  type: string;
  color: string;
  length: string;
  vlan: string;
  isUserModified?: boolean;
}

export interface CoolingCheckItem {
  id: string;
  text: string;
  checked: boolean;
  userNote?: string;
}

export interface PowerThermalConfig {
  feedType: 'A/B Dual Redundant' | 'Single Feed' | '3-Phase A/B/C';
  voltage: number;
  breakerAmps: number;
  continuousLoadPercent: number;
  coolingChecks: CoolingCheckItem[];
  ambientTempC: number;
}

export interface DecisionLogEntry {
  stageId: WorkflowStageId;
  version: string;
  user: string;
  timestamp: number;
  decision: 'APPROVED' | 'MODIFIED' | 'REVERTED';
  notes?: string;
}

export interface WorkflowStateData {
  currentStage: WorkflowStageId;
  stageStatuses: Record<WorkflowStageId, StageStatus>;
  stageContracts: Record<WorkflowStageId, StageCompletionContract>;
  requirement: RequirementSpec;
  bomItems: HardwareBomItem[];
  rackPlacements: RackPlacementItem[];
  cabinetConfig: RackCabinetConfig;
  cableRoutes: CableRouteItem[];
  powerThermalConfig: PowerThermalConfig;
  gapItems: GapAnalysisItem[];
  decisionHistory: DecisionLogEntry[];
  lastModifiedTimestamp: number;
  hasCanvasDeployment: boolean;
  activeOptimizationObjective?: OptimizationObjective;
  appliedOptimizationObjective?: OptimizationObjective;
  optimizationState?: {
    activeObjective: OptimizationObjective;
    changesEnabled: Record<string, boolean>;
    userNotes: Record<string, string>;
    customRules: Record<string, string[]>;
    appliedObjective?: OptimizationObjective;
    appliedSavingsSummary?: string;
  };
}


