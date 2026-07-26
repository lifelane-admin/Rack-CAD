import { CableData, Point, RACK_CONSTANTS } from '../core/types';
import { stateManager } from '../core/state';
import { getMaterialProfile } from '../core/cable-materials';
import { getTemplate } from '../library/device-catalog';

/**
 * Helper to get the orientation for a port connector.
 * If user explicitly overrides orientation, it takes precedence.
 * Otherwise, it auto-detects based on the port Y position relative to device height:
 * - Down side ports (bottom half) -> Cable exits UPWARD (orientation 'down')
 * - Up side ports (top half) -> Cable exits DOWNWARD (orientation 'up')
 */
export function getPortOrientation(
  cable: CableData,
  end: 'source' | 'dest'
): 'up' | 'down' | 'left' | 'right' {
  const portId = end === 'source' ? cable.sourcePortId : cable.destPortId;
  const isEarPort = portId && portId.includes('-ear-');

  const userOverride = end === 'source' ? cable.sourceOrientation : cable.destOrientation;
  if (userOverride && userOverride !== 'auto' && !isEarPort) {
    return userOverride;
  }

  const port = portId ? stateManager.getPort(portId) : null;
  if (!port) {
    return cable.sidePreference || 'right';
  }

  const device = stateManager.getDevice(port.deviceId);
  const template = device ? getTemplate(device.templateId) : null;
  const height = template ? template.heightUnits * 30 : 30;

  // Server-side / storage / ups devices ports align left/right horizontally
  if (device && (device.templateId.includes('server') || template?.category === 'server' || template?.category === 'storage' || template?.category === 'ups')) {
    return port.relativeX > 175 ? 'right' : 'left';
  }

  // Switch/patch panels / other network devices:
  // Top-row port (relativeY < height / 2) -> cable exits UPWARD (orientation 'down')
  // Bottom-row port (relativeY >= height / 2) -> cable exits DOWNWARD (orientation 'up')
  return port.relativeY < height / 2 ? 'down' : 'up';
}

/**
 * Helper to calculate the straight exit point based on position, orientation, and offset.
 */
export function getExitPoint(
  pos: Point,
  orientation: 'up' | 'down' | 'left' | 'right',
  offset: number
): Point {
  if (orientation === 'left') {
    return { x: pos.x - offset, y: pos.y };
  } else if (orientation === 'right') {
    return { x: pos.x + offset, y: pos.y };
  } else if (orientation === 'down') {
    // Connector faces down, cable tail exits upward
    return { x: pos.x, y: pos.y - offset };
  } else {
    // Connector faces up, cable tail exits downward
    return { x: pos.x, y: pos.y + offset };
  }
}

export function getDeterministicLaneIndex(
  cableId: string,
  rackId: string,
  side: 'left' | 'right'
): number {
  const s = stateManager.getState();
  
  const channelCables = s.cables.filter(c => {
    const srcPort = stateManager.getPort(c.sourcePortId);
    const destPort = c.destPortId ? stateManager.getPort(c.destPortId) : null;
    
    const srcDev = srcPort ? stateManager.getDevice(srcPort.deviceId) : null;
    const destDev = destPort ? stateManager.getDevice(destPort.deviceId) : null;
    
    const srcSide = c.sidePreference ?? (srcPort && srcPort.relativeX > 175 ? 'right' : 'left');
    const destSide = c.sidePreference ?? (destPort && destPort.relativeX > 175 ? 'right' : 'left');
    
    const usesSrc = srcDev && srcDev.rackId === rackId && srcSide === side;
    const usesDest = destDev && destDev.rackId === rackId && destSide === side;
    
    return usesSrc || usesDest;
  });
  
  channelCables.sort((a, b) => {
    const getPortY = (cab: CableData) => {
      const isSrc = cab.sourcePortId && stateManager.getPort(cab.sourcePortId);
      const port = isSrc ? stateManager.getPort(cab.sourcePortId) : (cab.destPortId ? stateManager.getPort(cab.destPortId) : null);
      if (!port) return 0;
      const dev = stateManager.getDevice(port.deviceId);
      if (!dev) return 0;
      return dev.startUnit * 30 + port.relativeY;
    };
    
    const yA = getPortY(a);
    const yB = getPortY(b);
    if (yA !== yB) return yA - yB;
    return a.id.localeCompare(b.id);
  });
  
  const idx = channelCables.findIndex(c => c.id === cableId);
  return idx >= 0 ? idx : 0;
}

export function computeSmartRouting(
  cable: CableData,
  sourcePos: Point,
  destPos: Point
): Point[] {
  const s = stateManager.getState();
  const sourcePort = stateManager.getPort(cable.sourcePortId);
  const destPort   = cable.destPortId ? stateManager.getPort(cable.destPortId) : null;

  if (!sourcePort) return [sourcePos, destPos];

  const sourceDevice = stateManager.getDevice(sourcePort.deviceId);
  const destDevice   = destPort ? stateManager.getDevice(destPort.deviceId) : null;

  const sourceRack = sourceDevice ? stateManager.getRack(sourceDevice.rackId) : null;
  const destRack   = destDevice   ? stateManager.getRack(destDevice.rackId)   : null;

  // ── Geometry constants (match rack-renderer.ts exactly) ──────────────────
  const INNER_X      = (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2; // 25
  const RIGHT_RAIL_X = INNER_X + RACK_CONSTANTS.RACK_INNER_WIDTH - RACK_CONSTANTS.RAIL_WIDTH;   // 400
  const LEFT_RAIL_X  = INNER_X;                                                                  // 25

  // Exact hole X on inner face of each rail post (matches rack-renderer.ts lines 116-117)
  const RIGHT_HOLE_X_LOCAL = RIGHT_RAIL_X + 6;  // 406 relative to rack.x
  const LEFT_HOLE_X_LOCAL  = LEFT_RAIL_X + RACK_CONSTANTS.RAIL_WIDTH - 6; // 44 relative to rack.x

  // ── Side preference ───────────────────────────────────────────────────────
  const sideSrc: 'left' | 'right' =
    cable.sidePreference ?? (sourcePort.relativeX > 175 ? 'right' : 'left');
  const sideDest: 'left' | 'right' =
    cable.sidePreference ?? (destPort ? (destPort.relativeX > 175 ? 'right' : 'left') : sideSrc);

  // ── World-space hole X ────────────────────────────────────────────────────
  const holeXSrc  = sourceRack
    ? (sideSrc  === 'right' ? sourceRack.x + RIGHT_HOLE_X_LOCAL : sourceRack.x + LEFT_HOLE_X_LOCAL)
    : sourcePos.x;

  const holeXDest = destRack
    ? (sideDest === 'right' ? destRack.x + RIGHT_HOLE_X_LOCAL   : destRack.x + LEFT_HOLE_X_LOCAL)
    : destPos.x;

  // ── Lane staggering (deterministic rack-channel routing) ─────────────────
  const laneSrc = sourceRack ? getDeterministicLaneIndex(cable.id, sourceRack.id, sideSrc) : 0;
  const laneDest = destRack ? getDeterministicLaneIndex(cable.id, destRack.id, sideDest) : 0;
  const LANE_STEP = 3; // px

  const getLaneX = (holeX: number, side: 'left' | 'right', lane: number) =>
    side === 'right' ? holeX + lane * LANE_STEP : holeX - lane * LANE_STEP;

  const laneXSrc  = getLaneX(holeXSrc,  sideSrc, laneSrc);
  const laneXDest = getLaneX(holeXDest, sideDest, laneDest);

  // ── Connector exits ───────────────────────────────────────────────────────
  const srcOrient = getPortOrientation(cable, 'source');
  const destOrient = getPortOrientation(cable, 'dest');
  const exitOffset = cable.exitStraightOffset ?? 15; // px

  const srcExit = getExitPoint(sourcePos, srcOrient, exitOffset);
  const destExit = getExitPoint(destPos, destOrient, exitOffset);

  // ── Smart Routing Logic & Obstacle Avoidance ──────────────────────────────
  
  // Case 1: Floating or Dragging cable end (no destination rack yet)
  if (!sourceRack || !destRack) {
    const A1: Point = { x: laneXSrc,  y: srcExit.y };
    const A2: Point = { x: laneXDest, y: destExit.y   };
    return [srcExit, A1, A2, destExit];
  }

  // Case 2: Cross-Rack Cabling (Overhead vs Underfloor routing)
  if (sourceRack.id !== destRack.id) {
    const s = stateManager.getState();
    const isUnderfloor = s.cableRoutingTrayMode === 'underfloor';
    
    if (isUnderfloor) {
      const hSrc = RACK_CONSTANTS.RACK_PADDING_TOP + sourceRack.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
      const hDest = RACK_CONSTANTS.RACK_PADDING_TOP + destRack.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
      const maxBottomY = Math.max(sourceRack.y + hSrc, destRack.y + hDest);
      const trayY = maxBottomY + 45; // Underfloor tray 45px below the cabinets

      const A1: Point = { x: laneXSrc, y: srcExit.y };
      const A1_bottom: Point = { x: laneXSrc, y: sourceRack.y + hSrc - 10 };
      const A1_tray: Point = { x: laneXSrc, y: trayY };

      const A2_tray: Point = { x: laneXDest, y: trayY };
      const A2_bottom: Point = { x: laneXDest, y: destRack.y + hDest - 10 };
      const A2: Point = { x: laneXDest, y: destExit.y };

      return [srcExit, A1, A1_bottom, A1_tray, A2_tray, A2_bottom, A2, destExit];
    } else {
      const minRackY = Math.min(sourceRack.y, destRack.y);
      const trayY = minRackY - 45; // Overhead runway 45px above the cabinets

      const A1: Point = { x: laneXSrc, y: srcExit.y };
      const A1_top: Point = { x: laneXSrc, y: sourceRack.y + 10 };
      const A1_tray: Point = { x: laneXSrc, y: trayY };

      const A2_tray: Point = { x: laneXDest, y: trayY };
      const A2_top: Point = { x: laneXDest, y: destRack.y + 10 };
      const A2: Point = { x: laneXDest, y: destExit.y };

      return [srcExit, A1, A1_top, A1_tray, A2_tray, A2_top, A2, destExit];
    }
  }

  // Case 3: Same Rack Routing
  // Case 3a: Same side gutter run
  if (sideSrc === sideDest) {
    const A1: Point = { x: laneXSrc,  y: srcExit.y };
    const A2: Point = { x: laneXDest, y: destExit.y   };
    return [srcExit, A1, A2, destExit];
  }

  // Case 3b: Cross-side run within the same rack (opposite side gutters)
  const rackTopY = sourceRack.y + 10;
  const rackBottomY = sourceRack.y + RACK_CONSTANTS.RACK_PADDING_TOP + sourceRack.units * RACK_CONSTANTS.RU_HEIGHT + 15;
  
  const avgY = (srcExit.y + destExit.y) / 2;
  const crossY = Math.abs(avgY - rackTopY) < Math.abs(avgY - rackBottomY) ? rackTopY : rackBottomY;

  const A1: Point = { x: laneXSrc, y: srcExit.y };
  const A1_cross: Point = { x: laneXSrc, y: crossY };
  const A2_cross: Point = { x: laneXDest, y: crossY };
  const A2: Point = { x: laneXDest, y: destExit.y };

  return [srcExit, A1, A1_cross, A2_cross, A2, destExit];
}

/**
 * Downsamples any list of points to exactly 3 points (first, middle, last).
 * This ensures that when the user customizes or locks a cable, it starts with exactly 3 default anchor points.
 */
export function get3DefaultAnchors(pts: Point[]): Point[] {
  if (pts.length === 3) return pts;
  if (pts.length < 3) {
    if (pts.length === 0) return [];
    if (pts.length === 1) return [pts[0], pts[0], pts[0]];
    const p0 = pts[0];
    const p1 = pts[1];
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    return [p0, mid, p1];
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  const midIdx = Math.floor(pts.length / 2);
  const middle = pts[midIdx];
  return [first, middle, last];
}

export function getExitDirection(
  sourcePos: Point,
  mousePos: Point,
): 'up' | 'down' | 'left' | 'right' {
  const dx = mousePos.x - sourcePos.x;
  const dy = mousePos.y - sourcePos.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}
