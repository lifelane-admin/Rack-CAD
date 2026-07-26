import { DeviceTemplate, DeviceCategory } from '../core/types';

const RU_HEIGHT = 30; // Matches RACK_CONSTANTS
const DEVICE_WIDTH = 350; // Matches inner width minus rails (400 - 50)
const PADDING = 20;

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
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 12, speed: '1 Gbps' },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 22, speed: '10 Gbps' },
      { id: 'nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 325, relativeY: 32, speed: '10 Gbps' },
      { id: 'nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 325, relativeY: 42, speed: '10 Gbps' },
      { id: 'nic5', name: 'NIC 5 (iDRAC)', type: 'management', relativeX: 325, relativeY: 52, speed: '1 Gbps' }
    ]
  },
  {
    id: 'dell-r760-3u',
    name: 'Dell PowerEdge R760 (3U)',
    manufacturer: 'Dell',
    model: 'R760-3U',
    category: 'server',
    heightUnits: 3,
    color: '#1a1a1e',
    icon: '🖥️',
    frontPanelImage: '/dell-poweredge-panel.png',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 15, speed: '10 Gbps' },
      { id: 'nic2', name: 'NIC 2', type: 'rj45', relativeX: 325, relativeY: 30, speed: '10 Gbps' },
      { id: 'nic3', name: 'NIC 3', type: 'rj45', relativeX: 325, relativeY: 45, speed: '10 Gbps' },
      { id: 'nic4', name: 'NIC 4', type: 'rj45', relativeX: 325, relativeY: 60, speed: '10 Gbps' },
      { id: 'nic5', name: 'NIC 5 (iDRAC)', type: 'management', relativeX: 325, relativeY: 75, speed: '1 Gbps' }
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
    frontPanelImage: '/dell-poweredge-panel.png',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 8, speed: '1 Gbps' },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 15, speed: '10 Gbps' },
      { id: 'nic3', name: 'NIC 3 (iDRAC)', type: 'management', relativeX: 325, relativeY: 22, speed: '1 Gbps' }
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
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 12, speed: '1 Gbps' },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 22, speed: '10 Gbps' },
      { id: 'nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 325, relativeY: 32, speed: '10 Gbps' },
      { id: 'nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 325, relativeY: 42, speed: '10 Gbps' },
      { id: 'nic5', name: 'NIC 5 (iDRAC)', type: 'management', relativeX: 325, relativeY: 52, speed: '1 Gbps' }
    ]
  },
  {
    id: 'hpe-dl210-3u',
    name: 'HPE ProLiant DL210 Gen11 (3U)',
    manufacturer: 'HPE',
    model: 'DL210-G11-3U',
    category: 'server',
    heightUnits: 3,
    color: '#161d20',
    icon: '🖥️',
    ports: [
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 15, speed: '1 Gbps' },
      { id: 'nic2', name: 'NIC 2', type: 'rj45', relativeX: 325, relativeY: 30, speed: '10 Gbps' },
      { id: 'nic3', name: 'NIC 3', type: 'rj45', relativeX: 325, relativeY: 45, speed: '10 Gbps' },
      { id: 'nic4', name: 'NIC 4', type: 'rj45', relativeX: 325, relativeY: 60, speed: '10 Gbps' },
      { id: 'nic5', name: 'NIC 5 (iDRAC)', type: 'management', relativeX: 325, relativeY: 75, speed: '1 Gbps' }
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
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 8, speed: '1 Gbps' },
      { id: 'nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 325, relativeY: 15, speed: '10 Gbps' },
      { id: 'nic3', name: 'NIC 3 (iDRAC)', type: 'management', relativeX: 325, relativeY: 22, speed: '1 Gbps' }
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
      { id: 'nic1', name: 'NIC 1', type: 'rj45', relativeX: 325, relativeY: 10, speed: '1 Gbps' },
      { id: 'nic2', name: 'NIC 2 (iDRAC)', type: 'management', relativeX: 325, relativeY: 20, speed: '1 Gbps' }
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
      { id: 'con0', name: 'Console', type: 'console', relativeX: 100, relativeY: 15, speed: '115.2 Kbps' },
      { id: 'port1', name: 'Port 1', type: 'sfp-plus', relativeX: 155, relativeY: 8, speed: '10 Gbps' },
      { id: 'port2', name: 'Port 2', type: 'sfp-plus', relativeX: 155, relativeY: 20, speed: '10 Gbps' },
      { id: 'port3', name: 'Port 3', type: 'sfp-plus', relativeX: 175, relativeY: 8, speed: '10 Gbps' },
      { id: 'port4', name: 'Port 4', type: 'sfp-plus', relativeX: 175, relativeY: 20, speed: '10 Gbps' },
      { id: 'port5', name: 'Port 5', type: 'sfp-plus', relativeX: 195, relativeY: 8, speed: '10 Gbps' },
      { id: 'port6', name: 'Port 6', type: 'sfp-plus', relativeX: 195, relativeY: 20, speed: '10 Gbps' },
      { id: 'port7', name: 'Port 7', type: 'sfp-plus', relativeX: 215, relativeY: 8, speed: '10 Gbps' },
      { id: 'port8', name: 'Port 8', type: 'sfp-plus', relativeX: 215, relativeY: 20, speed: '10 Gbps' },
      { id: 'port9', name: 'Port 9', type: 'sfp-plus', relativeX: 235, relativeY: 8, speed: '10 Gbps' },
      { id: 'port10', name: 'Port 10', type: 'sfp-plus', relativeX: 235, relativeY: 20, speed: '10 Gbps' },
      { id: 'port11', name: 'Port 11', type: 'rj45', relativeX: 260, relativeY: 8, speed: '10 Gbps' },
      { id: 'port12', name: 'Port 12', type: 'rj45', relativeX: 260, relativeY: 20, speed: '10 Gbps' }
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
      { id: 'con0', name: 'Console', type: 'console', relativeX: 25, relativeY: 15, speed: '115.2 Kbps' },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `port${i * 2 + 1}`,
        name: `Port ${i * 2 + 1}`,
        type: 'rj45' as const,
        relativeX: 60 + i * 20,
        relativeY: 8,
        speed: '1 Gbps'
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `port${i * 2 + 2}`,
        name: `Port ${i * 2 + 2}`,
        type: 'rj45' as const,
        relativeX: 60 + i * 20,
        relativeY: 20,
        speed: '1 Gbps'
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
      { id: 'con0', name: 'Console', type: 'console', relativeX: 20, relativeY: 15, speed: '115.2 Kbps' },
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `port${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 50 + i * 11,
        relativeY: 15,
        speed: '1 Gbps'
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
      { id: 'con0', name: 'Console', type: 'console', relativeX: 20, relativeY: 15, speed: '115.2 Kbps' },
      { id: 'mgmt0', name: 'Management', type: 'management', relativeX: 40, relativeY: 15, speed: '1 Gbps' },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `port${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 80 + i * 15,
        relativeY: 15,
        speed: '1 Gbps'
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
      { id: 'mgmt0', name: 'MGMT', type: 'management', relativeX: 30, relativeY: 30, speed: '1 Gbps' },
      { id: 'port1', name: 'Port 1', type: 'sfp-plus', relativeX: 300, relativeY: 20, speed: '10 Gbps' },
      { id: 'port2', name: 'Port 2', type: 'sfp-plus', relativeX: 320, relativeY: 20, speed: '10 Gbps' },
      { id: 'port3', name: 'Port 3', type: 'sfp-plus', relativeX: 300, relativeY: 40, speed: '10 Gbps' },
      { id: 'port4', name: 'Port 4', type: 'sfp-plus', relativeX: 320, relativeY: 40, speed: '10 Gbps' }
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
      { id: 'mgmt0', name: 'MGMT', type: 'management', relativeX: 325, relativeY: 30, speed: '1 Gbps' }
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
  },

  // Switch variants
  {
    id: 'switch-4p-1g',
    name: 'Switch 4-Port 1GbE',
    manufacturer: 'Generic',
    model: '4-Port Gigabit Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a237e',
    icon: '🔀',
    ports: Array.from({ length: 4 }, (_, i) => ({
      id: `sw4p-rj45-${i}`,
      name: `Gi0/${i + 1}`,
      type: 'rj45' as const,
      relativeX: 20 + i * 30,
      relativeY: 15,
      speed: '1G',
    })),
  },
  {
    id: 'switch-8p-1g',
    name: 'Switch 8-Port 1GbE',
    manufacturer: 'Generic',
    model: '8-Port Gigabit Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a237e',
    icon: '🔀',
    ports: Array.from({ length: 8 }, (_, i) => ({
      id: `sw8p-rj45-${i}`,
      name: `Gi0/${i + 1}`,
      type: 'rj45' as const,
      relativeX: 10 + i * 22,
      relativeY: 15,
      speed: '1G',
    })),
  },
  {
    id: 'switch-12p-1g',
    name: 'Switch 12-Port 1GbE',
    manufacturer: 'Generic',
    model: '12-Port Gigabit Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a237e',
    icon: '🔀',
    ports: Array.from({ length: 12 }, (_, i) => ({
      id: `sw12p-rj45-${i}`,
      name: `Gi0/${i + 1}`,
      type: 'rj45' as const,
      relativeX: 10 + i * 16,
      relativeY: 15,
      speed: '1G',
    })),
  },
  {
    id: 'switch-16p-1g',
    name: 'Switch 16-Port 1GbE',
    manufacturer: 'Generic',
    model: '16-Port Gigabit Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a237e',
    icon: '🔀',
    ports: Array.from({ length: 16 }, (_, i) => ({
      id: `sw16p-rj45-${i}`,
      name: `Gi0/${i + 1}`,
      type: 'rj45' as const,
      relativeX: 10 + i * 12,
      relativeY: 15,
      speed: '1G',
    })),
  },
  {
    id: 'switch-24p-10g',
    name: 'Switch 24-Port 10GbE',
    manufacturer: 'Generic',
    model: '24-Port 10GbE SFP+ Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#0d47a1',
    icon: '🔀',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `sw24p-sfp-${i}`,
      name: `Te0/${i + 1}`,
      type: 'sfp-plus' as const,
      relativeX: 10 + i * 10,
      relativeY: 15,
      speed: '10G',
    })),
  },
  {
    id: 'switch-48p-1g-4sfp',
    name: 'Switch 48-Port 1GbE + 4x SFP+',
    manufacturer: 'Generic',
    model: '48-Port 1GbE Access Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1565c0',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 48 }, (_, i) => ({
        id: `sw48p-rj45-${i}`,
        name: `Gi0/${i + 1}`,
        type: 'rj45' as const,
        relativeX: 6 + i * 6,
        relativeY: 10,
        speed: '1G',
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `sw48p-sfp-${i}`,
        name: `Te0/${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 310 + i * 16,
        relativeY: 10,
        speed: '10G',
      })),
    ],
  },

  // PDU variants
  {
    id: 'pdu-horizontal-basic',
    name: 'PDU Horizontal Basic',
    manufacturer: 'Generic',
    model: '1U Horizontal PDU 16A',
    category: 'pdu',
    heightUnits: 1,
    color: '#212121',
    icon: '🔌',
    ports: Array.from({ length: 8 }, (_, i) => ({
      id: `pdu-h-c13-${i}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 20 + i * 40,
      relativeY: 15,
    })),
  },
  {
    id: 'pdu-horizontal-smart',
    name: 'PDU Horizontal Smart (Metered)',
    manufacturer: 'Generic',
    model: '1U Smart PDU 32A',
    category: 'pdu',
    heightUnits: 1,
    color: '#1b5e20',
    icon: '🔌',
    ports: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `pdu-hs-c13-${i}`,
        name: `C13-${i + 1}`,
        type: 'power' as const,
        relativeX: 10 + i * 28,
        relativeY: 15,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `pdu-hs-c19-${i}`,
        name: `C19-${i + 1}`,
        type: 'power' as const,
        relativeX: 346 + i * 12,
        relativeY: 15,
      })),
    ],
  },
  {
    id: 'pdu-vertical-basic',
    name: 'PDU Vertical Basic',
    manufacturer: 'Generic',
    model: '0U Vertical PDU 32A',
    category: 'pdu',
    heightUnits: 2,
    color: '#37474f',
    icon: '🔌',
    ports: Array.from({ length: 16 }, (_, i) => ({
      id: `pdu-v-c13-${i}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 40,
      relativeY: 10 + i * 15,
    })),
  },
  {
    id: 'pdu-vertical-smart',
    name: 'PDU Vertical Smart (Metered + Switched)',
    manufacturer: 'Generic',
    model: '0U Smart Vertical PDU 32A',
    category: 'pdu',
    heightUnits: 2,
    color: '#1b5e20',
    icon: '🔌',
    ports: [
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `pdu-vs-c13-${i}`,
        name: `C13-${i + 1}`,
        type: 'power' as const,
        relativeX: 30,
        relativeY: 10 + i * 15,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `pdu-vs-c19-${i}`,
        name: `C19-${i + 1}`,
        type: 'power' as const,
        relativeX: 60,
        relativeY: 10 + i * 30,
      })),
    ],
  },

  // Patch Panels
  {
    id: 'patch-panel-24p-cat6',
    name: 'Patch Panel 24-Port Cat6',
    manufacturer: 'Generic',
    model: '1U 24-Port Cat6 Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#4a148c',
    icon: '🔲',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `pp24-rj45-${i}`,
      name: `P${i + 1}`,
      type: 'rj45' as const,
      relativeX: 8 + i * 14,
      relativeY: 15,
    })),
  },
  {
    id: 'patch-panel-48p-cat6',
    name: 'Patch Panel 48-Port Cat6',
    manufacturer: 'Generic',
    model: '2U 48-Port Cat6 Patch Panel',
    category: 'patch-panel',
    heightUnits: 2,
    color: '#4a148c',
    icon: '🔲',
    ports: Array.from({ length: 48 }, (_, i) => ({
      id: `pp48-rj45-${i}`,
      name: `P${i + 1}`,
      type: 'rj45' as const,
      relativeX: 4 + i * 7,
      relativeY: 20,
    })),
  },
  {
    id: 'patch-panel-24p-sfp',
    name: 'Fiber Patch Panel 24-Port SFP',
    manufacturer: 'Generic',
    model: '1U 24-Port LC Duplex Fiber Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#4a148c',
    icon: '🔲',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `fpp24-sfp-${i}`,
      name: `F${i + 1}`,
      type: 'sfp' as const,
      relativeX: 8 + i * 14,
      relativeY: 15,
    })),
  },

  // Router
  {
    id: 'router-1u-generic',
    name: 'Router 1U Enterprise',
    manufacturer: 'Generic',
    model: '1U Enterprise Router',
    category: 'router',
    heightUnits: 1,
    color: '#bf360c',
    icon: '🌐',
    ports: [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `rtr-wan-${i}`,
        name: `WAN${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 20 + i * 25,
        relativeY: 15,
        speed: '10G',
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `rtr-lan-${i}`,
        name: `LAN${i + 1}`,
        type: 'rj45' as const,
        relativeX: 130 + i * 22,
        relativeY: 15,
        speed: '1G',
      })),
    ],
  },

  // KVM and Console
  {
    id: 'kvm-8p',
    name: 'KVM Switch 8-Port',
    manufacturer: 'Generic',
    model: '1U 8-Port KVM over IP',
    category: 'server',
    heightUnits: 1,
    color: '#4e342e',
    icon: '🖥',
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `kvm-vga-${i}`,
        name: `KVM${i + 1}`,
        type: 'console' as const,
        relativeX: 20 + i * 40,
        relativeY: 15,
      })),
      { id: 'kvm-mgmt', name: 'MGMT', type: 'rj45' as const, relativeX: 360, relativeY: 15, speed: '1G' },
    ],
  },
  {
    id: 'console-server-16p',
    name: 'Console Server 16-Port',
    manufacturer: 'Generic',
    model: '1U 16-Port Serial Console Server',
    category: 'server',
    heightUnits: 1,
    color: '#4e342e',
    icon: '🖥',
    ports: [
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `cs-serial-${i}`,
        name: `Serial${i + 1}`,
        type: 'console' as const,
        relativeX: 10 + i * 22,
        relativeY: 15,
      })),
      { id: 'cs-mgmt', name: 'MGMT', type: 'rj45' as const, relativeX: 370, relativeY: 15, speed: '1G' },
    ],
  },

  // Additional blank and cable manager panels
  {
    id: 'blank-panel-1u',
    name: 'Blanking Panel 1U',
    manufacturer: 'Generic',
    model: '1U Blanking Panel',
    category: 'blank-panel',
    heightUnits: 1,
    color: '#333',
    icon: '▬',
    ports: [],
  },
  {
    id: 'cable-manager-1u',
    name: 'Horizontal Cable Manager 1U',
    manufacturer: 'Generic',
    model: '1U Horizontal Cable Manager',
    category: 'cable-manager',
    heightUnits: 1,
    color: '#1c1c1c',
    icon: '〰',
    ports: [],
  },
];

export function getTemplate(id: string): DeviceTemplate | undefined {
  return deviceCatalog.find(t => t.id === id);
}

export function getTemplatesByCategory(category: DeviceCategory): DeviceTemplate[] {
  return deviceCatalog.filter(t => t.category === category);
}
