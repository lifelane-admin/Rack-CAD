import type { RackDiff, AIMessage, AIHint, AIProviderName } from '../ai/types';

// === Geometry ===
export interface Point { x: number; y: number; }
export interface Rect { x: number; y: number; width: number; height: number; }
export interface Transform { x: number; y: number; scale: number; }

// === Rack ===
export interface RackData {
  id: string;
  name: string;
  units: 42 | 48;
  x: number;  // position on canvas
  y: number;
  showPduLeft?: boolean;
  showPduRight?: boolean;
  leftCableManagerWidth?: '4-inch' | '6-inch' | 'none';
  rightCableManagerWidth?: '4-inch' | '6-inch' | 'none';
}

// === Ports ===
export type PortType = 'rj45' | 'sfp' | 'sfp-plus' | 'sfp28' | 'qsfp' | 'qsfp28' | 'management' | 'console' | 'power';

export interface PortData {
  id: string;
  deviceId: string;
  name: string;
  type: PortType;
  relativeX: number;  // relative to device left
  relativeY: number;  // relative to device top
  speed?: string;
  connected: boolean;
  cableId: string | null;
  description?: string;
  portW?: number;  // scaled overlay width for switch ports (device coords)
  portH?: number;  // scaled overlay height for switch ports (device coords)
}

// === Devices ===
export type DeviceCategory = 'server' | 'switch' | 'router' | 'firewall' | 'storage' | 'patch-panel' | 'pdu' | 'ups' | 'blank-panel' | 'cable-manager' | 'cooling' | 'console';

export interface DeviceTemplate {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  category: DeviceCategory;
  heightUnits: number;  // 1U, 2U, etc.
  color: string;  // base color for rendering
  ports: Omit<PortData, 'deviceId' | 'connected' | 'cableId'>[];
  icon: string;  // emoji or text label for sidebar
  frontPanelImage?: string;
  isCustom?: boolean;
  basedOnTemplateId?: string;
  customDescription?: string;
  createdAt?: string;
}

export interface DeviceData {
  id: string;
  templateId: string;
  rackId: string;
  startUnit: number;  // 1-based RU position from bottom
  name: string;
  hostname: string;
  managementIp: string;
  serialNumber: string;
  description: string;
  locked?: boolean;
  ports: PortData[];
  frontPanelImage?: string;
}

export type CableType = 'idrac' | 'vm-network' | 'ceph-primary' | 'ceph-secondary' | 'live-migration' | 'backup' | 'general' | 'general-a' | 'general-b' | 'power' | 'cat6' | 'cat6a' | 'cat8' | 'om4' | 'om5' | 'dac-twinax' | 'qsfp28' | 'c13-power' | 'c19-power' | 'console' | 'custom';

export const CABLE_COLORS: Record<CableType, string> = {
  'idrac': '#e53935',
  'vm-network': '#fb8c00',
  'ceph-primary': '#43a047',
  'ceph-secondary': '#8e24aa',
  'live-migration': '#fdd835',
  'backup': '#1e88e5',
  'general': '#78909c',
  'general-a': '#00acc1',
  'general-b': '#d81b60',
  'power': '#212529',
  'cat6': '#1e88e5',
  'cat6a': '#fb8c00',
  'cat8': '#8e24aa',
  'om4': '#00acc1',
  'om5': '#43a047',
  'dac-twinax': '#37474f',
  'qsfp28': '#607d8b',
  'c13-power': '#212529',
  'c19-power': '#212529',
  'console': '#8d6e63',
  'custom': '#78909c'
};

export interface CableBundle {
  id: string;
  name: string;
  color: string;
  diameter: number;
  capacity: number;
  cableIds: string[];
}

export interface ValidationAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'medium' | 'connector' | 'speed' | 'bend' | 'loop' | 'congestion' | 'distance' | 'power' | 'weight';
  message: string;
  targetId: string; // cableId, portId, or rackId
  targetType: 'cable' | 'port' | 'rack';
}

export interface CableData {
  id: string;
  name: string;
  type: CableType;
  color: string;
  sourcePortId: string;
  destPortId: string | null;
  bendPoints: Point[];
  thickness: number;
  bendRadius: number;
  bundleId: string | null;
  notes: string;
  sourceTermination?: string;
  destTermination?: string;
  bendStyle?: string;
  floatingDest?: Point | null;
  floatingSource?: Point | null;
  sidePreference?: 'left' | 'right';
  sourceOrientation?: 'auto' | 'up' | 'down' | 'left' | 'right';
  destOrientation?: 'auto' | 'up' | 'down' | 'left' | 'right';
  /** 4 user-draggable midpoint anchors between source and dest */
  anchorPoints?: Point[];
  /** Whether anchors have been manually positioned by the user */
  anchorsLocked?: boolean;

  // Generic Cable Engine expansions
  displayName?: string;
  category?: string;       // copper-ethernet, fiber-optic, dac, power, management, storage, custom
  medium?: string;         // Cat6, Cat6A, Cat8, Single Mode, Multi Mode OM4, Passive DAC, AC, DC, Serial, NVMe
  weight?: number;         // weight in kg/m (e.g. 0.05)
  status?: 'planned' | 'ordered' | 'pulled' | 'terminated' | 'tested' | 'active' | 'inactive';
  length?: number;         // physical length in meters
  diameter?: number;       // physical diameter in mm
  tags?: string[];
  animatedFlow?: boolean;   // Packet flow animation toggle
  flowSpeed?: number;      // Animation speed factor
  exitStraightOffset?: number; // Straight exit distance before first bend (default 18px)
}

// === Application State ===
export type ToolMode = 'select' | 'pan' | 'cable' | 'zoom-in' | 'zoom-out';
export type Theme = 'dark' | 'light';

export type SelectableItem = 
  | { type: 'rack'; id: string }
  | { type: 'device'; id: string }
  | { type: 'port'; id: string }
  | { type: 'cable'; id: string }
  | { type: 'bundle'; id: string };

export interface LegendItem {
  id: string;
  label: string;
  color: string;
}

export interface AppState {
  theme: Theme;
  tool: ToolMode;
  transform: Transform;
  gridVisible: boolean;
  snapEnabled: boolean;
  rulersVisible: boolean;
  racks: RackData[];
  devices: DeviceData[];
  cables: CableData[];
  bundles: CableBundle[];
  validationAlerts: ValidationAlert[];
  selection: SelectableItem[];
  cableInProgress: {
    sourcePortId: string;
    currentPoint: Point;
    bendPoints: Point[];
    cableType: CableType;
  } | null;
  sidebarCollapsed: boolean;
  propertiesCollapsed: boolean;
  showLegends: boolean;
  customLegendItems?: LegendItem[];
  selectedCableType: CableType;
  selectedCableColor: string;
  selectedCableBend: number;
  selectedCableTermination: string;
  cabinetViewMode: 'front' | 'rear';
  cabinetDrawMode: 'default' | 'skeleton';
  cabinetCoverVisible: boolean;
  isometricMode: boolean;
  presenterMode: boolean;
  cableRoutingTrayMode: 'overhead' | 'underfloor';
  // AI Mode
  aiMode: boolean;
  aiProvider: AIProviderName;
  previewDiff: RackDiff | null;
  customTemplates: DeviceTemplate[];
}

// === Events ===
export interface AppEvents {
  'state:changed': Partial<AppState>;
  'rack:added': RackData;
  'rack:moved': { id: string; x: number; y: number };
  'rack:removed': string;
  'rack:update': { id: string; data: Partial<RackData> };
  'rack:add': { units: 42 | 48 };
  'device:added': DeviceData;
  'device:moved': { id: string; rackId: string; startUnit: number };
  'device:removed': string;
  'device:updated': DeviceData;
  'device:update': { id: string; data: Partial<DeviceData> };
  'port:hover': string | null;
  'port:selected': string;
  'cable:added': CableData;
  'cable:removed': string;
  'cable:updated': CableData;
  'cable:update': { id: string; data: Partial<CableData> };
  'bundle:added': CableBundle;
  'bundle:removed': string;
  'bundle:updated': CableBundle;
  'bundle:update': { id: string; data: Partial<CableBundle> };
  'validation:updated': ValidationAlert[];
  'reports:toggle': void;
  'selection:changed': SelectableItem[];
  'tool:changed': ToolMode;
  'theme:changed': Theme;
  'canvas:transformed': Transform;
  'canvas:click': Point;
  'canvas:rightclick': { point: Point; target: any; screenPoint?: Point };
  'canvas:mousemove': Point;
  'canvas:zoom': number;
  'history:push': void;
  'history:undo': void;
  'history:redo': void;
  'export:svg': void;
  'export:png': void;
  'export:jpeg': void;
  'export:pdf': void;
  'export:json': void;
  'cable:batch-generate': { deviceId: string; side: 'left' | 'right'; type: CableType; color: string; count: number };
  'project:save': void;
  'project:load': string;
  'file:new': void;
  'file:save': void;
  'file:open': File;
  'file:demo': void;
  'view:zoom-in': void;
  'view:zoom-out': void;
  'edit:undo': void;
  'edit:redo': void;
  'edit:delete': void;
  'view:toggle-grid': void;
  'view:toggle-snap': void;
  'view:toggle-rulers': void;
  'view:toggle-theme': void;
  'view:toggle-legends': void;
  'notification': { message: string; type: 'info' | 'success' | 'warning' | 'error' };
  'ai:mode-changed': boolean;
  'ai:provider-changed': AIProviderName;
  'ai:request': { messages: AIMessage[]; selectedId?: string };
  'ai:response': RackDiff;
  'ai:stream-chunk': string;
  'ai:stream-done': RackDiff;
  'ai:hints-updated': AIHint[];
  'ai:preview-diff': RackDiff | null;
  'ai:apply-diff': RackDiff;
  'ai:error': string;
}

// === Constants ===
export const RACK_CONSTANTS = {
  RU_HEIGHT: 30,           // pixels per rack unit at 100% zoom
  RACK_INNER_WIDTH: 400,   // inner width in pixels
  RACK_OUTER_WIDTH: 450,   // outer width including rails
  RAIL_WIDTH: 25,          // rail width
  RACK_PADDING_TOP: 30,    // top frame thickness
  RACK_PADDING_BOTTOM: 30, // bottom frame thickness
  MOUNTING_HOLE_SIZE: 4,
  PORT_SIZE: 12,           // default port width
  PORT_HEIGHT: 10,         // default port height
  GRID_SIZE: 20,           // grid snap size
  CABLE_THICKNESS: 2,
  CABLE_BEND_RADIUS: 10,
  CABLE_PARALLEL_SPACING: 6,
};
