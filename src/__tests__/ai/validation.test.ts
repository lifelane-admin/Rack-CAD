import { runValidationAlerts } from '../../core/validation';
import { RackData } from '../../core/types';

const rack: RackData = {
  id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0,
};

// Two PDU devices placed in the rack → capacity: 2 x 7200 = 14400W (matches getRackPduCount,
// which counts actual devices with category 'pdu', not the legacy showPduLeft/showPduRight flags).
const pduDevices = [
  {
    id: 'pdu1', templateId: 'pdu-basic-8c13', rackId: 'r1', startUnit: 40,
    name: 'PDU 1', hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
  },
  {
    id: 'pdu2', templateId: 'pdu-basic-8c13', rackId: 'r1', startUnit: 41,
    name: 'PDU 2', hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
  },
];

// Consumption is read from real power cables into a PDU's outlets (matches each PDU's own live
// meter), so the test server needs a power port and a cable plugged into pdu1's outlet-0.
function serverWithPower(watts: number) {
  return {
    id: 'd1', templateId: 't1', rackId: 'r1', startUnit: 1,
    name: 'Server 1', hostname: '', managementIp: '', serialNumber: '',
    description: `${watts}W server`,
    powerWatts: watts,
    ports: [{ id: 'd1-power', deviceId: 'd1', name: 'Power', type: 'power' as const, relativeX: 0, relativeY: 0, connected: true, cableId: 'c1' }],
  };
}
const powerCable = [{
  id: 'c1', name: 'Power cord', type: 'power' as const, color: '#000', sourcePortId: 'd1-power', destPortId: 'outlet-pdu1-0',
  bendPoints: [], thickness: 2, bendRadius: 0, bundleId: null, notes: '',
}];

describe('runValidationAlerts - power', () => {
  it('does not crash with no devices', () => {
    const alerts = runValidationAlerts([rack], [], []);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('emits no power alert when draw is below 80%', () => {
    // PDU capacity: 2 x 7200 = 14400W. 80% threshold = 11520W.
    // Device with 9000W description → 62.5%, no alert expected.
    const devices = [...pduDevices, serverWithPower(9000)];
    const alerts = runValidationAlerts([rack], devices, powerCable);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(0);
  });

  it('emits a warning when draw is >= 80% and < 95%', () => {
    // PDU capacity: 2 x 7200 = 14400W. 85% = 12240W.
    const devices = [...pduDevices, serverWithPower(12240)];
    const alerts = runValidationAlerts([rack], devices, powerCable);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(1);
    expect(powerAlerts[0].type).toBe('warning');
    expect(powerAlerts[0].targetId).toBe('r1');
    expect(powerAlerts[0].targetType).toBe('rack');
  });

  it('emits an error when draw is >= 95%', () => {
    // PDU capacity: 2 x 7200 = 14400W. 96% = 13824W.
    const devices = [...pduDevices, serverWithPower(13824)];
    const alerts = runValidationAlerts([rack], devices, powerCable);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(1);
    expect(powerAlerts[0].type).toBe('error');
    expect(powerAlerts[0].targetId).toBe('r1');
  });

  it('emits no power alert when rack has no PDUs', () => {
    const noPduRack: RackData = {
      id: 'r2', name: 'Rack 2', units: 42, x: 0, y: 0,
    };
    const devices = [
      {
        id: 'd2', templateId: 't1', rackId: 'r2', startUnit: 1,
        name: 'Server 2', hostname: '', managementIp: '', serialNumber: '',
        description: '9999W server',
        powerWatts: 9999,
        ports: [],
      },
    ];
    const alerts = runValidationAlerts([noPduRack], devices, []);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(0);
  });

  it('message includes percentage of capacity', () => {
    // 85% of 14400W = 12240W → warning
    const devices = [...pduDevices, serverWithPower(12240)];
    const alerts = runValidationAlerts([rack], devices, powerCable);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts[0].message).toContain('85%');
  });
});
