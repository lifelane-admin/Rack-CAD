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
  powerCircuitA?: string[];   // device IDs on circuit A
  powerCircuitB?: string[];   // device IDs on circuit B
  pduCapacityWatts?: number;  // max watts per circuit; default 3600
  leftPduId?: string;    // deviceId of PDU on left wall
  rightPduId?: string;   // deviceId of PDU on right wall
  /** Manual placement (rack-local coordinates, same convention as export-summary-overlay.ts's
   *  cardX/cardY) for this rack's export Summary/Cable-Types card pair, set by dragging them in
   *  the canvas's Summary Card Preview mode. Undefined means "auto" — clear of the rack body and
   *  any right-side PDU/cable manager (see rackRightEdge in export-summary-overlay.ts). */
  summaryCardOffset?: { x: number; y: number };
}

// === Ports ===
export type PortType = 'rj45' | 'sfp' | 'sfp-plus' | 'sfp28' | 'qsfp' | 'qsfp28' | 'management' | 'console' | 'power' | 'hybrid' | 'usb' | 'dvi' | 'displayport' | 'vga' | 'hdmi' | 'audio' | 'mic' | 'serial';

export type SocketType =
  | 'C13' | 'C19' | 'C15' | 'C5'
  | 'NEMA-5-15' | 'NEMA-5-20' | 'NEMA-L5-30' | 'NEMA-L6-20'
  | 'BS1363' | 'Schuko'
  | 'IS6538-5A' | 'IS6538-15A' | 'IS1293-6A' | 'IS1293-16A';

export interface OutletConfig {
  count: number;
  socketType: SocketType;
}

// === PDU Configurator ===
export interface PduOutletGroup {
  type: SocketType;
  count: number;
}

/** Full PDU configuration — shared by horizontal (rack-mount) and vertical (0U side-mount) PDUs. */
export interface PduConfig {
  category?: 'basic' | 'metered' | 'meteredOutlet' | 'switched' | 'managed' | 'smart' | 'intelligent' | 'monitored' | 'highDensity';
  manufacturer?: 'apc' | 'vertiv' | 'generic';
  electrical?: { phase?: 'single' | 'three' | 'split'; voltage?: number; currentA?: number };
  inputPlug?: string;
  cordLen?: number;
  cordCsa?: number;
  frls?: boolean;
  composition?: PduOutletGroup[];
  sockets?: { layout?: 'single' | 'dual' | 'triple'; rotationDeg?: number | 'alternate' };
  breaker?: 'none' | 'mcb' | 'mcb-guarded' | 'hydraulic' | 'electronic' | 'locking';
  mcbCurve?: 'B' | 'C' | 'D';
  smartFeatures?: string[];
  envSensors?: string[];
  networkPorts?: string[];
  wireless?: string[];
  leds?: string[];
  enclosure?: { finish?: string; customHex?: string; outletFace?: 'white' | 'black' };
  cableEntry?: 'top' | 'bottom' | 'left' | 'right';
  branding?: 'manufacturer' | 'rackSlicer' | 'none';
  labels?: string[];
}

/** KVM switch's local console-side peripheral ports (the "TARGETS" group — connections out to
 *  each managed server — is fixed/unaffected by this). Customizable subset of: 'usb1'..'usb4',
 *  'vga', 'hdmi', 'dvi', 'displayport', 'audio', 'mic', 'ethernet', 'serial'. Mirrors a typical
 *  1U KVM's real front-panel: local console ports (video + USB keyboard/mouse + audio), a
 *  management (LAN/IP) port, and a firmware/diagnostics serial (RS-232) port. */
export interface KvmConfig {
  localPorts?: string[];
}

export type SwitchVendor = 'cisco-catalyst' | 'cisco-nexus' | 'aruba-cx' | 'juniper-ex' | 'dell-powerswitch' | 'fortiswitch' | 'huawei' | 'extreme' | 'mikrotik' | 'ubiquiti' | 'netgear' | 'generic' | 'custom';
export type FirewallVendor = 'fortinet' | 'cisco' | 'paloalto' | 'juniper' | 'sophos' | 'checkpoint' | 'sonicwall' | 'aruba' | 'dell' | 'huawei' | 'generic';
export type LedTheme = 'green' | 'blue' | 'amber' | 'white';
export type SwitchLayer = 'L1' | 'L2' | 'L3';
export type NacVendor = 'generic' | 'forescout' | 'cisco-ise' | 'aruba-clearpass';

/** A named, coloured port range — a purely visual grouping (like a VLAN's port membership,
 *  without any actual VLAN/switching logic, which is out of this app's physical-only scope).
 *  `poe`, when set, marks just this range as PoE-capable (independent of SwitchConfig's global
 *  `poe` toggle) — real switches commonly power only a subset of their ports. */
export interface SwitchPortGroup {
  name: string;
  startPort: number;
  endPort: number;
  color: string;
  poe?: boolean;
}

/** Enterprise Switch Physical SDK — physical-appearance-only configurator state. Port counts
 *  drive live regeneration of the device's real ports (see injectConfigurablePorts in state.ts);
 *  everything else is cosmetic (vendor skin, toggled chrome, colors, port-range grouping). */
export interface SwitchConfig {
  vendor?: SwitchVendor;
  layer?: SwitchLayer;
  rj45Count?: number;
  sfpCount?: number;
  sfpPlusCount?: number;
  qsfpCount?: number;
  /** When `poe` is on, only ports in [poeStartPort, poeEndPort] are actually PoE-capable —
   *  defaults to the full RJ45 range when unset, so a bare "PoE" toggle still means "all ports"
   *  until the user narrows it. A port group's own `poe` flag (see SwitchPortGroup) is an
   *  independent, additional way to mark a named range as PoE, regardless of this range. */
  poe?: boolean;
  poeStartPort?: number;
  poeEndPort?: number;
  mgmtPort?: boolean;
  consolePort?: boolean;
  usbPort?: boolean;
  lcd?: boolean;
  stackPorts?: boolean;
  rackEars?: boolean;
  assetLabel?: boolean;
  dustCovers?: boolean;
  panelColor?: string;
  accentColor?: string;
  ledTheme?: LedTheme;
  brandName?: string;
  modelName?: string;
  portGroups?: SwitchPortGroup[];
}

/** Enterprise Firewall Physical SDK — physical-appearance-only configurator state. Mirrors
 *  SwitchConfig's shape; HA ports are a labeled RJ45 pair, not a distinct port type. */
export interface FirewallConfig {
  vendor?: FirewallVendor;
  /** WAN1/WAN2/... — real, separately-connectable ports of their own zone (distinct from the
   *  numbered LAN/rj45 range), matching how enterprise firewalls physically group Internet-
   *  facing uplinks apart from the internal LAN block. */
  wanCount?: number;
  rj45Count?: number;
  sfpPlusCount?: number;
  sfp28Count?: number;
  qsfpCount?: number;
  mgmtPort?: boolean;
  haPorts?: boolean;
  usbPort?: boolean;
  consolePort?: boolean;
  lcd?: boolean;
  rackEars?: boolean;
  qrCode?: boolean;
  assetLabel?: boolean;
  dustCovers?: boolean;
  panelColor?: string;
  brandStripColor?: string;
  accentColor?: string;
  ledTheme?: LedTheme;
  brandName?: string;
  modelName?: string;
  /** Overrides the panel's port-number/port-name labels (HA, WAN1, MGMT, port numbers, etc.),
   *  which otherwise default to a vendor-tone-derived grey. Independent of accentColor (used only
   *  for the brand name and MGMT's own label) and of a port group's own colour (which still wins
   *  for ports inside that group). */
  fontColor?: string;
  /** Overrides secondary/muted text (model name, WAN/UPLINK zone captions, USB-C/RST labels,
   *  the status line) — otherwise defaults to a dimmer vendor-tone-derived grey. */
  fontMuteColor?: string;
  /** Named, coloured port-range groups (WAN/LAN/PoE/10GbE/25GbE etc.) — same visual-only
   *  grouping as SwitchConfig.portGroups; `poe` is accepted but not drawn for firewalls (no PoE
   *  badge in this renderer yet), only name/color/range. */
  portGroups?: SwitchPortGroup[];
}

/** Network Access Control appliance — physical-appearance-only configurator state, same shape
 *  family as SwitchConfig/FirewallConfig but deliberately small: NAC boxes are simple fixed-role
 *  1U appliances (a handful of RJ45 uplinks + MGMT + console), not parametric switching fabric. */
export interface NacConfig {
  vendor?: NacVendor;
  rj45Count?: number;
  mgmtPort?: boolean;
  consolePort?: boolean;
  usbPort?: boolean;
  rackEars?: boolean;
  assetLabel?: boolean;
  panelColor?: string;
  accentColor?: string;
  ledTheme?: LedTheme;
  brandName?: string;
  modelName?: string;
}

/** Automatic Transfer Switch — dual power-input inlets (labeled SOURCE A / SOURCE B) feeding a
 *  row of output outlets, with a transfer-status indicator showing which source is currently
 *  active. Visually distinct from a plain PDU (single input) even though both are power gear. */
export interface AtsConfig {
  outletCount?: number;
  outletType?: SocketType;
  activeSource?: 'A' | 'B';
  panelColor?: string;
  accentColor?: string;
  brandName?: string;
  modelName?: string;
}

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
  group?: string;  // functional group label (e.g. WAN/LAN/DMZ/HA) for grouped-port panels
}

// === Devices ===
export type DeviceCategory = 'server' | 'switch' | 'router' | 'firewall' | 'storage' | 'patch-panel' | 'pdu' | 'ups' | 'blank-panel' | 'cable-manager' | 'cooling' | 'console' | 'nac' | 'ats' | 'load-balancer' | 'vpn-concentrator' | 'ids-ips' | 'proxy-waf';

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
  deviceConfig?: Record<string, unknown>;  // PDU configurator state
  isCustom?: boolean;
  // Always uses the generic device Properties panel (front-panel image upload + manual port
  // add/remove) instead of the category's specialized SDK configurator (renderSwitchProperties /
  // renderFirewallProperties etc.) — for templates meant to be re-skinned with a real hardware
  // photo and calibrated port-by-port, where the switch/firewall rj45Count-driven configurator
  // would fight with (and overwrite) manually placed ports.
  customLayout?: boolean;
  basedOnTemplateId?: string;
  customDescription?: string;
  createdAt?: string;
  powerWatts?: number;  // nameplate watts; 0 for passive devices
  mountType?: 'rack' | 'side';   // 'rack' is default
  pduWidth?: number;              // px width when side-mounted (e.g. 42)
  outletConfig?: OutletConfig[];  // for side PDUs
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
  deviceConfig?: Record<string, unknown>;  // PDU configurator state
  powerWatts?: number;  // per-instance override; falls back to template.powerWatts
  sideMountPosition?: 'left' | 'right';  // only for mountType:'side' devices
  portTypes?: Record<number, 'data' | 'power'>;  // port index → type; absent = 'data'
  // Per-instance "Device Type" override (Properties panel) — only honored when the template is
  // `customLayout: true` (Custom Server/Switch/Firewall 1U/2U/4U). Lets a blank custom chassis be
  // relabeled as whatever it actually is (Router, Load Balancer, Switch L2/L3, ...) without
  // fighting the SDK configurators, which stay keyed off the template's own native category.
  categoryOverride?: DeviceCategory;
}

// === Text Labels / Annotations ===
export interface TextLabel {
  id: string;
  x: number;  // world coords, top-left anchor
  y: number;
  text: string;  // may contain \n for multi-line
  fontFamily: string;
  fontSize: number;  // px
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  color: string;  // text fill
  align: 'left' | 'center' | 'right';
  backgroundColor: string | null;  // null = transparent
  /** Horizontal/vertical padding (px) between the text and the background box's edge — lets the
   *  user grow/shrink the box independent of the text itself. Undefined falls back to the
   *  renderer's tight default (see text-label-renderer.ts). */
  backgroundPaddingX?: number;
  backgroundPaddingY?: number;
  rotation: number;  // degrees
  locked?: boolean;

  // === Device pointer (callout) — optional connector line to a device ===
  /** When set, this label has a leader line pointing at a device — still a plain floating label
   *  otherwise (box drag/style/delete/undo all unchanged), just with an extra connector drawn. */
  pointerDeviceId?: string;
  /** Device-local attachment point, same relativeX/relativeY convention as PortData — tracks
   *  automatically if the device moves since it's resolved fresh on every render. */
  pointerAnchorX?: number;
  pointerAnchorY?: number;
  /** 'elbow' = diagonal-then-straight leader line (matches common rack-diagram callouts).
   *  'flexible' = user-draggable via-points, same interaction as CableData.anchorPoints. */
  pointerStyle?: 'elbow' | 'flexible';
  pointerAnchorPoints?: Point[];
  pointerLineColor?: string;
}

/** A user-uploaded raster/vector image dropped onto the canvas as a free-floating annotation —
 *  logos, reference photos, floor-plan underlays, etc. `src` is a data URL (from FileReader,
 *  same pattern as DeviceData.frontPanelImage) so it round-trips through project JSON save/load
 *  with no external file dependency; PNG/GIF/WEBP/SVG alpha transparency is preserved natively
 *  since it's the real uploaded image bytes, not a re-encoded copy. */
export interface ImageAsset {
  id: string;
  x: number;  // world coords, top-left
  y: number;
  width: number;
  height: number;
  src: string;  // data URL
  opacity: number;  // 0-1
  rotation: number;  // degrees
  locked?: boolean;
}

export type CableType = 'idrac' | 'vm-network' | 'ceph-primary' | 'ceph-secondary' | 'live-migration' | 'backup' | 'general' | 'general-a' | 'general-b' | 'power' | 'power-redundant' | 'cat6' | 'cat6a' | 'cat8' | 'om4' | 'om5' | 'dac-twinax' | 'qsfp28' | 'c13-power' | 'c19-power' | 'console' | 'custom';

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
  'power-redundant': '#ffb300',
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
  powerCableType?: 'data' | 'power';   // 'data' is default
  plugType?: SocketType;               // set when powerCableType === 'power'
  flowSpeed?: number;      // Animation speed factor
  exitStraightOffset?: number; // Straight exit distance before first bend (default 18px)
}

// === Application State ===
export type ToolMode = 'select' | 'pan' | 'cable' | 'power' | 'text' | 'label' | 'zoom-in' | 'zoom-out' | 'export-area';
export type Theme = 'dark' | 'light';

export type SelectableItem =
  | { type: 'rack'; id: string }
  | { type: 'device'; id: string }
  | { type: 'port'; id: string }
  | { type: 'cable'; id: string }
  | { type: 'bundle'; id: string }
  | { type: 'text'; id: string }
  | { type: 'image'; id: string };

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
  textLabels: TextLabel[];
  imageAssets: ImageAsset[];
  validationAlerts: ValidationAlert[];
  selection: SelectableItem[];
  cableInProgress: {
    sourcePortId: string;
    currentPoint: Point;
    bendPoints: Point[];
    cableType: CableType;
  } | null;
  /** "Airdrop Destination" — while drawing a (non-power) cable from a real source port, lets a
   *  click anywhere on the canvas (any rack, any spot, no snapping to a real port) finish the
   *  cable at that exact point instead of requiring a real destination port. Source ports are
   *  never affected — only where a cable is allowed to land. */
  airdropDestination: boolean;
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
  'device:remove-port': { deviceId: string; portId: string };
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
  'export:html': void;
  'export:json': void;
  'export:request-area-selection': void;
  'export:area-selected': { x: number; y: number; width: number; height: number };
  'export:area-selection-cancelled': void;
  'cable:batch-generate': { deviceId: string; side: 'left' | 'right'; type: CableType; color: string; count: number };
  'project:save': void;
  'project:load': string;
  'file:new': void;
  'file:save': void;
  'file:save-as': void;
  'file:open': void;
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
  'cable:toggle-airdrop-destination': void;
  'textlabel:update': { id: string; data: Partial<TextLabel> };
  'image:insert': void;
  'imageasset:update': { id: string; data: Partial<ImageAsset> };
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
