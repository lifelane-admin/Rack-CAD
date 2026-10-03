/**
 * RackSlicer AI Studio – Interactive Agentic Infrastructure Designer
 * Core Studio Data Models, Design Intent, Progressive BOM, and Validation Types.
 */

import { DeviceTemplate, DeviceCategory } from '../../core/types';

export type StudioDesignMode = 'guided' | 'architect' | 'optimizer' | 'expert' | 'custom';

export type StudioStep =
  | 'welcome'
  | 'requirements'
  | 'architecture'
  | 'resources'
  | 'bom'
  | 'power-cooling'
  | 'cabling'
  | 'validation'
  | 'optimization'
  | 'deploy';

export interface DesignIntent {
  workload: string;
  users: number;
  vms: number;
  availability: 'Standard' | 'High Availability' | 'Mission Critical';
  storageUsableTb: number;
  preferredVendor: 'No Preference' | 'Dell' | 'HPE' | 'Lenovo' | 'Cisco';
  storageProtocol: 'iSCSI' | 'Fibre Channel' | 'NVMe-oF' | 'No Preference';
  budgetLevel: 'Low' | 'Medium' | 'High' | 'Enterprise';
  datacenter: string;
  spareCapacityPercent: number;
  powerFeedType: 'Single' | 'A/B Redundant' | '3-Phase';
  coolingStrategy: 'Room' | 'In-Row' | 'Cold Aisle Containment' | 'Rear-Door Heat Exchanger';
}

export interface ArchitectureComponent {
  id: string;
  category: 'compute' | 'storage' | 'network' | 'security' | 'power' | 'cabling' | 'cooling' | 'passive';
  name: string;
  quantity: number;
  purpose: string;
  reason: string;
  dependencies: string[];
  status: 'recommended' | 'selected' | 'alternative';
  suggestedTemplateId?: string;
  alternatives: {
    templateId: string;
    name: string;
    whyNotReason: string;
  }[];
}

export interface ArchitecturePlan {
  title: string;
  summary: string;
  components: ArchitectureComponent[];
  calculatedMetrics: {
    totalUnits: number;
    totalWatts: number;
    heatLoadBtu: number;
    portCount: number;
    cableCount: number;
  };
}

export interface RecommendedResource {
  template: DeviceTemplate;
  matchScore: number;
  isBestFit: boolean;
  whyChosen: string[];
  whyNotAlternatives: {
    name: string;
    reason: string;
  }[];
  specHighlights: {
    height: string;
    ports: string;
    power: string;
    redundancy: string;
  };
}

export interface ProgressiveBomItem {
  id: string;
  templateId: string;
  name: string;
  category: DeviceCategory | 'passive' | 'cable' | 'power-accessory';
  manufacturer: string;
  model: string;
  quantity: number;
  heightUnits: number;
  powerWatts: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  notes?: string;
}

export interface CablingRouteItem {
  id: string;
  name: string;
  vlan: string;
  color: string;
  cableType: string;
  tray: string;
  count: number;
  lengthMeters: number;
  speed: string;
}

export interface DomainScorecard {
  category: string;
  rating: 'Good' | 'Review' | 'Excellent' | 'Warning';
  scorePercent: number; // 0 - 100
  explanation: string;
}

export interface OptimizationFinding {
  id: string;
  category: 'space' | 'power' | 'redundancy' | 'ports' | 'cabling' | 'cost';
  title: string;
  impact: string;
  recommendation: string;
  actionDiff?: Record<string, unknown>;
}

export interface WhatIfScenario {
  id: string;
  name: string;
  description: string;
  rackUsageU: number;
  powerKw: number;
  coolingBtu: number;
  portUtilization: string;
  equipmentCount: number;
  estimatedCostUsd: number;
  redundancyScore: string;
}
