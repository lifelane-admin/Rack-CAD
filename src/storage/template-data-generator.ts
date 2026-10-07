/**
 * Template Architecture Blueprint Generator
 * Provides fully populated, deterministic infrastructure designs for all
 * Certified Reference Architecture Templates with racks, servers, switches,
 * storage nodes, vertical PDUs, and complete cable laying.
 */

import { getTemplate } from '../library/device-catalog';

export interface TemplateProjectData {
  racks: any[];
  devices: any[];
  cables: any[];
  cloudNodes?: any[];
  cloudContainers?: any[];
  cloudConnectors?: any[];
}

function createStandardDevicePorts(
  templateId: string,
  deviceId: string,
  customPortOverrides: Record<string, Partial<any>> = {}
): any[] {
  const tpl = getTemplate(templateId);
  if (!tpl || !tpl.ports || tpl.ports.length === 0) return [];

  return tpl.ports.map((tp, idx) => {
    const override = customPortOverrides[tp.id] || customPortOverrides[`port-${idx + 1}`] || customPortOverrides[`p${idx + 1}`];
    return {
      ...tp,
      id: override?.id || `${deviceId}-${tp.id}`,
      name: override?.name || tp.name,
      deviceId,
      type: override?.type || tp.type,
      speed: override?.speed || tp.speed,
      relativeX: tp.relativeX,
      relativeY: tp.relativeY,
      portW: tp.portW,
      portH: tp.portH,
      group: tp.group,
      connected: false,
      cableId: null,
    };
  });
}

/**
 * 1. 3-Node Ceph — MESH Network (Cost-Optimized)
 * Direct point-to-point mesh cabling between 3 nodes eliminating redundant 25GbE ToR switches.
 */
export function generateCephMeshTemplate(): TemplateProjectData {
  const rackId = 'rack-ceph-01';

  const racks: any[] = [
    {
      id: rackId,
      name: 'Rack 01 - Ceph HCI Pod (42U)',
      units: 42,
      depthMm: 1070,
      rackType: 'server',
      mounting: 'floor',
      rackColor: '#0f172a',
      x: 200,
      y: 40,
      leftCableManagerWidth: '4-inch',
      rightCableManagerWidth: '4-inch',
      leftPduId: 'pdu-ceph-feed-a',
      rightPduId: 'pdu-ceph-feed-b',
    },
  ];

  const devices: any[] = [
    // Dual Vertical PDUs (Left & Right Zero-U)
    {
      id: 'pdu-ceph-feed-a',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed A - 32A Vertical PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'left',
      ports: [
        { id: 'pdu-a-out1', name: 'Outlet 1', type: 'power-c13', relativeX: 10, relativeY: 100, speed: '230V 10A' },
        { id: 'pdu-a-out2', name: 'Outlet 2', type: 'power-c13', relativeX: 10, relativeY: 120, speed: '230V 10A' },
        { id: 'pdu-a-out3', name: 'Outlet 3', type: 'power-c13', relativeX: 10, relativeY: 140, speed: '230V 10A' },
        { id: 'pdu-a-out4', name: 'Outlet 4', type: 'power-c13', relativeX: 10, relativeY: 160, speed: '230V 10A' },
      ],
      powerWatts: 0,
    },
    {
      id: 'pdu-ceph-feed-b',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed B - 32A Vertical PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'right',
      ports: [
        { id: 'pdu-b-out1', name: 'Outlet 1', type: 'power-c13', relativeX: 10, relativeY: 100, speed: '230V 10A' },
        { id: 'pdu-b-out2', name: 'Outlet 2', type: 'power-c13', relativeX: 10, relativeY: 120, speed: '230V 10A' },
        { id: 'pdu-b-out3', name: 'Outlet 3', type: 'power-c13', relativeX: 10, relativeY: 140, speed: '230V 10A' },
        { id: 'pdu-b-out4', name: 'Outlet 4', type: 'power-c13', relativeX: 10, relativeY: 160, speed: '230V 10A' },
      ],
      powerWatts: 0,
    },
    // Management 1GbE Switch (U40)
    {
      id: 'dev-ceph-mgmt-sw',
      templateId: 'rs-sw-24p',
      name: 'Cisco 2960-X 24P OOB Mgmt Switch',
      category: 'switch',
      rackId,
      startUnit: 40,
      heightUnits: 1,
      color: '#1e293b',
      powerWatts: 85,
      ports: createStandardDevicePorts('rs-sw-24p', 'dev-ceph-mgmt-sw', {
        'rsw24-p1': { id: 'sw-p1', name: 'Port 1 (Node 1)' },
        'rsw24-p2': { id: 'sw-p2', name: 'Port 2 (Node 2)' },
        'rsw24-p3': { id: 'sw-p3', name: 'Port 3 (Node 3)' },
        'rsw24-sfp1': { id: 'sw-uplink', name: 'SFP+ Uplink' },
      }),
    },
    // Cat6 Patch Panel (U39)
    {
      id: 'dev-ceph-patch',
      templateId: 'patch-1u-cat6a-48p',
      name: '24-Port Cat6A Patch Panel',
      category: 'patch-panel',
      rackId,
      startUnit: 39,
      heightUnits: 1,
      color: '#334155',
      powerWatts: 0,
      ports: createStandardDevicePorts('patch-1u-cat6a-48p', 'dev-ceph-patch'),
    },
    // Node 3 (U20-21)
    {
      id: 'dev-ceph-node-03',
      templateId: 'server-2u',
      name: 'Ceph Storage Node 3 (Dell R750)',
      category: 'server',
      rackId,
      startUnit: 20,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 450,
      ports: [
        { id: 'n3-mesh-1', name: '25G Mesh P1', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'n3-mesh-2', name: '25G Mesh P2', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'n3-mgmt', name: 'iDRAC / Mgmt', type: 'management', relativeX: 300, relativeY: 20, speed: '1 Gbps' },
        { id: 'n3-psu-a', name: 'PSU 1 (Feed A)', type: 'power-c14', relativeX: 340, relativeY: 20, speed: '1100W' },
        { id: 'n3-psu-b', name: 'PSU 2 (Feed B)', type: 'power-c14', relativeX: 360, relativeY: 20, speed: '1100W' },
      ],
    },
    // Node 2 (U16-17)
    {
      id: 'dev-ceph-node-02',
      templateId: 'server-2u',
      name: 'Ceph Storage Node 2 (Dell R750)',
      category: 'server',
      rackId,
      startUnit: 16,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 450,
      ports: [
        { id: 'n2-mesh-1', name: '25G Mesh P1', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'n2-mesh-2', name: '25G Mesh P2', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'n2-mgmt', name: 'iDRAC / Mgmt', type: 'management', relativeX: 300, relativeY: 20, speed: '1 Gbps' },
        { id: 'n2-psu-a', name: 'PSU 1 (Feed A)', type: 'power-c14', relativeX: 340, relativeY: 20, speed: '1100W' },
        { id: 'n2-psu-b', name: 'PSU 2 (Feed B)', type: 'power-c14', relativeX: 360, relativeY: 20, speed: '1100W' },
      ],
    },
    // Node 1 (U12-13)
    {
      id: 'dev-ceph-node-01',
      templateId: 'server-2u',
      name: 'Ceph Storage Node 1 (Dell R750)',
      category: 'server',
      rackId,
      startUnit: 12,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 450,
      ports: [
        { id: 'n1-mesh-1', name: '25G Mesh P1', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'n1-mesh-2', name: '25G Mesh P2', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'n1-mgmt', name: 'iDRAC / Mgmt', type: 'management', relativeX: 300, relativeY: 20, speed: '1 Gbps' },
        { id: 'n1-psu-a', name: 'PSU 1 (Feed A)', type: 'power-c14', relativeX: 340, relativeY: 20, speed: '1100W' },
        { id: 'n1-psu-b', name: 'PSU 2 (Feed B)', type: 'power-c14', relativeX: 360, relativeY: 20, speed: '1100W' },
      ],
    },
    // Battery Backup UPS (U1-U2)
    {
      id: 'dev-ceph-ups',
      templateId: 'ups-2u',
      name: 'APC Smart-UPS RT 3000VA 2U',
      category: 'ups',
      rackId,
      startUnit: 1,
      heightUnits: 2,
      color: '#1e1b4b',
      powerWatts: 0,
      ports: [],
    },
  ];

  const cables: any[] = [
    // Mesh Direct Ring Cabling (Orange 25G DAC cables)
    {
      id: 'cbl-mesh-1-2',
      name: 'Node 1 <-> Node 2 Direct 25G Mesh Link',
      type: 'dac',
      color: '#f59e0b',
      lengthMeters: 1.5,
      speed: '25 Gbps',
      sourcePortId: 'n1-mesh-1',
      destPortId: 'n2-mesh-1',
      status: 'ok',
    },
    {
      id: 'cbl-mesh-2-3',
      name: 'Node 2 <-> Node 3 Direct 25G Mesh Link',
      type: 'dac',
      color: '#f59e0b',
      lengthMeters: 1.5,
      speed: '25 Gbps',
      sourcePortId: 'n2-mesh-2',
      destPortId: 'n3-mesh-1',
      status: 'ok',
    },
    {
      id: 'cbl-mesh-3-1',
      name: 'Node 3 <-> Node 1 Direct 25G Mesh Link',
      type: 'dac',
      color: '#f59e0b',
      lengthMeters: 2.0,
      speed: '25 Gbps',
      sourcePortId: 'n3-mesh-2',
      destPortId: 'n1-mesh-2',
      status: 'ok',
    },
    // Out-of-Band Management Links (Blue Cat6)
    {
      id: 'cbl-mgmt-1',
      name: 'Node 1 iDRAC to Mgmt Switch P1',
      type: 'cat6',
      color: '#38bdf8',
      lengthMeters: 2.5,
      speed: '1 Gbps',
      sourcePortId: 'n1-mgmt',
      destPortId: 'sw-p1',
      status: 'ok',
    },
    {
      id: 'cbl-mgmt-2',
      name: 'Node 2 iDRAC to Mgmt Switch P2',
      type: 'cat6',
      color: '#38bdf8',
      lengthMeters: 2.0,
      speed: '1 Gbps',
      sourcePortId: 'n2-mgmt',
      destPortId: 'sw-p2',
      status: 'ok',
    },
    {
      id: 'cbl-mgmt-3',
      name: 'Node 3 iDRAC to Mgmt Switch P3',
      type: 'cat6',
      color: '#38bdf8',
      lengthMeters: 1.5,
      speed: '1 Gbps',
      sourcePortId: 'n3-mgmt',
      destPortId: 'sw-p3',
      status: 'ok',
    },
    // Redundant A/B Power Cabling (Feed A: Black, Feed B: Royal Blue)
    {
      id: 'cbl-pwr-n1-a',
      name: 'Node 1 PSU 1 to Feed A PDU',
      type: 'power',
      color: '#1e293b',
      lengthMeters: 1.5,
      sourcePortId: 'n1-psu-a',
      destPortId: 'pdu-a-out1',
      status: 'ok',
    },
    {
      id: 'cbl-pwr-n1-b',
      name: 'Node 1 PSU 2 to Feed B PDU',
      type: 'power',
      color: '#2563eb',
      lengthMeters: 1.5,
      sourcePortId: 'n1-psu-b',
      destPortId: 'pdu-b-out1',
      status: 'ok',
    },
    {
      id: 'cbl-pwr-n2-a',
      name: 'Node 2 PSU 1 to Feed A PDU',
      type: 'power',
      color: '#1e293b',
      lengthMeters: 1.5,
      sourcePortId: 'n2-psu-a',
      destPortId: 'pdu-a-out2',
      status: 'ok',
    },
    {
      id: 'cbl-pwr-n2-b',
      name: 'Node 2 PSU 2 to Feed B PDU',
      type: 'power',
      color: '#2563eb',
      lengthMeters: 1.5,
      sourcePortId: 'n2-psu-b',
      destPortId: 'pdu-b-out2',
      status: 'ok',
    },
    {
      id: 'cbl-pwr-n3-a',
      name: 'Node 3 PSU 1 to Feed A PDU',
      type: 'power',
      color: '#1e293b',
      lengthMeters: 1.5,
      sourcePortId: 'n3-psu-a',
      destPortId: 'pdu-a-out3',
      status: 'ok',
    },
    {
      id: 'cbl-pwr-n3-b',
      name: 'Node 3 PSU 2 to Feed B PDU',
      type: 'power',
      color: '#2563eb',
      lengthMeters: 1.5,
      sourcePortId: 'n3-psu-b',
      destPortId: 'pdu-b-out3',
      status: 'ok',
    },
  ];

  return { racks, devices, cables };
}

/**
 * 2. 2-Node Hyper-V Cluster + Azure Arc
 */
export function generateHyperVClusterTemplate(): TemplateProjectData {
  const rackId = 'rack-hyperv-01';

  const racks: any[] = [
    {
      id: rackId,
      name: 'Rack 01 - Windows Server 2025 S2D (42U)',
      units: 42,
      depthMm: 1070,
      rackType: 'server',
      mounting: 'floor',
      rackColor: '#0a192f',
      x: 200,
      y: 40,
      leftCableManagerWidth: '4-inch',
      rightCableManagerWidth: '4-inch',
      leftPduId: 'pdu-hyperv-a',
      rightPduId: 'pdu-hyperv-b',
    },
  ];

  const devices: any[] = [
    {
      id: 'pdu-hyperv-a',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed A - Vertical PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'left',
      ports: [
        { id: 'pdu-hv-a1', name: 'Outlet 1', type: 'power-c13', relativeX: 10, relativeY: 100 },
        { id: 'pdu-hv-a2', name: 'Outlet 2', type: 'power-c13', relativeX: 10, relativeY: 120 },
      ],
      powerWatts: 0,
    },
    {
      id: 'pdu-hyperv-b',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed B - Vertical PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'right',
      ports: [
        { id: 'pdu-hv-b1', name: 'Outlet 1', type: 'power-c13', relativeX: 10, relativeY: 100 },
        { id: 'pdu-hv-b2', name: 'Outlet 2', type: 'power-c13', relativeX: 10, relativeY: 120 },
      ],
      powerWatts: 0,
    },
    // ToR Switch (U41)
    {
      id: 'dev-hv-sw-01',
      templateId: 'sw-1u-tor-25g-100g',
      name: 'Dell PowerSwitch S5248F-ON 25GbE ToR',
      category: 'switch',
      rackId,
      startUnit: 41,
      heightUnits: 1,
      color: '#1e3a5f',
      powerWatts: 280,
      ports: createStandardDevicePorts('sw-1u-tor-25g-100g', 'dev-hv-sw-01', {
        'tor-sfp1': { id: 'hv-sw-p1', name: 'Port 1 (Node 1)' },
        'tor-sfp2': { id: 'hv-sw-p2', name: 'Port 2 (Node 2)' },
        'tor-mgmt': { id: 'hv-sw-p3', name: 'Port 3 (Azure Arc)' },
      }),
    },
    // Azure Arc Gateway (U30)
    {
      id: 'dev-azure-arc-edge',
      templateId: 'server-1u',
      name: 'Azure Arc Connected Machine Gateway',
      category: 'server',
      rackId,
      startUnit: 30,
      heightUnits: 1,
      color: '#0078d4',
      powerWatts: 150,
      ports: [
        { id: 'arc-uplink', name: 'WAN / Uplink', type: 'rj45', relativeX: 320, relativeY: 8, speed: '1 Gbps' },
      ],
    },
    // Node 2 (U16-17)
    {
      id: 'dev-hyperv-node-02',
      templateId: 'server-2u',
      name: 'Hyper-V Host 02 (Dell R760 2U)',
      category: 'server',
      rackId,
      startUnit: 16,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 500,
      ports: [
        { id: 'hv2-s2d-direct', name: 'S2D RDMA Direct', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'hv2-tor-uplink', name: 'ToR Uplink', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'hv2-psu-a', name: 'PSU 1', type: 'power-c14', relativeX: 340, relativeY: 20 },
        { id: 'hv2-psu-b', name: 'PSU 2', type: 'power-c14', relativeX: 360, relativeY: 20 },
      ],
    },
    // Node 1 (U12-13)
    {
      id: 'dev-hyperv-node-01',
      templateId: 'server-2u',
      name: 'Hyper-V Host 01 (Dell R760 2U)',
      category: 'server',
      rackId,
      startUnit: 12,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 500,
      ports: [
        { id: 'hv1-s2d-direct', name: 'S2D RDMA Direct', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'hv1-tor-uplink', name: 'ToR Uplink', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'hv1-psu-a', name: 'PSU 1', type: 'power-c14', relativeX: 340, relativeY: 20 },
        { id: 'hv1-psu-b', name: 'PSU 2', type: 'power-c14', relativeX: 360, relativeY: 20 },
      ],
    },
  ];

  const cables: any[] = [
    // S2D Direct RoCEv2 Storage Cross-connect (Purple)
    {
      id: 'cbl-s2d-sync',
      name: 'Storage Spaces Direct 25GbE RDMA Sync',
      type: 'dac',
      color: '#8b5cf6',
      lengthMeters: 1.0,
      speed: '25 Gbps',
      sourcePortId: 'hv1-s2d-direct',
      destPortId: 'hv2-s2d-direct',
      status: 'ok',
    },
    // ToR Switch Uplinks (Cyan)
    {
      id: 'cbl-hv1-tor',
      name: 'Host 01 to Dell ToR Switch',
      type: 'dac',
      color: '#06b6d4',
      lengthMeters: 2.0,
      speed: '25 Gbps',
      sourcePortId: 'hv1-tor-uplink',
      destPortId: 'hv-sw-p1',
      status: 'ok',
    },
    {
      id: 'cbl-hv2-tor',
      name: 'Host 02 to Dell ToR Switch',
      type: 'dac',
      color: '#06b6d4',
      lengthMeters: 1.8,
      speed: '25 Gbps',
      sourcePortId: 'hv2-tor-uplink',
      destPortId: 'hv-sw-p2',
      status: 'ok',
    },
    {
      id: 'cbl-arc-tor',
      name: 'Azure Arc Appliance Uplink',
      type: 'cat6',
      color: '#0078d4',
      lengthMeters: 1.2,
      sourcePortId: 'arc-uplink',
      destPortId: 'hv-sw-p3',
      status: 'ok',
    },
    // Power connections
    {
      id: 'cbl-hv1-pwr-a',
      name: 'Host 01 PSU 1 to Feed A',
      type: 'power',
      color: '#1e293b',
      lengthMeters: 1.5,
      sourcePortId: 'hv1-psu-a',
      destPortId: 'pdu-hv-a1',
    },
    {
      id: 'cbl-hv1-pwr-b',
      name: 'Host 01 PSU 2 to Feed B',
      type: 'power',
      color: '#2563eb',
      lengthMeters: 1.5,
      sourcePortId: 'hv1-psu-b',
      destPortId: 'pdu-hv-b1',
    },
  ];

  return { racks, devices, cables };
}

/**
 * 3. 3-Node Proxmox VE + Ceph + PBS
 */
export function generateProxmoxCephTemplate(): TemplateProjectData {
  const rackId = 'rack-proxmox-01';

  const racks: any[] = [
    {
      id: rackId,
      name: 'Rack 01 - Proxmox Enterprise HCI Pod (42U)',
      units: 42,
      depthMm: 1070,
      rackType: 'server',
      mounting: 'floor',
      rackColor: '#111827',
      x: 200,
      y: 40,
      leftCableManagerWidth: '4-inch',
      rightCableManagerWidth: '4-inch',
      leftPduId: 'pdu-proxmox-a',
      rightPduId: 'pdu-proxmox-b',
    },
  ];

  const devices: any[] = [
    {
      id: 'pdu-proxmox-a',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed A - Vertical PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'left',
      ports: [
        { id: 'pdu-px-a1', name: 'Outlet 1', type: 'power-c13', relativeX: 10, relativeY: 100 },
        { id: 'pdu-px-a2', name: 'Outlet 2', type: 'power-c13', relativeX: 10, relativeY: 120 },
        { id: 'pdu-px-a3', name: 'Outlet 3', type: 'power-c13', relativeX: 10, relativeY: 140 },
        { id: 'pdu-px-a4', name: 'Outlet 4', type: 'power-c13', relativeX: 10, relativeY: 160 },
      ],
      powerWatts: 0,
    },
    {
      id: 'pdu-proxmox-b',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed B - Vertical PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'right',
      ports: [
        { id: 'pdu-px-b1', name: 'Outlet 1', type: 'power-c13', relativeX: 10, relativeY: 100 },
        { id: 'pdu-px-b2', name: 'Outlet 2', type: 'power-c13', relativeX: 10, relativeY: 120 },
        { id: 'pdu-px-b3', name: 'Outlet 3', type: 'power-c13', relativeX: 10, relativeY: 140 },
        { id: 'pdu-px-b4', name: 'Outlet 4', type: 'power-c13', relativeX: 10, relativeY: 160 },
      ],
      powerWatts: 0,
    },
    // Dual ToR Switches (U41 & U40)
    {
      id: 'dev-proxmox-tor-01',
      templateId: 'sw-1u-tor-25g-100g',
      name: 'Cisco Nexus 93180YC ToR-01',
      category: 'switch',
      rackId,
      startUnit: 41,
      heightUnits: 1,
      color: '#1e293b',
      powerWatts: 300,
      ports: createStandardDevicePorts('sw-1u-tor-25g-100g', 'dev-proxmox-tor-01', {
        'tor-sfp1': { id: 'tor1-p1', name: 'P1 (H1)' },
        'tor-sfp2': { id: 'tor1-p2', name: 'P2 (H2)' },
        'tor-sfp3': { id: 'tor1-p3', name: 'P3 (H3)' },
        'tor-sfp4': { id: 'tor1-p4', name: 'P4 (PBS)' },
      }),
    },
    {
      id: 'dev-proxmox-tor-02',
      templateId: 'sw-1u-tor-25g-100g',
      name: 'Cisco Nexus 93180YC ToR-02 (MLAG)',
      category: 'switch',
      rackId,
      startUnit: 40,
      heightUnits: 1,
      color: '#1e293b',
      powerWatts: 300,
      ports: createStandardDevicePorts('sw-1u-tor-25g-100g', 'dev-proxmox-tor-02', {
        'tor-sfp1': { id: 'tor2-p1', name: 'P1 (H1)' },
        'tor-sfp2': { id: 'tor2-p2', name: 'P2 (H2)' },
        'tor-sfp3': { id: 'tor2-p3', name: 'P3 (H3)' },
        'tor-sfp4': { id: 'tor2-p4', name: 'P4 (PBS)' },
      }),
    },
    // Proxmox Backup Server (U22)
    {
      id: 'dev-proxmox-pbs',
      templateId: 'server-1u',
      name: 'Proxmox Backup Server (PBS-01)',
      category: 'server',
      rackId,
      startUnit: 22,
      heightUnits: 1,
      color: '#047857',
      powerWatts: 180,
      ports: [
        { id: 'pbs-uplink-1', name: 'Backup 10G', type: 'sfp-plus', relativeX: 320, relativeY: 8, speed: '10 Gbps' },
        { id: 'pbs-psu-a', name: 'PSU 1', type: 'power-c14', relativeX: 360, relativeY: 8 },
      ],
    },
    // Host 3 (U18-19)
    {
      id: 'dev-proxmox-h3',
      templateId: 'server-2u',
      name: 'Proxmox-H3-BLR (Supermicro 2U)',
      category: 'server',
      rackId,
      startUnit: 18,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 420,
      ports: [
        { id: 'h3-eth1', name: '25G Bond 1', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'h3-eth2', name: '25G Bond 2', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'h3-psu-a', name: 'PSU 1', type: 'power-c14', relativeX: 340, relativeY: 20 },
        { id: 'h3-psu-b', name: 'PSU 2', type: 'power-c14', relativeX: 360, relativeY: 20 },
      ],
    },
    // Host 2 (U14-15)
    {
      id: 'dev-proxmox-h2',
      templateId: 'server-2u',
      name: 'Proxmox-H2-BLR (Supermicro 2U)',
      category: 'server',
      rackId,
      startUnit: 14,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 420,
      ports: [
        { id: 'h2-eth1', name: '25G Bond 1', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'h2-eth2', name: '25G Bond 2', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'h2-psu-a', name: 'PSU 1', type: 'power-c14', relativeX: 340, relativeY: 20 },
        { id: 'h2-psu-b', name: 'PSU 2', type: 'power-c14', relativeX: 360, relativeY: 20 },
      ],
    },
    // Host 1 (U10-11)
    {
      id: 'dev-proxmox-h1',
      templateId: 'server-2u',
      name: 'Proxmox-H1-BLR (Supermicro 2U)',
      category: 'server',
      rackId,
      startUnit: 10,
      heightUnits: 2,
      color: '#0f172a',
      powerWatts: 420,
      ports: [
        { id: 'h1-eth1', name: '25G Bond 1', type: 'sfp28', relativeX: 120, relativeY: 20, speed: '25 Gbps' },
        { id: 'h1-eth2', name: '25G Bond 2', type: 'sfp28', relativeX: 140, relativeY: 20, speed: '25 Gbps' },
        { id: 'h1-psu-a', name: 'PSU 1', type: 'power-c14', relativeX: 340, relativeY: 20 },
        { id: 'h1-psu-b', name: 'PSU 2', type: 'power-c14', relativeX: 360, relativeY: 20 },
      ],
    },
  ];

  const cables: any[] = [
    // Dual-homed 25GbE LACP Active/Active Cabling (Cyan & Emerald)
    {
      id: 'cbl-h1-to-tor1',
      name: 'Host 1 to ToR-01 Primary Link',
      type: 'dac',
      color: '#06b6d4',
      lengthMeters: 2.5,
      speed: '25 Gbps',
      sourcePortId: 'h1-eth1',
      destPortId: 'tor1-p1',
      status: 'ok',
    },
    {
      id: 'cbl-h1-to-tor2',
      name: 'Host 1 to ToR-02 Redundant Link',
      type: 'dac',
      color: '#10b981',
      lengthMeters: 2.5,
      speed: '25 Gbps',
      sourcePortId: 'h1-eth2',
      destPortId: 'tor2-p1',
      status: 'ok',
    },
    {
      id: 'cbl-h2-to-tor1',
      name: 'Host 2 to ToR-01 Primary Link',
      type: 'dac',
      color: '#06b6d4',
      lengthMeters: 2.0,
      speed: '25 Gbps',
      sourcePortId: 'h2-eth1',
      destPortId: 'tor1-p2',
      status: 'ok',
    },
    {
      id: 'cbl-h2-to-tor2',
      name: 'Host 2 to ToR-02 Redundant Link',
      type: 'dac',
      color: '#10b981',
      lengthMeters: 2.0,
      speed: '25 Gbps',
      sourcePortId: 'h2-eth2',
      destPortId: 'tor2-p2',
      status: 'ok',
    },
    {
      id: 'cbl-h3-to-tor1',
      name: 'Host 3 to ToR-01 Primary Link',
      type: 'dac',
      color: '#06b6d4',
      lengthMeters: 1.8,
      speed: '25 Gbps',
      sourcePortId: 'h3-eth1',
      destPortId: 'tor1-p3',
      status: 'ok',
    },
    {
      id: 'cbl-h3-to-tor2',
      name: 'Host 3 to ToR-02 Redundant Link',
      type: 'dac',
      color: '#10b981',
      lengthMeters: 1.8,
      speed: '25 Gbps',
      sourcePortId: 'h3-eth2',
      destPortId: 'tor2-p3',
      status: 'ok',
    },
    // Proxmox Backup Server Uplink
    {
      id: 'cbl-pbs-tor1',
      name: 'PBS Dedicated Backup Trunk',
      type: 'fiber-mm',
      color: '#3b82f6',
      lengthMeters: 1.5,
      speed: '10 Gbps',
      sourcePortId: 'pbs-uplink-1',
      destPortId: 'tor1-p4',
      status: 'ok',
    },
    // Power connections
    {
      id: 'cbl-h1-pwr-a',
      name: 'Host 1 PSU 1 to Feed A',
      type: 'power',
      color: '#1e293b',
      lengthMeters: 1.5,
      sourcePortId: 'h1-psu-a',
      destPortId: 'pdu-px-a1',
    },
    {
      id: 'cbl-h1-pwr-b',
      name: 'Host 1 PSU 2 to Feed B',
      type: 'power',
      color: '#2563eb',
      lengthMeters: 1.5,
      sourcePortId: 'h1-psu-b',
      destPortId: 'pdu-px-b1',
    },
  ];

  return { racks, devices, cables };
}

/**
 * 4. Azure Hub-Spoke Enterprise Landing Zone (Cloud Architecture)
 */
export function generateAzureHubSpokeTemplate(): TemplateProjectData {
  const cloudContainers: any[] = [
    {
      id: 'azure-hub-vnet',
      name: 'Central Hub VNet (10.0.0.0/16)',
      label: 'Central Hub VNet (10.0.0.0/16)',
      kind: 'vpc',
      provider: 'azure',
      x: 100,
      y: 80,
      width: 320,
      height: 380,
      color: '#0078d4',
    },
    {
      id: 'azure-spoke-prod',
      name: 'Production Spoke VNet (10.1.0.0/16)',
      label: 'Production Spoke VNet (10.1.0.0/16)',
      kind: 'vpc',
      provider: 'azure',
      x: 500,
      y: 60,
      width: 300,
      height: 200,
      color: '#10b981',
    },
    {
      id: 'azure-spoke-data',
      name: 'Database & Storage Spoke (10.2.0.0/16)',
      label: 'Database & Storage Spoke (10.2.0.0/16)',
      kind: 'vpc',
      provider: 'azure',
      x: 500,
      y: 300,
      width: 300,
      height: 200,
      color: '#8b5cf6',
    },
  ];

  const cloudNodes: any[] = [
    // Hub components
    {
      id: 'az-fw-prem',
      name: 'Azure Firewall Premium',
      label: 'Azure Firewall Premium',
      provider: 'azure',
      serviceType: 'Security',
      iconId: 'azure-firewall',
      iconName: 'azure-firewall',
      x: 150,
      y: 130,
      width: 60,
      height: 60,
      containerId: 'azure-hub-vnet',
    },
    {
      id: 'az-er-gw',
      name: 'ExpressRoute Gateway',
      label: 'ExpressRoute Gateway',
      provider: 'azure',
      serviceType: 'Networking',
      iconId: 'azure-expressroute',
      iconName: 'azure-expressroute',
      x: 150,
      y: 230,
      width: 60,
      height: 60,
      containerId: 'azure-hub-vnet',
    },
    {
      id: 'az-bastion',
      name: 'Azure Bastion Host',
      label: 'Azure Bastion Host',
      provider: 'azure',
      serviceType: 'Management',
      iconId: 'azure-bastion',
      iconName: 'azure-bastion',
      x: 150,
      y: 330,
      width: 60,
      height: 60,
      containerId: 'azure-hub-vnet',
    },
    // Production Spoke
    {
      id: 'az-aks-cluster',
      name: 'Production AKS Cluster',
      label: 'Production AKS Cluster',
      provider: 'azure',
      serviceType: 'Compute',
      iconId: 'azure-aks',
      iconName: 'azure-aks',
      x: 550,
      y: 120,
      width: 60,
      height: 60,
      containerId: 'azure-spoke-prod',
    },
    {
      id: 'az-app-gw',
      name: 'WAF App Gateway v2',
      label: 'WAF App Gateway v2',
      provider: 'azure',
      serviceType: 'Networking',
      iconId: 'azure-app-gateway',
      iconName: 'azure-app-gateway',
      x: 670,
      y: 120,
      width: 60,
      height: 60,
      containerId: 'azure-spoke-prod',
    },
    // Database Spoke
    {
      id: 'az-sql-mi',
      name: 'Azure SQL Managed Instance',
      label: 'Azure SQL Managed Instance',
      provider: 'azure',
      serviceType: 'Database',
      iconId: 'azure-sql',
      iconName: 'azure-sql',
      x: 550,
      y: 360,
      width: 60,
      height: 60,
      containerId: 'azure-spoke-data',
    },
    {
      id: 'az-key-vault',
      name: 'Enterprise Key Vault (HSM)',
      label: 'Enterprise Key Vault (HSM)',
      provider: 'azure',
      serviceType: 'Security',
      iconId: 'azure-key-vault',
      iconName: 'azure-key-vault',
      x: 670,
      y: 360,
      width: 60,
      height: 60,
      containerId: 'azure-spoke-data',
    },
  ];

  const cloudConnectors: any[] = [
    {
      id: 'peer-hub-prod',
      sourceNodeId: 'az-fw-prem',
      destNodeId: 'az-app-gw',
      targetNodeId: 'az-app-gw',
      label: 'Hub-to-Prod VNet Peering',
      style: 'solid',
      color: '#0078d4',
    },
    {
      id: 'peer-hub-data',
      sourceNodeId: 'az-fw-prem',
      destNodeId: 'az-sql-mi',
      targetNodeId: 'az-sql-mi',
      label: 'Hub-to-Data Private Link',
      style: 'solid',
      color: '#8b5cf6',
    },
  ];

  return {
    racks: [],
    devices: [],
    cables: [],
    cloudNodes,
    cloudContainers,
    cloudConnectors,
  };
}

/**
 * 5. AWS Multi-Account Transit Gateway (Cloud Architecture)
 */
export function generateAWSTransitGatewayTemplate(): TemplateProjectData {
  const cloudContainers: any[] = [
    {
      id: 'aws-sec-vpc',
      name: 'Security Inspection VPC (10.100.0.0/16)',
      label: 'Security Inspection VPC (10.100.0.0/16)',
      kind: 'vpc',
      provider: 'aws',
      x: 80,
      y: 80,
      width: 320,
      height: 350,
      color: '#ff9900',
    },
    {
      id: 'aws-prod-vpc',
      name: 'Production Core VPC (10.200.0.0/16)',
      label: 'Production Core VPC (10.200.0.0/16)',
      kind: 'vpc',
      provider: 'aws',
      x: 520,
      y: 80,
      width: 340,
      height: 350,
      color: '#10b981',
    },
  ];

  const cloudNodes: any[] = [
    {
      id: 'aws-tgw',
      name: 'AWS Transit Gateway (Central)',
      label: 'AWS Transit Gateway (Central)',
      provider: 'aws',
      serviceType: 'Networking',
      iconId: 'aws-transit-gateway',
      iconName: 'aws-transit-gateway',
      x: 440,
      y: 220,
      width: 60,
      height: 60,
    },
    {
      id: 'aws-net-fw',
      name: 'AWS Network Firewall',
      label: 'AWS Network Firewall',
      provider: 'aws',
      serviceType: 'Security',
      iconId: 'aws-network-firewall',
      iconName: 'aws-network-firewall',
      x: 140,
      y: 150,
      width: 60,
      height: 60,
      containerId: 'aws-sec-vpc',
    },
    {
      id: 'aws-dx-gw',
      name: 'Direct Connect Gateway',
      label: 'Direct Connect Gateway',
      provider: 'aws',
      serviceType: 'Hybrid',
      iconId: 'aws-direct-connect',
      iconName: 'aws-direct-connect',
      x: 140,
      y: 280,
      width: 60,
      height: 60,
      containerId: 'aws-sec-vpc',
    },
    {
      id: 'aws-eks-cluster',
      name: 'Multi-AZ EKS Cluster',
      label: 'Multi-AZ EKS Cluster',
      provider: 'aws',
      serviceType: 'Compute',
      iconId: 'aws-eks',
      iconName: 'aws-eks',
      x: 600,
      y: 150,
      width: 60,
      height: 60,
      containerId: 'aws-prod-vpc',
    },
    {
      id: 'aws-aurora-db',
      name: 'Aurora PostgreSQL Serverless',
      label: 'Aurora PostgreSQL Serverless',
      provider: 'aws',
      serviceType: 'Database',
      iconId: 'aws-aurora',
      iconName: 'aws-aurora',
      x: 600,
      y: 280,
      width: 60,
      height: 60,
      containerId: 'aws-prod-vpc',
    },
  ];

  const cloudConnectors: any[] = [
    {
      id: 'conn-sec-tgw',
      sourceNodeId: 'aws-net-fw',
      destNodeId: 'aws-tgw',
      targetNodeId: 'aws-tgw',
      label: 'Security VPC Attachment',
      style: 'solid',
      color: '#ff9900',
    },
    {
      id: 'conn-prod-tgw',
      sourceNodeId: 'aws-tgw',
      destNodeId: 'aws-eks-cluster',
      targetNodeId: 'aws-eks-cluster',
      label: 'Prod VPC Attachment',
      style: 'solid',
      color: '#10b981',
    },
  ];

  return {
    racks: [],
    devices: [],
    cables: [],
    cloudNodes,
    cloudContainers,
    cloudConnectors,
  };
}

/**
 * 6. 8x NVIDIA H100 AI Training & Inference Pod
 */
export function generateH100AIPodTemplate(): TemplateProjectData {
  const rackId = 'rack-h100-01';

  const racks: any[] = [
    {
      id: rackId,
      name: 'Rack 01 - NVIDIA H100 Supercomputing Pod (48U)',
      units: 48,
      depthMm: 1200,
      rackType: 'server',
      mounting: 'floor',
      rackColor: '#050c1a',
      x: 200,
      y: 30,
      leftCableManagerWidth: '4-inch',
      rightCableManagerWidth: '4-inch',
      leftPduId: 'pdu-h100-a',
      rightPduId: 'pdu-h100-b',
    },
  ];

  const devices: any[] = [
    {
      id: 'pdu-h100-a',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed A - 3-Phase 30A High Density PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'left',
      ports: [
        { id: 'pdu-h100-a1', name: 'Outlet 1', type: 'power-c19', relativeX: 10, relativeY: 100 },
        { id: 'pdu-h100-a2', name: 'Outlet 2', type: 'power-c19', relativeX: 10, relativeY: 130 },
      ],
      powerWatts: 0,
    },
    {
      id: 'pdu-h100-b',
      templateId: 'vpdu-apc-ap8858',
      name: 'Feed B - 3-Phase 30A High Density PDU',
      category: 'pdu',
      rackId,
      startUnit: 0,
      heightUnits: 0,
      sideMountPosition: 'right',
      ports: [
        { id: 'pdu-h100-b1', name: 'Outlet 1', type: 'power-c19', relativeX: 10, relativeY: 100 },
        { id: 'pdu-h100-b2', name: 'Outlet 2', type: 'power-c19', relativeX: 10, relativeY: 130 },
      ],
      powerWatts: 0,
    },
    // Quantum-2 InfiniBand Switch 01 (U46)
    {
      id: 'dev-ib-sw-01',
      templateId: 'sw-1u-leaf-100g-400g',
      name: 'NVIDIA Quantum-2 800Gb/s IB Switch 01',
      category: 'switch',
      rackId,
      startUnit: 46,
      heightUnits: 1,
      color: '#10b981',
      powerWatts: 550,
      ports: createStandardDevicePorts('sw-1u-leaf-100g-400g', 'dev-ib-sw-01', {
        'leaf-q1': { id: 'ib1-p1', name: 'NDR P1' },
        'leaf-q2': { id: 'ib1-p2', name: 'NDR P2' },
        'leaf-q3': { id: 'ib1-p3', name: 'NDR P3' },
        'leaf-q4': { id: 'ib1-p4', name: 'NDR P4' },
      }),
    },
    // Quantum-2 InfiniBand Switch 02 (U45)
    {
      id: 'dev-ib-sw-02',
      templateId: 'sw-1u-leaf-100g-400g',
      name: 'NVIDIA Quantum-2 800Gb/s IB Switch 02',
      category: 'switch',
      rackId,
      startUnit: 45,
      heightUnits: 1,
      color: '#10b981',
      powerWatts: 550,
      ports: createStandardDevicePorts('sw-1u-leaf-100g-400g', 'dev-ib-sw-02', {
        'leaf-q1': { id: 'ib2-p1', name: 'NDR P5' },
        'leaf-q2': { id: 'ib2-p2', name: 'NDR P6' },
        'leaf-q3': { id: 'ib2-p3', name: 'NDR P7' },
        'leaf-q4': { id: 'ib2-p4', name: 'NDR P8' },
      }),
    },
    // 8U Supermicro HGX H100 8x GPU Server (U20-U27)
    {
      id: 'dev-h100-gpu-server',
      templateId: 'server-4u',
      name: 'Supermicro HGX H100 8-GPU AI Node',
      category: 'server',
      rackId,
      startUnit: 20,
      heightUnits: 8,
      color: '#022c22',
      powerWatts: 7200,
      ports: [
        { id: 'gpu-cx7-1', name: 'CX7 NDR 1', type: 'qsfp-dd', relativeX: 80, relativeY: 40, speed: '400 Gbps' },
        { id: 'gpu-cx7-2', name: 'CX7 NDR 2', type: 'qsfp-dd', relativeX: 110, relativeY: 40, speed: '400 Gbps' },
        { id: 'gpu-cx7-3', name: 'CX7 NDR 3', type: 'qsfp-dd', relativeX: 140, relativeY: 40, speed: '400 Gbps' },
        { id: 'gpu-cx7-4', name: 'CX7 NDR 4', type: 'qsfp-dd', relativeX: 170, relativeY: 40, speed: '400 Gbps' },
        { id: 'gpu-psu-1', name: 'PSU 1 (3000W)', type: 'power-c20', relativeX: 340, relativeY: 40 },
        { id: 'gpu-psu-2', name: 'PSU 2 (3000W)', type: 'power-c20', relativeX: 360, relativeY: 40 },
      ],
    },
    // Liquid Cooling CDU Manifold (U4-U7)
    {
      id: 'dev-cdu-cooling',
      templateId: 'server-4u',
      name: 'In-Rack Liquid Cooling CDU (4U)',
      category: 'other',
      rackId,
      startUnit: 4,
      heightUnits: 4,
      color: '#0891b2',
      powerWatts: 450,
      ports: [],
    },
  ];

  const cables: any[] = [
    // 400G / 800G NDR InfiniBand Cables (Neon Emerald)
    {
      id: 'cbl-ib-1',
      name: 'H100 CX7-1 to Quantum-2 SW01 P1',
      type: 'fiber-mm',
      color: '#10b981',
      lengthMeters: 2.0,
      speed: '400 Gbps',
      sourcePortId: 'gpu-cx7-1',
      destPortId: 'ib1-p1',
      status: 'ok',
    },
    {
      id: 'cbl-ib-2',
      name: 'H100 CX7-2 to Quantum-2 SW01 P2',
      type: 'fiber-mm',
      color: '#10b981',
      lengthMeters: 2.0,
      speed: '400 Gbps',
      sourcePortId: 'gpu-cx7-2',
      destPortId: 'ib1-p2',
      status: 'ok',
    },
    {
      id: 'cbl-ib-3',
      name: 'H100 CX7-3 to Quantum-2 SW01 P3',
      type: 'fiber-mm',
      color: '#10b981',
      lengthMeters: 2.0,
      speed: '400 Gbps',
      sourcePortId: 'gpu-cx7-3',
      destPortId: 'ib1-p3',
      status: 'ok',
    },
    {
      id: 'cbl-ib-4',
      name: 'H100 CX7-4 to Quantum-2 SW01 P4',
      type: 'fiber-mm',
      color: '#10b981',
      lengthMeters: 2.0,
      speed: '400 Gbps',
      sourcePortId: 'gpu-cx7-4',
      destPortId: 'ib1-p4',
      status: 'ok',
    },
    // Heavy 16A C19/C20 Power cords
    {
      id: 'cbl-gpu-pwr-a',
      name: 'HGX H100 PSU 1 to Feed A PDU',
      type: 'power',
      color: '#1e293b',
      lengthMeters: 2.0,
      sourcePortId: 'gpu-psu-1',
      destPortId: 'pdu-h100-a1',
    },
    {
      id: 'cbl-gpu-pwr-b',
      name: 'HGX H100 PSU 2 to Feed B PDU',
      type: 'power',
      color: '#2563eb',
      lengthMeters: 2.0,
      sourcePortId: 'gpu-psu-2',
      destPortId: 'pdu-h100-b1',
    },
  ];

  return { racks, devices, cables };
}

/**
 * Returns the populated project JSON for a given template ID
 */
export function getTemplatePayloadJson(templateId: string): string {
  let data: TemplateProjectData;

  switch (templateId) {
    case 'tpl-ceph-mesh':
      data = generateCephMeshTemplate();
      break;
    case 'tpl-hyperv-cluster':
      data = generateHyperVClusterTemplate();
      break;
    case 'tpl-proxmox-ceph':
      data = generateProxmoxCephTemplate();
      break;
    case 'tpl-azure-hub-spoke':
      data = generateAzureHubSpokeTemplate();
      break;
    case 'tpl-aws-transit':
      data = generateAWSTransitGatewayTemplate();
      break;
    case 'tpl-ai-gpu-pod':
      data = generateH100AIPodTemplate();
      break;
    default:
      data = generateCephMeshTemplate();
      break;
  }

  return JSON.stringify({
    version: 1,
    type: 'rackslicer-project',
    timestamp: Date.now(),
    racks: data.racks,
    devices: data.devices,
    cables: data.cables,
    cloudNodes: data.cloudNodes || [],
    cloudContainers: data.cloudContainers || [],
    cloudConnectors: data.cloudConnectors || [],
  });
}
