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

function getSortedSwitchDataPorts(sw: DeviceData): PortData[] {
  return (sw.ports || [])
    .filter(p =>
      !p.id.includes('-ear-') &&
      !p.id.includes('mgmt') &&
      !p.id.includes('console') &&
      p.type !== 'management' &&
      p.type !== 'console' &&
      p.type !== 'power'
    )
    .sort((a, b) => {
      // 1st terminate cables on top row only, then on 2nd row (smaller relativeY first, then left-to-right)
      const yDiff = a.relativeY - b.relativeY;
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.relativeX - b.relativeX;
    });
}

function getSortedSwitchMgmtPorts(sw: DeviceData): PortData[] {
  return (sw.ports || [])
    .filter(p => !p.id.includes('-ear-') && p.type !== 'power')
    .sort((a, b) => {
      const yDiff = a.relativeY - b.relativeY;
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.relativeX - b.relativeX;
    });
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
    bendRadius: 10,
    bundleId: null,
    notes: 'Auto-laid by AI workflow',
    sidePreference,
    anchorPoints: [],
    anchorsLocked: false,
    powerCableType: type === 'power' ? 'power' : 'data',
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

    // Compute max outlets for each PDU (handles vertical side-mount PDUs with outletConfig as well as 1U rackmount PDUs with ports array)
    const getPduMaxOutlets = (pdu: DeviceData | undefined): number => {
      if (!pdu) return 0;
      if (pdu.ports && pdu.ports.length > 0) {
        const pPorts = pdu.ports.filter(p => p.type === 'power');
        if (pPorts.length > 0) return pPorts.length;
      }
      const tpl = getTemplate(pdu.templateId);
      if (tpl?.outletConfig && tpl.outletConfig.length > 0) {
        return tpl.outletConfig.reduce((acc, cfg) => acc + cfg.count, 0);
      }
      return 24;
    };

    const pduAMaxOutlets = getPduMaxOutlets(pduA);
    const pduBMaxOutlets = getPduMaxOutlets(pduB);

    const outletIdx: Record<string, number> = {};
    if (pduA) outletIdx[pduA.id] = 0;
    if (pduB) outletIdx[pduB.id] = 0;

    const switchPortIdx: Record<string, number> = {};
    if (torA) switchPortIdx[torA.id] = 0;
    if (torB) switchPortIdx[torB.id] = 0;

    // OOB switch port index — tracked explicitly so each server gets a different port.
    // We cannot rely on port.connected because the AI cable state doesn't update that field.
    let oobPortIdx = 0;

    for (const device of devices) {
      if (isPduDevice(device)) continue; // PDUs don't draw power from other PDUs

      const psuPorts = device.ports.filter(isPsuPort);
      const nicPorts = device.ports.filter(isNicPort);
      const mgmtPorts = device.ports.filter(isMgmtPort);

      // Prefer ear-hole ports for cleaner cable-manager routing.
      // Left ear: data ports exit through left cable manager; left power hole → PDU-A.
      // Right ear: data ports + management (iDRAC/iLO) exit through right side; right power → PDU-B.
      // Falls back to body ports when ear holes are not present (non-server devices).
      const earLeftData = device.ports
        .filter(p => p.id.includes('-ear-left-') && p.type !== 'power')
        .sort((a, b) => a.relativeY - b.relativeY);
      const earLeftPower  = device.ports.find(p => p.id.includes('-ear-left-')  && p.type === 'power');
      const earRightPower = device.ports.find(p => p.id.includes('-ear-right-') && p.type === 'power');
      const earRightMgmt  = device.ports.filter(p => p.id === `${device.id}-ear-right-mgmt`);

      // ── Power cables — exit through dedicated ear power holes into cable managers for ALL active devices ──
      // Primary PSU → left ear power hole → left cable manager → PDU-A (Feed A: Red #dc2626)
      const primaryPsuPort = earLeftPower ?? psuPorts[0];
      if (pduA && primaryPsuPort && outletIdx[pduA.id] < pduAMaxOutlets) {
        const syntheticOutletA = `outlet-${pduA.id}-${outletIdx[pduA.id]}`;
        const pair = `${primaryPsuPort.id}|${syntheticOutletA}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(primaryPsuPort.id, syntheticOutletA, 'power', '#dc2626', 'left', `Power — ${device.name} Primary PSU → Feed A`));
          existingPairs.add(pair);
        }
        outletIdx[pduA.id]++;
      }

      // Secondary PSU → right ear power hole → right cable manager → PDU-B (Feed B: Blue #2563eb)
      const secondaryPsuPort = earRightPower ?? psuPorts[1];
      if (pduB && secondaryPsuPort && outletIdx[pduB.id] < pduBMaxOutlets) {
        const syntheticOutletB = `outlet-${pduB.id}-${outletIdx[pduB.id]}`;
        const pair = `${secondaryPsuPort.id}|${syntheticOutletB}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(secondaryPsuPort.id, syntheticOutletB, 'power', '#2563eb', 'right', `Power — ${device.name} Secondary PSU → Feed B`));
          existingPairs.add(pair);
        }
        outletIdx[pduB.id]++;
      }

      // Skip switches for host data and management port connections to ToR/OOB
      if (isSwitchDevice(device)) continue;

      const dataSourcePorts = earLeftData.length > 0 ? earLeftData : nicPorts;
      const mgmtSourcePorts = earRightMgmt.length > 0 ? earRightMgmt : mgmtPorts;

      // ── Data cables (via left ear holes → left cable manager) ─────
      // Terminate on switch TOP ROW FIRST before 2nd row
      if (torA && dataSourcePorts[0]) {
        const sortedPortsA = getSortedSwitchDataPorts(torA);
        const torAPort = sortedPortsA[switchPortIdx[torA.id]];
        if (torAPort) {
          const pair = `${dataSourcePorts[0].id}|${torAPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(dataSourcePorts[0].id, torAPort.id, 'dac-twinax', '#3b82f6', 'left', 'Data — NIC1 → ToR-A'));
            existingPairs.add(pair);
          }
          switchPortIdx[torA.id]++;
        }
      }

      if (torB && dataSourcePorts[1]) {
        const sortedPortsB = getSortedSwitchDataPorts(torB);
        const torBPort = sortedPortsB[switchPortIdx[torB.id]];
        if (torBPort) {
          const pair = `${dataSourcePorts[1].id}|${torBPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(dataSourcePorts[1].id, torBPort.id, 'dac-twinax', '#06b6d4', 'left', 'Data — NIC2 → ToR-B'));
            existingPairs.add(pair);
          }
          switchPortIdx[torB.id]++;
        }
      }

      // ── Management cables (via right ear iDRAC/iLO/BMC hole) ──────
      if (oobSwitch && mgmtSourcePorts.length > 0) {
        const sortedMgmtPorts = getSortedSwitchMgmtPorts(oobSwitch);
        const oobPort = sortedMgmtPorts[oobPortIdx];
        if (oobPort) {
          const mgmtSide: 'left' | 'right' = earRightMgmt.length > 0 ? 'right' : 'left';
          const pair = `${mgmtSourcePorts[0].id}|${oobPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(mgmtSourcePorts[0].id, oobPort.id, 'cat6', '#64748b', mgmtSide, `MGMT — ${device.name} → OOB`));
            existingPairs.add(pair);
          }
          oobPortIdx++;
        }
      }
    }

    // ToR-A ↔ ToR-B peer link (highest-index DATA/UPLINK ports of each switch, NEVER power ports)
    if (torA && torB) {
      const dataPortsA = torA.ports.filter(p => p.type === 'qsfp28' || p.type === 'sfp28' || (p.type !== 'power' && p.type !== 'management' && p.type !== 'console'));
      const dataPortsB = torB.ports.filter(p => p.type === 'qsfp28' || p.type === 'sfp28' || (p.type !== 'power' && p.type !== 'management' && p.type !== 'console'));
      const torAUplink = dataPortsA[dataPortsA.length - 1];
      const torBUplink = dataPortsB[dataPortsB.length - 1];
      if (torAUplink && torBUplink) {
        const pair = `${torAUplink.id}|${torBUplink.id}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(torAUplink.id, torBUplink.id, 'dac-twinax', '#8b5cf6', 'right', 'ISL — ToR-A ↔ ToR-B'));
          existingPairs.add(pair);
        }
      }
    }

    // Remove managed cables for ports that no longer exist
    const allPortIds = new Set(devices.flatMap(d => d.ports.map(p => p.id)));
    const syntheticOutletRe = /^outlet-.+-\d+$/;
    const validManaged = managedExisting.filter(
      c =>
        allPortIds.has(c.sourcePortId ?? '') &&
        (allPortIds.has(c.destPortId ?? '') || syntheticOutletRe.test(c.destPortId ?? '')),
    );

    stateManager.setState({ cables: [...unmanaged, ...validManaged, ...newCables] } as any);
  }

  clearAll(): void {
    const state = stateManager.getState();
    const cables = (state.cables ?? []).filter((c: CableData) => !c.id.startsWith(CABLE_PREFIX));
    stateManager.setState({ cables } as any);
  }
}
