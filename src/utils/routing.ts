import { CableData, Point, PortData, DeviceData, RackData } from '../core/types';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';

/**
 * Helper to get the orientation for a port connector.
 * If user explicitly overrides orientation, it takes precedence.
 * Otherwise, it auto-detects based on device type:
 * - Server devices & ear ports: horizontal ('left' / 'right')
 * - Switches & patch panels: vertical ('inward' / 'up' / 'down')
 */
export function getPortOrientation(
  cable: CableData,
  end: 'source' | 'dest'
): 'up' | 'down' | 'left' | 'right' | 'inward' {
  const portId = end === 'source' ? cable.sourcePortId : cable.destPortId;
  const isEarPort = portId && portId.includes('-ear-');

  const port = portId ? stateManager.getPort(portId) : null;
  const isPower = cable.powerCableType === 'power'
    || cable.type?.includes('power')
    || (port && port.type === 'power')
    || (portId && portId.startsWith('outlet-'));

  const userOverride = end === 'source' ? cable.sourceOrientation : cable.destOrientation;
  if (userOverride && userOverride !== 'auto') {
    // Only allow direction changes on standard ports or specifically on Earblade POWER ports
    if (!isEarPort || isPower || port?.type === 'power' || port?.name?.toLowerCase().includes('power')) {
      return userOverride;
    }
  }

  // Ear ports always exit horizontally through the cable manager channel,
  // even when they carry power — putting them 'down' triggers the down↔down
  // U-bend shortcut and the cable never reaches the VCM channel.
  if (isEarPort) {
    if (!port) return cable.sidePreference === 'right' ? 'right' : 'left';
    return port.relativeX > 175 ? 'right' : 'left';
  }

  // Power ports / PDU outlets: vertical plug-in orientation
  if (isPower) {
    return 'down';
  }

  if (!port) {
    return cable.sidePreference || 'right';
  }

  const s = stateManager.getState();
  const device = stateManager.getDevice(port.deviceId);
  const template = device ? getTemplate(device.templateId, s.customTemplates || []) : null;

  // Server-side / storage / ups devices ports align left/right horizontally
  if (device && (device.templateId.includes('server') || template?.category === 'server' || template?.category === 'storage' || template?.category === 'ups')) {
    return port.relativeX > 175 ? 'right' : 'left';
  }

  // Switches / patch panels / network devices:
  // Intelligent top row vs bottom row alignment
  if (device && template) {
    const deviceH = (template.heightUnits || 1) * 30;
    // Top row (relativeY in upper half, or odd port number like port 1, 3, 5...) -> 'up'
    if (port.relativeY !== undefined && port.relativeY < deviceH / 2) {
      return 'up';
    }
    // Bottom row (relativeY in lower half, or even port number like port 2, 4, 6...) -> 'down'
    if (port.relativeY !== undefined && port.relativeY >= deviceH / 2) {
      return 'down';
    }
  }

  // Fallback for switches/patch panels based on port name or id
  if (port.name) {
    const portNumMatch = port.name.match(/\d+/);
    if (portNumMatch) {
      const portNum = parseInt(portNumMatch[0], 10);
      return (portNum % 2 === 1) ? 'up' : 'down';
    }
  }

  return 'up';
}

/**
 * Helper to calculate the straight exit point based on position, orientation, and offset.
 */
export function getExitPoint(
  pos: Point,
  orientation: 'up' | 'down' | 'left' | 'right' | 'inward' | string,
  offset: number,
  targetPos?: Point
): Point {
  if (orientation === 'inward') {
    const isUp = targetPos ? targetPos.y < pos.y : false;
    return { x: pos.x, y: pos.y + (isUp ? -offset : offset) };
  }
  if (orientation === 'left') {
    return { x: pos.x - offset, y: pos.y };
  } else if (orientation === 'right') {
    return { x: pos.x + offset, y: pos.y };
  } else if (orientation === 'up') {
    return { x: pos.x, y: pos.y - offset };
  } else if (orientation === 'down') {
    return { x: pos.x, y: pos.y + offset };
  } else {
    return { x: pos.x, y: pos.y - offset };
  }
}

/**
 * Resolves whether a cable should route via the Left or Right vertical rack channel.
 * Left ear blade connections and left-half ports route to Left Channel;
 * Right ear blade connections and right-half ports route to Right Channel.
 */
export function resolveCableChannelSide(
  cable: CableData,
  srcPort: PortData | null,
  destPort: PortData | null,
  srcDevice: DeviceData | null,
  destDevice: DeviceData | null
): 'left' | 'right' {
  if (cable.sidePreference) return cable.sidePreference;

  // Ear ports have dedicated sides
  if (srcPort?.id.includes('ear-left')) return 'left';
  if (srcPort?.id.includes('ear-right')) return 'right';
  if (destPort?.id.includes('ear-left')) return 'left';
  if (destPort?.id.includes('ear-right')) return 'right';

  if (srcPort?.id.includes('-ear-')) return srcPort.relativeX <= 175 ? 'left' : 'right';
  if (destPort?.id.includes('-ear-')) return destPort.relativeX <= 175 ? 'left' : 'right';

  // Power cables route to the right / PDU side by default
  const isPower = cable.type?.includes('power') || cable.powerCableType === 'power';
  if (isPower) return 'right';

  // Based on port relative position in device
  const srcX = srcPort?.relativeX ?? 175;
  const destX = destPort?.relativeX ?? 175;
  const avgX = (srcX + destX) / 2;
  return avgX < 175 ? 'left' : 'right';
}

/**
 * Computes the dedicated vertical trunk coordinate for a color group in a channel.
 * All cables of the exact same color share the same single vertical line.
 */
export function getColorTrunkX(
  rack: RackData,
  side: 'left' | 'right',
  cableColor: string,
  allCables: CableData[]
): number {
  const uniqueColors = Array.from(new Set(allCables.map(c => (c.color || '#7b2fbe').toLowerCase()))).sort();
  const colorKey = (cableColor || '#7b2fbe').toLowerCase();
  let colorIdx = uniqueColors.indexOf(colorKey);
  if (colorIdx < 0) colorIdx = 0;

  const getVcmWidth = (w?: string): number => {
    switch (w) {
      case '2-inch': return 16;
      case '4-inch': return 26;
      case '6-inch': return 40;
      case '8-inch': return 54;
      default: return 0;
    }
  };

  if (side === 'left') {
    const leftVcmWidth = getVcmWidth(rack.leftCableManagerWidth);
    if (leftVcmWidth > 0) {
      // Route through the center of the Left Vertical Cable Manager
      const vcmCenterX = rack.x - (leftVcmWidth / 2) - 6;
      return vcmCenterX + (colorIdx - uniqueColors.length / 2) * 3;
    }
    // Default rail gutter
    return (rack.x + 14) - colorIdx * 3.5;
  } else {
    const rightVcmWidth = getVcmWidth(rack.rightCableManagerWidth);
    if (rightVcmWidth > 0) {
      // Route through the center of the Right Vertical Cable Manager
      const vcmCenterX = rack.x + 450 + 6 + (rightVcmWidth / 2);
      return vcmCenterX + (colorIdx - uniqueColors.length / 2) * 3;
    }
    // Default rail gutter
    return (rack.x + 436) + colorIdx * 3.5;
  }
}

export interface CableManagerInfo {
  device: DeviceData;
  yCenter: number;
}

/**
 * Finds all installed horizontal cable managers (Brush Panels, D-Rings, Finger Ducts) in a rack.
 */
export function findCableManagers(
  rack: RackData,
  devices: DeviceData[],
  customTemplates: any[]
): CableManagerInfo[] {
  const managers: CableManagerInfo[] = [];
  for (const dev of devices) {
    if (dev.rackId !== rack.id) continue;
    const tpl = getTemplate(dev.templateId, customTemplates);
    const isCM = tpl?.category === 'cable-manager'
      || dev.templateId.includes('cable-manager')
      || dev.templateId.includes('brush-panel')
      || dev.templateId.includes('d-ring')
      || dev.templateId.includes('finger-duct');

    if (isCM) {
      const hUnits = tpl?.heightUnits || 1;
      const devY = rack.y + 30 + (rack.units - dev.startUnit - hUnits + 1) * 30;
      const yCenter = devY + (hUnits * 30) / 2;
      managers.push({ device: dev, yCenter });
    }
  }
  return managers.sort((a, b) => a.yCenter - b.yCenter);
}

export function getDeterministicLaneIndex(
  cableId: string,
  rackId: string,
  side: 'left' | 'right'
): number {
  const s = stateManager.getState();
  
  const channelCables = s.cables.filter(c => {
    const srcPort = c.sourcePortId ? stateManager.getPort(c.sourcePortId) : null;
    const destPort = c.destPortId ? stateManager.getPort(c.destPortId) : null;
    
    const srcDev = srcPort ? stateManager.getDevice(srcPort.deviceId) : null;
    const destDev = destPort ? stateManager.getDevice(destPort.deviceId) : null;
    
    const srcSide = c.sidePreference ?? (srcPort && srcPort.relativeX > 175 ? 'right' : 'left');
    const destSide = c.sidePreference ?? (destPort && destPort.relativeX > 175 ? 'right' : 'left');
    
    const usesSrc = srcDev && srcDev.rackId === rackId && srcSide === side;
    const usesDest = destDev && destDev.rackId === rackId && destSide === side;
    
    const usesFloatingSrc = !srcPort && c.floatingSource && s.racks[0]?.id === rackId;
    const usesFloatingDest = !destPort && c.floatingDest && s.racks[0]?.id === rackId;
    
    return usesSrc || usesDest || usesFloatingSrc || usesFloatingDest;
  });
  
  channelCables.sort((a, b) => {
    const getPortY = (cab: CableData) => {
      const isSrc = cab.sourcePortId ? stateManager.getPort(cab.sourcePortId) : null;
      const port = isSrc ? isSrc : (cab.destPortId ? stateManager.getPort(cab.destPortId) : null);
      if (!port) {
        const floatPos = cab.floatingSource || cab.floatingDest;
        return floatPos ? floatPos.y : 0;
      }
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

/**
 * Removes duplicate and redundant collinear points along straight horizontal or vertical lines.
 */
export function simplifyCollinearPoints(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;

  // 1. Remove consecutive duplicate points
  const deduped: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = pts[i];
    if (Math.abs(curr.x - prev.x) >= 0.5 || Math.abs(curr.y - prev.y) >= 0.5) {
      deduped.push(curr);
    }
  }

  if (deduped.length <= 2) return deduped;

  // 2. Remove collinear points where prev, curr, next are in the same row (horizontal) or column (vertical)
  const result: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];

    const isHoriz = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
    const isVert = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;

    if (isHoriz || isVert) {
      // Redundant point on a straight line segment - omit it
      continue;
    }

    result.push(curr);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

/**
 * Enterprise Intelligent Cable Routing:
 * - Automatically routes via Left/Right vertical rack channels (never hanging in rack center)
 * - Bundles same-colored cables along a single crisp vertical trunk line
 * - Automatically routes through installed Cable Managers (Brush Panels, D-Rings, Finger Ducts)
 * - Intelligently allocates only the necessary corner waypoints (zero redundant anchors in the same row)
 */
export function computeSmartRouting(
  cable: CableData,
  sourcePos: Point,
  destPos: Point
): Point[] {
  const s = stateManager.getState();
  const exitOffset = Math.max(cable.exitStraightOffset ?? 20, 20);

  const srcPort = cable.sourcePortId ? (stateManager.getPort(cable.sourcePortId) ?? null) : null;
  const destPort = cable.destPortId ? (stateManager.getPort(cable.destPortId) ?? null) : null;
  const srcDev = srcPort ? (stateManager.getDevice(srcPort.deviceId) ?? null) : null;
  const destDev = destPort ? (stateManager.getDevice(destPort.deviceId) ?? null) : null;

  const rackId = srcDev?.rackId ?? destDev?.rackId ?? s.racks[0]?.id;
  const rack = s.racks.find(r => r.id === rackId);

  const srcOrient = getPortOrientation(cable, 'source');
  const destHasOverride = cable.destOrientation && cable.destOrientation !== 'auto';
  const destOrient = (!cable.destPortId && !destHasOverride)
    ? (Math.abs(destPos.x - sourcePos.x) > Math.abs(destPos.y - sourcePos.y)
        ? (destPos.x >= sourcePos.x ? 'right' : 'left')
        : (destPos.y >= sourcePos.y ? 'down' : 'up'))
    : getPortOrientation(cable, 'dest');

  const srcExit  = getExitPoint(sourcePos, srcOrient, exitOffset, destPos);
  const destExit = getExitPoint(destPos, destOrient, exitOffset, sourcePos);

  const isSrcVertical = srcOrient === 'up' || srcOrient === 'down' || srcOrient === 'inward';
  const isDestVertical = destOrient === 'up' || destOrient === 'down' || destOrient === 'inward';

  // Direct Downward-to-Downward connections (e.g. Ear Blade Power / Device to PDU socket)
  // Clean U-bend with exactly 2 corner waypoints (drop from source -> horizontal run -> rise into dest)
  if (srcOrient === 'down' && destOrient === 'down') {
    const ySag = Math.max(sourcePos.y, destPos.y) + Math.max(18, exitOffset);
    const raw = [sourcePos, { x: sourcePos.x, y: ySag }, { x: destPos.x, y: ySag }, destPos];
    return simplifyCollinearPoints(raw).slice(1, -1);
  }

  // Direct Upward-to-Upward connections
  if (srcOrient === 'up' && destOrient === 'up') {
    const yRise = Math.min(sourcePos.y, destPos.y) - Math.max(18, exitOffset);
    const raw = [sourcePos, { x: sourcePos.x, y: yRise }, { x: destPos.x, y: yRise }, destPos];
    return simplifyCollinearPoints(raw).slice(1, -1);
  }

  // If no rack context or floating drop with no real rack, use clean orthogonal routing
  if (!rack || (!srcDev && !destDev)) {
    if (Math.abs(srcExit.x - destExit.x) < 2) {
      return [srcExit, destExit];
    }
    if (isSrcVertical && isDestVertical) {
      const trunkY = (srcExit.y + destExit.y) / 2;
      return [srcExit, { x: srcExit.x, y: trunkY }, { x: destExit.x, y: trunkY }, destExit];
    } else if (isSrcVertical && !isDestVertical) {
      return [srcExit, { x: srcExit.x, y: destExit.y }, destExit];
    } else if (!isSrcVertical && isDestVertical) {
      return [srcExit, { x: destExit.x, y: srcExit.y }, destExit];
    } else {
      const trunkX = (srcExit.x + destExit.x) / 2;
      return [srcExit, { x: trunkX, y: srcExit.y }, { x: trunkX, y: destExit.y }, destExit];
    }
  }

  // Same-device local connection: route directly
  if (srcDev && destDev && srcDev.id === destDev.id && Math.abs(srcExit.y - destExit.y) < 35) {
    const trunkY = (srcExit.y + destExit.y) / 2;
    const raw = [sourcePos, srcExit, { x: srcExit.x, y: trunkY }, { x: destExit.x, y: trunkY }, destExit, destPos];
    return simplifyCollinearPoints(raw).slice(1, -1);
  }

  const side = resolveCableChannelSide(cable, srcPort, destPort, srcDev, destDev);
  const trunkX = getColorTrunkX(rack, side, cable.color, s.cables);

  // Check for Cable Managers in this rack
  const cableManagers = findCableManagers(rack, s.devices, s.customTemplates || []);

  let srcCM_Y: number | null = null;
  let destCM_Y: number | null = null;

  if (cableManagers.length > 0) {
    const minY = Math.min(sourcePos.y, destPos.y);
    const maxY = Math.max(sourcePos.y, destPos.y);
    const betweenCMs = cableManagers.filter(cm => cm.yCenter >= minY - 45 && cm.yCenter <= maxY + 45);
    if (betweenCMs.length > 0) {
      const closestToSrc = [...betweenCMs].sort((a, b) => Math.abs(a.yCenter - sourcePos.y) - Math.abs(b.yCenter - sourcePos.y))[0];
      if ((srcOrient === 'inward' || srcOrient === 'up' || srcOrient === 'down') && Math.abs(closestToSrc.yCenter - sourcePos.y) < 65) {
        srcCM_Y = closestToSrc.yCenter;
      }

      const closestToDest = [...betweenCMs].sort((a, b) => Math.abs(a.yCenter - destPos.y) - Math.abs(b.yCenter - destPos.y))[0];
      if ((destOrient === 'inward' || destOrient === 'up' || destOrient === 'down') && Math.abs(closestToDest.yCenter - destPos.y) < 65) {
        destCM_Y = closestToDest.yCenter;
      }
    }
  }

  // Build systematic corner waypoints sequence
  const waypoints: Point[] = [sourcePos];

  // 1. Source Lead-Out:
  if (!isSrcVertical) {
    waypoints.push({ x: trunkX, y: sourcePos.y });
  } else if (srcCM_Y !== null) {
    waypoints.push({ x: sourcePos.x, y: srcCM_Y });
    waypoints.push({ x: trunkX, y: srcCM_Y });
  } else {
    waypoints.push(srcExit);
    waypoints.push({ x: trunkX, y: srcExit.y });
  }

  // 2. Dest Lead-In:
  if (!isDestVertical) {
    waypoints.push({ x: trunkX, y: destPos.y });
  } else if (destCM_Y !== null) {
    waypoints.push({ x: trunkX, y: destCM_Y });
    waypoints.push({ x: destPos.x, y: destCM_Y });
  } else {
    waypoints.push({ x: trunkX, y: destExit.y });
    waypoints.push(destExit);
  }

  waypoints.push(destPos);

  // Clean all collinear points on straight rows and columns
  const simplified = simplifyCollinearPoints(waypoints);

  // Return the intermediate corner waypoints (excluding start sourcePos and end destPos)
  return simplified.slice(1, -1);
}

/**
 * Downsamples any list of points to exactly 3 points (first, middle, last).
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
