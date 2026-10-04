/**
 * RackSlicer AI — Excel Architecture Intent Engine Types
 *
 * Deterministic structured architecture input specifications across 12 worksheets.
 * Source of Truth for Enterprise Infrastructure Generation.
 */

export type AIRequestAction = 'CREATE' | 'MODIFY' | 'REVIEW' | 'CLONE';

export interface Sheet01_AI_Request {
  requestId: string;
  requestName: string;
  action: AIRequestAction;
  environment: 'Production' | 'Staging' | 'DR' | 'Development' | 'Lab';
  siteCount: number;
  rackCount: number;
  primaryObjective: string;
  specialConstraints?: string;
  existingBaselineId?: string;
}

export interface Sheet02_ComputeItem {
  id: string;
  brandModel: string;
  qty: number;
  cpuCoresPerNode: number;
  ramGbPerNode: number;
  nicPorts: number;
  nicSpeed: string;
  psuQty: number;
  uHeight: number;
}

export interface Sheet03_Virtualization {
  platform: 'Microsoft Hyper-V' | 'Proxmox' | 'VMware vSphere' | 'Kubernetes' | 'Nutanix AHV' | 'OpenStack' | 'Bare Metal' | 'Other';
  haPolicy: 'N+1' | '2N' | 'Active-Active' | 'None';
  mgmtNetworkMode: 'Dedicated' | 'Shared' | 'Not Specified';
  clusterHeadroomPercent: number;
}

export interface Sheet04_NetworkItem {
  id: string;
  name: string;
  speed: string;
  switchesQty: number;
  redundancy: 'MLAG' | 'LACP' | 'Single' | 'Not Specified';
  vlanId?: number;
  subnet?: string;
  isShared: boolean | 'UNKNOWN';
}

export interface Sheet05_StorageItem {
  id: string;
  storageType: 'SAN iSCSI' | 'SAN FC' | 'Ceph All-NVMe' | 'Ceph Hybrid' | 'NVMe-oF' | 'Local ZFS' | 'NAS Backup Target';
  usableCapacityTb: number;
  rawCapacityTb?: number;
  controllerHA: boolean | 'UNKNOWN';
  multipathing: boolean | 'UNKNOWN';
}

export interface Sheet06_Rack_Physical {
  cabinetName: string;
  totalU: number;
  preferredUStart?: number | 'Auto';
  leftCableManagerWidth: string;
  rightCableManagerWidth: string;
  leftPduTemplate: string;
  rightPduTemplate: string;
}

export interface Sheet07_CablingItem {
  cableId: string;
  sourceDevice: string;
  sourcePort: string;
  targetDevice: string;
  targetPort: string;
  purpose: 'iSCSI' | 'iDRAC' | 'VM' | 'Live Migration' | 'Power' | 'NAS Backup' | 'ISL Trunk';
  media: 'Cat6' | 'Cat6A' | 'DAC Twinax' | 'Fiber OM4' | 'Power C13';
  speed: string;
  color: string;
}

export interface Sheet08_SecurityItem {
  id: string;
  name: string;
  qty: number;
  haMode: 'Active/Passive' | 'Active/Active' | 'Standalone';
  syncLinkDedicated: boolean | 'UNKNOWN';
}

export interface Sheet09_WorkloadItem {
  name: string;
  qty: number;
  vcpuPerVm: number;
  ramGbPerVm: number;
  storageGbPerVm: number;
}

export interface RequirementConflict {
  id: string;
  sourceSheetA: string;
  sourceSheetB: string;
  fieldA: string;
  fieldB: string;
  valueA: string;
  valueB: string;
  description: string;
}

export interface RequirementTraceableRef {
  componentId: string;
  componentType: string;
  sourceRequirements: string[];
}

export interface ArchitectureGenerationContext {
  generationId: string;
  requestId: string;
  inputSource: 'Excel' | 'Natural Language' | 'Hybrid';
  inputHash: string;
  action: AIRequestAction;
  baselineId?: string;
  timestamp: number;
}

export interface ArchitectureManifest {
  generationId: string;
  requestId: string;
  action: AIRequestAction;
  inputHash: string;
  timestamp: number;
  context: ArchitectureGenerationContext;
  request: Sheet01_AI_Request;
  compute: Sheet02_ComputeItem[];
  virtualization: Sheet03_Virtualization;
  networks: Sheet04_NetworkItem[];
  storage: Sheet05_StorageItem[];
  physical: Sheet06_Rack_Physical;
  cabling: Sheet07_CablingItem[];
  security: Sheet08_SecurityItem[];
  workloads: Sheet09_WorkloadItem[];
  conflicts: RequirementConflict[];
  missingRequirements: string[];
  assumptions: string[];
  traceability: RequirementTraceableRef[];
  validation: {
    capacityPass: boolean;
    spofCount: number;
    warnings: string[];
  };
}
