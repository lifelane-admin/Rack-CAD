import { describe, it, expect, beforeEach } from 'vitest';
import { deviceCatalog, getTemplate, getEffectiveCategory } from '../library/device-catalog';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';
import { PropertiesPanel } from '../components/properties';
import { computeRackSummary } from '../utils/rack-summary';
import type { DeviceData } from '../core/types';

/**
 * "Custom Layout" catalog templates — 1U/2U/4U × Server/Switch/Firewall, for real hardware whose
 * look doesn't match any built-in template. They ship with ZERO ports: earlier they pre-populated
 * 60 ports at one fixed default position, which stacked into a single visible/clickable "Port 60"
 * with the other 59 invisible and dead underneath it. Ports are meant to be added one at a time
 * via the Properties panel's "+ Add Port" (Port Visual Calibration) and hand-positioned to match
 * an uploaded Front Panel Image — up to 60 real ports, each usable as either end of a cable.
 * `customLayout: true` routes them to the generic Properties panel instead of the switch/firewall
 * SDK configurator, which would otherwise regenerate ports from an rj45Count field.
 */
const CUSTOM_LAYOUT_IDS = [
  'custom-server-1u', 'custom-server-2u', 'custom-server-4u',
  'custom-switch-1u', 'custom-switch-2u', 'custom-switch-4u',
  'custom-firewall-1u', 'custom-firewall-2u', 'custom-firewall-4u',
];

describe('Custom Layout catalog templates', () => {
  it.each(CUSTOM_LAYOUT_IDS)('%s exists, is flagged customLayout, and ships with ZERO pre-built ports', (id) => {
    const t = getTemplate(id);
    expect(t).toBeTruthy();
    expect(t!.customLayout).toBe(true);
    expect(t!.ports.length).toBe(0);
  });

  it('covers 1U/2U/4U for each of Server, Switch, and Firewall', () => {
    const byCategory: Record<string, number[]> = { server: [], switch: [], firewall: [] };
    for (const id of CUSTOM_LAYOUT_IDS) {
      const t = getTemplate(id)!;
      byCategory[t.category].push(t.heightUnits);
    }
    expect(byCategory.server.sort()).toEqual([1, 2, 4]);
    expect(byCategory.switch.sort()).toEqual([1, 2, 4]);
    expect(byCategory.firewall.sort()).toEqual([1, 2, 4]);
  });

  it('none of the 9 ids collide with an existing catalog template', () => {
    const nonCustomIds = deviceCatalog.filter(t => !CUSTOM_LAYOUT_IDS.includes(t.id)).map(t => t.id);
    for (const id of CUSTOM_LAYOUT_IDS) {
      expect(nonCustomIds).not.toContain(id);
    }
  });
});

describe('Properties panel routing for customLayout devices', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [] });
  });

  function seedDevice(deviceId: string, templateId: string): void {
    const template = getTemplate(templateId)!;
    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: deviceId, templateId, rackId: 'r1', startUnit: 1, name: '',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: template.ports.map(p => ({ ...p, deviceId, connected: false, cableId: null })),
      } as DeviceData],
    });
  }

  it('a custom-layout switch gets the generic panel (image upload + "+ Add Port"), not the SDK configurator', () => {
    seedDevice('dev-csw', 'custom-switch-1u');
    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-csw', container);

    expect(container.querySelector('#prop-dev-panel-file')).toBeTruthy();
    expect(container.querySelector('#btn-save-custom-asset')).toBeTruthy();
    // No bulk-add — adding several unpositioned ports at once is exactly what caused the overlap bug.
    expect(container.querySelector('#prop-port-bulk-add')).toBeFalsy();
    // The SDK switch configurator's own field must NOT be present.
    expect(container.querySelector('#sw-rj45')).toBeFalsy();
  });

  it('a custom-layout firewall gets the generic panel too, not the firewall SDK configurator', () => {
    seedDevice('dev-cfw', 'custom-firewall-2u');
    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-cfw', container);

    expect(container.querySelector('#prop-dev-panel-file')).toBeTruthy();
    expect(container.querySelector('#btn-save-custom-asset')).toBeTruthy();
    expect(container.querySelector('#fw-rj45')).toBeFalsy();
  });

  it('a custom-layout server also gets the generic panel (unaffected, but same code path)', () => {
    seedDevice('dev-csrv', 'custom-server-4u');
    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-csrv', container);

    expect(container.querySelector('#prop-dev-panel-file')).toBeTruthy();
    expect(container.querySelector('#btn-save-custom-asset')).toBeTruthy();
  });

  it('regression: a NON-custom-layout switch/firewall still gets its SDK configurator, unaffected by the routing change', () => {
    seedDevice('dev-sw-enterprise', 'sw-enterprise');
    const swContainer = document.createElement('div');
    const swPanel = new PropertiesPanel(swContainer);
    (swPanel as any).renderDeviceProperties('dev-sw-enterprise', swContainer);
    expect(swContainer.querySelector('#sw-rj45')).toBeTruthy();
    expect(swContainer.querySelector('#btn-save-custom-asset')).toBeFalsy();

    seedDevice('dev-fw-enterprise', 'fw-enterprise');
    const fwContainer = document.createElement('div');
    const fwPanel = new PropertiesPanel(fwContainer);
    (fwPanel as any).renderDeviceProperties('dev-fw-enterprise', fwContainer);
    expect(fwContainer.querySelector('#fw-rj45')).toBeTruthy();
    expect(fwContainer.querySelector('#btn-save-custom-asset')).toBeFalsy();
  });
});

describe('"Device Type" retyping — every device, predefined and custom alike', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [] });
  });

  function seedDevice(deviceId: string, templateId: string, ports: DeviceData['ports'] = []): void {
    const template = getTemplate(templateId)!;
    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: deviceId, templateId, rackId: 'r1', startUnit: 1, name: '',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: ports.length ? ports : template.ports.map(p => ({ ...p, deviceId, connected: false, cableId: null })),
      } as DeviceData],
    });
  }

  it('shows the "Device Type" dropdown for a custom-layout device, defaulted to its native category', () => {
    seedDevice('dev-csrv', 'custom-server-1u');
    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-csrv', container);

    const select = container.querySelector('#prop-dev-type') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('server');
  });

  it('also shows the dropdown for a predefined (non-customLayout) device, defaulted to its native category', () => {
    seedDevice('dev-router', 'router-4p');
    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-router', container);

    const select = container.querySelector('#prop-dev-type') as HTMLSelectElement;
    expect(select).toBeTruthy();
    // Assert against the rendered `selected` attribute rather than `select.value` — jsdom's
    // <select> "selectedness" algorithm doesn't reliably reflect a mid-list `selected` attribute
    // set via a single innerHTML assignment in this environment, independent of app correctness.
    expect(select.querySelector('option[value="router"]')?.hasAttribute('selected')).toBe(true);
  });

  it('changing the dropdown to "Switch - L3" emits a categoryOverride + deviceConfig.layer payload, and getEffectiveCategory reflects it', () => {
    seedDevice('dev-csrv2', 'custom-server-1u');
    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-csrv2', container);

    let captured: any = null;
    const listener = (payload: any) => { captured = payload; };
    eventBus.on('device:update', listener);
    try {
      const select = container.querySelector('#prop-dev-type') as HTMLSelectElement;
      select.value = 'switch-l3';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      eventBus.off('device:update', listener);
    }

    expect(captured?.id).toBe('dev-csrv2');
    expect(captured?.data?.categoryOverride).toBe('switch');
    expect(captured?.data?.deviceConfig?.layer).toBe('L3');

    // Apply the same merge the real 'device:update' handler (app.ts) performs, then verify the
    // downstream pure functions treat the device as a switch.
    stateManager.setState({
      devices: stateManager.getState().devices.map(d => d.id === 'dev-csrv2' ? { ...d, ...captured.data } : d),
    });
    const device = stateManager.getDevice('dev-csrv2')!;
    expect(getEffectiveCategory(device, getTemplate(device.templateId))).toBe('switch');
  });

  it('retyping to Load Balancer updates the Rack Summary category counts', () => {
    seedDevice('dev-lb', 'custom-server-2u');
    stateManager.setState({
      devices: stateManager.getState().devices.map(d => d.id === 'dev-lb' ? { ...d, categoryOverride: 'load-balancer' } : d),
    });

    const state = stateManager.getState();
    const rack = state.racks[0];
    const summary = computeRackSummary(rack, state.devices, state.cables);
    const lbRow = summary.categoryRows.find(([label]) => label === 'Load Balancers');
    expect(lbRow).toBeTruthy();
    expect(lbRow![1]).toBe(1);
    // No longer counted as a server once retyped.
    expect(summary.categoryRows.find(([label]) => label === 'Servers')).toBeFalsy();
  });

  it('regression: retyping a custom-layout switch to Switch-L2 does NOT wipe its manually-calibrated ports', () => {
    const manualPort = { id: 'dev-csw2-manual-0', deviceId: 'dev-csw2', name: 'Port 1', type: 'rj45' as const, relativeX: 42, relativeY: 17, connected: false, cableId: null };
    seedDevice('dev-csw2', 'custom-switch-1u', [manualPort]);
    const nonEarPorts = (ports: DeviceData['ports']) => ports.filter(p => !p.id.includes('-ear-'));
    expect(nonEarPorts(stateManager.getDevice('dev-csw2')!.ports)).toEqual([manualPort]);

    stateManager.setState({
      devices: stateManager.getState().devices.map(d =>
        d.id === 'dev-csw2' ? { ...d, categoryOverride: 'switch' as const, deviceConfig: { layer: 'L2' } } : d,
      ),
    });

    const device = stateManager.getDevice('dev-csw2')!;
    expect(nonEarPorts(device.ports)).toEqual([manualPort]);
    expect((device.deviceConfig as any)?.layer).toBe('L2');
  });

  it('a predefined device DOES honor categoryOverride (Rack Summary / rendering treat it as retyped)', () => {
    const template = getTemplate('router-4p')!;
    const device: DeviceData = {
      id: 'dev-x', templateId: 'router-4p', rackId: 'r1', startUnit: 1, name: '',
      hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
      categoryOverride: 'load-balancer',
    };
    expect(getEffectiveCategory(device, template)).toBe('load-balancer');
  });

  it('regression: retyping a PREDEFINED switch (real SDK deviceConfig + ports) never nulls or replaces its deviceConfig', () => {
    const template = getTemplate('sw-enterprise')!;
    seedDevice('dev-realsw', 'sw-enterprise');
    // Mirror what the switch SDK configurator would have saved — a real SwitchConfig, not the
    // bare {layer} stub a Custom Layout device gets.
    stateManager.setState({
      devices: stateManager.getState().devices.map(d => d.id === 'dev-realsw' ? { ...d, deviceConfig: template.deviceConfig } : d),
    });
    const before = stateManager.getDevice('dev-realsw')!;
    const beforePortCount = before.ports.length;
    expect(beforePortCount).toBeGreaterThan(0);

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-realsw', container);

    let captured: any = null;
    const listener = (payload: any) => { captured = payload; };
    eventBus.on('device:update', listener);
    try {
      const select = container.querySelector('#prop-dev-type') as HTMLSelectElement;
      expect(select).toBeTruthy();
      select.value = 'load-balancer';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      eventBus.off('device:update', listener);
    }

    expect(captured?.data?.categoryOverride).toBe('load-balancer');
    // Critical: the real SwitchConfig must pass through completely untouched, not nulled/replaced
    // (that would silently reset the device's actual rj45/sfp port composition on next edit).
    expect(captured?.data?.deviceConfig).toBe(before.deviceConfig);

    stateManager.setState({
      devices: stateManager.getState().devices.map(d => d.id === 'dev-realsw' ? { ...d, ...captured.data } : d),
    });
    const after = stateManager.getDevice('dev-realsw')!;
    expect(after.ports.length).toBe(beforePortCount);
    expect(getEffectiveCategory(after, getTemplate(after.templateId))).toBe('load-balancer');
  });

  it('retyping a PREDEFINED firewall to "Switch - L2" merges layer without discarding its real FirewallConfig', () => {
    const fwTemplate = getTemplate('fw-enterprise')!;
    seedDevice('dev-realfw', 'fw-enterprise');
    stateManager.setState({
      devices: stateManager.getState().devices.map(d => d.id === 'dev-realfw' ? { ...d, deviceConfig: fwTemplate.deviceConfig } : d),
    });
    const before = stateManager.getDevice('dev-realfw')!;

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderDeviceProperties('dev-realfw', container);

    let captured: any = null;
    const listener = (payload: any) => { captured = payload; };
    eventBus.on('device:update', listener);
    try {
      const select = container.querySelector('#prop-dev-type') as HTMLSelectElement;
      select.value = 'switch-l2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      eventBus.off('device:update', listener);
    }

    expect(captured?.data?.categoryOverride).toBe('switch');
    expect(captured?.data?.deviceConfig?.layer).toBe('L2');
    // Every original FirewallConfig field must still be present alongside the new `layer`.
    for (const key of Object.keys(before.deviceConfig as object)) {
      expect((captured?.data?.deviceConfig as any)[key]).toEqual((before.deviceConfig as any)[key]);
    }
  });
});

describe('end-to-end: a manually-added Custom Layout port works as BOTH cable source and destination', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [], cableInProgress: null });
  });

  it('connects two custom-switch-1u ports (added via "+ Add Port") to each other, source end first then dest end', async () => {
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

    // Templates ship with zero ports — seed each device with one manually-added-style port,
    // as "+ Add Port" + hand-calibrating X/Y in the Properties panel would produce.
    stateManager.setState({
      // Switch RJ45 ports render in FRONT view (rear view is PSU/fan modules) — unlike a server's
      // NICs, which are rear-view-only. Default cabinetViewMode is already 'front'; left implicit.
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'dA', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 5, name: 'Switch A',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'dA-port-0', deviceId: 'dA', name: 'Port 1', type: 'rj45', relativeX: 50, relativeY: 15, connected: false, cableId: null }],
      } as DeviceData, {
        id: 'dB', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 10, name: 'Switch B',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'dB-port-1', deviceId: 'dB', name: 'Port 1', type: 'rj45', relativeX: 60, relativeY: 15, connected: false, cableId: null }],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    const sourcePortId = 'dA-port-0';
    const destPortId = 'dB-port-1';

    const sourceEl = document.querySelector(`[data-port-id="${sourcePortId}"]`) as SVGElement;
    expect(sourceEl).toBeTruthy();
    sourceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe(sourcePortId);

    const destEl = document.querySelector(`[data-port-id="${destPortId}"]`) as SVGElement;
    expect(destEl).toBeTruthy();
    destEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));

    const cables = stateManager.getState().cables;
    expect(cables.length).toBe(1);
    expect(cables[0].sourcePortId).toBe(sourcePortId);
    expect(cables[0].destPortId).toBe(destPortId);
  });
});
