import { getRackPduCount, getRackPowerCapacityWatts, getRackPduLoadWatts, countDevicePowerCables, getRackRedundantPowerDeviceCount } from '../utils/power';
import { RackData, DeviceData, CableData } from '../core/types';

const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 };

function pdu(id: string, startUnit: number): DeviceData {
  return {
    id, templateId: 'pdu-basic-8c13', rackId: 'r1', startUnit,
    name: id, hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
  };
}

function serverWithPowerPorts(id: string, watts: number, portIds: string[]): DeviceData {
  return {
    id, templateId: 'server-generic', rackId: 'r1', startUnit: 1,
    name: id, hostname: '', managementIp: '', serialNumber: '', description: '',
    powerWatts: watts,
    ports: portIds.map((pid, i) => ({
      id: pid, deviceId: id, name: `Power ${i + 1}`, type: 'power' as const,
      relativeX: 0, relativeY: 0, connected: true, cableId: null,
    })),
  };
}

function powerCable(id: string, sourcePortId: string, destPortId: string): CableData {
  return {
    id, name: id, type: 'power', color: '#000', sourcePortId, destPortId,
    bendPoints: [], thickness: 2, bendRadius: 0, bundleId: null, notes: '',
  };
}

describe('getRackPduCount / getRackPowerCapacityWatts', () => {
  it('counts horizontal + vertical PDU devices actually placed in the rack, not rail checkboxes', () => {
    const devices = [pdu('pdu1', 40), pdu('pdu2', 0), pdu('pdu3', 0)];
    expect(getRackPduCount(rack, devices)).toBe(3);
    expect(getRackPowerCapacityWatts(rack, devices)).toBe(3 * 7200);
  });

  it('ignores PDU devices belonging to a different rack', () => {
    const devices = [pdu('pdu1', 40), { ...pdu('pdu2', 0), rackId: 'r2' }];
    expect(getRackPduCount(rack, devices)).toBe(1);
  });
});

describe('getRackPduLoadWatts — sum of every PDU\'s own reading', () => {
  it('sums a single-corded device once from its one PDU connection', () => {
    const devices = [pdu('pdu1', 40), serverWithPowerPorts('srv1', 400, ['srv1-pwr'])];
    const cables = [powerCable('c1', 'srv1-pwr', 'outlet-pdu1-0')];
    expect(getRackPduLoadWatts(rack, devices, cables)).toBe(400);
  });

  it('counts a redundant-power device once per PDU it feeds (matches adding up each PDU\'s own reading)', () => {
    const devices = [pdu('pdu1', 40), pdu('pdu2', 41), serverWithPowerPorts('srv1', 400, ['srv1-pwr-a', 'srv1-pwr-b'])];
    const cables = [
      powerCable('c1', 'srv1-pwr-a', 'outlet-pdu1-0'),
      powerCable('c2', 'srv1-pwr-b', 'outlet-pdu2-0'),
    ];
    // PDU1 reads 400W, PDU2 reads 400W (same device, redundant feed) — rack total is their sum, 800W.
    expect(getRackPduLoadWatts(rack, devices, cables)).toBe(800);
  });

  it('sums multiple distinct devices correctly alongside a redundant one', () => {
    const devices = [
      pdu('pdu1', 40), pdu('pdu2', 41),
      serverWithPowerPorts('srv1', 400, ['srv1-pwr-a', 'srv1-pwr-b']), // redundant, counted on both PDUs
      serverWithPowerPorts('srv2', 150, ['srv2-pwr']), // single-corded
    ];
    const cables = [
      powerCable('c1', 'srv1-pwr-a', 'outlet-pdu1-0'),
      powerCable('c2', 'srv1-pwr-b', 'outlet-pdu2-0'),
      powerCable('c3', 'srv2-pwr', 'outlet-pdu1-1'),
    ];
    // PDU1: srv1 (400) + srv2 (150) = 550. PDU2: srv1 (400) = 400. Total = 950.
    expect(getRackPduLoadWatts(rack, devices, cables)).toBe(950);
  });
});

describe('countDevicePowerCables / getRackRedundantPowerDeviceCount', () => {
  it('counts 0 with no power cables, 1 with one cord, 2+ with redundant cords', () => {
    const devices = [pdu('pdu1', 40), pdu('pdu2', 41), serverWithPowerPorts('srv1', 400, ['a', 'b'])];
    const noCables: CableData[] = [];
    expect(countDevicePowerCables('srv1', noCables, devices)).toBe(0);

    const oneCable = [powerCable('c1', 'a', 'outlet-pdu1-0')];
    expect(countDevicePowerCables('srv1', oneCable, devices)).toBe(1);

    const twoCables = [powerCable('c1', 'a', 'outlet-pdu1-0'), powerCable('c2', 'b', 'outlet-pdu2-0')];
    expect(countDevicePowerCables('srv1', twoCables, devices)).toBe(2);
  });

  it('identifies exactly the devices with 2+ power cords in the rack', () => {
    const devices = [
      pdu('pdu1', 40), pdu('pdu2', 41),
      serverWithPowerPorts('srv1', 400, ['srv1-a', 'srv1-b']),
      serverWithPowerPorts('srv2', 150, ['srv2-a']),
    ];
    const cables = [
      powerCable('c1', 'srv1-a', 'outlet-pdu1-0'),
      powerCable('c2', 'srv1-b', 'outlet-pdu2-0'),
      powerCable('c3', 'srv2-a', 'outlet-pdu1-1'),
    ];
    expect(getRackRedundantPowerDeviceCount(rack, devices, cables)).toBe(1);
  });
});
