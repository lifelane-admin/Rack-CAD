import { DeviceTemplate, DeviceCategory } from '../core/types';

const RU_HEIGHT = 30; // Matches RACK_CONSTANTS
const DEVICE_WIDTH = 350; // Matches inner width minus rails (400 - 50)
const PADDING = 20;

function createPorts(
  count: number,
  prefix: string,
  type: string,
  heightUnits: number,
  offsetY?: number
): any[] {
  const ports = [];
  const spacing = (DEVICE_WIDTH - 2 * PADDING) / (count || 1);
  const relativeY = offsetY !== undefined ? offsetY : (heightUnits * RU_HEIGHT) / 2;
  
  for (let i = 0; i < count; i++) {
    ports.push({
      id: `${prefix}${i}`,
      name: `${prefix}${i}`,
      type: type,
      relativeX: PADDING + i * spacing,
      relativeY: relativeY
    });
  }
  return ports;
}

export const deviceCatalog: DeviceTemplate[] = [
  // Servers
  {
    id: 'dell-r760',
    name: 'Dell PowerEdge R760',
    manufacturer: 'Dell',
    model: 'R760',
    category: 'server',
    heightUnits: 2,
    color: '#1a1a1e',
    icon: '🖥️',
    frontPanelImage: '/dell-poweredge-panel.png',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 12 },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 22 },
      { id: 'nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 325, relativeY: 32 },
      { id: 'nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 325, relativeY: 42 },
      { id: 'nic5', name: 'NIC 5 (iDRAC)', type: 'management', relativeX: 325, relativeY: 52 }
    ]
  },
  {
    id: 'dell-r660',
    name: 'Dell PowerEdge R660',
    manufacturer: 'Dell',
    model: 'R660',
    category: 'server',
    heightUnits: 1,
    color: '#1a1a1e',
    icon: '🖥️',
    frontPanelImage: '/dell-poweredge-panel.png', // Scales to 1U height
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 8 },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 15 },
      { id: 'nic3', name: 'NIC 3 (iDRAC)', type: 'management', relativeX: 325, relativeY: 22 }
    ]
  },
  {
    id: 'hpe-dl380',
    name: 'HPE ProLiant DL380',
    manufacturer: 'HPE',
    model: 'DL380',
    category: 'server',
    heightUnits: 2,
    color: '#161d20',
    icon: '🖥️',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 12 },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 22 },
      { id: 'nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 325, relativeY: 32 },
      { id: 'nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 325, relativeY: 42 },
      { id: 'nic5', name: 'NIC 5 (iDRAC)', type: 'management', relativeX: 325, relativeY: 52 }
    ]
  },
  {
    id: 'hpe-dl360',
    name: 'HPE ProLiant DL360',
    manufacturer: 'HPE',
    model: 'DL360',
    category: 'server',
    heightUnits: 1,
    color: '#161d20',
    icon: '🖥️',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 8 },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 15 },
      { id: 'nic3', name: 'NIC 3 (iDRAC)', type: 'management', relativeX: 325, relativeY: 22 }
    ]
  },
  {
    id: 'smc-1u',
    name: 'Supermicro 1U Server',
    manufacturer: 'Supermicro',
    model: 'SYS-110',
    category: 'server',
    heightUnits: 1,
    color: '#111317',
    icon: '🖥️',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 10 },
      { id: 'nic2', name: 'NIC 2 (iDRAC)', type: 'management', relativeX: 325, relativeY: 20 }
    ]
  },

  // Switches
  {
    id: 'tor-switch-10g',
    name: 'ToR Switch (12-Port 10GbE)',
    manufacturer: 'Generic',
    model: 'TOR-12G',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    frontPanelImage: '/switch-panel.png',
    ports: [
      { id: 'con0', name: 'Console', type: 'console', relativeX: 100, relativeY: 15 },
      { id: 'port1', name: 'Port 1', type: 'sfp-plus', relativeX: 155, relativeY: 8 },
      { id: 'port2', name: 'Port 2', type: 'sfp-plus', relativeX: 155, relativeY: 20 },
      { id: 'port3', name: 'Port 3', type: 'sfp-plus', relativeX: 175, relativeY: 8 },
      { id: 'port4', name: 'Port 4', type: 'sfp-plus', relativeX: 175, relativeY: 20 },
      { id: 'port5', name: 'Port 5', type: 'sfp-plus', relativeX: 195, relativeY: 8 },
      { id: 'port6', name: 'Port 6', type: 'sfp-plus', relativeX: 195, relativeY: 20 },
      { id: 'port7', name: 'Port 7', type: 'sfp-plus', relativeX: 215, relativeY: 8 },
      { id: 'port8', name: 'Port 8', type: 'sfp-plus', relativeX: 215, relativeY: 20 },
      { id: 'port9', name: 'Port 9', type: 'sfp-plus', relativeX: 235, relativeY: 8 },
      { id: 'port10', name: 'Port 10', type: 'sfp-plus', relativeX: 235, relativeY: 20 },
      { id: 'port11', name: 'Port 11', type: 'rj45', relativeX: 260, relativeY: 8 },
      { id: 'port12', name: 'Port 12', type: 'rj45', relativeX: 260, relativeY: 20 }
    ]
  },
  {
    id: 'mgmt-switch-24p',
    name: 'Management Switch (24-Port 1GbE)',
    manufacturer: 'Generic',
    model: 'MGMT-24G',
    category: 'switch',
    heightUnits: 1,
    color: '#1c1e22',
    icon: '🔀',
    ports: [
      { id: 'con0', name: 'Console', type: 'console', relativeX: 25, relativeY: 15 },
      // 24 ports grouped on the left/middle
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `port${i * 2 + 1}`,
        name: `Port ${i * 2 + 1}`,
        type: 'rj45' as const,
        relativeX: 60 + i * 20,
        relativeY: 8
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `port${i * 2 + 2}`,
        name: `Port ${i * 2 + 2}`,
        type: 'rj45' as const,
        relativeX: 60 + i * 20,
        relativeY: 20
      }))
    ]
  },
  {
    id: 'cisco-c9300',
    name: 'Cisco Catalyst 9300',
    manufacturer: 'Cisco',
    model: 'Catalyst 9300',
    category: 'switch',
    heightUnits: 1,
    color: '#1e2328',
    icon: '🔀',
    ports: [
      { id: 'con0', name: 'Console', type: 'console', relativeX: 20, relativeY: 15 },
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `port${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 50 + i * 11,
        relativeY: 15
      }))
    ]
  },

  // Firewalls
  {
    id: 'fg-600f',
    name: 'Fortinet FortiGate 600F',
    manufacturer: 'Fortinet',
    model: '600F',
    category: 'firewall',
    heightUnits: 1,
    color: '#2d1818',
    icon: '🛡️',
    ports: [
      { id: 'con0', name: 'Console', type: 'console', relativeX: 20, relativeY: 15 },
      { id: 'mgmt0', name: 'Management', type: 'management', relativeX: 40, relativeY: 15 },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `port${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 80 + i * 15,
        relativeY: 15
      }))
    ]
  },

  // Storage
  {
    id: 'powerstore-500t',
    name: 'Dell PowerStore 500T',
    manufacturer: 'Dell',
    model: '500T',
    category: 'storage',
    heightUnits: 2,
    color: '#151e2b',
    icon: '💾',
    ports: [
      { id: 'mgmt0', name: 'MGMT', type: 'management', relativeX: 30, relativeY: 30 },
      { id: 'port1', name: 'Port 1', type: 'sfp-plus', relativeX: 300, relativeY: 20 },
      { id: 'port2', name: 'Port 2', type: 'sfp-plus', relativeX: 320, relativeY: 20 },
      { id: 'port3', name: 'Port 3', type: 'sfp-plus', relativeX: 300, relativeY: 40 },
      { id: 'port4', name: 'Port 4', type: 'sfp-plus', relativeX: 320, relativeY: 40 }
    ]
  },

  // Power & Accessories
  {
    id: 'apc-ups-3000',
    name: 'APC Smart-UPS 3000',
    manufacturer: 'APC',
    model: 'SMT3000',
    category: 'ups',
    heightUnits: 2,
    color: '#222222',
    icon: '⚡',
    ports: [
      { id: 'mgmt0', name: 'MGMT', type: 'management', relativeX: 325, relativeY: 30 }
    ]
  },
  {
    id: 'blank-1u',
    name: '1U Blank Panel',
    manufacturer: 'Generic',
    model: 'BP-1U',
    category: 'blank-panel',
    heightUnits: 1,
    color: '#232326',
    icon: '🔧',
    ports: []
  },
  {
    id: 'blank-2u',
    name: '2U Blank Panel',
    manufacturer: 'Generic',
    model: 'BP-2U',
    category: 'blank-panel',
    heightUnits: 2,
    color: '#232326',
    icon: '🔧',
    ports: []
  },
  {
    id: 'brush-panel-1u',
    name: '1U Brush Cable Manager',
    manufacturer: 'Generic',
    model: 'Brush-1U',
    category: 'cable-manager',
    heightUnits: 1,
    color: '#1a1a1c',
    icon: '📂',
    ports: []
  },
  {
    id: 'd-ring-1u',
    name: '1U D-Ring Cable Organizer',
    manufacturer: 'Generic',
    model: 'D-Ring-1U',
    category: 'cable-manager',
    heightUnits: 1,
    color: '#1e1e20',
    icon: '📂',
    ports: []
  },
  {
    id: 'finger-duct-2u',
    name: '2U Finger Duct Cable Organizer',
    manufacturer: 'Generic',
    model: 'Finger-2U',
    category: 'cable-manager',
    heightUnits: 2,
    color: '#151518',
    icon: '📂',
    ports: []
  },
  {
    id: 'finger-duct-4u',
    name: '4U Finger Duct Cable Organizer',
    manufacturer: 'Generic',
    model: 'Finger-4U',
    category: 'cable-manager',
    heightUnits: 4,
    color: '#121215',
    icon: '📂',
    ports: []
  },
  {
    id: 'vertical-mgr-4',
    name: 'Vertical Cable Manager (4")',
    manufacturer: 'Generic',
    model: 'VCM-4',
    category: 'cable-manager',
    heightUnits: 42,
    color: '#151518',
    icon: '📂',
    ports: []
  },
  {
    id: 'vertical-mgr-6',
    name: 'Vertical Cable Manager (6")',
    manufacturer: 'Generic',
    model: 'VCM-6',
    category: 'cable-manager',
    heightUnits: 42,
    color: '#151518',
    icon: '📂',
    ports: []
  }
];

export function getTemplate(id: string): DeviceTemplate | undefined {
  return deviceCatalog.find(t => t.id === id);
}

export function getTemplatesByCategory(category: DeviceCategory): DeviceTemplate[] {
  return deviceCatalog.filter(t => t.category === category);
}
