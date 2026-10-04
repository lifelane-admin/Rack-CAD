import { stateManager } from '../../core/state';
import { DeviceData, CableData, PortData } from '../../core/types';
import { RequirementSpec } from './types';
import { getTemplate } from '../../library/device-catalog';
import { generateId } from '../../utils/geometry';

const CABLE_PREFIX = 'ai-cable-';

function isPsuPort(p: PortData): boolean {
  return (
    p.type === 'power' ||
    p.name.toLowerCase().includes('psu') ||
    p.name.toLowerCase().includes('c14') ||
    p.name.toLowerCase().includes('c13')
  );
}

function isNicPort(p: PortData): boolean {
  return (
    ['sfp28', 'sfp-plus', 'qsfp28', 'sfp'].includes(p.type) ||
    p.name.toLowerCase().includes('nic') ||
    p.name.toLowerCase().includes('sfp') ||
    p.name.toLowerCase().includes('25g') ||
    p.name.toLowerCase().includes('100g')
  );
}

function isMgmtPort(p: PortData): boolean {
  return (
    p.type === 'management' ||
    p.name.toLowerCase().includes('mgmt') ||
    p.name.toLowerCase().includes('bmc') ||
    p.name.toLowerCase().includes('idrac') ||
    p.name.toLowerCase().includes('ilo')
  );
}

function isPduDevice(d: DeviceData): boolean {
  return getTemplate(d.templateId)?.category === 'pdu';
}

function isSwitchDevice(d: DeviceData): boolean {
  return getTemplate(d.templateId)?.category === 'switch';
}

function makeAiCable(
  sourcePortId: string,
  destPortId: string,
  type: CableData['type'],
  color: string,
  sidePreference: 'left' | 'right',
  name: string,
): CableData {
  return {
    id: `${CABLE_PREFIX}${generateId()}`,
    name,
    type,
    color,
    sourcePortId,
    destPortId,
    bendPoints: [],
    thickness: 2,
    bendRadius: 4,
    bundleId: null,
    notes: 'Auto-laid by AI workflow',
    sidePreference,
    anchorPoints: [],
    anchorsLocked: false,
  } as unknown as CableData;
}

export class CableLayingOrchestrator {
  syncCables(
    devices: DeviceData[],
    existingCables: CableData[],
    _req: RequirementSpec,
  ): void {
    const state = stateManager.getState();
    const allCables: CableData[] = state.cables ?? [];

    const unmanaged = allCables.filter(c => !c.id.startsWith(CABLE_PREFIX));
    const managedExisting = allCables.filter(c => c.id.startsWith(CABLE_PREFIX));

    const existingPairs = new Set(
      managedExisting.map(c => `${c.sourcePortId}|${c.destPortId}`),
    );

    const newCables: CableData[] = [];

    const pdus = devices.filter(isPduDevice);
    const pduA = pdus[0];
    const pduB = pdus[1];

    const switches = devices.filter(isSwitchDevice);
    const torA = switches[0];
    const torB = switches[1];

    const oobSwitch = devices.find(d => {
      const tpl = getTemplate(d.templateId);
      return tpl?.category === 'switch' && d.name.toLowerCase().includes('oob');
    });

    const outletIdx: Record<string, number> = {};
    if (pduA) outletIdx[pduA.id] = 0;
    if (pduB) outletIdx[pduB.id] = 0;

    const switchPortIdx: Record<string, number> = {};
    if (torA) switchPortIdx[torA.id] = 0;
    if (torB) switchPortIdx[torB.id] = 0;

    for (const device of devices) {
      if (isPduDevice(device) || isSwitchDevice(device)) continue;

      const psuPorts = device.ports.filter(isPsuPort);
      const nicPorts = device.ports.filter(isNicPort);
      const mgmtPorts = device.ports.filter(isMgmtPort);

      // ── Power cables ──────────────────────────────────────────────
      if (pduA && psuPorts[0]) {
        const outletId = `outlet-${pduA.id}-${outletIdx[pduA.id]}`;
        const pair = `${psuPorts[0].id}|${outletId}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(psuPorts[0].id, outletId, 'power', '#f97316', 'right', 'Power — PSU1 → Feed A'));
          existingPairs.add(pair);
        }
        outletIdx[pduA.id]++;
      }

      if (pduB && psuPorts[1]) {
        const outletId = `outlet-${pduB.id}-${outletIdx[pduB.id]}`;
        const pair = `${psuPorts[1].id}|${outletId}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(psuPorts[1].id, outletId, 'power', '#f97316', 'right', 'Power — PSU2 → Feed B'));
          existingPairs.add(pair);
        }
        outletIdx[pduB.id]++;
      }

      // ── Data cables ───────────────────────────────────────────────
      if (torA && nicPorts[0]) {
        const torAPort = torA.ports[switchPortIdx[torA.id]];
        if (torAPort) {
          const pair = `${nicPorts[0].id}|${torAPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(nicPorts[0].id, torAPort.id, 'ethernet', '#3b82f6', 'left', 'Data — NIC1 → ToR-A'));
            existingPairs.add(pair);
          }
          switchPortIdx[torA.id]++;
        }
      }

      if (torB && nicPorts[1]) {
        const torBPort = torB.ports[switchPortIdx[torB.id]];
        if (torBPort) {
          const pair = `${nicPorts[1].id}|${torBPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(nicPorts[1].id, torBPort.id, 'ethernet', '#06b6d4', 'left', 'Data — NIC2 → ToR-B'));
            existingPairs.add(pair);
          }
          switchPortIdx[torB.id]++;
        }
      }

      // ── Management cables ─────────────────────────────────────────
      if (oobSwitch && mgmtPorts.length > 0) {
        const oobPortIdx = oobSwitch.ports.findIndex(p => !p.connected);
        const oobPort = oobSwitch.ports[oobPortIdx >= 0 ? oobPortIdx : 0];
        if (oobPort) {
          const pair = `${mgmtPorts[0].id}|${oobPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(mgmtPorts[0].id, oobPort.id, 'ethernet', '#64748b', 'left', `MGMT — ${device.name} → OOB`));
            existingPairs.add(pair);
          }
        }
      }
    }

    // ToR-A ↔ ToR-B peer link (highest-index ports of each switch)
    if (torA && torB && torA.ports.length > 0 && torB.ports.length > 0) {
      const torAUplink = torA.ports[torA.ports.length - 1];
      const torBUplink = torB.ports[torB.ports.length - 1];
      if (torAUplink && torBUplink) {
        const pair = `${torAUplink.id}|${torBUplink.id}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(torAUplink.id, torBUplink.id, 'ethernet', '#8b5cf6', 'left', 'ISL — ToR-A ↔ ToR-B'));
        }
      }
    }

    // Remove managed cables for ports that no longer exist
    const allPortIds = new Set(devices.flatMap(d => d.ports.map(p => p.id)));
    const validManaged = managedExisting.filter(
      c => allPortIds.has(c.sourcePortId ?? '') && allPortIds.has(c.destPortId ?? ''),
    );

    stateManager.setState({ cables: [...unmanaged, ...validManaged, ...newCables] } as any);
  }

  clearAll(): void {
    const state = stateManager.getState();
    const cables = (state.cables ?? []).filter((c: CableData) => !c.id.startsWith(CABLE_PREFIX));
    stateManager.setState({ cables } as any);
  }
}
