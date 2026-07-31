import { describe, it, expect } from 'vitest';
import { renderFrontPanel } from '../renderers/panel-renderer';
import { getTemplate } from '../library/device-catalog';
import { switchPorts } from '../renderers/switch-renderer';
import { firewallPorts } from '../renderers/firewall-renderer';

describe('renderFrontPanel', () => {
  const W = 350;

  it('returns an SVGGElement for rs-sw-24p', () => {
    const t = getTemplate('rs-sw-24p')!;
    const result = renderFrontPanel('switch', t, null, W, 30);
    expect(result).toBeDefined();
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for rs-sw-48p', () => {
    const t = getTemplate('rs-sw-48p')!;
    const result = renderFrontPanel('switch', t, null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for server-2u', () => {
    const t = getTemplate('server-2u')!;
    const result = renderFrontPanel('server', t, null, W, 60);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('handles null template gracefully (renders generic dark rect)', () => {
    const result = renderFrontPanel('server', null, null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
    const rect = result.querySelector('rect');
    expect(rect).toBeTruthy();
  });

  it('returns SVGGElement for every category', () => {
    const categories = ['server','switch','router','firewall','storage','patch-panel','pdu','ups','blank-panel','cable-manager','cooling','console'] as const;
    for (const cat of categories) {
      const result = renderFrontPanel(cat, null, null, W, 30);
      expect(result.tagName.toLowerCase()).toBe('g');
    }
  });

  it('renders sw-enterprise with a deviceConfig without throwing', () => {
    const t = getTemplate('sw-enterprise')!;
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: t.ports.map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null })), deviceConfig: t.deviceConfig } as any;
    const result = renderFrontPanel('switch', t, deviceData, W, 30, new Set(), new Set());
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('renders fw-enterprise with a deviceConfig without throwing', () => {
    const t = getTemplate('fw-enterprise')!;
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: t.ports.map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null })), deviceConfig: t.deviceConfig } as any;
    const result = renderFrontPanel('firewall', t, deviceData, W, 30, new Set(), new Set());
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('renders fw-fortigate-400f with no deviceConfig via the legacy path', () => {
    const t = getTemplate('fw-fortigate-400f')!;
    const result = renderFrontPanel('firewall', t, null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('firewall: MGMT/HA/Console are separate real ports, all matching the RJ45 jack aspect ratio', () => {
    const t = getTemplate('fw-enterprise')!;
    const cfg = { vendor: 'generic', rj45Count: 8, sfpPlusCount: 2, mgmtPort: true, haPorts: true, consolePort: true };
    const livePorts = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('firewall', t, deviceData, W, 30, new Set(), new Set());

    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    expect(rj45Ports.length).toBe(8);

    const mgmtEl = result.querySelector('[aria-label="MGMT port"]');
    const haEl = result.querySelector('[aria-label="HA port"]');
    const consoleEl = result.querySelector('[aria-label="Console port"]');
    expect(mgmtEl).toBeTruthy();
    expect(haEl).toBeTruthy();
    expect(consoleEl).toBeTruthy();

    // Same footprint/aspect ratio (30×40) as a regular Ethernet jack — the whole point of
    // rebuilding this renderer on the Switch engine.
    const rjUse = rj45Ports[0].querySelector('use')!;
    for (const portEl of [mgmtEl, haEl, consoleEl]) {
      const use = portEl!.querySelector('use')!;
      expect(use.getAttribute('width')).toBe(rjUse.getAttribute('width'));
      expect(use.getAttribute('height')).toBe(rjUse.getAttribute('height'));
    }
  });

  it('firewall: changing RJ45 count does not change chassis tone/colors, only layout', () => {
    const t = getTemplate('fw-enterprise')!;
    const buildDevice = (rj45Count: number) => {
      const cfg = { vendor: 'paloalto', accentColor: undefined, rj45Count, sfpPlusCount: 2, mgmtPort: true, haPorts: true, consolePort: true };
      const ports = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
      return { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports, deviceConfig: cfg } as any;
    };
    const stopColors = (panel: SVGGElement) =>
      Array.from(panel.querySelectorAll('linearGradient[id^="chassis-"] stop')).map(s => s.getAttribute('stop-color'));

    const small = renderFrontPanel('firewall', t, buildDevice(4), W, 30, new Set(), new Set());
    const large = renderFrontPanel('firewall', t, buildDevice(24), W, 30, new Set(), new Set());

    expect(stopColors(small)).toEqual(stopColors(large));
    expect(stopColors(small).length).toBeGreaterThan(0);

    // Brand accent text colour (vendor-driven) must also be identical regardless of port count.
    const brandTextColor = (panel: SVGGElement) => Array.from(panel.querySelectorAll('text')).find(el => el.getAttribute('font-weight') === '700' && el.getAttribute('fill'))?.getAttribute('fill');
    expect(brandTextColor(small)).toBe(brandTextColor(large));
  });

  it('a custom Panel Colour applies to the rack-mount blades too, not just the chassis', () => {
    const t = getTemplate('fw-enterprise')!;
    const cfg = { vendor: 'generic', rj45Count: 8, sfpPlusCount: 2, panelColor: '#ff00aa' };
    const ports = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports, deviceConfig: cfg } as any;
    const result = renderFrontPanel('firewall', t, deviceData, 350, 30, new Set(), new Set());
    const fills = Array.from(result.querySelectorAll('rect')).map(r => r.getAttribute('fill'));
    // The chassis rect and at least one blade rect must both use the custom colour directly.
    expect(fills.filter(f => f === '#ff00aa').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a switch with a custom vendor, layer badge, and port range groups without throwing', () => {
    const t = getTemplate('sw-enterprise')!;
    const cfg = {
      ...t.deviceConfig, vendor: 'custom', layer: 'L3',
      portGroups: [{ name: 'VLAN10', startPort: 1, endPort: 4, color: '#ff8800' }],
    };
    const ports = t.ports.map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: 'SN123', description: '', ports, deviceConfig: cfg } as any;
    const result = renderFrontPanel('switch', t, deviceData, W, 30, new Set(), new Set());
    expect(result.tagName.toLowerCase()).toBe('g');
    const texts = Array.from(result.querySelectorAll('text')).map(el => el.textContent);
    expect(texts).toContain('L3');
    const groupPort = result.querySelector('[aria-label*="VLAN10"]');
    expect(groupPort).toBeTruthy();
  });

  it('draws the live device port count, not the stale catalog template count', () => {
    // rs-sw-4p's template is frozen at 4 RJ45 + 2 SFP+ — simulate a config-driven device that
    // has been resized to 8 RJ45 + 0 SFP+ (injectConfigurablePorts already regenerated its real
    // ports; the panel must draw THAT layout, not fall back to the template's original 4+2).
    const t = getTemplate('rs-sw-4p')!;
    const liveCfg = { vendor: 'generic', rj45Count: 8, sfpCount: 0, sfpPlusCount: 0, qsfpCount: 0 };
    const livePorts = switchPorts(8, 0, 1, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: liveCfg } as any;
    const result = renderFrontPanel('switch', t, deviceData, W, 30, new Set(), new Set());
    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    expect(rj45Ports.length).toBe(8);
  });

  it('MGMT and Console are separate ports, not port 1 relabeled, and match RJ45 aspect ratio', () => {
    const t = getTemplate('rs-sw-8p')!;
    const cfg = { vendor: 'generic', rj45Count: 8, sfpPlusCount: 2, mgmtPort: true, consolePort: true };
    const livePorts = switchPorts(8, 2, 1, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('switch', t, deviceData, W, 30, new Set(), new Set());

    // Regular RJ45 ports must all be plainly numbered — no "MGMT" mixed into port 1.
    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    expect(rj45Ports.length).toBe(8);
    expect(result.querySelector('[aria-label="RJ45 port MGMT"]')).toBeFalsy();
    expect(rj45Ports.some(p => p.querySelector('text')?.textContent === 'MGMT')).toBe(false);

    // MGMT and Console are their own distinct, separately-connectable ports.
    const mgmtEl = result.querySelector('[aria-label="MGMT port"]');
    const consoleEl = result.querySelector('[aria-label="Console port"]');
    expect(mgmtEl).toBeTruthy();
    expect(consoleEl).toBeTruthy();

    // Same RJ_W×RJ_H (30×40) footprint/aspect ratio as a regular Ethernet jack.
    const rjUse = rj45Ports[0].querySelector('use')!;
    const mgmtUse = mgmtEl!.querySelector('use')!;
    const consoleUse = consoleEl!.querySelector('use')!;
    expect(mgmtUse.getAttribute('width')).toBe(rjUse.getAttribute('width'));
    expect(mgmtUse.getAttribute('height')).toBe(rjUse.getAttribute('height'));
    expect(consoleUse.getAttribute('width')).toBe(rjUse.getAttribute('width'));
    expect(consoleUse.getAttribute('height')).toBe(rjUse.getAttribute('height'));
  });

  it('scopes the global PoE toggle to poeStartPort..poeEndPort, not every port', () => {
    const t = getTemplate('rs-sw-8p')!;
    const cfg = { vendor: 'generic', rj45Count: 8, poe: true, poeStartPort: 1, poeEndPort: 4 };
    const livePorts = switchPorts(8, 0, 1, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('switch', t, deviceData, W, 30, new Set(), new Set());

    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    expect(rj45Ports.length).toBe(8);
    const poeCount = rj45Ports.filter(p => p.querySelector('.poe-badge')).length;
    expect(poeCount).toBe(4);
    // Ports 1-4 (the first 4 in document order) should be the ones with PoE.
    expect(rj45Ports.slice(0, 4).every(p => p.querySelector('.poe-badge'))).toBe(true);
    expect(rj45Ports.slice(4).some(p => p.querySelector('.poe-badge'))).toBe(false);
  });

  it('a port group\'s own PoE flag applies regardless of the global PoE range', () => {
    const t = getTemplate('rs-sw-8p')!;
    const cfg = {
      vendor: 'generic', rj45Count: 8, poe: false,
      portGroups: [{ name: 'IoT', startPort: 6, endPort: 8, color: '#ff8800', poe: true }],
    };
    const livePorts = switchPorts(8, 0, 1, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('switch', t, deviceData, W, 30, new Set(), new Set());

    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    const poeCount = rj45Ports.filter(p => p.querySelector('.poe-badge')).length;
    expect(poeCount).toBe(3);
  });

  it('firewall: custom Font Colour / Font Mute Colour override every label/status text, not just some', () => {
    const t = getTemplate('fw-enterprise')!;
    const cfg = {
      vendor: 'generic', wanCount: 2, rj45Count: 8, sfpPlusCount: 2,
      mgmtPort: true, haPorts: true, consolePort: true, usbPort: true,
      fontColor: '#123456', fontMuteColor: '#654321',
    };
    const livePorts = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('firewall', t, deviceData, W, 30, new Set(), new Set());

    // Port number/name labels (HA, WAN1, RJ45 #s, Console) use the primary Font Colour.
    const texts = Array.from(result.querySelectorAll('text'));
    const haLabel = texts.find(el => el.textContent === 'HA');
    const wanLabel = texts.find(el => el.textContent === 'WAN1');
    const rjLabel = texts.find(el => el.textContent === '1');
    const consoleLabel = texts.find(el => el.textContent === 'CONSOLE');
    expect(haLabel?.getAttribute('fill')).toBe('#123456');
    expect(wanLabel?.getAttribute('fill')).toBe('#123456');
    expect(rjLabel?.getAttribute('fill')).toBe('#123456');
    expect(consoleLabel?.getAttribute('fill')).toBe('#123456');

    // Secondary/muted text (UPLINK zone caption, model line, USB-C label) uses Font Mute Colour.
    const uplinkCaption = texts.find(el => el.textContent === 'UPLINK');
    const usbLabel = texts.find(el => el.textContent === 'USB-C');
    expect(uplinkCaption?.getAttribute('fill')).toBe('#654321');
    expect(usbLabel?.getAttribute('fill')).toBe('#654321');

    // Nothing should still be emitting the old hardcoded vendor-tone greys once overridden.
    const fills = texts.map(el => el.getAttribute('fill'));
    expect(fills).not.toContain('#8a9099');
    expect(fills).not.toContain('#5b636a');
    expect(fills).not.toContain('#aeb6bd');
    expect(fills).not.toContain('#8b939a');
  });

  it('firewall: WAN ports render as their own zone, separate from the numbered LAN range', () => {
    const t = getTemplate('fw-enterprise')!;
    const cfg = { vendor: 'generic', wanCount: 3, rj45Count: 8, sfpPlusCount: 2, mgmtPort: true, haPorts: true, consolePort: true };
    const livePorts = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('firewall', t, deviceData, W, 30, new Set(), new Set());

    const wanPorts = Array.from(result.querySelectorAll('[aria-label^="WAN port"]'));
    expect(wanPorts.length).toBe(3);
    // Port-number labels are drawn as siblings (not children) of the port's <g>, matching the
    // switch engine's layout — collect them separately and confirm WAN1/WAN2/WAN3 are all present.
    const wanLabels = Array.from(result.querySelectorAll('text')).map(el => el.textContent).filter(t => /^WAN\d+$/.test(t ?? ''));
    expect(wanLabels.sort()).toEqual(['WAN1', 'WAN2', 'WAN3']);

    // The LAN (plain RJ45) range must not include the WAN ports.
    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    expect(rj45Ports.length).toBe(8);

    // Same jack footprint as a regular RJ45 port.
    const rjUse = rj45Ports[0].querySelector('use')!;
    const wanUse = wanPorts[0].querySelector('use')!;
    expect(wanUse.getAttribute('width')).toBe(rjUse.getAttribute('width'));
    expect(wanUse.getAttribute('height')).toBe(rjUse.getAttribute('height'));

    // No separate "WAN" zone-caption text — each port already carries its own WAN1/WAN2/...
    // label, so a floating "WAN" group label would be redundant (unlike UPLINK, whose ports are
    // just numbered and do need a caption).
    const texts = Array.from(result.querySelectorAll('text')).map(el => el.textContent);
    expect(texts).not.toContain('WAN');
  });

  it('firewall: rj45Count/wanCount live-derivation excludes HA/WAN/ear ports (properties-panel parity)', () => {
    const cfg = { vendor: 'generic', wanCount: 2, rj45Count: 6, sfpPlusCount: 0, mgmtPort: true, haPorts: true, consolePort: true };
    const ports = firewallPorts(cfg as any, 'd1-');
    const nonEar = ports.filter(p => !p.id.includes('-ear-'));
    const derivedRj45 = nonEar.filter(p => p.type === 'rj45' && p.group !== 'HA' && p.group !== 'WAN').length;
    const derivedWan = nonEar.filter(p => p.group === 'WAN').length;
    expect(derivedRj45).toBe(6);
    expect(derivedWan).toBe(2);
  });

  it('firewall: supports named/coloured port range groups on the LAN block, same as switch VLANs', () => {
    const t = getTemplate('fw-enterprise')!;
    const cfg = {
      vendor: 'generic', rj45Count: 8, sfpPlusCount: 2,
      portGroups: [{ name: 'DMZ', startPort: 1, endPort: 4, color: '#ff8800' }],
    };
    const livePorts = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('firewall', t, deviceData, W, 30, new Set(), new Set());

    const groupPort = result.querySelector('[aria-label*="DMZ"]');
    expect(groupPort).toBeTruthy();
    expect(result.querySelectorAll('[aria-label*="DMZ"]').length).toBe(4);
  });

  it('firewall: up to 12 ports (6 columns × 2 rows) share a block before jumping to a new block with a gap', () => {
    const t = getTemplate('fw-enterprise')!;
    const cfg = { vendor: 'generic', rj45Count: 24, sfpPlusCount: 0, mgmtPort: false, haPorts: false, consolePort: false, usbPort: false };
    const livePorts = firewallPorts(cfg as any, 'd1-').map(p => ({ ...p, deviceId: 'd1', connected: false, cableId: null }));
    const deviceData = { id: 'd1', templateId: t.id, rackId: 'r1', startUnit: 1, name: '', hostname: '', managementIp: '', serialNumber: '', description: '', ports: livePorts, deviceConfig: cfg } as any;
    const result = renderFrontPanel('firewall', t, deviceData, W, 30, new Set(), new Set());

    const rj45Ports = Array.from(result.querySelectorAll('[aria-label^="RJ45 port"]'));
    expect(rj45Ports.length).toBe(24);
    const xOf = (el: Element) => {
      const m = /translate\(([-\d.]+)/.exec(el.getAttribute('transform') ?? '');
      return m ? parseFloat(m[1]) : NaN;
    };
    // Ports are stacked pairs (odd top / even bottom): port 1 and port 2 share a column (same x).
    expect(xOf(rj45Ports[0])).toBeCloseTo(xOf(rj45Ports[1]), 5);
    // 12 ports = 6 columns fill the first block; port 13 (index 12) starts a new block — its x
    // must jump by more than one column-pitch's worth (i.e. there's a real block gap, not a
    // uniform column stride all the way through).
    const columnPitch = xOf(rj45Ports[2]) - xOf(rj45Ports[0]);
    const jumpAt13 = xOf(rj45Ports[24 - 12]) - xOf(rj45Ports[24 - 12 - 2]);
    expect(jumpAt13).toBeGreaterThan(columnPitch);
  });
});
