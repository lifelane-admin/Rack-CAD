import { AppState, RackData, DeviceData, PortData, CableData, CableType, SelectableItem, Transform, RACK_CONSTANTS, CableBundle, ValidationAlert, PduConfig, KvmConfig, DeviceTemplate } from './types';
import { eventBus } from './event-bus';
import { getTemplate } from '../library/device-catalog';
import { runValidationAlerts } from './validation';
import { loadCustomTemplates, saveAllCustomTemplates } from '../library/custom-catalog';
import { computeConfiguredPduLayout, computeGenericPduLayout, computeSidePduOutletPositions, sidePduOffsetX, normalizeComposition } from '../renderers/pdu-layout';
import { networkingPorts } from '../renderers/networking-renderer';

function asPduConfig(config: unknown): PduConfig {
  return (config && typeof config === 'object') ? (config as PduConfig) : {};
}

class StateManager {
  private state: AppState;
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  constructor() {
    this.state = {
      theme: 'dark',
      tool: 'select',
      transform: { x: 0, y: 0, scale: 1 },
      gridVisible: true,
      snapEnabled: true,
      rulersVisible: true,
      racks: [
        { id: 'rack-1', name: 'Rack 1', units: 42, x: 200, y: 100, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' },
        { id: 'rack-2', name: 'Rack 2', units: 42, x: 700, y: 100, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' }
      ],
      devices: [],
      cables: [],
      bundles: [],
      validationAlerts: [],
      selection: [],
      cableInProgress: null,
      sidebarCollapsed: false,
      propertiesCollapsed: false,
      showLegends: false,
      selectedCableType: 'general',
      selectedCableColor: '#78909c',
      selectedCableBend: 10,
      selectedCableTermination: 'RJ45 Ethernet',
      cabinetViewMode: 'front',
      cabinetDrawMode: 'default',
      cabinetCoverVisible: true,
      isometricMode: false,
      presenterMode: false,
      cableRoutingTrayMode: 'overhead',
      aiMode: false,
      aiProvider: 'rules',
      previewDiff: null,
      customTemplates: loadCustomTemplates()
    };

    // Load auto-save if present, otherwise load the Proxmox demo project automatically
    const loaded = this.loadAutoSave();
    if (!loaded) {
      this.loadDemoProject();
    }
  }

  getState(): AppState {
    return this.state;
  }

  loadDemoProject(): void {
    const rackId = 'rack-demo';
    const racks: RackData[] = [
      { id: rackId, name: 'Enterprise Cluster Rack', units: 42, x: 250, y: 80, leftCableManagerWidth: '4-inch', rightCableManagerWidth: '4-inch' }
    ];

    const devices: DeviceData[] = [];
    const cables: CableData[] = [];

    const mkDevice = (id: string, templateId: string, startUnit: number, name: string, hostname: string, ip: string, serial: string, desc: string): DeviceData => {
      const tmpl = getTemplate(templateId)!;
      return {
        id,
        templateId,
        rackId,
        startUnit,
        name,
        hostname,
        managementIp: ip,
        serialNumber: serial,
        description: desc,
        // Strip any "ear hole" ports — injectEarPorts() regenerates the full PSU/network/hybrid
        // sequence separately as one evenly-spaced grid (see injectEarPorts in this file).
        ports: tmpl.ports.filter(p => !p.id.includes('-ear-')).map((p, i) => ({ ...p, id: `${id}-port-${i}`, deviceId: id, connected: false, cableId: null })),
      };
    };

    const torA = mkDevice('tor-a', 'rs-sw-24p', 40, 'TOR SWITCH A', 'tor-switch-a', '10.10.10.11', 'SRN-TOR-A', 'Top of Rack Switch A');
    const torB = mkDevice('tor-b', 'rs-sw-24p', 38, 'TOR SWITCH B', 'tor-switch-b', '10.10.10.12', 'SRN-TOR-B', 'Top of Rack Switch B');
    const mgmtSwitch = mkDevice('mgmt-switch', 'rs-sw-24p', 36, 'MANAGEMENT SWITCH', 'mgmt-switch', '10.10.10.10', 'SRN-MGMT', '1GbE OOB Management Switch');
    const node1 = mkDevice('node-1', 'server-2u', 20, 'Server Node 1', 'server-node-1', '10.10.10.21', 'SRN-NODE-1', 'Cluster Node 1');
    const node2 = mkDevice('node-2', 'server-2u', 17, 'Server Node 2', 'server-node-2', '10.10.10.22', 'SRN-NODE-2', 'Cluster Node 2');
    const node3 = mkDevice('node-3', 'server-2u', 14, 'Server Node 3', 'server-node-3', '10.10.10.23', 'SRN-NODE-3', 'Cluster Node 3');
    const backup = mkDevice('backup-server', 'server-2u', 1, 'Backup Server', 'backup-server', '10.10.10.20', 'SRN-BACKUP', 'Backup Server Node');

    devices.push(torA, torB, mgmtSwitch, node1, node2, node3, backup);

    let cableCount = 1;
    const connect = (srcDev: DeviceData, srcIdx: number, destDev: DeviceData, destIdx: number, type: CableType, color: string) => {
      const srcPort = srcDev.ports[srcIdx];
      const destPort = destDev.ports[destIdx];
      if (!srcPort || !destPort) return;
      const cableId = `cable-${cableCount++}`;
      cables.push({
        id: cableId, name: `Cable ${cableCount - 1}`, type, color,
        sourcePortId: srcPort.id, destPortId: destPort.id,
        bendPoints: [], thickness: 2, bendRadius: 10,
        bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false,
      });
      srcPort.connected = true;
      srcPort.cableId = cableId;
      destPort.connected = true;
      destPort.cableId = cableId;
    };

    // Node 1
    connect(node1, 0, torA, 0, 'vm-network', '#fb8c00');
    connect(node1, 1, torA, 1, 'ceph-primary', '#43a047');
    connect(node1, 2, torB, 0, 'ceph-secondary', '#8e24aa');
    connect(node1, 3, torB, 1, 'live-migration', '#fdd835');
    connect(node1, 4, mgmtSwitch, 0, 'idrac', '#e53935');
    // Node 2
    connect(node2, 0, torA, 2, 'vm-network', '#fb8c00');
    connect(node2, 1, torA, 3, 'ceph-primary', '#43a047');
    connect(node2, 2, torB, 2, 'ceph-secondary', '#8e24aa');
    connect(node2, 3, torB, 3, 'live-migration', '#fdd835');
    connect(node2, 4, mgmtSwitch, 1, 'idrac', '#e53935');
    // Node 3
    connect(node3, 0, torA, 4, 'vm-network', '#fb8c00');
    connect(node3, 1, torA, 5, 'ceph-primary', '#43a047');
    connect(node3, 2, torB, 4, 'ceph-secondary', '#8e24aa');
    connect(node3, 3, torB, 5, 'live-migration', '#fdd835');
    connect(node3, 4, mgmtSwitch, 2, 'idrac', '#e53935');
    // Backup
    connect(backup, 0, mgmtSwitch, 3, 'backup', '#1e88e5');
    connect(backup, 4, mgmtSwitch, 4, 'idrac', '#e53935');
    // TOR interconnect
    connect(torA, 23, torB, 23, 'ceph-secondary', '#8e24aa');

    this.setState({ racks, devices, cables, selection: [], showLegends: true });
    eventBus.emit('notification', { message: 'Loaded demo project!', type: 'success' });
  }

  private prepareDevices(devices: DeviceData[]): DeviceData[] {
    return devices.map(d => {
      const template = getTemplate(d.templateId);
      if (!template) return d;
      const withLocalPorts = injectNetworkLocalPorts(d.id, template, d.deviceConfig, d.ports);
      return {
        ...d,
        ports: injectEarPorts(d.id, template.category, template.heightUnits, withLocalPorts)
      };
    });
  }

  setState(partial: Partial<AppState>, skipHistory = false): void {
    if (partial.devices !== undefined) {
      partial.devices = this.prepareDevices(partial.devices);
    }

    const isStructuralChange = partial.racks !== undefined || partial.devices !== undefined || partial.cables !== undefined || partial.bundles !== undefined;
    
    if (isStructuralChange && !skipHistory) {
      const snapshot = JSON.stringify({
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles
      });
      
      if (this.undoStack.length === 0 || this.undoStack[this.undoStack.length - 1] !== snapshot) {
        this.undoStack.push(snapshot);
        if (this.undoStack.length > 50) {
          this.undoStack.shift();
        }
        this.redoStack = [];
      }
    }

    this.state = { ...this.state, ...partial };

    if ('customTemplates' in partial) {
      saveAllCustomTemplates((partial as any).customTemplates);
    }

    if (isStructuralChange) {
      this.state.validationAlerts = runValidationAlerts(this.state.racks, this.state.devices, this.state.cables);
      // Emit validation event
      eventBus.emit('validation:updated', this.state.validationAlerts);
    }

    eventBus.emit('state:changed', partial);

    if (isStructuralChange) {
      this.autoSave();
    }
  }

  undo(): void {
    if (this.undoStack.length === 0) {
      eventBus.emit('notification', { message: 'Nothing to undo', type: 'warning' });
      return;
    }

    const currentSnapshot = JSON.stringify({
      racks: this.state.racks,
      devices: this.state.devices,
      cables: this.state.cables,
      bundles: this.state.bundles
    });
    this.redoStack.push(currentSnapshot);

    const prevSnapshot = this.undoStack.pop()!;
    try {
      const data = JSON.parse(prevSnapshot);
      this.state.racks = data.racks;
      this.state.devices = this.prepareDevices(data.devices);
      this.state.cables = data.cables;
      this.state.bundles = data.bundles || [];
      
      eventBus.emit('state:changed', {
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles
      });
      this.autoSave();
      eventBus.emit('notification', { message: 'Undo successful', type: 'success' });
    } catch (err) {
      console.error('Undo failed', err);
    }
  }

  redo(): void {
    if (this.redoStack.length === 0) {
      eventBus.emit('notification', { message: 'Nothing to redo', type: 'warning' });
      return;
    }

    const currentSnapshot = JSON.stringify({
      racks: this.state.racks,
      devices: this.state.devices,
      cables: this.state.cables,
      bundles: this.state.bundles
    });
    this.undoStack.push(currentSnapshot);

    const nextSnapshot = this.redoStack.pop()!;
    try {
      const data = JSON.parse(nextSnapshot);
      this.state.racks = data.racks;
      this.state.devices = this.prepareDevices(data.devices);
      this.state.cables = data.cables;
      this.state.bundles = data.bundles || [];

      eventBus.emit('state:changed', {
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles
      });
      this.autoSave();
      eventBus.emit('notification', { message: 'Redo successful', type: 'success' });
    } catch (err) {
      console.error('Redo failed', err);
    }
  }

  autoSave(): void {
    try {
      const data = JSON.stringify({
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles
      });
      localStorage.setItem('rack_design_autosave', data);
    } catch (err) {
      console.error('Autosave failed', err);
    }
  }

  loadAutoSave(): boolean {
    try {
      const data = localStorage.getItem('rack_design_autosave');
      if (!data) return false;
      
      const parsed = JSON.parse(data);
      if (parsed.racks && parsed.devices && parsed.cables) {
        this.state.racks = parsed.racks;
        this.state.devices = this.prepareDevices(parsed.devices);
        this.state.cables = parsed.cables;
        this.state.bundles = parsed.bundles || [];
        return true;
      }
    } catch (err) {
      console.error('Load autosave failed', err);
    }
    return false;
  }

  getRack(id: string): RackData | undefined {
    return this.state.racks.find(r => r.id === id);
  }

  getDevice(id: string): DeviceData | undefined {
    return this.state.devices.find(d => d.id === id);
  }

  getPort(id: string): PortData | undefined {
    for (const device of this.state.devices) {
      const port = device.ports.find(p => p.id === id);
      if (port) return port;
    }
    return undefined;
  }

  getCable(id: string): CableData | undefined {
    return this.state.cables.find(c => c.id === id);
  }

  getDevicesInRack(rackId: string): DeviceData[] {
    return this.state.devices.filter(d => d.rackId === rackId);
  }

  /**
   * Every synthetic `outlet-<deviceId>-<idx>` port id across every PDU currently in the design
   * (both horizontal and vertical). PDU outlets aren't in any device's `ports` array, so proximity
   * "snap to nearest port" logic (app.ts's cable-drawing click handler) must consult this
   * separately or it can never snap to a PDU outlet, only exact `.pdu-outlet-hit` hits.
   */
  getAllPduOutletPortIds(): string[] {
    const ids: string[] = [];
    for (const device of this.state.devices) {
      const template = getTemplate(device.templateId);
      if (!template || template.category !== 'pdu') continue;
      const config = asPduConfig(device.deviceConfig);
      const composition = normalizeComposition(config, template.outletConfig);
      const count = composition.reduce((sum, r) => sum + r.count, 0);
      for (let i = 0; i < count; i++) ids.push(`outlet-${device.id}-${i}`);
    }
    return ids;
  }

  /**
   * PDU outlets aren't real PortData entries — they're referenced by the convention
   * `outlet-<pduDeviceId>-<outletIdx>` (see app.ts's `.pdu-outlet-hit` cable hit-testing).
   * Resolve that convention here so power cables to either a horizontal (rack-mounted) or
   * vertical (0U side-mount) PDU's outlets get a real world position instead of silently
   * failing to render.
   */
  private getPduOutletWorldPosition(pduDeviceId: string, outletIdx: number): { x: number; y: number } | null {
    const device = this.state.devices.find(d => d.id === pduDeviceId);
    if (!device) return null;
    const template = getTemplate(device.templateId);
    if (!template) return null;
    const rack = this.getRack(device.rackId);
    if (!rack) return null;
    const config = asPduConfig(device.deviceConfig);

    if (device.sideMountPosition) {
      const pduWidth = template.pduWidth ?? 0;
      const stripH = rack.units * RACK_CONSTANTS.RU_HEIGHT;
      const positions = computeSidePduOutletPositions(template, config, pduWidth, stripH);
      const local = positions[outletIdx];
      if (!local) return null;
      const baseX = sidePduOffsetX(rack, device.sideMountPosition, pduWidth);
      return { x: rack.x + baseX + local.x, y: rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + local.y };
    }

    const heightUnits = template.heightUnits ?? 1;
    const deviceWidth = RACK_CONSTANTS.RACK_INNER_WIDTH - 2 * RACK_CONSTANTS.RAIL_WIDTH;
    const deviceHeight = heightUnits * RACK_CONSTANTS.RU_HEIGHT;
    const innerX = (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2;
    const deviceX = rack.x + innerX + RACK_CONSTANTS.RAIL_WIDTH;
    const deviceY = rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units - device.startUnit - heightUnits + 1) * RACK_CONSTANTS.RU_HEIGHT;

    const hasComposition = !!config.composition || !!(device.deviceConfig as any)?.rows;
    const layout = hasComposition
      ? computeConfiguredPduLayout(template, config, deviceWidth, deviceHeight)
      : computeGenericPduLayout(template, config, deviceWidth, deviceHeight);
    const local = layout.positions[outletIdx];
    if (!local) return null;
    return { x: deviceX + local.x, y: deviceY + local.y };
  }

  getPortWorldPosition(portId: string): { x: number; y: number } | null {
    const outletMatch = /^outlet-(.+)-(\d+)$/.exec(portId);
    if (outletMatch) {
      return this.getPduOutletWorldPosition(outletMatch[1], Number(outletMatch[2]));
    }

    let targetPort: PortData | null = null;
    let targetDevice: DeviceData | null = null;

    for (const device of this.state.devices) {
      const port = device.ports.find(p => p.id === portId);
      if (port) {
        targetPort = port;
        targetDevice = device;
        break;
      }
    }

    if (!targetPort || !targetDevice) return null;

    const rack = this.getRack(targetDevice.rackId);
    if (!rack) return null;
    
    const template = getTemplate(targetDevice.templateId);
    const heightUnits = template ? template.heightUnits : 1;
    const deviceY = rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units - targetDevice.startUnit - heightUnits + 1) * RACK_CONSTANTS.RU_HEIGHT;
    // Match device-renderer.ts: deviceX = innerX + RAIL_WIDTH = (OUTER-INNER)/2 + RAIL_WIDTH
    const innerX = (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2; // 25
    const deviceX = rack.x + innerX + RACK_CONSTANTS.RAIL_WIDTH; // rack.x + 50

    return {
      x: deviceX + targetPort.relativeX,
      y: deviceY + targetPort.relativeY
    };
  }

  addRack(data: RackData): void {
    const racks = [...this.state.racks, data];
    this.setState({ racks });
    eventBus.emit('rack:added', data);
  }

  removeRack(id: string): void {
    const racks = this.state.racks.filter(r => r.id !== id);
    this.setState({ racks });
    eventBus.emit('rack:removed', id);
  }

  addDevice(data: DeviceData): void {
    const devices = [...this.state.devices, data];
    this.setState({ devices });
    eventBus.emit('device:added', data);
  }

  removeDevice(id: string): void {
    const device = this.getDevice(id);
    let cables = this.state.cables;
    if (device) {
      const portIds = device.ports.map(p => p.id);
      const outletPrefix = `outlet-${id}-`;
      cables = this.state.cables.filter(c =>
        !portIds.includes(c.sourcePortId) && (!c.destPortId || !portIds.includes(c.destPortId)) &&
        !c.sourcePortId.startsWith(outletPrefix) && !(c.destPortId ?? '').startsWith(outletPrefix)
      );
    }
    const devices = this.state.devices.filter(d => d.id !== id);
    this.setState({ devices, cables });
    eventBus.emit('device:removed', id);
  }

  isRUOccupied(rackId: string, unit: number): boolean {
    const devices = this.getDevicesInRack(rackId);
    for (const d of devices) {
      const template = getTemplate(d.templateId);
      const height = template ? template.heightUnits : 1;
      if (unit >= d.startUnit && unit < d.startUnit + height) {
        return true;
      }
    }
    return false;
  }

  getNextAvailableRU(rackId: string, heightUnits: number): number | null {
    const rack = this.getRack(rackId);
    if (!rack) return null;
    
    for (let u = 1; u <= rack.units - heightUnits + 1; u++) {
      let occupied = false;
      for (let i = 0; i < heightUnits; i++) {
        if (this.isRUOccupied(rackId, u + i)) {
          occupied = true;
          break;
        }
      }
      if (!occupied) return u;
    }
    return null;
  }

  getBundle(id: string): CableBundle | undefined {
    return this.state.bundles.find(b => b.id === id);
  }

  addBundle(data: CableBundle): void {
    this.state.bundles.push(data);
    this.setState({ bundles: this.state.bundles });
    eventBus.emit('bundle:added', data);
  }

  removeBundle(id: string): void {
    this.state.bundles = this.state.bundles.filter(b => b.id !== id);
    const cables = this.state.cables.map(c => c.bundleId === id ? { ...c, bundleId: null } : c);
    this.setState({ bundles: this.state.bundles, cables });
    eventBus.emit('bundle:removed', id);
  }
}

/**
 * Regenerates a KVM or plain console-server device's customizable local-peripheral port group
 * (see KvmConfig) from its live `deviceConfig`, leaving the target group (real connections out
 * to managed servers/serial devices — labeled 'TARGETS' for KVM, 'SERIAL' for console servers)
 * and any ear-hole ports untouched. Runs on every setState({devices}) via prepareDevices,
 * exactly like injectEarPorts, so toggling a chip in the properties panel immediately
 * regenerates the device's actual connectable ports — not just the cosmetic SVG.
 */
export function injectNetworkLocalPorts(deviceId: string, template: DeviceTemplate, deviceConfig: unknown, basePorts: PortData[]): PortData[] {
  const isKvm = template.category === 'console' && template.id.startsWith('kvm');
  const isConsoleServer = template.category === 'console' && !isKvm;
  if (!isKvm && !isConsoleServer) return basePorts;

  const netKind = isKvm ? 'kvm' : 'console';
  const targetLabel = isKvm ? 'TARGETS' : 'SERIAL';

  const earPorts = basePorts.filter(p => p.id.includes('-ear-'));
  const targetPorts = basePorts.filter(p => p.group === targetLabel && !p.id.includes('-ear-'));
  const oldLocalPorts = basePorts.filter(p => p.group !== targetLabel && !p.id.includes('-ear-'));
  const targetsCount = targetPorts.length || template.ports.filter(p => p.group === targetLabel).length || 8;

  const cfg = (deviceConfig && typeof deviceConfig === 'object') ? (deviceConfig as KvmConfig) : undefined;
  const freshLocal = networkingPorts(netKind, targetsCount, `${deviceId}-local-`, undefined, cfg)
    .filter(p => p.group !== targetLabel);

  const mergedLocal: PortData[] = freshLocal.map(p => {
    const existing = oldLocalPorts.find(op => op.id === p.id);
    return { ...p, deviceId, connected: existing?.connected ?? false, cableId: existing?.cableId ?? null };
  });

  return [...targetPorts, ...mergedLocal, ...earPorts];
}

const EAR_HOLE_CATEGORIES = new Set(['server', 'switch', 'router', 'firewall', 'ups', 'storage', 'console']);

// Standard ear-hole count per side for common chassis heights (4 for 1U, 6 for 2U, 8 for 4U) —
// not a simple heightUnits*2 scaling; heights outside this table fall back to that formula.
const STANDARD_EAR_HOLE_COUNTS: Record<number, number> = { 1: 4, 2: 6, 4: 8 };

export function injectEarPorts(deviceId: string, category: string, heightUnits: number, basePorts: PortData[]): PortData[] {
  if (!EAR_HOLE_CATEGORIES.has(category)) return basePorts;

  // Every ear-hole port (network + hybrid) is regenerated here as one single evenly-spaced
  // sequence, never defined in device-catalog.ts.
  const filtered = basePorts.filter(p => !p.id.includes('-ear-'));

  const leftX = -12.5;
  const rightX = 350 + 12.5;

  const earPorts: PortData[] = [];
  const numHoles = STANDARD_EAR_HOLE_COUNTS[heightUnits] ?? heightUnits * 2;
  // Pitch is however much vertical space each hole gets when the device's own height is
  // divided evenly into `numHoles` slots — it must scale with both height AND hole count (a
  // fixed 15px pitch, correct for the old "2 holes per U" rule, would push a 1U's now-4 holes
  // to y=52.5 — 22.5px past the bottom of a 30px-tall 1U panel). Left unrounded (SVG doesn't
  // need integer coordinates) so every gap is exactly equal, not just approximately equal via
  // independently-rounded positions.
  const height = heightUnits * RACK_CONSTANTS.RU_HEIGHT;
  const pitch = height / numHoles;

  for (let i = 1; i <= numHoles; i++) {
    const yVal = (i - 0.5) * pitch;
    // Every hole looks and behaves the same (plain network jack) except the very last one,
    // which is the Hybrid port (same footprint, rendered as a distinct purple rounded-square
    // in port-renderer.ts) — no separate PSU/power hole or special coloring.
    const isLast = i === numHoles;
    const portType = isLast ? 'hybrid' : 'rj45';
    const label = isLast ? 'Hybrid' : 'RJ45';
    // Left ear port
    earPorts.push({
      id: `${deviceId}-ear-left-nic${i}`,
      deviceId,
      name: `${deviceId} Left Ear ${isLast ? 'Hybrid' : 'Network'} ${i} (${label})`,
      type: portType,
      relativeX: leftX,
      relativeY: yVal,
      connected: false,
      cableId: null
    });
    // Right ear port
    earPorts.push({
      id: `${deviceId}-ear-right-nic${i}`,
      deviceId,
      name: `${deviceId} Right Ear ${isLast ? 'Hybrid' : 'Network'} ${i} (${label})`,
      type: portType,
      relativeX: rightX,
      relativeY: yVal,
      connected: false,
      cableId: null
    });
  }

  // Merge any connection state from matching port IDs if they already exist
  const mergedEarPorts = earPorts.map(ep => {
    const existing = basePorts.find(p => p.id === ep.id);
    if (existing) {
      return { ...ep, connected: existing.connected, cableId: existing.cableId };
    }
    return ep;
  });

  return [...filtered, ...mergedEarPorts];
}

export const stateManager = new StateManager();
export default stateManager;
