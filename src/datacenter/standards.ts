import { DcRackType, DcDoorStyle, DcMounting, DcSpacingStandard } from './types';

export interface RackPreset {
  id: string;
  name: string;
  type: DcRackType;
  widthMm: number;
  depthMm: number;
  heightU: number;
  manufacturer: string;
  model: string;
  doorStyle: DcDoorStyle;
  mounting: DcMounting;
  color: string;
}

export const RACK_PRESETS: RackPreset[] = [
  {
    id: 'apc-42u-server',
    name: 'APC NetShelter SX 42U Server Cabinet',
    type: 'server',
    widthMm: 600,
    depthMm: 1075,
    heightU: 42,
    manufacturer: 'APC Schneider',
    model: 'AR3100',
    doorStyle: 'perforated',
    mounting: 'floor',
    color: '#1e3a5f',
  },
  {
    id: 'apc-48u-deep-server',
    name: 'APC NetShelter SX 48U Deep Server Cabinet',
    type: 'server',
    widthMm: 750,
    depthMm: 1200,
    heightU: 48,
    manufacturer: 'APC Schneider',
    model: 'AR3357',
    doorStyle: 'perforated',
    mounting: 'floor',
    color: '#1e3a5f',
  },
  {
    id: 'eaton-45u-network',
    name: 'Eaton RS 45U Telecom Network Cabinet',
    type: 'network',
    widthMm: 800,
    depthMm: 1000,
    heightU: 45,
    manufacturer: 'Eaton',
    model: 'RS-45U810',
    doorStyle: 'perforated',
    mounting: 'floor',
    color: '#1a4731',
  },
  {
    id: 'tripp-42u-network',
    name: 'Tripp Lite SmartRack 42U High-Density Network Cabinet',
    type: 'network',
    widthMm: 800,
    depthMm: 1200,
    heightU: 42,
    manufacturer: 'Tripp Lite',
    model: 'SRW42UBWD',
    doorStyle: 'perforated',
    mounting: 'floor',
    color: '#1e293b',
  },
  {
    id: 'startech-42u-openframe',
    name: 'StarTech 42U 4-Post Open Frame Relay Rack',
    type: 'open-frame',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    manufacturer: 'StarTech',
    model: '4POSTRACK42U',
    doorStyle: 'none',
    mounting: 'floor',
    color: '#334155',
  },
  {
    id: 'tripp-12u-wallmount',
    name: 'Tripp Lite 12U Wall-Mount Enclosure Cabinet',
    type: 'wall-mount',
    widthMm: 600,
    depthMm: 600,
    heightU: 12,
    manufacturer: 'Tripp Lite',
    model: 'SRW12US',
    doorStyle: 'glass',
    mounting: 'wall-mount',
    color: '#2d1f4e',
  },
];

export interface SpacingStandardInfo {
  id: DcSpacingStandard;
  label: string;
  gapM: number;
  gapMm: number;
  gapFt: number;
  description: string;
  standardDoc: string;
}

export const SPACING_STANDARDS: SpacingStandardInfo[] = [
  {
    id: 'bayed-0mm',
    label: 'Zero Clearance / Bayed Continuous Row (0 mm)',
    gapM: 0,
    gapMm: 0,
    gapFt: 0,
    description: 'Racks bolted side-by-side using in-row baying kits.',
    standardDoc: 'TIA-942 / EN 50600 Bayed Row Standard',
  },
  {
    id: 'cold-aisle-1.2m',
    label: 'TIA-942 Standard Cold Aisle (1.2m / 4.0 ft / 1200 mm)',
    gapM: 1.2,
    gapMm: 1200,
    gapFt: 3.94,
    description: 'Recommended minimum front-to-front maintenance and airflow aisle.',
    standardDoc: 'TIA-942-B Section 6.4 / ASHRAE TC 9.9',
  },
  {
    id: 'cold-aisle-1.5m',
    label: 'High-Density Cold Aisle (1.5m / 5.0 ft / 1500 mm)',
    gapM: 1.5,
    gapMm: 1500,
    gapFt: 4.92,
    description: 'Expanded front clearance for liquid-cooled chassis & heavy equipment lifting.',
    standardDoc: 'ASHRAE TC 9.9 High-Density Guidelines',
  },
  {
    id: 'hot-aisle-0.9m',
    label: 'TIA-942 Standard Hot Aisle (0.9m / 3.0 ft / 900 mm)',
    gapM: 0.9,
    gapMm: 900,
    gapFt: 2.95,
    description: 'Recommended rear-to-rear clearance for cabling & dual vertical PDU access.',
    standardDoc: 'TIA-942-B Section 6.5 / ISO/IEC 22237',
  },
  {
    id: 'hot-aisle-1.2m',
    label: 'Wide Hot Aisle (1.2m / 4.0 ft / 1200 mm)',
    gapM: 1.2,
    gapMm: 1200,
    gapFt: 3.94,
    description: 'Wide rear aisle for heavy cable trays, busways & maintenance clearance.',
    standardDoc: 'EN 50600-2-2 Power & Cabling Infrastructure',
  },
  {
    id: 'inrow-300mm',
    label: 'In-Row Air Conditioner / Manager Gap (300 mm / 12 in)',
    gapM: 0.3,
    gapMm: 300,
    gapFt: 0.98,
    description: '300mm gap for in-row cooling units or high-density vertical cable managers.',
    standardDoc: 'ASHRAE Thermal Guidelines',
  },
  {
    id: 'inrow-600mm',
    label: 'In-Row Cooler / Extra Service Gap (600 mm / 24 in)',
    gapM: 0.6,
    gapMm: 600,
    gapFt: 1.97,
    description: '600mm full tile width gap for dedicated cooling modules or service aisle.',
    standardDoc: 'ISO/IEC 22237 Datacenter Infrastructure',
  },
];
