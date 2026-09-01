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

export function formatSingleDistance(meters: number): string {
  const { mm, feet, inches } = metersToAll(meters);
  return `${meters.toFixed(2)}m | ${mm.toLocaleString()}mm | ${feet.toFixed(2)}ft | ${inches.toFixed(1)}in`;
}

export function formatDimensionsMeters(lengthM: number, widthM: number): string {
  const l = metersToAll(lengthM);
  const w = metersToAll(widthM);
  return `${lengthM}m × ${widthM}m (${l.feet.toFixed(1)}′ × ${w.feet.toFixed(1)}′ | ${l.mm.toLocaleString()} × ${w.mm.toLocaleString()}mm | ${l.inches.toFixed(0)}″ × ${w.inches.toFixed(0)}″)`;
}

export function formatDimensionsMm(widthMm: number, depthMm: number): string {
  const w = mmToAll(widthMm);
  const d = mmToAll(depthMm);
  return `${widthMm} × ${depthMm}mm (${w.meters.toFixed(2)} × ${d.meters.toFixed(2)}m | ${w.feet.toFixed(2)}′ × ${d.feet.toFixed(2)}′ | ${w.inches.toFixed(1)}″ × ${d.inches.toFixed(1)}″)`;
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
