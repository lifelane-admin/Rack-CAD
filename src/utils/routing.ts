import { CableData, Point } from '../core/types';
import { stateManager } from '../core/state';
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
  const srcOrient  = getPortOrientation(cable, 'source');
  const destOrient = getPortOrientation(cable, 'dest');
  const exitOffset = cable.exitStraightOffset ?? 15;

  const srcExit  = getExitPoint(sourcePos, srcOrient,  exitOffset);
  const destExit = getExitPoint(destPos,   destOrient, exitOffset);

  const mid: Point = {
    x: (srcExit.x + destExit.x) / 2,
    y: (srcExit.y + destExit.y) / 2,
  };

  return [srcExit, mid, destExit];
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
