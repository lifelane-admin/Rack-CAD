import { RackData, DeviceData, CableData, ValidationAlert, PortData } from './types';
import { generateId } from '../utils/geometry';

/**
 * Runs continuous background validation on the current rack configuration.
 */
export function runValidationAlerts(
  racks: RackData[],
  devices: DeviceData[],
  cables: CableData[]
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];

  // Helper to find a port
  const findPort = (portId: string): PortData | null => {
    for (const d of devices) {
      const p = d.ports.find(x => x.id === portId);
      if (p) return p;
    }
    return null;
  };

  // Helper to find device of a port
  const findDeviceOfPort = (portId: string): DeviceData | null => {
    for (const d of devices) {
      if (d.ports.some(x => x.id === portId)) return d;
    }
    return null;
  };

  // 1. Congestion Alerts (Rack vertical managers)
  for (const rack of racks) {
    // Count cables routing through left/right of this rack
    let leftCount = 0;
    let rightCount = 0;

    for (const cable of cables) {
      const srcPort = findPort(cable.sourcePortId);
      const srcDevice = srcPort ? findDeviceOfPort(srcPort.id) : null;
      if (srcDevice && srcDevice.rackId === rack.id) {
        if (cable.sidePreference === 'left') leftCount++;
        else if (cable.sidePreference === 'right') rightCount++;
        else {
          // Auto routing assignment
          if (cable.type === 'power') rightCount++;
          else leftCount++;
        }
      }
    }

    const limit = 12; // safety congestion threshold
    if (leftCount > limit) {
      alerts.push({
        id: generateId(),
        type: 'warning',
        category: 'congestion',
        message: `Left vertical cable manager of ${rack.name} is congested (${leftCount} cables, threshold is ${limit}).`,
        targetId: rack.id,
        targetType: 'rack'
      });
    }
    if (rightCount > limit) {
      alerts.push({
        id: generateId(),
        type: 'warning',
        category: 'congestion',
        message: `Right vertical cable manager of ${rack.name} is congested (${rightCount} cables, threshold is ${limit}).`,
        targetId: rack.id,
        targetType: 'rack'
      });
    }
  }

  // Cable loops detection map
  const adjacency: Record<string, string[]> = {};
  for (const d of devices) {
    adjacency[d.id] = [];
  }

  // 2. Cable-by-cable checks
  for (const cable of cables) {
    // A. Incomplete Connection
    if (!cable.destPortId) {
      alerts.push({
        id: generateId(),
        type: 'info',
        category: 'distance',
        message: `Cable "${cable.name}" has a floating end (not connected to a destination port).`,
        targetId: cable.id,
        targetType: 'cable'
      });
      continue;
    }

    const srcPort = findPort(cable.sourcePortId);
    const destPort = findPort(cable.destPortId);

    if (!srcPort || !destPort) continue;

    const srcDev = findDeviceOfPort(srcPort.id);
    const destDev = findDeviceOfPort(destPort.id);

    if (srcDev && destDev) {
      adjacency[srcDev.id].push(destDev.id);
      adjacency[destDev.id].push(srcDev.id);
    }

    // B. Medium & Connector Compatibility
    const isFiberPort = (type: string) => ['sfp', 'qsfp', 'lc', 'sc', 'fiber', 'optical'].some(t => type.toLowerCase().includes(t));
    const isPowerPort = (type: string) => ['power', 'pwr', 'c13', 'c14', 'c19', 'c20'].some(t => type.toLowerCase().includes(t));
    const isEarPort = (id: string) => id.includes('-ear-');

    if (!isEarPort(srcPort.id) && !isEarPort(destPort.id)) {
      if (isFiberPort(srcPort.type) && !isFiberPort(destPort.type)) {
        alerts.push({
          id: generateId(),
          type: 'error',
          category: 'medium',
          message: `Media mismatch on "${cable.name}": Connecting Fiber port (${srcPort.name}) to non-fiber port (${destPort.name}).`,
          targetId: cable.id,
          targetType: 'cable'
        });
      }
      if (isPowerPort(srcPort.type) && !isPowerPort(destPort.type)) {
        alerts.push({
          id: generateId(),
          type: 'error',
          category: 'medium',
          message: `Power mismatch on "${cable.name}": Power port (${srcPort.name}) cannot terminate in data port (${destPort.name}).`,
          targetId: cable.id,
          targetType: 'cable'
        });
      }
    }

    // C. Speed Compatibility
    if (srcPort.speed && destPort.speed && srcPort.speed !== destPort.speed) {
      alerts.push({
        id: generateId(),
        type: 'warning',
        category: 'speed',
        message: `Speed negotiation mismatch on "${cable.name}": Source speed is ${srcPort.speed}, Destination speed is ${destPort.speed}.`,
        targetId: cable.id,
        targetType: 'cable'
      });
    }

    // D. Bend Radius Safety
    if (cable.bendRadius !== undefined && cable.bendRadius < 8) {
      alerts.push({
        id: generateId(),
        type: 'warning',
        category: 'bend',
        message: `Bend radius violation on "${cable.name}": Radius is ${cable.bendRadius}px. A bend radius < 8px can damage cables or degrade signal.`,
        targetId: cable.id,
        targetType: 'cable'
      });
    }

    // E. Power Separation Check
    const isPower = cable.type === 'power' || isPowerPort(srcPort.type) || isPowerPort(destPort.type);
    if (isPower && cable.sidePreference === 'left') {
      alerts.push({
        id: generateId(),
        type: 'warning',
        category: 'congestion',
        message: `Power Separation violation on "${cable.name}": AC power cables should be routed through the Right Gutter manager to prevent EMI noise on data channels.`,
        targetId: cable.id,
        targetType: 'cable'
      });
    }
  }

  // 3. Simple Loop Detection (Cycle check in graph using DFS)
  const visited = new Set<string>();
  const recStack = new Set<string>();

  const hasCycle = (u: string, parent: string | null): boolean => {
    visited.add(u);
    recStack.add(u);

    for (const v of adjacency[u] || []) {
      if (v === parent) continue;
      if (recStack.has(v)) return true;
      if (!visited.has(v)) {
        if (hasCycle(v, u)) return true;
      }
    }

    recStack.delete(u);
    return false;
  };

  for (const u of Object.keys(adjacency)) {
    if (!visited.has(u)) {
      if (hasCycle(u, null)) {
        alerts.push({
          id: generateId(),
          type: 'warning',
          category: 'loop',
          message: `Network loop detected. Ensure spanning tree (STP) is enabled or break redundant cabling links.`,
          targetId: u,
          targetType: 'cable' // target switch
        });
        break; // report once
      }
    }
  }

  return alerts;
}
