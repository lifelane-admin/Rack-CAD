/**
 * Physical Infrastructure Model – Core Types & Entities
 * Canonical Source of Truth for RackSlicer
 */

export type ProjectStatus = 'draft' | 'review' | 'approved' | 'production';

export interface Project {
  projectId: string;
  projectName: string;
  customer?: string;
  site?: string;
  datacenter?: string;
  room?: string;
  description?: string;
  createdDate: string;
  modifiedDate: string;
  version: string;
  status: ProjectStatus;
}

export interface Site {
  siteId: string;
  siteName: string;
  location?: string;
  failureDomain?: string;
}

export interface Room {
  roomId: string;
  roomName: string;
  floor?: string;
  length?: number;
  width?: number;
  height?: number;
}

export type Orientation = 'North' | 'South' | 'East' | 'West';

export interface PhysicalRack {
  rackId: string;
  rackName: string;
  rackSizeU: number;
  rackWidth: number;   // mm, standard 600 or 800
  rackDepth: number;   // mm, standard 1000 or 1200
  rackHeight: number;  // mm, standard 2000
  rackPositionX: number; // grid/floor X
  rackPositionY: number; // grid/floor Y
  rackPositionZ: number; // row/depth Z
  weightCapacity: number; // kg
  powerCapacity: number;  // watts
  coolingCapacity: number;// btu / watts
  usedU: number;
  freeU: number;
  reservedU: number;
  blockedU: number;
  powerConsumed: number;  // current watts
  weightConsumed: number; // current kg
  utilizationPercent?: number;
  failureDomain?: string;
  frontOrientation?: Orientation;
  rearOrientation?: Orientation;
  notes?: string;
}

export type ObjectCategory =
  | 'compute'
  | 'storage'
  | 'network'
  | 'routing'
  | 'security'
  | 'application'
  | 'infrastructure'
  | 'power'
  | 'cooling'
  | 'monitoring';

export type AirflowDirection = 'Front-to-Back' | 'Back-to-Front' | 'Side-to-Side' | 'Passive';
export type FrontRearOrientation = 'Front' | 'Rear';
export type ObjectStatus = 'Planned' | 'Active' | 'Maintenance' | 'Decommissioned';
export type PsuRedundancy = 'None' | '1+1' | 'N+1' | '2N' | '2N+1';

export interface PhysicalObject {
  objectId: string;
  objectName: string;
  category: ObjectCategory;
  subCategory: string; // e.g. "ToR Switch", "GPU Server", "SAN", "Firewall"
  manufacturer: string;
  model: string;
  partNumber?: string;
  serialNumber?: string;
  rackId: string;
  uStart: number; // 1-based index from bottom of rack
  uEnd: number;   // 1-based inclusive top unit
  heightU: number; // uEnd - uStart + 1
  width: number;  // mm (standard 482.6 for 19-inch)
  depth: number;  // mm
  height: number; // mm (heightU * 44.45)
  weight: number; // kg
  positionX: number;
  positionY: number;
  positionZ: number;
  rotation: number;
  powerWatts: number;
  powerVA: number;
  psuCount: number;
  psuRedundancy: PsuRedundancy;
  airflowDirection: AirflowDirection;
  frontRearOrientation: FrontRearOrientation;
  status: ObjectStatus;
  haPairId?: string;
  failureDomain?: string;
  notes?: string;
}

export type PortSpeed =
  | '1GbE'
  | '10GbE'
  | '25GbE'
  | '40GbE'
  | '50GbE'
  | '100GbE'
  | '200GbE'
  | '400GbE'
  | '800GbE'
  | '16GFC'
  | '32GFC'
  | '64GFC'
  | 'Management'
  | 'Console'
  | 'Power';

export type ConnectorType =
  | 'RJ45'
  | 'SFP'
  | 'SFP+'
  | 'SFP28'
  | 'QSFP+'
  | 'QSFP28'
  | 'QSFP56'
  | 'QSFP112'
  | 'OSFP'
  | 'DAC'
  | 'AOC'
  | 'LC'
  | 'SC'
  | 'MPO'
  | 'C13'
  | 'C14'
  | 'C19'
  | 'C20'
  | 'NEMA-5-15'
  | 'Other';

export type PortStatus = 'Up' | 'Down' | 'Connected' | 'Available' | 'Reserved';

export interface PhysicalPort {
  portId: string;
  objectId: string;
  portGroup: string; // e.g. "Data", "Uplink", "Management", "Power"
  portType: string;  // e.g. "Ethernet", "Fibre Channel", "Serial", "Power Inlet"
  speed: PortSpeed;
  connector: ConnectorType;
  physicalPosition: {
    x: number;
    y: number;
    side?: 'front' | 'rear';
  };
  label: string;
  purpose: string; // e.g. "Host Data", "ISL Stacking", "OOB Management", "Power PSU1"
  status: PortStatus;
}

export type ConnectionStatus = 'planned' | 'connected' | 'tested' | 'fault';
export type PathType = 'overhead' | 'underfloor' | 'in-rack';

export interface PhysicalConnection {
  connectionId: string;
  sourceObjectId: string;
  sourcePortId: string;
  destinationObjectId: string;
  destinationPortId: string;
  media: 'Copper' | 'Fiber' | 'DAC' | 'AOC' | 'Power';
  speed: string;
  connector: string;
  cableId: string;
  cableLength?: number; // meters
  path?: string[];      // via waypoint / trays
  pathType?: PathType;
  patchPanel?: string;
  cableManager?: string;
  fabric?: string;      // e.g. "Fabric A", "Fabric B", "Management"
  networkPurpose?: string;
  status: ConnectionStatus;
}

export type CableMedia = 'Copper' | 'Fiber' | 'DAC' | 'AOC' | 'Power';
export type CablePurpose =
  | 'Management'
  | 'Storage'
  | 'Production'
  | 'Backup'
  | 'Replication'
  | 'OOB'
  | 'Cluster'
  | 'Internet'
  | 'WAN'
  | 'Power'
  | 'ISL';

export interface PhysicalCable {
  cableId: string;
  sourceObject: string;
  sourcePort: string;
  destinationObject: string;
  destinationPort: string;
  media: CableMedia;
  speed: string;
  connectorA: string;
  connectorB: string;
  length: number; // meters
  color: string;
  primaryRoute: string;
  secondaryRoute?: string;
  patchPanel?: string;
  cableManager?: string;
  rackA: string;
  rackB: string;
  fabric?: string;
  purpose: CablePurpose;
  status: 'planned' | 'pulled' | 'connected' | 'tested' | 'inactive';
}

export type PowerFeed = 'A' | 'B' | 'Single' | '3-Phase';
export type PowerRedundancyStatus = 'redundant' | 'spof' | 'unpowered';

export interface PhysicalPower {
  powerId: string;
  objectId: string;
  psuId: string;
  psuLabel: string;
  cableId: string;
  pduId: string;
  pduSocketId: string;
  socketType: string;
  powerFeed: PowerFeed;
  upsId?: string;
  powerWatts: number;
  voltage?: number;
  redundancyStatus: PowerRedundancyStatus;
}

export interface PhysicalFailureDomain {
  domainId: string;
  domainName: string;
  type: 'rack' | 'power-feed' | 'network-fabric' | 'room' | 'row' | 'custom';
  description?: string;
  memberObjectIds: string[];
}

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingCategory = 'physical' | 'network' | 'power' | 'storage' | 'ha' | 'cooling';

export interface ValidationFinding {
  findingId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  objectId?: string;
  rackId?: string;
  affectedObjectIds: string[];
  description: string;
  impact: string;
  recommendation: string;
  status: 'open' | 'acknowledged' | 'resolved';
}

export type ProposalType =
  | 'MOVE_OBJECT'
  | 'ADD_OBJECT'
  | 'REMOVE_OBJECT'
  | 'CONNECT_PORTS'
  | 'DISCONNECT_PORTS'
  | 'MAP_POWER'
  | 'REASSIGN_FAILURE_DOMAIN'
  | 'REPLACE_CABLE';

export interface ProposalImpact {
  uChangeRack1?: number;
  uChangeRack2?: number;
  cableRoutesChanged?: number;
  powerMappingsChanged?: number;
  haStatus?: string;
  summary: string;
}

export interface ChangeProposal {
  proposalId: string;
  type: ProposalType;
  objectId: string;
  from?: Record<string, any>;
  to?: Record<string, any>;
  reason: string;
  impact: ProposalImpact;
  status: 'proposed' | 'validated' | 'approved' | 'applied' | 'rejected';
}

export interface ArchitectureVersion {
  version: string;
  timestamp: string;
  author: string;
  description: string;
  changeReason?: string;
  snapshot: string; // JSON serialization of PhysicalModelSnapshot
  proposalId?: string;
}

export interface ArchitectureDiff {
  added: PhysicalObject[];
  removed: PhysicalObject[];
  modified: {
    before: PhysicalObject;
    after: PhysicalObject;
    changes: string[];
  }[];
  moved: {
    objectId: string;
    objectName: string;
    fromRack: string;
    fromU: number;
    toRack: string;
    toU: number;
  }[];
  reconnected: {
    cableId: string;
    before: string;
    after: string;
  }[];
  powerChanged: {
    objectId: string;
    detail: string;
  }[];
  portChanged: {
    portId: string;
    detail: string;
  }[];
}

export interface AIRequestContext {
  project: Project;
  racks: PhysicalRack[];
  objects: PhysicalObject[];
  ports: PhysicalPort[];
  connections: PhysicalConnection[];
  cables: PhysicalCable[];
  power: PhysicalPower[];
  haRelationships: {
    primaryId: string;
    secondaryId: string;
    type: string;
  }[];
  failureDomains: PhysicalFailureDomain[];
  validationResults: ValidationFinding[];
  userRequest: string;
}

export interface PhysicalModelSnapshot {
  project: Project;
  site?: Site;
  room?: Room;
  racks: PhysicalRack[];
  objects: PhysicalObject[];
  ports: PhysicalPort[];
  connections: PhysicalConnection[];
  cables: PhysicalCable[];
  power: PhysicalPower[];
  failureDomains: PhysicalFailureDomain[];
  proposals: ChangeProposal[];
}
