import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CableLayingOrchestrator } from '../../ai/workflow/cable-laying-orchestrator';
import { stateManager } from '../../core/state';
import type { DeviceData, CableData } from '../../core/types';

vi.mock('../../core/state', () => ({
  stateManager: {
    getState: vi.fn(() => ({ cables: [], devices: [], racks: [], textLabels: [] })),
    setState: vi.fn(),
  },
}));

// Mock getTemplate so PDU and switch categories are recognized
vi.mock('../../library/device-catalog', () => ({
  getTemplate: vi.fn((id: string) => {
    if (id === 'pdu-basic-8c13') return { category: 'pdu' };
    if (id.includes('switch')) return { category: 'switch' };
    return { category: 'server' };
  }),
}));

const psuPort = (id: string, deviceId: string) => ({
  id, deviceId, name: 'PSU 1 (C14)', type: 'power' as const,
  relativeX: 0, relativeY: 0, connected: false, cableId: null,
});

const outletPort = (id: string, deviceId: string) => ({
  id, deviceId, name: 'Outlet 1', type: 'power' as const,
  relativeX: 0, relativeY: 0, connected: false, cableId: null,
});

const makeServer = (id: string): DeviceData => ({
  id, templateId: 'server-2u-enterprise', rackId: 'r1', startUnit: 1,
  name: 'Host 1', hostname: '', managementIp: '', serialNumber: '', description: '',
  ports: [
    { ...psuPort(`${id}-psu1`, id), name: 'PSU 1 (C14)' },
    { ...psuPort(`${id}-psu2`, id), name: 'PSU 2 (C14)' },
  ],
} as unknown as DeviceData);

const makePdu = (id: string, feedLabel: 'A' | 'B'): DeviceData => ({
  id, templateId: 'pdu-basic-8c13', rackId: 'r1', startUnit: 40,
  name: `PDU ${feedLabel}`, hostname: '', managementIp: '', serialNumber: '', description: '',
  ports: [
    { ...outletPort(`outlet-${id}-0`, id), name: 'Outlet 1' },
    { ...outletPort(`outlet-${id}-1`, id), name: 'Outlet 2' },
  ],
} as unknown as DeviceData);

describe('CableLayingOrchestrator — power cables', () => {
  let orch: CableLayingOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    (stateManager.getState as any).mockReturnValue({ cables: [], devices: [], racks: [], textLabels: [] });
    orch = new CableLayingOrchestrator();
  });

  it('creates a power cable from PSU1 to Feed-A PDU outlet', () => {
    const server = makeServer('srv1');
    const pduA = makePdu('pdu-a', 'A');
    const pduB = makePdu('pdu-b', 'B');
    orch.syncCables([server, pduA, pduB], [], {} as any);

    const call = (stateManager.setState as any).mock.calls[0][0];
    const powerCables = call.cables.filter((c: any) => c.type === 'power');
    expect(powerCables.length).toBeGreaterThanOrEqual(1);

    const psu1Cable = powerCables.find((c: any) => c.sourcePortId === 'srv1-psu1');
    expect(psu1Cable).toBeDefined();
    expect(psu1Cable.destPortId).toBe('outlet-pdu-a-0');
    expect(psu1Cable.sidePreference).toBe('right');
  });

  it('creates a power cable from PSU2 to Feed-B PDU outlet', () => {
    const server = makeServer('srv1');
    const pduA = makePdu('pdu-a', 'A');
    const pduB = makePdu('pdu-b', 'B');
    orch.syncCables([server, pduA, pduB], [], {} as any);

    const call = (stateManager.setState as any).mock.calls[0][0];
    const cables = call.cables;
    const psu2Cable = cables.find((c: any) => c.sourcePortId === 'srv1-psu2');
    expect(psu2Cable).toBeDefined();
    expect(psu2Cable.destPortId).toBe('outlet-pdu-b-0');
  });

  it('syncCables is idempotent — does not duplicate existing power cables', () => {
    const server = makeServer('srv1');
    const pduA = makePdu('pdu-a', 'A');
    const pduB = makePdu('pdu-b', 'B');
    const existingCable: CableData = {
      id: 'ai-cable-existing', name: 'Power', type: 'power', color: '#f97316',
      sourcePortId: 'srv1-psu1', destPortId: 'outlet-pdu-a-0',
      bendPoints: [], thickness: 2, bendRadius: 0, bundleId: null, notes: '',
      sidePreference: 'right',
    } as unknown as CableData;
    (stateManager.getState as any).mockReturnValue({
      cables: [existingCable], devices: [], racks: [], textLabels: [],
    });

    orch.syncCables([server, pduA, pduB], [existingCable], {} as any);
    const call = (stateManager.setState as any).mock.calls[0][0];
    const psu1Cables = call.cables.filter((c: any) => c.sourcePortId === 'srv1-psu1');
    expect(psu1Cables).toHaveLength(1);
  });
});

describe('CableLayingOrchestrator — management cables', () => {
  it('creates grey management cable when OOB switch present', () => {
    vi.clearAllMocks();
    (stateManager.getState as any).mockReturnValue({ cables: [], devices: [], racks: [], textLabels: [] });

    const orch = new CableLayingOrchestrator();

    const server: DeviceData = {
      id: 'srv1', templateId: 'server-2u-enterprise', rackId: 'r1', startUnit: 1,
      name: 'Host 1', hostname: '', managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 'srv1-mgmt', deviceId: 'srv1', name: 'BMC / MGMT', type: 'management',
          relativeX: 0, relativeY: 0, connected: false, cableId: null },
      ],
    } as unknown as DeviceData;

    const oobSwitch: DeviceData = {
      id: 'oob1', templateId: 'switch-oob', rackId: 'r1', startUnit: 42,
      name: 'OOB Switch', hostname: '', managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 'oob1-p1', deviceId: 'oob1', name: 'Port 1', type: 'rj45',
          relativeX: 0, relativeY: 0, connected: false, cableId: null },
      ],
    } as unknown as DeviceData;

    orch.syncCables([server, oobSwitch], [], {} as any);

    const call = (stateManager.setState as any).mock.calls[0][0];
    const mgmtCable = call.cables.find((c: any) =>
      c.sourcePortId === 'srv1-mgmt' || c.destPortId === 'srv1-mgmt'
    );
    expect(mgmtCable).toBeDefined();
    expect(mgmtCable.color).toBe('#64748b');
    expect(mgmtCable.sidePreference).toBe('left');
  });
});
