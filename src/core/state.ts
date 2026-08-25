import { AppState, RackData, DeviceData, PortData, CableData, CableType, SelectableItem, Transform, RACK_CONSTANTS, CableBundle, ValidationAlert, PduConfig, KvmConfig, SwitchConfig, FirewallConfig, NacConfig, AtsConfig, DeviceTemplate, CloudNode, CloudContainer, CloudConnector, CloudHierarchy } from './types';
import { eventBus } from './event-bus';
import { getTemplate } from '../library/device-catalog';
import { runValidationAlerts } from './validation';
import { loadCustomTemplates, saveAllCustomTemplates } from '../library/custom-catalog';
import { computeConfiguredPduLayout, computeGenericPduLayout, computeSidePduOutletPositions, sidePduOffsetX, normalizeComposition } from '../renderers/pdu-layout';
import { networkingPorts } from '../renderers/networking-renderer';
import { switchPorts } from '../renderers/switch-renderer';
import { firewallPorts } from '../renderers/firewall-renderer';
import { nacPorts } from '../renderers/nac-renderer';
import { atsPorts } from '../renderers/ats-renderer';

function asPduConfig(config: unknown): PduConfig {
  return (config && typeof config === 'object') ? (config as PduConfig) : {};
}

class StateManager {
  private state: AppState;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  /** True whenever structural state has changed since the last explicit file Save/Open/New —
   *  there is no background auto-save, so this purely drives the beforeunload warning in
   *  app.ts (see markSaved()). */
  private _hasUnsavedChanges = false;

  constructor() {
    this.state = {
      theme: 'dark',
      tool: 'select',
      transform: { x: 0, y: 0, scale: 1 },
      gridVisible: true,
      snapEnabled: true,
      rulersVisible: true,
      racks: [
        { id: 'rack-1', name: 'Rack 1', units: 42, x: 300, y: 100, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' },
      ],
      devices: [],
      cables: [],
      bundles: [],
      textLabels: [],
      imageAssets: [],
      validationAlerts: [],
      selection: [],
      cableInProgress: null,
      airdropDestination: false,
      sidebarCollapsed: false,
      propertiesCollapsed: false,
      showLegends: true,
      selectedCableType: 'general',
      selectedCableColor: '#78909c',
      selectedCableBend: 10,
      selectedCableTermination: 'RJ45 Ethernet',
      cabinetViewMode: 'front',
      cabinetDrawMode: 'default',
      cabinetCoverVisible: true,
      isometricMode: false,
      show3DPanel: false,
      floatingToolbarVisible: true,
      presenterMode: false,
      cableRoutingTrayMode: 'overhead',
      aiMode: false,
      aiProvider: 'rules',
      previewDiff: null,
      customTemplates: loadCustomTemplates(),
      activeView: 'rack',
      hybridLayoutMode: 'merged',
      cloudNodes: [],
      cloudContainers: [],
      cloudConnectors: [],
      cloudHierarchies: [],
    };
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

    // Switch A (Port 1 - 32)
    const switchA = mkDevice('switch-a', 'rs-sw-32p', 31, '32-Port Gigabit Ethernet Switch', 'switch-a', '10.10.10.30', 'SRN-SW-A', '32-Port Gigabit Ethernet Switch');
    // Cable Manager Brush Panel
    const brushPanel = mkDevice('brush-panel', 'brush-panel-1u', 30, '1U Brush Panel', 'brush-panel', '', 'SRN-BRUSH', '1U Brush Panel');
    // Switch B (Port 1 - 32)
    const switchB = mkDevice('switch-b', 'rs-sw-32p', 29, 'Distribution Switch B', 'switch-b', '10.10.10.31', 'SRN-SW-B', 'Distribution Switch B');

    devices.push(switchA, brushPanel, switchB);

    let cableCount = 1;
    const connect = (srcDev: DeviceData, srcIdx: number, destDev: DeviceData, destIdx: number, type: CableType, color: string) => {
      const srcPort = srcDev.ports[srcIdx];
      const destPort = destDev.ports[destIdx];
      if (!srcPort || !destPort) return;
      const cableId = `cable-${cableCount++}`;
      cables.push({
        id: cableId, name: `Cable ${cableCount - 1}`, type, color,
        sourcePortId: srcPort.id, destPortId: destPort.id,
        bendPoints: [], thickness: 2.2, bendRadius: 22,
        bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false,
      });
      srcPort.connected = true;
      srcPort.cableId = cableId;
      destPort.connected = true;
      destPort.cableId = cableId;
    };

    // Connect all 32 ports with neutral light-gray / off-white cables (#cfd8dc)
    for (let i = 0; i < 32; i++) {
      connect(switchA, i, switchB, i, 'general', '#cfd8dc');
    }

    this.setState({ racks, devices, cables, selection: [], showLegends: true });
    eventBus.emit('notification', { message: 'Loaded 32-Port Switch Demo!', type: 'success' });
  }

  private prepareDevices(devices: DeviceData[]): DeviceData[] {
    return devices.map(d => {
      const template = getTemplate(d.templateId);
      if (!template) return d;
      const withLocalPorts = injectNetworkLocalPorts(d.id, template, d.deviceConfig, d.ports);
      const withConfigurablePorts = injectConfigurablePorts(d.id, template, d.deviceConfig, withLocalPorts);
      return {
        ...d,
        ports: injectEarPorts(d.id, template.category, template.heightUnits, withConfigurablePorts, d.deviceConfig)
      };
    });
  }

  setState(partial: Partial<AppState>, skipHistory = false): void {
    if (partial.devices !== undefined) {
      partial.devices = this.prepareDevices(partial.devices);
    }

    const isStructuralChange = partial.racks !== undefined || partial.devices !== undefined || partial.cables !== undefined || partial.bundles !== undefined || partial.textLabels !== undefined || partial.imageAssets !== undefined || partial.cloudNodes !== undefined || partial.cloudContainers !== undefined || partial.cloudConnectors !== undefined || partial.cloudHierarchies !== undefined;

    if (isStructuralChange && !skipHistory) {
      const snapshot = JSON.stringify({
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles,
        textLabels: this.state.textLabels,
        imageAssets: this.state.imageAssets,
        cloudNodes: this.state.cloudNodes,
        cloudContainers: this.state.cloudContainers,
        cloudConnectors: this.state.cloudConnectors,
        cloudHierarchies: this.state.cloudHierarchies
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
      this._hasUnsavedChanges = true;
    }
  }

  /** Whether structural state has changed since the last explicit Save/Open/New — drives the
   *  beforeunload "unsaved changes" browser warning (see app.ts). */
  get hasUnsavedChanges(): boolean {
    return this._hasUnsavedChanges;
  }

  /** Call after a successful file Save/Save As/Open so the beforeunload guard stops warning. */
  markSaved(): void {
    this._hasUnsavedChanges = false;
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
      bundles: this.state.bundles,
      textLabels: this.state.textLabels,
      imageAssets: this.state.imageAssets,
      cloudNodes: this.state.cloudNodes,
      cloudContainers: this.state.cloudContainers,
      cloudConnectors: this.state.cloudConnectors,
        cloudHierarchies: this.state.cloudHierarchies
    });
    this.redoStack.push(currentSnapshot);

    const prevSnapshot = this.undoStack.pop()!;
    try {
      const data = JSON.parse(prevSnapshot);
      this.state.racks = data.racks;
      this.state.devices = this.prepareDevices(data.devices);
      this.state.cables = data.cables;
      this.state.bundles = data.bundles || [];
      this.state.textLabels = data.textLabels || [];
      this.state.imageAssets = data.imageAssets || [];
      this.state.cloudNodes = data.cloudNodes || [];
      this.state.cloudContainers = data.cloudContainers || [];
      this.state.cloudConnectors = data.cloudConnectors || [];
      this.state.cloudHierarchies = data.cloudHierarchies || [];

      eventBus.emit('state:changed', {
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles,
        textLabels: this.state.textLabels,
        imageAssets: this.state.imageAssets,
        cloudNodes: this.state.cloudNodes,
        cloudContainers: this.state.cloudContainers,
        cloudConnectors: this.state.cloudConnectors,
        cloudHierarchies: this.state.cloudHierarchies
      });
      this._hasUnsavedChanges = true;
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
      bundles: this.state.bundles,
      textLabels: this.state.textLabels,
      imageAssets: this.state.imageAssets,
      cloudNodes: this.state.cloudNodes,
      cloudContainers: this.state.cloudContainers,
      cloudConnectors: this.state.cloudConnectors,
        cloudHierarchies: this.state.cloudHierarchies
    });
    this.undoStack.push(currentSnapshot);

    const nextSnapshot = this.redoStack.pop()!;
    try {
      const data = JSON.parse(nextSnapshot);
      this.state.racks = data.racks;
      this.state.devices = this.prepareDevices(data.devices);
      this.state.cables = data.cables;
      this.state.bundles = data.bundles || [];
      this.state.textLabels = data.textLabels || [];
      this.state.imageAssets = data.imageAssets || [];
      this.state.cloudNodes = data.cloudNodes || [];
      this.state.cloudContainers = data.cloudContainers || [];
      this.state.cloudConnectors = data.cloudConnectors || [];
      this.state.cloudHierarchies = data.cloudHierarchies || [];

      eventBus.emit('state:changed', {
        racks: this.state.racks,
        devices: this.state.devices,
        cables: this.state.cables,
        bundles: this.state.bundles,
        textLabels: this.state.textLabels,
        imageAssets: this.state.imageAssets,
        cloudNodes: this.state.cloudNodes,
        cloudContainers: this.state.cloudContainers,
        cloudConnectors: this.state.cloudConnectors,
        cloudHierarchies: this.state.cloudHierarchies
      });
      this._hasUnsavedChanges = true;
      eventBus.emit('notification', { message: 'Redo successful', type: 'success' });
    } catch (err) {
      console.error('Redo failed', err);
    }
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

  /**
   * A device's own top-left world position (before any port/anchor relativeX/relativeY offset
   * is added) — factored out of getPortWorldPosition() so anything else that needs a
   * device-relative point (e.g. a TextLabel's pointerAnchorX/Y, see types.ts) can resolve it the
   * same way, kept live from the device's current rackId/startUnit.
   */
  getDeviceWorldOrigin(deviceId: string): { x: number; y: number } | null {
    const device = this.getDevice(deviceId);
    if (!device) return null;
    const rack = this.getRack(device.rackId);
    if (!rack) return null;

    const template = getTemplate(device.templateId);
    const heightUnits = template ? template.heightUnits : 1;
    const deviceY = rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units - device.startUnit - heightUnits + 1) * RACK_CONSTANTS.RU_HEIGHT;
    // Match device-renderer.ts: deviceX = innerX + RAIL_WIDTH = (OUTER-INNER)/2 + RAIL_WIDTH
    const innerX = (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2; // 25
    const deviceX = rack.x + innerX + RACK_CONSTANTS.RAIL_WIDTH; // rack.x + 50

    return { x: deviceX, y: deviceY };
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

    const origin = this.getDeviceWorldOrigin(targetDevice.id);
    if (!origin) return null;

    return {
      x: origin.x + targetPort.relativeX,
      y: origin.y + targetPort.relativeY
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

  addCloudNode(data: CloudNode): void {
    const cloudNodes = [...this.state.cloudNodes, data];
    this.setState({ cloudNodes });
    eventBus.emit('cloudnode:added', data);
  }

  removeCloudNode(id: string): void {
    const cloudNodes = this.state.cloudNodes.filter(n => n.id !== id);
    const cloudConnectors = this.state.cloudConnectors.filter(c => c.sourceNodeId !== id && c.destNodeId !== id);
    this.setState({ cloudNodes, cloudConnectors });
  }

  addCloudContainer(data: CloudContainer): void {
    const cloudContainers = [...this.state.cloudContainers, data];
    this.setState({ cloudContainers });
    eventBus.emit('cloudcontainer:added', data);
  }

  removeCloudContainer(id: string): void {
    const cloudContainers = this.state.cloudContainers.filter(c => c.id !== id);
    this.setState({ cloudContainers });
  }

  addCloudConnector(data: CloudConnector): void {
    const cloudConnectors = [...this.state.cloudConnectors, data];
    this.setState({ cloudConnectors });
    eventBus.emit('cloudconnector:added', data);
  }

  removeCloudConnector(id: string): void {
    const cloudConnectors = this.state.cloudConnectors.filter(c => c.id !== id);
    this.setState({ cloudConnectors });
  }

  addCloudHierarchy(data: CloudHierarchy): void {
    const cloudHierarchies = [...this.state.cloudHierarchies, data];
    this.setState({ cloudHierarchies });
    eventBus.emit('cloudhierarchy:added', data);
  }

  removeCloudHierarchy(id: string): void {
    const cloudHierarchies = this.state.cloudHierarchies.filter(h => h.id !== id);
    this.setState({ cloudHierarchies });
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
  if (template.customLayout) return basePorts;
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

/**
 * Regenerates a switch's or firewall's port-group ports (see SwitchConfig/FirewallConfig) from
 * its live `deviceConfig`, merging `connected`/`cableId` from the old array by matching `id` —
 * same live-regeneration pattern as injectNetworkLocalPorts, so changing a port count or toggle
 * in the properties panel immediately regenerates the device's actual connectable ports. A no-op
 * for any device with no `deviceConfig` (every switch/firewall placed before this feature
 * existed), which keeps their appearance and ports byte-identical to before.
 *
 * Always a no-op for `customLayout` devices (Custom Switch/Firewall 1U/2U/4U etc.) even if they
 * do carry a `deviceConfig` — e.g. the Properties panel's "Device Type" picker stashes `{layer}`
 * there for a custom-layout switch's L1/L2/L3 badge. Without this guard that would look like a
 * real SwitchConfig and regenerate the device's ports from `rj45Count`/etc., silently discarding
 * every manually-placed/calibrated port.
 */
export function injectConfigurablePorts(deviceId: string, template: DeviceTemplate, deviceConfig: unknown, basePorts: PortData[]): PortData[] {
  if (template.customLayout) return basePorts;
  const CONFIGURABLE_CATEGORIES = new Set(['switch', 'firewall', 'nac', 'ats']);
  if (!CONFIGURABLE_CATEGORIES.has(template.category)) return basePorts;
  if (!deviceConfig || typeof deviceConfig !== 'object') return basePorts;

  const earPorts = basePorts.filter(p => p.id.includes('-ear-'));
  const nonEarPorts = basePorts.filter(p => !p.id.includes('-ear-'));

  let fresh: Omit<PortData, 'deviceId' | 'connected' | 'cableId'>[];

  if (template.category === 'switch') {
    const cfg = deviceConfig as SwitchConfig;
    const currentRj45 = nonEarPorts.filter(p => p.type === 'rj45' && p.group !== 'STACK').length;
    const rj45 = cfg.rj45Count ?? currentRj45;
    const sfp = cfg.sfpCount ?? 0;
    const sfpPlus = cfg.sfpPlusCount ?? 0;
    const qsfp = cfg.qsfpCount ?? 0;
    const stack = cfg.stackPorts ? 2 : 0;
    const rows = rj45 <= 8 ? 1 : 2;
    const mgmt = cfg.mgmtPort !== false;
    const consolePort = cfg.consolePort !== false;
    const usbPort = cfg.usbPort !== false;
    fresh = switchPorts(rj45, sfpPlus, rows, `${deviceId}-`, { sfp, qsfp, stack, mgmt, consolePort, usbPort });
  } else if (template.category === 'firewall') {
    fresh = firewallPorts(deviceConfig as FirewallConfig, `${deviceId}-`);
  } else if (template.category === 'nac') {
    fresh = nacPorts(deviceConfig as NacConfig, `${deviceId}-`);
  } else {
    fresh = atsPorts(deviceConfig as AtsConfig, `${deviceId}-`);
  }

  const merged: PortData[] = fresh.map(p => {
    const existing = nonEarPorts.find(op => op.id === p.id);
    return { ...p, deviceId, connected: existing?.connected ?? false, cableId: existing?.cableId ?? null };
  });

  return [...merged, ...earPorts];
}

const EAR_HOLE_CATEGORIES = new Set(['server', 'switch', 'router', 'firewall', 'ups', 'storage', 'console']);

// Standard ear-hole count per side for common chassis heights (4 for 1U, 6 for 2U, 8 for 4U) —
// not a simple heightUnits*2 scaling; heights outside this table fall back to that formula.
export const STANDARD_EAR_HOLE_COUNTS: Record<number, number> = { 1: 4, 2: 6, 4: 8 };

export function getMaxEarHoles(heightUnits: number): number {
  if (heightUnits === 1) return 4;
  if (heightUnits === 2) return 9;
  if (heightUnits === 4) return 13;
  return Math.max(1, heightUnits * 3 + 1);
}

export function getDefaultEarHoles(heightUnits: number): number {
  return STANDARD_EAR_HOLE_COUNTS[heightUnits] ?? heightUnits * 2;
}

export function injectEarPorts(
  deviceId: string,
  category: string,
  heightUnits: number,
  basePorts: PortData[],
  deviceConfig?: unknown
): PortData[] {
  if (!EAR_HOLE_CATEGORIES.has(category)) return basePorts;

  const filtered = basePorts.filter(p => !p.id.includes('-ear-'));

  const leftX  = -12.5;
  const rightX = 350 + 12.5;

  const maxHoles     = getMaxEarHoles(heightUnits);
  const maxDataHoles = maxHoles - 1; // 1 hole always reserved for power

  // ── Two simple user inputs: Number of Slots (1-4) and Ports per Slot (1-4) ─────────────────
  let numSlots     = 1;
  let portsPerSlot = Math.min(maxDataHoles, (STANDARD_EAR_HOLE_COUNTS[heightUnits] ?? heightUnits * 2) - 1);

  if (deviceConfig && typeof deviceConfig === 'object') {
    const cfg = deviceConfig as Record<string, unknown>;
    if (typeof cfg.numSlots     === 'number') numSlots     = Math.min(4, Math.max(1, Math.round(cfg.numSlots)));
    if (typeof cfg.portsPerSlot === 'number') portsPerSlot = Math.min(4, Math.max(1, Math.round(cfg.portsPerSlot)));
  }

  // Build sequential entries: S1-P1 … S1-Pn, S2-P1 … S2-Pn, …
  type SlotEntry = { slotNumber: number; portInSlot: number };
  const dataEntries: SlotEntry[] = [];
  outer: for (let s = 1; s <= numSlots; s++) {
    for (let p = 1; p <= portsPerSlot; p++) {
      if (dataEntries.length >= maxDataHoles * 2) break outer;
      dataEntries.push({ slotNumber: s, portInSlot: p });
    }
  }

  // Fallback when config is absent
  if (dataEntries.length === 0) {
    const numData = Math.min(maxDataHoles * 2, Math.max(0, (STANDARD_EAR_HOLE_COUNTS[heightUnits] ?? heightUnits * 2) - 1));
    for (let i = 0; i < numData; i++) {
      dataEntries.push({ slotNumber: Math.floor(i / 4) + 1, portInSlot: (i % 4) + 1 });
    }
  }

  const totalDataPorts = dataEntries.length;
  const leftCount = Math.ceil(totalDataPorts / 2);
  const rightCount = totalDataPorts - leftCount;
  const maxDataCount = Math.max(leftCount, rightCount);

  const numHoles = maxDataCount + 1; // +1 for the power hole
  const earPorts: PortData[] = [];
  const height = heightUnits * RACK_CONSTANTS.RU_HEIGHT;
  const pitch  = height / numHoles;

  for (let i = 1; i <= numHoles; i++) {
    const yVal = (i - 0.5) * pitch;

    // Left side port
    const leftIsLast = i === numHoles;
    const leftEntry  = leftIsLast ? null : (i <= leftCount ? dataEntries[i - 1] : null);
    const leftLabel  = leftIsLast ? 'Power' : (leftEntry ? `S${leftEntry.slotNumber}-P${leftEntry.portInSlot}` : 'Res');
    const leftType   = leftIsLast ? 'power' : 'rj45';

    earPorts.push({
      id: `${deviceId}-ear-left-nic${i}`,
      deviceId,
      name: `Left Ear ${leftLabel}`,
      type: leftType,
      relativeX: leftX,
      relativeY: yVal,
      connected: false,
      cableId: null
    });

    // Right side port
    const rightIsLast = i === numHoles;
    const rightEntry  = rightIsLast ? null : (i <= rightCount ? dataEntries[leftCount + i - 1] : null);
    const rightLabel  = rightIsLast ? 'Power' : (rightEntry ? `S${rightEntry.slotNumber}-P${rightEntry.portInSlot}` : 'Res');
    const rightType   = rightIsLast ? 'power' : 'rj45';

    earPorts.push({
      id: `${deviceId}-ear-right-nic${i}`,
      deviceId,
      name: `Right Ear ${rightLabel}`,
      type: rightType,
      relativeX: rightX,
      relativeY: yVal,
      connected: false,
      cableId: null
    });
  }

  // Preserve existing cable connections on ports that still exist
  const mergedEarPorts = earPorts.map(ep => {
    const existing = basePorts.find(p => p.id === ep.id);
    return existing ? { ...ep, connected: existing.connected, cableId: existing.cableId } : ep;
  });

  return [...filtered, ...mergedEarPorts];
}

export const stateManager = new StateManager();
export default stateManager;
