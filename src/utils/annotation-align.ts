// Shared "center on rack" helper for TextToolPanel/ImageToolPanel's Center Horizontally button —
// finding "the rack this annotation is sitting over" so a label/image can be snapped to line up
// exactly with that rack's horizontal center, instead of the user eyeballing pixel offsets.
import { RackData, RACK_CONSTANTS } from '../core/types';

/**
 * Picks the rack most relevant to a point at (x, y): prefers one whose vertical span actually
 * contains y (the common case — the label/image sits directly over/near that rack's body),
 * falling back to whichever rack's horizontal center is closest to x if none does (e.g. the
 * item was dropped above/below every rack). Returns null if there are no racks at all.
 */
export function findNearestRack(racks: RackData[], x: number, y: number): RackData | null {
  if (racks.length === 0) return null;

  // Racks are commonly placed in a row at the same y — every one of them can "vertically
  // contain" a given y at once, so pick the horizontally closest AMONG those matches rather
  // than just the first one in array order (which would always favor the leftmost rack).
  const containing = racks.filter(r => {
    const top = r.y;
    const bottom = r.y + RACK_CONSTANTS.RACK_PADDING_TOP + r.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
    return y >= top && y <= bottom;
  });
  const candidates = containing.length > 0 ? containing : racks;

  return candidates.reduce((closest, r) => {
    const rCenter = r.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
    const closestCenter = closest.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
    return Math.abs(rCenter - x) < Math.abs(closestCenter - x) ? r : closest;
  });
}

export function rackCenterX(rack: RackData): number {
  return rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
}
