import type { RackDiff, AIMessage, AIHint, AIProviderName } from '../ai/types';

// === Geometry ===
export interface Point { x: number; y: number; }
/** Screen-space (viewport pixel) rectangle — deliberately NOT world/SVG coordinates, since it's
 *  compared directly against candidate elements' own getBoundingClientRect() (see the
 *  *:area-select events this backs). */
export interface ScreenRect { left: number; top: number; right: number; bottom: number; }
export interface Rect { x: number; y: number; width: number; height: number; }
export interface Transform { x: number; y: number; scale: number; }

// === Rack ===
export const RACK_UNIT_SIZES = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54
] as const;
export type RackUnits = typeof RACK_UNIT_SIZES[number] | number;

export const STANDARD_RACK_HEIGHTS = [6, 9, 12, 18, 24, 27, 36, 42, 45, 48] as const;
export const STANDARD_RACK_DEPTHS = [450, 600, 800, 1000, 1200] as const;
export type VcmWidth = '2-inch' | '4-inch' | '6-inch' | '8-inch' | 'none';
export type RackType = 'server' | 'network' | 'wall-mount' | 'open-frame';
export type RackDoorType =
  | 'glass'
  | 'perforated'
  | 'perforated-large'
  | 'perforated-medium'
  | 'perforated-small'
  | 'perforated-tiny'
  | 'honeycomb-large'
  | 'honeycomb-medium'
  | 'honeycomb-small'
  | 'honeycomb-tiny'
  | 'solid'
  | 'split-perforated'
  | 'split-perforated-large'
  | 'split-perforated-medium'
  | 'split-perforated-small'
  | 'split-perforated-tiny'
  | 'split-honeycomb'
  | 'split-honeycomb-large'
  | 'split-honeycomb-medium'
  | 'split-honeycomb-small'
  | 'split-honeycomb-tiny'
  | 'split-solid'
  | 'split-glass'
  | 'multi-compartment-2'
  | 'multi-compartment-4'
  | 'louvered'
  | 'none';
export type RackMounting = 'floor' | 'wall-mount';
export type RackWidthOption = '19-inch' | '23-inch' | 'custom';
export type VcmType = 'single-sided' | 'double-sided';

export interface RackData {
  id: string;
  name: string;
  units: number;
  x: number;  // position on canvas
  y: number;
  rackWidth?: RackWidthOption;
  depthMm?: number;
  rackType?: RackType;
  frontDoor?: RackDoorType;
  sidePanels?: boolean;
  rackColor?: string;
  mounting?: RackMounting;
  showPduLeft?: boolean;
  showPduRight?: boolean;
  leftCableManagerWidth?: VcmWidth;
  rightCableManagerWidth?: VcmWidth;
  leftCableManagerColor?: string;
  rightCableManagerColor?: string;
  vcmType?: VcmType;
  vcmHeight?: 'match-rack' | number;
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
export type PortType = 'rj45' | 'sfp' | 'sfp-plus' | 'sfp28' | 'qsfp' | 'qsfp28' | 'qsfp-dd' | 'osfp' | 'management' | 'console' | 'power' | 'hybrid' | 'usb' | 'dvi' | 'displayport' | 'vga' | 'hdmi' | 'audio' | 'mic' | 'serial';

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

/** Per-device 3D viewport configuration. All fields optional at the data layer;
 *  device-builder resolves: device.device3D → template.default3D → built-in defaults. */
export interface Device3DConfig {
  depth: number;  // mm-equivalent units; default 500 (standard 1U server depth)
  width: number;  // mm-equivalent units; default 350 (RACK_INNER_WIDTH − 2×RAIL_WIDTH)
}

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
  default3D?: Device3DConfig;
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
  color?: string;  // per-instance chassis / finish color override
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
  device3D?: Device3DConfig;
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
  x: number;  // world coords, top-left — in whichever canvas's own coordinate space `canvas` below selects
  y: number;
  width: number;
  height: number;
  src: string;  // data URL
  opacity: number;  // 0-1
  rotation: number;  // degrees
  locked?: boolean;
  /** Which canvas this image was inserted/pasted onto — rack elevation or Cloud Architecture
   *  diagram (see app.ts's insertImageAsset). Unset means 'rack', matching every image asset
   *  created before this field existed. Each canvas only renders/hit-tests its own images (see
   *  renderAll()'s labelLayer loop vs renderCloudAll()'s cloud-image-layer loop) — they don't
   *  bleed across views, since their x/y aren't in a shared coordinate space. */
  canvas?: 'rack' | 'cloud';
}

// === Cloud Architecture canvas (standalone diagram mode, independent of racks) ===
export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'onprem';

/** A single cloud-service icon placed on the Cloud Architecture canvas. `iconId` references an
 *  entry in src/library/cloud-icon-manifest.json (id -> { path, name, provider, category }). */
export interface CloudNode {
  id: string;
  iconId: string;
  provider: CloudProvider;
  x: number;  // world coords, top-left
  y: number;
  width: number;
  height: number;
  label: string;  // editable display name, defaults to the manifest entry's name
  locked?: boolean;
  /** Set at drop time from CloudIconEntry.trueScale — marks this node as using real
   *  RACK_CONSTANTS proportions (see the "True Scale" local-resources category), which enables
   *  rack-unit grid snapping and snap-into-cabinet placement in app.ts. */
  trueScale?: boolean;
}

/** The full border/line dash-pattern catalog — shared by CloudConnector.style and
 *  CloudContainer.style so both pickers (properties.ts's lineStylePickerMarkup()) and both
 *  renderers (cloud-connector-renderer.ts's DASH_BY_STYLE/DOUBLE_INNER_STYLE/isDoubleLineStyle,
 *  reused as-is by cloud-container-renderer.ts) stay in sync off one definition. */
export type CloudLineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'long-dash' | 'double' | 'double-dashed' | 'double-dotted' | 'double-dash-dot' | 'double-long-dash';

/** A background boundary box (VPC/Subnet/Resource-Group/AZ/Region/etc.) — decorative only in
 *  this phase: dragging a container does not move nodes visually inside it. */
export interface CloudContainer {
  id: string;
  kind: 'vpc' | 'subnet' | 'resource-group' | 'az' | 'region' | 'account' | 'generic';
  provider?: CloudProvider | null;  // null/undefined = neutral generic styling
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;  // border/accent override
  /** Label chip ("ribbon") fill color override, independent of the boundary box's own border/tint
   *  above — same relationship as CloudHierarchy.ribbonColor (see its doc comment). Unset falls
   *  back to `color` (or the provider accent if that's unset too). */
  ribbonColor?: string;
  /** Label chip TEXT color override — independent of ribbonColor, since the chip's own fill can
   *  be any color a user picks and dark-on-dark/light-on-light would otherwise become illegible.
   *  Unset means the original hardcoded near-black (#0d1117), which only reads well on light
   *  ribbon colors — pick something lighter if you've set a dark Ribbon Color. */
  textColor?: string;
  /** Border dash pattern — unset means "use kind's own default" (see BORDER_STYLE_BY_KIND in
   *  cloud-container-renderer.ts, e.g. subnet defaults to dashed, az to dotted). A 'double'-family
   *  value draws a second, inset parallel rect border rather than an offset polyline (which is
   *  how CloudConnector does it) — a rectangle's four sides don't need path-offset math. */
  style?: CloudLineStyle;
  /** Background fill opacity, 0 (no fill at all — border only) to 1 (fully opaque). Unset means
   *  "use the default" (~8%, the original hardcoded translucent-tint look). 0 is the "disable
   *  background" case — same field drives both "how transparent" and "on/off", rather than a
   *  separate boolean the opacity would have to agree with. */
  backgroundOpacity?: number;
  locked?: boolean;
  /** Set when this container was created by dropping a boundary-type palette icon (e.g. Azure
   *  "Virtual Networks") rather than the generic container tool — drawn as a small icon next to
   *  the label chip. References cloud-icon-manifest.json's id, same as CloudNode.iconId. */
  iconId?: string;
}

export type CloudHierarchyLevelKind = 'account' | 'region' | 'resource-group' | 'vpc' | 'subnet';

export interface CloudHierarchyLevel {
  kind: CloudHierarchyLevelKind;
  label: string;
}

/** A compact "breadcrumb bar" describing a nested Account/Region/Resource-Group/VPC/Subnet
 *  hierarchy, built from one slash-separated line of text (see library/hierarchy-parser.ts's
 *  parseHierarchyLine) instead of placing and nesting several CloudContainer boxes by hand.
 *  Purely a labeled diagram element — a single continuous pill with each segment's icon+label
 *  inline (see renderers/cloud-hierarchy-renderer.ts) — unlike CloudContainer it doesn't visually
 *  bound/contain other canvas objects, it's read left-to-right like a breadcrumb path. */
export interface CloudHierarchy {
  id: string;
  provider: CloudProvider;
  x: number;
  y: number;
  levels: CloudHierarchyLevel[];
  locked?: boolean;
  /** Box dimensions, like CloudContainer's width/height — dragged via the corner resize handle.
   *  Unset means "auto-fit to content" (the natural width for the icons+text at normal size, and
   *  a single row's height). Icons/text are NOT scaled by resizing — growing the box just reveals
   *  more pill background around the same-size content, same as CloudContainer's label chip. */
  width?: number;
  height?: number;
  /** Boundary box LINE color override (border stroke + translucent background tint) — same
   *  meaning as CloudContainer.color (unset = provider accent). Independent of ribbonColor below
   *  — the box border and the chip on top of it are two separately colorable elements. */
  color?: string;
  /** Label chip ("ribbon") fill color override, independent of the boundary box's own line/border
   *  color above. Unset falls back to `color` (or the provider accent if that's unset too), so a
   *  hierarchy with no overrides at all still reads as one solid color like before. */
  ribbonColor?: string;
  /** Chip label TEXT color override — same meaning as CloudContainer.textColor (unset = the
   *  original hardcoded white, tuned for the default provider-accent ribbon colors — pick
   *  something darker if you've set a light Ribbon Color). */
  textColor?: string;
  /** Boundary box border dash pattern — same catalog/meaning as CloudContainer.style (unset =
   *  the default dashed border). */
  style?: CloudLineStyle;
  /** Boundary box background fill opacity — same meaning as CloudContainer.backgroundOpacity
   *  (unset = the default ~8% tint, 0 = border only). */
  backgroundOpacity?: number;
}

/** A freeform line between two cloud nodes, or between a node and a bare point — mirrors
 *  CableData's floatingSource/floatingDest duality, but with no port system underneath. */
export type CloudHandleSide = 'top' | 'right' | 'bottom' | 'left';

/** Line-tip style, independently choosable for the source and dest ends — 'none' draws a bare
 *  line end, the rest render an SVG marker at that tip (see cloud-connector-renderer.ts /
 *  CloudCanvasManager's marker <defs>). 'arrow' = classic filled triangle, 'arrow-open' = open
 *  chevron (no fill), 'arrow-broad' = wider/blockier filled triangle, 'dot' = filled circle,
 *  'diamond' = filled rhombus. */
export type CloudArrowType = 'none' | 'arrow' | 'arrow-open' | 'arrow-broad' | 'dot' | 'diamond';

export interface CloudConnector {
  id: string;
  sourceNodeId?: string | null;
  sourcePoint?: Point | null;
  destNodeId?: string | null;
  destPoint?: Point | null;
  /** Which side of the source/dest node the line actually exits/enters from — set from the
   *  connection handle that was dragged (source) and, when the drop landed on a specific dest
   *  handle, that handle too; otherwise inferred automatically from relative node position (see
   *  inferBestSide() in cloud-connector-renderer.ts). Undefined for a pre-existing connector
   *  from before this field existed, or when either end is a bare floating point. */
  sourceSide?: CloudHandleSide;
  destSide?: CloudHandleSide;
  label?: string;
  style?: CloudLineStyle;
  /** 'orthogonal' (the default for newly created connectors) routes as a right-angle path that
   *  exits/enters perpendicular to each side (common in official cloud architecture diagrams)
   *  instead of a single straight line between the two endpoints. */
  routing?: 'straight' | 'orthogonal';
  /** Rounds the corners of an orthogonal route with a small arc instead of a sharp 90° turn. */
  roundedCorners?: boolean;
  /** Manual override for the orthogonal route's crossbar — the single interior segment shared by
   *  both bends when the source/dest sides are the same orientation (both left/right or both
   *  top/bottom), or when neither side is known. An absolute world-space X (same-orientation
   *  horizontal sides, or no sides known) or Y (same-orientation vertical sides) coordinate,
   *  dragged via the small dot handle at the crossbar's midpoint — see crossbarHandleFor() in
   *  cloud-connector-renderer.ts. Unset means "use the auto-computed default". Not offered for
   *  perpendicular sides or a single known side — those routes have no free interior coordinate
   *  to drag without introducing a non-orthogonal segment. */
  crossbarOffset?: number;
  /** Manual override for the short run immediately after the route leaves the SOURCE side (the
   *  segment right after its perpendicular stub-out) — an absolute world-space Y (horizontal
   *  source side) or X (vertical source side) coordinate. Present alongside crossbarOffset lets
   *  every orthogonal route — including perpendicular-side ones, which have no crossbar — get a
   *  draggable entry segment; see routeHandlesFor() in cloud-connector-renderer.ts. Unset
   *  means "use the auto-computed default" (a perfectly straight stub-out, no jog). */
  entryOffset?: number;
  /** Same idea as entryOffset, mirrored at the DEST side's stub-in. */
  exitOffset?: number;
  /** Manual override for the short perpendicular "jog" segment that appears right next to the
   *  SOURCE node once entryOffset has actually moved the entry run sideways (it's what keeps the
   *  stub-out exactly perpendicular to the node while the run itself sits elsewhere) — an
   *  absolute world-space X (horizontal source side) or Y (vertical source side) coordinate for
   *  where that jog sits, same convention as entryOffset. Only produces a visible, non-degenerate
   *  segment (and matching handle) once entryOffset is also set — with entryOffset unset there's
   *  nothing to jog away from in the first place. */
  entryStubOffset?: number;
  /** Same idea as entryStubOffset, mirrored at the DEST side's jog (only visible once exitOffset
   *  is set). */
  exitStubOffset?: number;
  /** Fully manual interior route — mirrors CableData.anchorPoints (see cable-renderer.ts):
   *  ordered free points the line passes through between `from` and `to`, added via the
   *  connector's right-click "Add Waypoint Here" (nearest point on the clicked segment, see
   *  distToSegment() in utils/geometry.ts) and removed the same way a cable anchor is. When
   *  present (non-empty), this completely overrides crossbarOffset/entryOffset/exitOffset/
   *  entryStubOffset/exitStubOffset and the whole auto-route/'orthogonal' perpendicular-stub
   *  logic — the path is drawn straight through `from`, each waypoint in order, then `to`,
   *  optionally corner-rounded by `roundedCorners` exactly like the auto-routed case. Manually
   *  placed waypoints are NOT forced back onto horizontal/vertical alignment (same as cable
   *  anchors) — the user is taking over routing entirely at that point. */
  waypoints?: Point[];
  /** When true (and routing === 'orthogonal'), routes around other cloud nodes/containers/
   *  hierarchies instead of straight through them — see routeAroundObstacles() in
   *  cloud-connector-router.ts. Falls back to the plain elbow route when no valid path exists
   *  (e.g. destination fully enclosed). Ignored when routing !== 'orthogonal', and overridden
   *  entirely by a non-empty `waypoints` list, same precedence as every other auto-route knob.
   *  The per-segment manual offsets above don't apply to a multi-bend pathfound route. */
  avoidObstacles?: boolean;
  /** Stroke width in px — default 2 when unset. */
  width?: number;
  /** Tip style at the source end — default 'none'. */
  startArrow?: CloudArrowType;
  /** Tip style at the dest end — default 'arrow'. */
  endArrow?: CloudArrowType;
  color?: string;
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
  sourcePortId: string | null;
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
  sourceOrientation?: 'auto' | 'up' | 'down' | 'left' | 'right' | 'inward';
  destOrientation?: 'auto' | 'up' | 'down' | 'left' | 'right' | 'inward';
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
export type ToolMode = 'select' | 'pan' | 'cable' | 'power' | 'text' | 'label' | 'zoom-in' | 'zoom-out' | 'export-area' | 'cloud-container' | 'cloud-connect' | 'cloud-export-area';
export type Theme = 'dark' | 'light';

export type SelectableItem =
  | { type: 'rack'; id: string }
  | { type: 'device'; id: string }
  | { type: 'port'; id: string }
  | { type: 'cable'; id: string }
  | { type: 'bundle'; id: string }
  | { type: 'text'; id: string }
  | { type: 'image'; id: string }
  | { type: 'cloud-node'; id: string }
  | { type: 'cloud-container'; id: string }
  | { type: 'cloud-connector'; id: string }
  | { type: 'cloud-hierarchy'; id: string };

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
    sourcePortId: string | null;
    floatingSource?: Point | null;
    currentPoint: Point;
    bendPoints: Point[];
    cableType: CableType;
  } | null;
  /** "Airdrop Destination" — while drawing a (non-power) cable from a real source port, lets a
   *  click anywhere on the canvas (any rack, any spot, no snapping to a real port) finish the
   *  cable at that exact point instead of requiring a real destination port. Source ports are
   *  never affected — only where a cable is allowed to land. */
  airdropDestination: boolean;
  activeCableEnd?: 'source' | 'dest';
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
  /** Rack view only — shows/hides the Three.js 3D panel (#canvas-3d + its splitter) alongside
   *  the 2D elevation. Off by default: the 3D render loop is paused while hidden (see
   *  ThreeViewport.pause/resume) so an unopened panel costs nothing. Toggled from the rack
   *  floating toolbar's 3D switch (see floating-toolbar.ts) — there is no Cloud Architecture
   *  canvas equivalent. */
  show3DPanel: boolean;
  /** Whether the floating canvas toolbars (FloatingToolbar + CloudFloatingToolbar) are visible.
   *  Toggled by the ⊞ button in the top toolbar. Default true. */
  floatingToolbarVisible: boolean;
  presenterMode: boolean;
  cableRoutingTrayMode: 'overhead' | 'underfloor';
  // AI Mode
  aiMode: boolean;
  aiProvider: AIProviderName;
  previewDiff: RackDiff | null;
  customTemplates: DeviceTemplate[];
  /** Top-level view switch — 'rack' is the existing 2D+3D rack elevation workspace, 'cloud' is
   *  the standalone Cloud Architecture diagram canvas, 'hybrid' shows both canvases together (2D
   *  only — never shows the 3D panel), laid out per hybridLayoutMode. See app.ts's
   *  setActiveView() for how the layering/pass-through works. */
  activeView: 'rack' | 'cloud' | 'hybrid' | 'datacenter' | 'flowchart';
  /** Hybrid-only sub-mode, toggled from the toolbar's Hybrid Layout group (see toolbar.ts) —
   *  'split' (default) shows the rack and cloud canvases as separate side-by-side panes, each
   *  with its own independent pan/zoom/scale (see mountHybridSplitter in app.ts), good for a rack
   *  elevation and a cloud diagram that don't share a natural scale. 'merged' instead overlaps
   *  them into one shared coordinate space with locked pan/zoom (see setHybridTransformSync) so
   *  cloud items can be placed directly next to/over the rack at the same zoom level. */
  hybridLayoutMode: 'split' | 'merged';
  cloudNodes: CloudNode[];
  cloudContainers: CloudContainer[];
  cloudConnectors: CloudConnector[];
  cloudHierarchies: CloudHierarchy[];
  activeElevationRackId?: string | null;
  workflowMode?: 'rack' | 'datacenter' | 'cloud' | 'hybrid' | 'flowchart';
}

// === Events ===
export interface AppEvents {
  'state:changed': Partial<AppState>;
  'rack:added': RackData;
  'rack:moved': { id: string; x: number; y: number };
  'rack:removed': string;
  'rack:update': { id: string; data: Partial<RackData> };
  'rack:add': { units?: number };
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
  'properties:toggle': void;
  'properties:show': void;
  'properties:hide': void;
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
  'export:cloud-svg': void;
  'export:cloud-png': void;
  'export:request-area-selection': void;
  'export:area-selected': { x: number; y: number; width: number; height: number };
  'export:area-selection-cancelled': void;
  'export:cloud-request-area-selection': void;
  'export:cloud-area-selected': { x: number; y: number; width: number; height: number };
  'export:cloud-area-selection-cancelled': void;
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
  'view:toggle-3d-panel': void;
  /** Toggles the floating canvas toolbar(s) show/hide — emitted by the ⊞ button in Toolbar. */
  'view:toggle-floating-toolbar': void;
  /** Switches Hybrid view's sub-mode between separate scaled panes and one shared overlapping
   *  canvas — see AppState.hybridLayoutMode's doc comment and app.ts's setHybridLayoutMode(). */
  'view:set-hybrid-layout': 'split' | 'merged';
  'view:toggle-theme': void;
  'view:toggle-legends': void;
  'cable:toggle-airdrop-destination': void;
  'textlabel:update': { id: string; data: Partial<TextLabel> };
  'image:insert': void;
  'imageasset:update': { id: string; data: Partial<ImageAsset> };
  'view:switch': 'rack' | 'cloud' | 'hybrid' | 'datacenter' | 'flowchart';
  'dc:set-tool': 'select' | 'pan';
  'dc:set-view': '2d' | '3d';
  'dc:rotate-2d': void;
  'dc:toggle-xray': void;
  'dc:toggle-grid': void;
  'dc:toggle-snap': void;
  'dc:toggle-grid-lock': void;
  'dc:toggle-labels': void;
  'dc:fit': void;
  'dc:zoom-in': void;
  'dc:zoom-out': void;
  'dc:work-rack': string;
  'dc:add-preset': string;
  'dc:add-row': void;
  'dc:new-floor': void;
  'dc:toggle-left-panel': void;
  'dc:start-lay-pathway': any;
  'dc:start-place-equipment': any;
  'dc:start-lay-wall': any;
  'dc:perimeter-walls': void;
  'dc:roof-settings': void;
  'dc:start-place-wall-item': any;
  'dc:cancel-tool': void;
  'dc:tool-started': any;
  'dc:tool-ended': void;
  /** Primes the cloud-container draw tool with a specific boundary kind (Region/AZ/VPC/Subnet/
   *  Resource Group/Account) — the dedicated toolbar shape buttons, as opposed to dropping a
   *  boundary-type palette icon (which also primes the same tool, see isBoundaryIcon()). */
  'cloud-shape:prime': CloudContainer['kind'];
  'view:changed': 'rack' | 'cloud' | 'hybrid' | 'datacenter' | 'flowchart';
  'cloudnode:added': CloudNode;
  'cloudnode:update': { id: string; data: Partial<CloudNode> };
  'cloudcontainer:added': CloudContainer;
  'cloudcontainer:update': { id: string; data: Partial<CloudContainer> };
  'cloudconnector:added': CloudConnector;
  'cloudconnector:update': { id: string; data: Partial<CloudConnector> };
  'cloudhierarchy:added': CloudHierarchy;
  'cloudhierarchy:update': { id: string; data: Partial<CloudHierarchy> };
  /** Opens the "describe infra in one line" quick-entry modal (see hierarchy-input-modal.ts),
   *  pre-selecting the given provider (unset defaults inside the handler). */
  'cloudhierarchy:prime': CloudProvider | undefined;
  'cloud-canvas:transformed': Transform;
  'cloud-canvas:click': Point;
  'cloud-canvas:rightclick': { point: Point; target: EventTarget | null; screenPoint: Point };
  /** Left-click-and-drag marquee selection on the Cloud Architecture canvas — see
   *  'canvas:area-select's doc comment, same mechanics via CloudCanvasManager. */
  'cloud-canvas:area-select': ScreenRect;
  'notification': { message: string; type: 'info' | 'success' | 'warning' | 'error' };
  'app:show-landing': void;
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
