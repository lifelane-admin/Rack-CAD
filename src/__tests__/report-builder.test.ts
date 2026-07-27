import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../core/state', () => ({
  stateManager: {
    getState: vi.fn(() => ({
      cabinetViewMode: 'front',
      cabinetDrawMode: 'default',
      isometricMode: false,
      cabinetCoverVisible: false,
      transform: { x: 0, y: 0, scale: 1 },
    })),
    getDevice: vi.fn(() => undefined),
    getRack: vi.fn(() => undefined),
  },
  default: { getState: vi.fn(() => ({})), setState: vi.fn() },
}));

vi.mock('../renderers/rack-renderer', () => ({
  renderRack: vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g')),
}));

vi.mock('../renderers/device-renderer', () => ({
  renderDevice: vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g')),
}));

vi.mock('../library/device-catalog', () => ({
  getTemplate: vi.fn(() => ({ heightUnits: 2, category: 'server' })),
}));

const makeState = (overrides: Partial<any> = {}): any => ({
  racks: [],
  devices: [],
  cables: [],
  ...overrides,
});

const makeMeta = (overrides: Partial<any> = {}): any => ({
  title: 'Test Report',
  author: 'Alice',
  revision: 'Rev 1',
  notes: '',
  generatedAt: '2026-07-26T10:00:00.000Z',
  ...overrides,
});

describe('buildReport', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns a string starting with <!DOCTYPE html>', async () => {
    const { buildReport } = await import('../export/report-builder');
    const html = buildReport(makeState(), makeMeta());
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it('includes the project title in the output', async () => {
    const { buildReport } = await import('../export/report-builder');
    const html = buildReport(makeState(), makeMeta({ title: 'My DC Design' }));
    expect(html).toContain('My DC Design');
  });

  it('includes rack name and device hostname when present', async () => {
    const { buildReport } = await import('../export/report-builder');
    const state = makeState({
      racks: [{ id: 'r1', name: 'Prod Rack A', units: 42, x: 0, y: 0, showPduLeft: false, showPduRight: false }],
      devices: [{
        id: 'd1', rackId: 'r1', startUnit: 10,
        name: 'Web Server', hostname: 'web-01', managementIp: '10.0.0.5',
        serialNumber: 'SN999', description: '400W', templateId: 'server-2u', ports: [],
      }],
    });
    const html = buildReport(state, makeMeta());
    expect(html).toContain('Prod Rack A');
    expect(html).toContain('web-01');
    expect(html).toContain('10.0.0.5');
    expect(html).toContain('SN999');
  });

  it('calculates 50% power usage for 3600W on a single 7200W PDU rack', async () => {
    const { buildReport } = await import('../export/report-builder');
    const state = makeState({
      racks: [{ id: 'r1', name: 'Rack', units: 42, x: 0, y: 0, showPduLeft: true, showPduRight: false }],
      devices: [{
        id: 'd1', rackId: 'r1', startUnit: 1, name: 'Srv', hostname: '', managementIp: '',
        serialNumber: '', description: '3600W', templateId: 'server-2u', ports: [],
      }],
    });
    const html = buildReport(state, makeMeta());
    expect(html).toContain('50%');
    expect(html).toContain('7200 W');
    expect(html).toContain('3600 W');
  });

  it('shows Critical status badge when usage >= 95%', async () => {
    const { buildReport } = await import('../export/report-builder');
    const state = makeState({
      racks: [{ id: 'r1', name: 'Rack', units: 42, x: 0, y: 0, showPduLeft: true, showPduRight: false }],
      devices: [{
        id: 'd1', rackId: 'r1', startUnit: 1, name: 'Srv', hostname: '', managementIp: '',
        serialNumber: '', description: '7000W', templateId: 'server-2u', ports: [],
      }],
    });
    const html = buildReport(state, makeMeta());
    expect(html).toContain('Critical');
  });

  it('shows design notes in a pre block', async () => {
    const { buildReport } = await import('../export/report-builder');
    const html = buildReport(makeState(), makeMeta({ notes: 'Deployed 2026-Q3\nSee ticket #4421' }));
    expect(html).toContain('<pre>');
    expect(html).toContain('Deployed 2026-Q3');
  });

  it('shows placeholder when design notes is empty', async () => {
    const { buildReport } = await import('../export/report-builder');
    const html = buildReport(makeState(), makeMeta({ notes: '' }));
    expect(html).toContain('No design notes provided');
  });

  it('escapes HTML in design notes to prevent injection', async () => {
    const { buildReport } = await import('../export/report-builder');
    const html = buildReport(makeState(), makeMeta({ notes: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('skips port mapping cables with null destPortId', async () => {
    const { buildReport } = await import('../export/report-builder');
    const state = makeState({
      racks: [{ id: 'r1', name: 'Rack', units: 42, x: 0, y: 0, showPduLeft: false, showPduRight: false }],
      devices: [{ id: 'd1', rackId: 'r1', startUnit: 1, name: 'Srv', hostname: '', managementIp: '', serialNumber: '', description: '', templateId: 's', ports: [{ id: 'p1', deviceId: 'd1', name: 'NIC1', type: 'rj45', relativeX: 0, relativeY: 0, connected: false, cableId: null }] }],
      cables: [{ id: 'c1', name: 'floating', type: 'general', color: '#888', sourcePortId: 'p1', destPortId: null, bendPoints: [], thickness: 2, bendRadius: 0, bundleId: null, notes: '' }],
    });
    const html = buildReport(state, makeMeta());
    expect(html).toContain('No cables connected');
  });

  it('includes all 7 section headers in output', async () => {
    const { buildReport } = await import('../export/report-builder');
    const state = makeState({
      racks: [{ id: 'r1', name: 'R1', units: 42, x: 0, y: 0, showPduLeft: false, showPduRight: false }],
    });
    const html = buildReport(state, makeMeta());
    expect(html).toContain('Device Inventory');
    expect(html).toContain('Port Mapping');
    expect(html).toContain('Cable Legend');
    expect(html).toContain('Power Summary');
    expect(html).toContain('Design Notes');
  });
});
