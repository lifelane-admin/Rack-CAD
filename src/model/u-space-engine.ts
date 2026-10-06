/**
 * Deterministic Rack U-Space Engine
 * Handles rack unit collision detection, bounds verification, and utilization metrics.
 */

import { PhysicalRack, PhysicalObject } from './types';

export interface UValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RackMetrics {
  totalU: number;
  usedU: number;
  freeU: number;
  reservedU: number;
  blockedU: number;
  utilizationPercent: number;
  powerWatts: number;
  weightKg: number;
}

export class USpaceEngine {
  /**
   * Validates placement of an object in a rack.
   * Prevents:
   * - Objects extending past rack top (uEnd > rackSizeU)
   * - Objects starting below rack bottom (uStart < 1)
   * - Overlaps with existing objects in the same rack
   * - Partially occupied or fractional U positions
   */
  static validatePlacement(
    rack: PhysicalRack,
    existingObjects: PhysicalObject[],
    candidate: { objectId?: string; uStart: number; heightU: number; category?: string; subCategory?: string }
  ): UValidationResult {
    const errors: string[] = [];
    const { objectId, uStart, heightU } = candidate;

    // 0U side-mount vertical equipment (Vertical PDUs, 0U managers) does not occupy horizontal RU slots
    const isZeroU =
      heightU === 0 ||
      uStart === 0 ||
      (candidate as any).isZeroU ||
      candidate.category === 'power' && uStart === 0 ||
      candidate.subCategory?.toLowerCase().includes('vertical');

    if (isZeroU) {
      return { valid: true, errors: [] };
    }

    if (!Number.isInteger(uStart) || uStart < 1) {
      errors.push(`Invalid U position: uStart must be an integer >= 1 (got ${uStart}).`);
    }

    if (!Number.isInteger(heightU) || heightU < 1) {
      errors.push(`Invalid equipment height: heightU must be an integer >= 1 (got ${heightU}).`);
    }

    const uEnd = uStart + heightU - 1;

    if (uEnd > rack.rackSizeU) {
      errors.push(
        `Rack overflow: Object occupies U${uStart}-U${uEnd}, exceeding rack height of ${rack.rackSizeU}U.`
      );
    }

    // Check collisions with other objects in this rack
    const objectsInRack = existingObjects.filter(
      obj => obj.rackId === rack.rackId && obj.objectId !== objectId && obj.heightU > 0 && obj.uStart > 0 && !obj.subCategory?.toLowerCase().includes('vertical')
    );

    for (const obj of objectsInRack) {
      // Overlap condition: max(uStart, obj.uStart) <= min(uEnd, obj.uEnd)
      const overlapStart = Math.max(uStart, obj.uStart);
      const overlapEnd = Math.min(uEnd, obj.uEnd);

      if (overlapStart <= overlapEnd) {
        errors.push(
          `U collision: Candidate occupies U${uStart}-U${uEnd}, overlapping with ${obj.objectName} (${obj.objectId}) at U${obj.uStart}-U${obj.uEnd}.`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generates a 1-based occupancy map: U number -> objectId or null
   */
  static getOccupancyMap(rack: PhysicalRack, objectsInRack: PhysicalObject[]): Map<number, PhysicalObject | null> {
    const map = new Map<number, PhysicalObject | null>();
    for (let u = 1; u <= rack.rackSizeU; u++) {
      map.set(u, null);
    }

    for (const obj of objectsInRack) {
      for (let u = obj.uStart; u <= obj.uEnd; u++) {
        if (u >= 1 && u <= rack.rackSizeU) {
          map.set(u, obj);
        }
      }
    }

    return map;
  }

  /**
   * Computes comprehensive rack utilization metrics.
   */
  static calculateMetrics(rack: PhysicalRack, objectsInRack: PhysicalObject[]): RackMetrics {
    const occupancy = this.getOccupancyMap(rack, objectsInRack);
    let usedU = 0;
    let powerWatts = 0;
    let weightKg = 0;

    for (let u = 1; u <= rack.rackSizeU; u++) {
      if (occupancy.get(u) !== null) {
        usedU++;
      }
    }

    for (const obj of objectsInRack) {
      powerWatts += obj.powerWatts || 0;
      weightKg += obj.weight || 0;
    }

    const totalU = rack.rackSizeU;
    const reservedU = rack.reservedU || 0;
    const blockedU = rack.blockedU || 0;
    const freeU = Math.max(0, totalU - usedU - reservedU - blockedU);
    const utilizationPercent = totalU > 0 ? Math.round((usedU / totalU) * 1000) / 10 : 0;

    return {
      totalU,
      usedU,
      freeU,
      reservedU,
      blockedU,
      utilizationPercent,
      powerWatts,
      weightKg,
    };
  }

  /**
   * Finds the lowest available contiguous U-slot for a given height.
   */
  static findFirstAvailableSlot(
    rack: PhysicalRack,
    objectsInRack: PhysicalObject[],
    heightU: number
  ): number | null {
    const occupancy = this.getOccupancyMap(rack, objectsInRack);

    for (let u = 1; u <= rack.rackSizeU - heightU + 1; u++) {
      let isFree = true;
      for (let offset = 0; offset < heightU; offset++) {
        if (occupancy.get(u + offset) !== null) {
          isFree = false;
          break;
        }
      }
      if (isFree) return u;
    }

    return null;
  }
}
