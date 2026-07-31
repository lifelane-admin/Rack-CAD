import { describe, it, expect } from 'vitest';
import { injectConfigurablePorts, stateManager } from '../core/state';
import { getTemplate, deviceCatalog } from '../library/device-catalog';
import { renderFrontPanel } from '../renderers/panel-renderer';
import { PropertiesPanel } from '../components/properties';
import { eventBus } from '../core/event-bus';
import type { PortData, SwitchConfig, FirewallConfig, DeviceData } from '../core/types';

function basePort(id: string, overrides: Partial<PortData> = {}): PortData {
  return {
    id, deviceId: 'dev1', name: id, type: 'rj45', relativeX: 0, relativeY: 0,
    connected: false, cableId: null, ...overrides,
  };
}

describe('injectConfigurablePorts', () => {
  const switchTemplate = getTemplate('sw-enterprise')!;
  const firewallTemplate = getTemplate('fw-enterprise')!;

  it('is a no-op when deviceConfig is absent', () => {
    const base = [basePort('dev1-p1'), basePort('dev1-p2')];
    const result = injectConfigurablePorts('dev1', switchTemplate, undefined, base);
    expect(result).toBe(base);
  });

  it('regenerates switch ports to match rj45/sfpPlus/qsfp counts', () => {
    const cfg: SwitchConfig = { rj45Count: 8, sfpPlusCount: 2, qsfpCount: 1 };
    const result = injectConfigurablePorts('dev1', switchTemplate, cfg, []);
    expect(result.filter(p => p.type === 'rj45' && p.group !== 'STACK').length).toBe(8);
    expect(result.filter(p => p.type === 'sfp-plus').length).toBe(2);
    expect(result.filter(p => p.type === 'qsfp28').length).toBe(1);
  });

  it('adds 2 stack ports when stackPorts toggled on', () => {
    const cfg: SwitchConfig = { rj45Count: 8, stackPorts: true };
    const result = injectConfigurablePorts('dev1', switchTemplate, cfg, []);
    expect(result.filter(p => p.group === 'STACK').length).toBe(2);
  });

  it('preserves connected/cableId by id across a count-preserving regeneration', () => {
    const cfg: SwitchConfig = { rj45Count: 8 };
    const first = injectConfigurablePorts('dev1', switchTemplate, cfg, []);
    const connectedId = first[0].id;
    const withConnection = first.map(p => p.id === connectedId ? { ...p, connected: true, cableId: 'cable-1' } : p);
    const second = injectConfigurablePorts('dev1', switchTemplate, cfg, withConnection);
    const reconnected = second.find(p => p.id === connectedId);
    expect(reconnected?.connected).toBe(true);
    expect(reconnected?.cableId).toBe('cable-1');
  });

  it('drops connection state for a port removed by a shrinking count', () => {
    const cfg8: SwitchConfig = { rj45Count: 8, mgmtPort: false, consolePort: false };
    const eightPorts = injectConfigurablePorts('dev1', switchTemplate, cfg8, []);
    const lastPortId = eightPorts[7].id;
    const withConnection = eightPorts.map(p => p.id === lastPortId ? { ...p, connected: true, cableId: 'cable-1' } : p);
    const cfg4: SwitchConfig = { rj45Count: 4, mgmtPort: false, consolePort: false };
    const fourPorts = injectConfigurablePorts('dev1', switchTemplate, cfg4, withConnection);
    expect(fourPorts.some(p => p.id === lastPortId)).toBe(false);
    expect(fourPorts.length).toBe(4);
  });

  it('MGMT and Console are real, separate ports (types management/console) — not a relabeled RJ45', () => {
    const cfg: SwitchConfig = { rj45Count: 8, mgmtPort: true, consolePort: true };
    const result = injectConfigurablePorts('dev1', switchTemplate, cfg, []);
    expect(result.filter(p => p.type === 'rj45' && p.group !== 'STACK').length).toBe(8);
    expect(result.filter(p => p.type === 'management').length).toBe(1);
    expect(result.filter(p => p.type === 'console').length).toBe(1);
    expect(result.length).toBe(10);
  });

  it('omits MGMT/Console ports entirely when toggled off', () => {
    const cfg: SwitchConfig = { rj45Count: 8, mgmtPort: false, consolePort: false };
    const result = injectConfigurablePorts('dev1', switchTemplate, cfg, []);
    expect(result.filter(p => p.type === 'management').length).toBe(0);
    expect(result.filter(p => p.type === 'console').length).toBe(0);
    expect(result.length).toBe(8);
  });

  it('regenerates firewall ports from MGMT/HA + rj45/sfpPlus counts', () => {
    // Console defaults on too (a real port, like Switch's) — explicitly off here to isolate
    // just MGMT/HA/rj45/sfpPlus for this assertion.
    const cfg: FirewallConfig = { mgmtPort: true, haPorts: true, rj45Count: 4, sfpPlusCount: 2, consolePort: false };
    const result = injectConfigurablePorts('dev1', firewallTemplate, cfg, []);
    expect(result.length).toBe(2 + 4 + 2);
  });

  it('omits MGMT/HA/Console ports when all toggled off', () => {
    const cfg: FirewallConfig = { mgmtPort: false, haPorts: false, consolePort: false, rj45Count: 4 };
    const result = injectConfigurablePorts('dev1', firewallTemplate, cfg, []);
    expect(result.length).toBe(4);
  });

  it('leaves ear-hole ports untouched', () => {
    const earPort = basePort('dev1-ear-1', { id: 'dev1-ear-1' });
    const result = injectConfigurablePorts('dev1', switchTemplate, { rj45Count: 4 }, [earPort]);
    expect(result.some(p => p.id === 'dev1-ear-1')).toBe(true);
  });
});

/**
 * Regression guard for the "opening properties silently rewrites port count, panel drawing goes
 * stale" bug class: for every switch/firewall catalog template, deriving default config field
 * values the exact way the properties panel does (from the template's own current ports) and
 * then regenerating must reproduce the SAME port composition — i.e. simply opening properties
 * and saving without touching any field is a true no-op, for EVERY catalog SKU, not just the
 * one or two whose real counts happen to match a hardcoded guess.
 */
describe('properties-panel default derivation is a true no-op across the whole catalog', () => {
  const switchTemplates = deviceCatalog.filter(t => t.category === 'switch');
  const firewallTemplates = deviceCatalog.filter(t => t.category === 'firewall');

  it.each(switchTemplates.map(t => t.id))('switch %s: default-derived config reproduces its own port composition', (id) => {
    const t = getTemplate(id)!;
    const seedPorts = t.ports.map(p => ({ ...p, deviceId: 'dev1', connected: false, cableId: null }));
    const before = {
      rj45: seedPorts.filter(p => p.type === 'rj45' && p.group !== 'STACK').length,
      sfp: seedPorts.filter(p => p.type === 'sfp').length,
      sfpPlus: seedPorts.filter(p => p.type === 'sfp-plus').length,
      qsfp: seedPorts.filter(p => p.type === 'qsfp28').length,
      stack: seedPorts.filter(p => p.group === 'STACK').length,
    };
    // Mirrors renderSwitchProperties' defaultRj45/defaultSfp/defaultSfpPlus/defaultQsfp derivation.
    const cfg: SwitchConfig = {
      rj45Count: before.rj45, sfpCount: before.sfp, sfpPlusCount: before.sfpPlus, qsfpCount: before.qsfp,
      stackPorts: before.stack > 0,
    };
    const after = injectConfigurablePorts('dev1', t, cfg, seedPorts);
    expect({
      rj45: after.filter(p => p.type === 'rj45' && p.group !== 'STACK').length,
      sfp: after.filter(p => p.type === 'sfp').length,
      sfpPlus: after.filter(p => p.type === 'sfp-plus').length,
      qsfp: after.filter(p => p.type === 'qsfp28').length,
      stack: after.filter(p => p.group === 'STACK').length,
    }).toEqual(before);

    // And the panel must actually draw that same live count (the original desync bug).
    const deviceData = { id: 'dev1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: after, deviceConfig: cfg as unknown as Record<string, unknown> } as DeviceData;
    const panel = renderFrontPanel('switch', t, deviceData, 350, 30, new Set(), new Set());
    const drawnRj45 = panel.querySelectorAll('[aria-label^="RJ45 port"]').length;
    expect(drawnRj45).toBe(before.rj45);
  });

  it.each(firewallTemplates.map(t => t.id))('firewall %s: default-derived config total port count is stable', (id) => {
    const t = getTemplate(id)!;
    const seedPorts = t.ports.map(p => ({ ...p, deviceId: 'dev1', connected: false, cableId: null }));
    // fw-fortigate-400f and the legacy fw-*p SKUs have no deviceConfig and no MGMT/HA zone
    // concept — injectConfigurablePorts is a no-op for them (asserted separately elsewhere);
    // only exercise the derivation round-trip for a template that actually ships a config.
    if (!t.deviceConfig) {
      expect(injectConfigurablePorts('dev1', t, undefined, seedPorts)).toBe(seedPorts);
      return;
    }
    // Mirrors renderFirewallProperties' default derivation exactly: MGMT is its own port type
    // (already excluded from the rj45 count), HA and WAN are plain rj45 jacks tagged
    // group:'HA'/'WAN', and Console is a real port too — all default from whether they're
    // actually present.
    const cfg: FirewallConfig = {
      mgmtPort: seedPorts.some(p => p.type === 'management'),
      haPorts: seedPorts.some(p => p.group === 'HA'),
      consolePort: seedPorts.some(p => p.type === 'console'),
      wanCount: seedPorts.filter(p => p.group === 'WAN').length,
      rj45Count: seedPorts.filter(p => p.type === 'rj45' && p.group !== 'HA' && p.group !== 'WAN').length,
      sfpPlusCount: seedPorts.filter(p => p.type === 'sfp-plus').length,
      sfp28Count: seedPorts.filter(p => p.type === 'sfp28').length,
      qsfpCount: seedPorts.filter(p => p.type === 'qsfp28').length,
    };
    const after = injectConfigurablePorts('dev1', t, cfg, seedPorts);
    expect(after.length).toBe(seedPorts.length);
  });
});

/**
 * True end-to-end regression: drives the REAL PropertiesPanel (real DOM, real button click, real
 * device:update emission) through the REAL stateManager, which — unlike the unit tests above —
 * actually runs prepareDevices()/injectEarPorts() first. This is what caught the real bug: ear-
 * hole ports (also typed 'rj45') were being counted by the properties panel's default-count
 * derivation, inflating rj45Count on the very first save (e.g. an 8-port switch's panel opened
 * showing "14" and clicking "+ Add Port Group" silently resized it to 14 real ports).
 */
describe('end-to-end: clicking + Add Port Group must not change the switch panel layout', () => {
  const switchTemplates = deviceCatalog.filter(t => t.category === 'switch');

  it.each(switchTemplates.map(t => t.id))('%s: default rj45/sfp counts exclude ear-hole ports and a click is a true no-op', (id) => {
    const template = getTemplate(id)!;
    const deviceId = `e2e-${id}`;
    const seedPorts = template.ports.map(p => ({ ...p, deviceId, connected: false, cableId: null }));
    stateManager.setState({ devices: [{ id: deviceId, templateId: template.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: seedPorts } as DeviceData] });

    const realRj45 = seedPorts.filter(p => p.type === 'rj45').length;
    const realSfpPlus = seedPorts.filter(p => p.type === 'sfp-plus').length;

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderSwitchProperties(stateManager.getDevice(deviceId), template, container);

    // The panel must show the device's REAL counts, not counts inflated by ear-hole ports.
    expect(Number((container.querySelector('#sw-rj45') as HTMLInputElement).value)).toBe(realRj45);
    expect(Number((container.querySelector('#sw-sfpplus') as HTMLInputElement).value)).toBe(realSfpPlus);

    const beforePanel = renderFrontPanel('switch', template, stateManager.getDevice(deviceId) ?? null, 350, 30, new Set(), new Set());
    const beforeCount = beforePanel.querySelectorAll('[aria-label^="RJ45 port"]').length;

    let capturedConfig: any = null;
    const handler = (payload: any) => { if (payload.id === deviceId) capturedConfig = payload.data.deviceConfig; };
    eventBus.on('device:update' as any, handler);
    (container.querySelector('#sw-add-portgroup') as HTMLButtonElement).click();
    eventBus.off('device:update' as any, handler);

    expect(capturedConfig).toBeTruthy();
    stateManager.setState({ devices: [{ ...stateManager.getDevice(deviceId)!, deviceConfig: capturedConfig }] });

    const afterPanel = renderFrontPanel('switch', template, stateManager.getDevice(deviceId) ?? null, 350, 30, new Set(), new Set());
    const afterCount = afterPanel.querySelectorAll('[aria-label^="RJ45 port"]').length;

    expect(afterCount).toBe(beforeCount);
    expect(afterCount).toBe(realRj45);
  });
});

describe('end-to-end: deleting a port group via the real "Delete Group" button', () => {
  it('removes exactly the clicked group, keeps the others, and survives a close+reopen cycle', () => {
    const template = getTemplate('rs-sw-8p')!;
    const deviceId = 'e2e-delete-group';
    const seedPorts = template.ports.map(p => ({ ...p, deviceId, connected: false, cableId: null }));
    stateManager.setState({ devices: [{ id: deviceId, templateId: template.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: seedPorts } as DeviceData] });

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderSwitchProperties(stateManager.getDevice(deviceId), template, container);

    let capturedConfig: any = null;
    const handler = (payload: any) => {
      if (payload.id !== deviceId) return;
      capturedConfig = payload.data.deviceConfig;
      stateManager.setState({ devices: [{ ...stateManager.getDevice(deviceId)!, deviceConfig: capturedConfig }] });
    };
    eventBus.on('device:update' as any, handler);

    (container.querySelector('#sw-add-portgroup') as HTMLButtonElement).click();
    (container.querySelector('#sw-add-portgroup') as HTMLButtonElement).click();
    (container.querySelector('#sw-add-portgroup') as HTMLButtonElement).click();
    expect(capturedConfig.portGroups.map((g: any) => g.name)).toEqual(['VLAN1', 'VLAN2', 'VLAN3']);

    // Close and reopen the panel (fresh render from the persisted device) before deleting.
    (panel as any).renderSwitchProperties(stateManager.getDevice(deviceId), template, container);
    const cards = container.querySelectorAll('#sw-portgroup-rows > div');
    expect(cards.length).toBe(3);

    const findDeleteButton = (card: Element) => Array.from(card.querySelectorAll('button')).find(b => b.textContent?.includes('Delete'));
    const middleDeleteBtn = findDeleteButton(cards[1]);
    expect(middleDeleteBtn).toBeTruthy();
    middleDeleteBtn!.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

    expect(capturedConfig.portGroups.map((g: any) => g.name)).toEqual(['VLAN1', 'VLAN3']);
    expect(container.querySelectorAll('#sw-portgroup-rows > div').length).toBe(2);

    eventBus.off('device:update' as any, handler);
  });
});

describe('end-to-end: firewall Properties panel — WAN count default + Port Groups add/remove', () => {
  it('derives WAN count from live ports and a click on + Add Port Group is a true no-op on the panel', () => {
    const template = getTemplate('fw-enterprise')!;
    const deviceId = 'e2e-fw-wan';
    const cfg: FirewallConfig = { wanCount: 2, rj45Count: 8, sfpPlusCount: 2, mgmtPort: true, haPorts: true, consolePort: true };
    const seedPorts = injectConfigurablePorts(deviceId, template, cfg, []);
    stateManager.setState({ devices: [{ id: deviceId, templateId: template.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: seedPorts, deviceConfig: cfg } as DeviceData] });

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderFirewallProperties(stateManager.getDevice(deviceId), template, container);

    // The WAN Count field must reflect the device's real live WAN port count.
    expect(Number((container.querySelector('#fw-wan') as HTMLInputElement).value)).toBe(2);
    expect(Number((container.querySelector('#fw-rj45') as HTMLInputElement).value)).toBe(8);

    const beforePanel = renderFrontPanel('firewall', template, stateManager.getDevice(deviceId) ?? null, 350, 30, new Set(), new Set());
    const beforeWan = beforePanel.querySelectorAll('[aria-label^="WAN port"]').length;
    const beforeRj45 = beforePanel.querySelectorAll('[aria-label^="RJ45 port"]').length;

    let capturedConfig: any = null;
    const handler = (payload: any) => { if (payload.id === deviceId) capturedConfig = payload.data.deviceConfig; };
    eventBus.on('device:update' as any, handler);
    (container.querySelector('#fw-add-portgroup') as HTMLButtonElement).click();
    eventBus.off('device:update' as any, handler);

    expect(capturedConfig).toBeTruthy();
    expect(capturedConfig.wanCount).toBe(2);
    stateManager.setState({ devices: [{ ...stateManager.getDevice(deviceId)!, deviceConfig: capturedConfig }] });

    const afterPanel = renderFrontPanel('firewall', template, stateManager.getDevice(deviceId) ?? null, 350, 30, new Set(), new Set());
    expect(afterPanel.querySelectorAll('[aria-label^="WAN port"]').length).toBe(beforeWan);
    expect(afterPanel.querySelectorAll('[aria-label^="RJ45 port"]').length).toBe(beforeRj45);
  });

  it('removes exactly the clicked group via the real "Delete Group" button, keeps the others', () => {
    const template = getTemplate('fw-enterprise')!;
    const deviceId = 'e2e-fw-delete-group';
    const cfg: FirewallConfig = { rj45Count: 8, sfpPlusCount: 2, mgmtPort: true, haPorts: true, consolePort: true };
    const seedPorts = injectConfigurablePorts(deviceId, template, cfg, []);
    stateManager.setState({ devices: [{ id: deviceId, templateId: template.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: seedPorts, deviceConfig: cfg } as DeviceData] });

    const container = document.createElement('div');
    const panel = new PropertiesPanel(container);
    (panel as any).renderFirewallProperties(stateManager.getDevice(deviceId), template, container);

    let capturedConfig: any = null;
    const handler = (payload: any) => {
      if (payload.id !== deviceId) return;
      capturedConfig = payload.data.deviceConfig;
      stateManager.setState({ devices: [{ ...stateManager.getDevice(deviceId)!, deviceConfig: capturedConfig }] });
    };
    eventBus.on('device:update' as any, handler);

    (container.querySelector('#fw-add-portgroup') as HTMLButtonElement).click();
    (container.querySelector('#fw-add-portgroup') as HTMLButtonElement).click();
    expect(capturedConfig.portGroups.map((g: any) => g.name)).toEqual(['LAN-GRP1', 'LAN-GRP2']);

    (panel as any).renderFirewallProperties(stateManager.getDevice(deviceId), template, container);
    const cards = container.querySelectorAll('#fw-portgroup-rows > div');
    expect(cards.length).toBe(2);

    const findDeleteButton = (card: Element) => Array.from(card.querySelectorAll('button')).find(b => b.textContent?.includes('Delete'));
    const firstDeleteBtn = findDeleteButton(cards[0]);
    expect(firstDeleteBtn).toBeTruthy();
    firstDeleteBtn!.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

    expect(capturedConfig.portGroups.map((g: any) => g.name)).toEqual(['LAN-GRP2']);
    expect(container.querySelectorAll('#fw-portgroup-rows > div').length).toBe(1);

    eventBus.off('device:update' as any, handler);
  });
});
