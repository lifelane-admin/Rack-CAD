import { AppState, RackData, DeviceData, PortData, CableData, SelectableItem, Transform, RACK_CONSTANTS, CableBundle, ValidationAlert } from './types';
import { eventBus } from './event-bus';
import { getTemplate } from '../library/device-catalog';
import { runValidationAlerts } from './validation';
import { computeSmartRouting, get3DefaultAnchors } from '../utils/routing';

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
        { id: 'rack-1', name: 'Rack 1', units: 42, x: 200, y: 100, showPduLeft: true, showPduRight: true, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' },
        { id: 'rack-2', name: 'Rack 2', units: 42, x: 700, y: 100, showPduLeft: true, showPduRight: true, leftCableManagerWidth: 'none', rightCableManagerWidth: 'none' }
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
      selectedCableTermination: 'RJ45 Ethernet'
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
      { id: rackId, name: 'Enterprise Cluster Rack', units: 42, x: 250, y: 80, showPduLeft: true, showPduRight: true, leftCableManagerWidth: '4-inch', rightCableManagerWidth: '4-inch' }
    ];

    const devices: DeviceData[] = [];
    const cables: CableData[] = [];

    // 1. Add switches
    const torA: DeviceData = {
      id: 'tor-a',
      templateId: 'tor-switch-10g',
      rackId,
      startUnit: 40,
      name: 'TOR SWITCH A (10GbE)',
      hostname: 'tor-switch-a',
      managementIp: '10.10.10.11',
      serialNumber: 'SRN-TOR-A10G',
      description: 'Top of Rack Switch A',
      frontPanelImage: '/switch-panel.png',
      ports: []
    };
    const torATemplate = getTemplate('tor-switch-10g')!;
    torA.ports = torATemplate.ports.map((p, i) => ({ ...p, id: `tor-a-port-${i}`, deviceId: 'tor-a', connected: false, cableId: null }));
    devices.push(torA);

    const torB: DeviceData = {
      id: 'tor-b',
      templateId: 'tor-switch-10g',
      rackId,
      startUnit: 36,
      name: 'TOR SWITCH B (10GbE)',
      hostname: 'tor-switch-b',
      managementIp: '10.10.10.12',
      serialNumber: 'SRN-TOR-B10G',
      description: 'Top of Rack Switch B',
      frontPanelImage: '/switch-panel.png',
      ports: []
    };
    const torBTemplate = getTemplate('tor-switch-10g')!;
    torB.ports = torBTemplate.ports.map((p, i) => ({ ...p, id: `tor-b-port-${i}`, deviceId: 'tor-b', connected: false, cableId: null }));
    devices.push(torB);

    const mgmtSwitch: DeviceData = {
      id: 'mgmt-switch',
      templateId: 'mgmt-switch-24p',
      rackId,
      startUnit: 32,
      name: 'MANAGEMENT SWITCH (1GbE)',
      hostname: 'mgmt-switch',
      managementIp: '10.10.10.10',
      serialNumber: 'SRN-MGMT-24P',
      description: '1GbE Out-of-Band Management Switch',
      ports: []
    };
    const mgmtTemplate = getTemplate('mgmt-switch-24p')!;
    mgmtSwitch.ports = mgmtTemplate.ports.map((p, i) => ({ ...p, id: `mgmt-switch-port-${i}`, deviceId: 'mgmt-switch', connected: false, cableId: null }));
    devices.push(mgmtSwitch);

    // 2. Add Dell Servers (Nodes 1, 2, 3)
    const nodeIds = ['node-1', 'node-2', 'node-3'];
    const nodeNames = ['DELL POWEREDGE (Node 1)', 'DELL POWEREDGE (Node 2)', 'DELL POWEREDGE (Node 3)'];
    const startUnits = [17, 13, 8];

    nodeIds.forEach((id, idx) => {
      const node: DeviceData = {
        id,
        templateId: 'dell-r760',
        rackId,
        startUnit: startUnits[idx],
        name: nodeNames[idx],
        hostname: `pve-node-${idx + 1}`,
        managementIp: `10.10.10.1${idx + 1}`,
        serialNumber: `SRN-DELL-N${idx + 1}`,
        description: `Proxmox VE Cluster Node ${idx + 1}`,
        frontPanelImage: '/dell-poweredge-panel.png',
        ports: []
      };
      const template = getTemplate('dell-r760')!;
      node.ports = template.ports.map((p, i) => ({ ...p, id: `${id}-port-${i}`, deviceId: id, connected: false, cableId: null }));
      devices.push(node);
    });

    // 3. Add HPE Backup Server
    const backupServer: DeviceData = {
      id: 'backup-server',
      templateId: 'hpe-dl380',
      rackId,
      startUnit: 2,
      name: 'HPE ProLiant BACKUP SERVER',
      hostname: 'pbs-server',
      managementIp: '10.10.10.20',
      serialNumber: 'SRN-HPE-PBS1',
      description: 'Proxmox Backup Server (PBS) Node',
      frontPanelImage: '/dell-poweredge-panel.png',
      ports: []
    };
    const hpeTemplate = getTemplate('hpe-dl380')!;
    backupServer.ports = hpeTemplate.ports.map((p, i) => ({ ...p, id: `backup-server-port-${i}`, deviceId: 'backup-server', connected: false, cableId: null }));
    devices.push(backupServer);

    // Helper to connect a cable
    let cableCount = 1;
    const connect = (srcDevId: string, srcPortIdx: number, destDevId: string, destPortIdx: number, type: any, color: string) => {
      const srcDev = devices.find(d => d.id === srcDevId)!;
      const destDev = devices.find(d => d.id === destDevId)!;
      const srcPort = srcDev.ports[srcPortIdx];
      const destPort = destDev.ports[destPortIdx];
      
      if (!srcPort || !destPort) return;

      const cableId = `cable-${cableCount++}`;
      
      const getDemoPortWorldPosition = (device: DeviceData, port: PortData) => {
        const rack = racks.find(r => r.id === device.rackId)!;
        const template = getTemplate(device.templateId)!;
        const heightUnits = template.heightUnits;
        const deviceY = rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units - device.startUnit - heightUnits + 1) * RACK_CONSTANTS.RU_HEIGHT;
        const innerX = (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2;
        const deviceX = rack.x + innerX + RACK_CONSTANTS.RAIL_WIDTH;
        return {
          x: deviceX + port.relativeX,
          y: deviceY + port.relativeY
        };
      };

      const srcPos = getDemoPortWorldPosition(srcDev, srcPort);
      const destPos = getDemoPortWorldPosition(destDev, destPort);

      const cable: CableData = {
        id: cableId,
        name: `Cable ${cableCount - 1}`,
        type,
        color,
        sourcePortId: srcPort.id,
        destPortId: destPort.id,
        bendPoints: [],
        thickness: 2,
        bendRadius: 10,
        bundleId: null,
        notes: '',
        anchorPoints: [],
        anchorsLocked: false
      };

      // Set default 3 anchors
      const autoPts = computeSmartRouting(cable, srcPos, destPos);
      cable.anchorPoints = get3DefaultAnchors(autoPts);
      cable.anchorsLocked = true;

      srcPort.connected = true;
      srcPort.cableId = cableId;
      destPort.connected = true;
      destPort.cableId = cableId;

      cables.push(cable);
    };

    // Connections
    // Node 1 Connects
    connect('node-1', 0, 'tor-a', 11, 'vm-network', '#fb8c00');      // NIC 1 -> Tor A Port 11 (Orange)
    connect('node-1', 1, 'tor-a', 9,  'ceph-primary', '#43a047');    // NIC 2 -> Tor A Port 9 (Green)
    connect('node-1', 2, 'tor-b', 1,  'ceph-secondary', '#8e24aa');  // NIC 3 -> Tor B Port 1 (Purple)
    connect('node-1', 3, 'tor-b', 7,  'live-migration', '#fdd835');  // NIC 4 -> Tor B Port 7 (Yellow)
    connect('node-1', 4, 'mgmt-switch', 1, 'idrac', '#e53935');       // NIC 5 -> Mgmt Switch Port 1 (Red)

    // Node 2 Connects
    connect('node-2', 0, 'tor-a', 12, 'vm-network', '#fb8c00');      // NIC 1 -> Tor A Port 12 (Orange)
    connect('node-2', 1, 'tor-a', 10, 'ceph-primary', '#43a047');    // NIC 2 -> Tor A Port 10 (Green)
    connect('node-2', 2, 'tor-b', 2,  'ceph-secondary', '#8e24aa');  // NIC 3 -> Tor B Port 2 (Purple)
    connect('node-2', 3, 'tor-b', 8,  'live-migration', '#fdd835');  // NIC 4 -> Tor B Port 8 (Yellow)
    connect('node-2', 4, 'mgmt-switch', 2, 'idrac', '#e53935');       // NIC 5 -> Mgmt Switch Port 2 (Red)

    // Node 3 Connects
    connect('node-3', 0, 'tor-b', 6,  'vm-network', '#fb8c00');      // NIC 1 -> Tor B Port 6 (Orange)
    connect('node-3', 1, 'tor-b', 5,  'ceph-primary', '#43a047');    // NIC 2 -> Tor B Port 5 (Green)
    connect('node-3', 2, 'tor-b', 3,  'ceph-secondary', '#8e24aa');  // NIC 3 -> Tor B Port 3 (Purple)
    connect('node-3', 3, 'tor-b', 9,  'live-migration', '#fdd835');  // NIC 4 -> Tor B Port 9 (Yellow)
    connect('node-3', 4, 'mgmt-switch', 3, 'idrac', '#e53935');       // NIC 5 -> Mgmt Switch Port 3 (Red)

    // HPE Backup Server Connects
    connect('backup-server', 0, 'mgmt-switch', 9, 'backup', '#1e88e5');    // NIC 1 -> Mgmt Switch Port 9 (Blue, PBS Backup)
    connect('backup-server', 4, 'mgmt-switch', 4, 'idrac', '#e53935');     // NIC 5 -> Mgmt Switch Port 4 (Red, iDRAC)

    // ToR Switch Uplink Interconnect
    connect('tor-a', 23, 'tor-b', 23, 'ceph-secondary', '#8e24aa');        // Uplink Interconnect

    this.setState({
      racks,
      devices,
      cables,
      selection: [],
      showLegends: true
    });

    eventBus.emit('notification', { message: 'Loaded Proxmox Cluster Demo Project!', type: 'success' });
  }

  setState(partial: Partial<AppState>, skipHistory = false): void {
    if (partial.devices !== undefined) {
      partial.devices = partial.devices.map(d => {
        const template = getTemplate(d.templateId);
        if (template && template.category === 'server') {
          return {
            ...d,
            ports: injectEarPorts(d.id, 'server', template.heightUnits, d.ports)
          };
        }
        return d;
      });
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
      this.state.devices = data.devices;
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
      this.state.devices = data.devices;
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
        this.state.devices = parsed.devices;
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

  getPortWorldPosition(portId: string): { x: number; y: number } | null {
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
    this.state.racks.push(data);
    eventBus.emit('rack:added', data);
  }

  removeRack(id: string): void {
    this.state.racks = this.state.racks.filter(r => r.id !== id);
    eventBus.emit('rack:removed', id);
  }

  addDevice(data: DeviceData): void {
    this.state.devices.push(data);
    eventBus.emit('device:added', data);
  }

  removeDevice(id: string): void {
    const device = this.getDevice(id);
    if (device) {
      const portIds = device.ports.map(p => p.id);
      this.state.cables = this.state.cables.filter(
        c => !portIds.includes(c.sourcePortId) && (!c.destPortId || !portIds.includes(c.destPortId))
      );
    }
    this.state.devices = this.state.devices.filter(d => d.id !== id);
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

export function injectEarPorts(deviceId: string, category: string, heightUnits: number, basePorts: PortData[]): PortData[] {
  if (category !== 'server') return basePorts;

  // Prevent duplicate injection
  const filtered = basePorts.filter(p => !p.id.includes('-ear-'));

  const height = heightUnits * RACK_CONSTANTS.RU_HEIGHT;
  const leftX = -12.5;
  const rightX = 350 + 12.5;

  const earPorts: PortData[] = [];
  const numHoles = heightUnits === 2 ? 5 : (heightUnits === 1 ? 4 : heightUnits * 2);
  const dy = height / (numHoles + 1);

  for (let i = 1; i <= numHoles; i++) {
    const yVal = Math.round(i * dy);
    // Left ear port
    earPorts.push({
      id: `${deviceId}-ear-left-nic${i}`,
      deviceId,
      name: `${deviceId} Left Ear Network ${i} (RJ45)`,
      type: 'rj45',
      relativeX: leftX,
      relativeY: yVal,
      connected: false,
      cableId: null
    });
    // Right ear port
    earPorts.push({
      id: `${deviceId}-ear-right-nic${i}`,
      deviceId,
      name: `${deviceId} Right Ear Network ${i} (RJ45)`,
      type: 'rj45',
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
