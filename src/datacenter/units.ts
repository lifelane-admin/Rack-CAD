import { DcUnit } from './types';

export interface DistanceMetrics {
  meters: number;
  mm: number;
  feet: number;
  inches: number;
}

export function metersToAll(meters: number): DistanceMetrics {
  const mm = Math.round(meters * 1000);
  const feet = meters * 3.280839895;
  const inches = meters * 39.37007874;
  return { meters, mm, feet, inches };
}

export function mmToAll(mm: number): DistanceMetrics {
  return metersToAll(mm / 1000);
}

export function unitToMeters(val: number, unit: DcUnit): number {
  switch (unit) {
    case 'm': return val;
    case 'mm': return val / 1000;
    case 'ft': return val / 3.280839895;
    case 'in': return val / 39.37007874;
  }
}

export function metersToUnit(meters: number, unit: DcUnit): number {
  switch (unit) {
    case 'm': return meters;
    case 'mm': return meters * 1000;
    case 'ft': return meters * 3.280839895;
    case 'in': return meters * 39.37007874;
  }
}

export function unitToMm(val: number, unit: DcUnit): number {
  return unitToMeters(val, unit) * 1000;
}

export function mmToUnit(mm: number, unit: DcUnit): number {
  return metersToUnit(mm / 1000, unit);
}

export function getUnitName(unit: DcUnit): string {
  switch (unit) {
    case 'm': return 'Meters (m)';
    case 'mm': return 'Millimeters (mm)';
    case 'ft': return 'Feet (ft)';
    case 'in': return 'Inches (in)';
  }
}

export function getUnitSymbol(unit: DcUnit): string {
  switch (unit) {
    case 'm': return 'm';
    case 'mm': return 'mm';
    case 'ft': return 'ft';
    case 'in': return 'in';
  }
}

export function formatSingleDistance(meters: number, primaryUnit: DcUnit = 'm'): string {
  const { mm, feet, inches } = metersToAll(meters);
  const valPrimary = metersToUnit(meters, primaryUnit);
  const sym = getUnitSymbol(primaryUnit);

  let formattedPrimary = '';
  if (primaryUnit === 'm') formattedPrimary = `${valPrimary.toFixed(2)}m`;
  else if (primaryUnit === 'mm') formattedPrimary = `${Math.round(valPrimary).toLocaleString()}mm`;
  else if (primaryUnit === 'ft') formattedPrimary = `${valPrimary.toFixed(2)}ft`;
  else if (primaryUnit === 'in') formattedPrimary = `${valPrimary.toFixed(1)}in`;

  return `${formattedPrimary} (${meters.toFixed(2)}m | ${mm.toLocaleString()}mm | ${feet.toFixed(2)}ft | ${inches.toFixed(1)}in)`;
}

export function formatDimensionsMeters(lengthM: number, widthM: number, primaryUnit: DcUnit = 'm'): string {
  const l = metersToAll(lengthM);
  const w = metersToAll(widthM);
  const lPri = metersToUnit(lengthM, primaryUnit);
  const wPri = metersToUnit(widthM, primaryUnit);
  const sym = getUnitSymbol(primaryUnit);

  let priStr = `${lPri.toFixed(1)}${sym} × ${wPri.toFixed(1)}${sym}`;
  if (primaryUnit === 'mm') priStr = `${Math.round(lPri).toLocaleString()} × ${Math.round(wPri).toLocaleString()} mm`;

  return `${priStr} (${lengthM}m × ${widthM}m | ${l.feet.toFixed(1)}′ × ${w.feet.toFixed(1)}′ | ${l.mm.toLocaleString()} × ${w.mm.toLocaleString()}mm | ${l.inches.toFixed(0)}″ × ${w.inches.toFixed(0)}″)`;
}

export function formatDimensionsMm(widthMm: number, depthMm: number, primaryUnit: DcUnit = 'mm'): string {
  const w = mmToAll(widthMm);
  const d = mmToAll(depthMm);
  const wPri = mmToUnit(widthMm, primaryUnit);
  const dPri = mmToUnit(depthMm, primaryUnit);
  const sym = getUnitSymbol(primaryUnit);

  let priStr = `${widthMm} × ${depthMm}mm`;
  if (primaryUnit === 'm') priStr = `${wPri.toFixed(2)} × ${dPri.toFixed(2)}m`;
  else if (primaryUnit === 'ft') priStr = `${wPri.toFixed(2)} × ${dPri.toFixed(2)}ft`;
  else if (primaryUnit === 'in') priStr = `${wPri.toFixed(1)} × ${dPri.toFixed(1)}in`;

  return `${priStr} (${w.meters.toFixed(2)} × ${d.meters.toFixed(2)}m | ${w.feet.toFixed(2)}′ × ${d.feet.toFixed(2)}′ | ${w.inches.toFixed(1)}″ × ${d.inches.toFixed(1)}″)`;
}

export function formatRackHeight(heightU: number): string {
  const mm = Math.round(heightU * 44.45); // 1U = 44.45 mm (1.75 in)
  const meters = mm / 1000;
  const feet = meters * 3.28084;
  const inches = heightU * 1.75;
  return `${heightU}U (${mm}mm | ${meters.toFixed(2)}m | ${feet.toFixed(2)}ft | ${inches.toFixed(1)}in)`;
}

export function formatArea(lengthM: number, widthM: number): string {
  const sqM = lengthM * widthM;
  const sqFt = sqM * 10.7639104;
  return `${sqM.toFixed(1)} m² (${sqFt.toFixed(1)} sq ft)`;
}
