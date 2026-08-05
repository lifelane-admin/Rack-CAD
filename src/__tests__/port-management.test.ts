import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';
import { PropertiesPanel } from '../components/properties';
import type { DeviceData } from '../core/types';

/**
 * Manual port add/remove — for devices (e.g. a custom front-panel image slapped onto a plain
 * server template) whose real, connectable port count doesn't match what the base template
 * shipped with. The Properties panel's "Port Visual Calibration" section gained "+ Add Port" (one
 * at a time, staggered default position) and a per-port "✕" remove button so any device can get
 * real ports matching a custom illustration, not just the built-in switch/firewall/nac/ats
 * configurators. There's no bulk-add: adding several unpositioned ports at once would stack them
 * on the same spot with no way to tell them apart.
 *
 * Note: a 1U 'server' device auto-gains 8 ear-hole ports (injectEarPorts, see state.ts) on top
 * of its 3 catalog NIC/MGMT ports — these tests read the actual baseline from the normalized
 * device rather than hardcoding a count, so they don't depend on that unrelated ear-port detail.
 */
function seedServerDevice(deviceId: string, extraPorts: DeviceData['ports'] = []): void {
  stateManager.setState({
    racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
    devices: [{
      id: deviceId, templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '1U Server',
      hostname: '', managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 's1u-nic1', deviceId, name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: false, cableId: null },
        { id: 's1u-nic2', deviceId, name: 'NIC 2', type: 'rj45', relativeX: 332, relativeY: 8, connected: false, cableId: null },
        { id: 's1u-mgmt', deviceId, name: 'MGMT', type: 'management', relativeX: 344, relativeY: 8, connected: false, cableId: null },
        ...extraPorts,
      ],
    } as DeviceData],
    cables: [],
    selection: [],
  });
}

describe('Properties panel: manually adding custom ports to any device', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [] });
  });

  it('"+ Add Port" appends exactly one new rj45 port via device:update', () => {
    const deviceId = 'dev-add-1';
    seedServerDevice(deviceId);
    const baseline = stateManager.getDevice(deviceId)!.ports;

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties(deviceId, container);

    let captured: any = null;
    const handler = (payload: any) => { if (payload.id === deviceId) captured = payload.data; };
    eventBus.on('device:update' as any, handler);
    (container.querySelector('#prop-port-add') as HTMLButtonElement).click();
    eventBus.off('device:update' as any, handler);

    expect(captured).toBeTruthy();
    expect(captured.ports.length).toBe(baseline.length + 1);

    const baselineIds = new Set(baseline.map(p => p.id));
    const added = captured.ports.filter((p: any) => !baselineIds.has(p.id));
    expect(added.length).toBe(1);
    expect(added[0].type).toBe('rj45');
    expect(added[0].connected).toBe(false);
    expect(added[0].cableId).toBeNull();
    expect(added[0].deviceId).toBe(deviceId);
  });

  it('repeated "+ Add Port" clicks stagger each new port to a different default spot (no overlap blob)', () => {
    const deviceId = 'dev-stagger';
    seedServerDevice(deviceId);

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties(deviceId, container);

    // Click "+ Add Port" 5 times in a row without repositioning anything in between — simulates
    // a user adding several ports before calibrating any of them, which used to stack every new
    // port on the exact same point (only the topmost one visible/clickable, the rest dead).
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 5; i++) {
      let captured: any = null;
      const handler = (payload: any) => { if (payload.id === deviceId) captured = payload.data; };
      eventBus.on('device:update' as any, handler);
      (container.querySelector('#prop-port-add') as HTMLButtonElement).click();
      eventBus.off('device:update' as any, handler);
      stateManager.setState({ devices: stateManager.getState().devices.map(d => d.id === deviceId ? { ...d, ports: captured.ports } : d) });
      const newest = captured.ports[captured.ports.length - 1];
      positions.push({ x: newest.relativeX, y: newest.relativeY });
      // Panel re-render picks up the freshly seeded device for the next iteration's baseline.
      (panel as any).renderDeviceProperties(deviceId, container);
    }

    const uniqueX = new Set(positions.map(p => p.x));
    expect(uniqueX.size).toBe(5); // every new port got a distinct X — none stacked on the last
  });

  it('"+ Add Port" refuses once a device already has 60 real ports', () => {
    const deviceId = 'dev-add-at-cap';
    const sixtyPorts = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, deviceId, name: `Port ${i}`, type: 'rj45' as const, relativeX: 10, relativeY: 10, connected: false, cableId: null,
    }));
    seedServerDevice(deviceId, sixtyPorts);
    // seedServerDevice also seeds 3 catalog ports, so this device has 63 real ports — already over
    // the cap, which is the scenario being tested (any further add must be refused).

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties(deviceId, container);

    let updateFired = false;
    let notified: any = null;
    const updateHandler = () => { updateFired = true; };
    const notifyHandler = (payload: any) => { notified = payload; };
    eventBus.on('device:update' as any, updateHandler);
    eventBus.on('notification' as any, notifyHandler);
    (container.querySelector('#prop-port-add') as HTMLButtonElement).click();
    eventBus.off('device:update' as any, updateHandler);
    eventBus.off('notification' as any, notifyHandler);

    expect(updateFired).toBe(false); // no port added
    expect(notified?.type).toBe('warning');
  });

  it('the "✕" button on an existing port row emits device:remove-port for that exact port id', () => {
    const deviceId = 'dev-remove-btn';
    seedServerDevice(deviceId);

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties(deviceId, container);

    let captured: any = null;
    const handler = (payload: any) => { captured = payload; };
    eventBus.on('device:remove-port' as any, handler);
    (container.querySelector('.prop-port-remove[data-port-idx="1"]') as HTMLButtonElement).click();
    eventBus.off('device:remove-port' as any, handler);

    expect(captured).toEqual({ deviceId, portId: 's1u-nic2' });
  });
});

describe('end-to-end: removing a manually-added port through the real App', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [], cableInProgress: null });
  });

  it('drops the port and deletes any cable plugged into it, leaving everything else untouched', async () => {
    document.body.innerHTML = `
      <div id="app">
        <header id="toolbar"></header>
        <div id="workspace">
          <aside id="sidebar"></aside>
          <main id="canvas-container">
            <div id="ruler-corner"></div>
            <div id="ruler-horizontal"></div>
            <div id="ruler-vertical"></div>
            <div id="canvas-viewport"><svg id="canvas"></svg></div>
            <div id="minimap"></div>
          </main>
          <aside id="properties-panel"></aside>
        </div>
        <footer id="statusbar"></footer>
        <div id="context-menu" class="hidden"></div>
      </div>
      <div id="ai-key-modal" class="hidden"></div>
      <div id="export-report-modal" class="hidden"></div>
      <div id="custom-asset-modal" class="hidden"></div>
    `;
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const deviceId = 'dev-remove-e2e';
    const customPortId = 'custom-port-xyz';
    seedServerDevice(deviceId, [
      { id: customPortId, deviceId, name: 'Port 4', type: 'rj45', relativeX: 100, relativeY: 15, connected: true, cableId: 'cable-1' },
    ]);
    const beforeRemoval = stateManager.getDevice(deviceId)!.ports;
    expect(beforeRemoval.find(p => p.id === customPortId)).toBeTruthy();

    stateManager.setState({
      cables: [{
        id: 'cable-1', name: 'Cable 1', type: 'general', color: '#78909c',
        sourcePortId: 's1u-nic1', destPortId: customPortId, bendPoints: [], thickness: 3, bendRadius: 10,
        bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false,
      }],
    });
    (app as any).renderAll();

    eventBus.emit('device:remove-port', { deviceId, portId: customPortId });

    const device = stateManager.getDevice(deviceId)!;
    expect(device.ports.find(p => p.id === customPortId)).toBeUndefined();
    expect(device.ports.length).toBe(beforeRemoval.length - 1);
    // Everything else (the 3 catalog ports + 8 auto ear ports) survives untouched.
    expect(device.ports.find(p => p.id === 's1u-nic1')).toBeTruthy();
    expect(device.ports.find(p => p.id === 's1u-nic2')).toBeTruthy();
    expect(device.ports.find(p => p.id === 's1u-mgmt')).toBeTruthy();

    // The cable plugged into the removed port must be gone too, not left dangling.
    expect(stateManager.getState().cables.find(c => c.id === 'cable-1')).toBeUndefined();
  });
});
