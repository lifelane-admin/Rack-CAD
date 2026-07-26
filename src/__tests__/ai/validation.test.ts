import { runValidationAlerts } from '../../core/validation';
import { RackData } from '../../core/types';

const rack: RackData = {
  id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0,
  showPduLeft: true, showPduRight: true,
};

describe('runValidationAlerts - power', () => {
  it('does not crash with no devices', () => {
    const alerts = runValidationAlerts([rack], [], []);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('emits no power alert when draw is below 80%', () => {
    // PDU capacity: 2 x 7200 = 14400W. 80% threshold = 11520W.
    // Device with 9000W description → 62.5%, no alert expected.
    const devices = [
      {
        id: 'd1', templateId: 't1', rackId: 'r1', startUnit: 1,
        name: 'Server 1', hostname: '', managementIp: '', serialNumber: '',
        description: '9000W server',
        ports: [],
      },
    ];
    const alerts = runValidationAlerts([rack], devices, []);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(0);
  });

  it('emits a warning when draw is >= 80% and < 95%', () => {
    // PDU capacity: 2 x 7200 = 14400W. 85% = 12240W.
    const devices = [
      {
        id: 'd1', templateId: 't1', rackId: 'r1', startUnit: 1,
        name: 'Server 1', hostname: '', managementIp: '', serialNumber: '',
        description: '12240W server',
        ports: [],
      },
    ];
    const alerts = runValidationAlerts([rack], devices, []);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(1);
    expect(powerAlerts[0].type).toBe('warning');
    expect(powerAlerts[0].targetId).toBe('r1');
    expect(powerAlerts[0].targetType).toBe('rack');
  });

  it('emits an error when draw is >= 95%', () => {
    // PDU capacity: 2 x 7200 = 14400W. 96% = 13824W.
    const devices = [
      {
        id: 'd1', templateId: 't1', rackId: 'r1', startUnit: 1,
        name: 'Server 1', hostname: '', managementIp: '', serialNumber: '',
        description: '13824W server',
        ports: [],
      },
    ];
    const alerts = runValidationAlerts([rack], devices, []);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(1);
    expect(powerAlerts[0].type).toBe('error');
    expect(powerAlerts[0].targetId).toBe('r1');
  });

  it('emits no power alert when rack has no PDUs', () => {
    const noPduRack: RackData = {
      id: 'r2', name: 'Rack 2', units: 42, x: 0, y: 0,
      showPduLeft: false, showPduRight: false,
    };
    const devices = [
      {
        id: 'd2', templateId: 't1', rackId: 'r2', startUnit: 1,
        name: 'Server 2', hostname: '', managementIp: '', serialNumber: '',
        description: '9999W server',
        ports: [],
      },
    ];
    const alerts = runValidationAlerts([noPduRack], devices, []);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts).toHaveLength(0);
  });

  it('message includes percentage of capacity', () => {
    // 85% of 14400W = 12240W → warning
    const devices = [
      {
        id: 'd1', templateId: 't1', rackId: 'r1', startUnit: 1,
        name: 'Server 1', hostname: '', managementIp: '', serialNumber: '',
        description: '12240W server',
        ports: [],
      },
    ];
    const alerts = runValidationAlerts([rack], devices, []);
    const powerAlerts = alerts.filter(a => a.category === 'power');
    expect(powerAlerts[0].message).toContain('85%');
  });
});
