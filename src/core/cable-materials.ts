import { CableType } from './types';

export interface CableMaterialProfile {
  name: string;
  category: string;
  outerDiameterMm: number;
  renderThicknessPx: number;
  minBendRadiusMm: number;
  weightPerMeterKg: number;
  defaultColor: string;
  roughness: number; // 0 (mirror gloss) to 1 (full matte rubber)
  gloss: number;     // Specular intensity
  exitStraightOffsetPx: number;
  jacketMaterial: 'LSZH' | 'PVC' | 'TPE' | 'Braided' | 'Rubber';
}

export const CABLE_MATERIAL_CATALOG: Record<string, CableMaterialProfile> = {
  'cat6': {
    name: 'Category 6 U/UTP',
    category: 'copper-ethernet',
    outerDiameterMm: 6.2,
    renderThicknessPx: 3.2,
    minBendRadiusMm: 25,
    weightPerMeterKg: 0.045,
    defaultColor: '#1e88e5',
    roughness: 0.25,
    gloss: 0.75,
    exitStraightOffsetPx: 18,
    jacketMaterial: 'LSZH'
  },
  'cat6a': {
    name: 'Category 6A S/FTP Shielded',
    category: 'copper-ethernet',
    outerDiameterMm: 7.8,
    renderThicknessPx: 4.2,
    minBendRadiusMm: 32,
    weightPerMeterKg: 0.062,
    defaultColor: '#fb8c00',
    roughness: 0.2,
    gloss: 0.8,
    exitStraightOffsetPx: 22,
    jacketMaterial: 'LSZH'
  },
  'cat8': {
    name: 'Category 8.1 40GbE Shielded',
    category: 'copper-ethernet',
    outerDiameterMm: 8.4,
    renderThicknessPx: 4.8,
    minBendRadiusMm: 40,
    weightPerMeterKg: 0.078,
    defaultColor: '#8e24aa',
    roughness: 0.15,
    gloss: 0.85,
    exitStraightOffsetPx: 24,
    jacketMaterial: 'LSZH'
  },
  'om4': {
    name: 'Multi-Mode OM4 Aqua Fiber (50/125µm)',
    category: 'fiber-optic',
    outerDiameterMm: 3.0,
    renderThicknessPx: 2.5,
    minBendRadiusMm: 15,
    weightPerMeterKg: 0.012,
    defaultColor: '#00acc1',
    roughness: 0.1,
    gloss: 0.9,
    exitStraightOffsetPx: 16,
    jacketMaterial: 'LSZH'
  },
  'om5': {
    name: 'Multi-Mode OM5 Lime Green Fiber',
    category: 'fiber-optic',
    outerDiameterMm: 3.0,
    renderThicknessPx: 2.5,
    minBendRadiusMm: 15,
    weightPerMeterKg: 0.012,
    defaultColor: '#43a047',
    roughness: 0.1,
    gloss: 0.9,
    exitStraightOffsetPx: 16,
    jacketMaterial: 'LSZH'
  },
  'dac-twinax': {
    name: '10G/25G Direct Attach Copper Twinax',
    category: 'dac',
    outerDiameterMm: 5.5,
    renderThicknessPx: 3.8,
    minBendRadiusMm: 30,
    weightPerMeterKg: 0.085,
    defaultColor: '#37474f',
    roughness: 0.3,
    gloss: 0.7,
    exitStraightOffsetPx: 26,
    jacketMaterial: 'PVC'
  },
  'qsfp28': {
    name: '100G QSFP28 Direct Attach Cable',
    category: 'dac',
    outerDiameterMm: 6.8,
    renderThicknessPx: 4.5,
    minBendRadiusMm: 38,
    weightPerMeterKg: 0.120,
    defaultColor: '#607d8b',
    roughness: 0.25,
    gloss: 0.75,
    exitStraightOffsetPx: 28,
    jacketMaterial: 'PVC'
  },
  'c13-power': {
    name: 'IEC C13/C14 Heavy Duty AC Power (15A)',
    category: 'power',
    outerDiameterMm: 9.5,
    renderThicknessPx: 5.2,
    minBendRadiusMm: 45,
    weightPerMeterKg: 0.140,
    defaultColor: '#212529',
    roughness: 0.4,
    gloss: 0.6,
    exitStraightOffsetPx: 24,
    jacketMaterial: 'Rubber'
  },
  'c19-power': {
    name: 'IEC C19/C20 High Current AC Power (20A)',
    category: 'power',
    outerDiameterMm: 11.2,
    renderThicknessPx: 6.0,
    minBendRadiusMm: 55,
    weightPerMeterKg: 0.190,
    defaultColor: '#212529',
    roughness: 0.4,
    gloss: 0.6,
    exitStraightOffsetPx: 28,
    jacketMaterial: 'Rubber'
  }
};

export function getMaterialProfile(type: CableType | string): CableMaterialProfile {
  return CABLE_MATERIAL_CATALOG[type] || CABLE_MATERIAL_CATALOG['cat6a'];
}
