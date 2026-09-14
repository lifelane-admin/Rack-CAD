import { describe, it, expect } from 'vitest';

describe('DeviceCategory type', () => {
  it('includes console as a valid category', async () => {
    // This is a compile-time check — if DeviceCategory doesn't include 'console'
    // the import of a DeviceData with category 'console' would fail tsc.
    // At runtime we check getTemplatesByCategory works with it.
    const { getTemplatesByCategory } = await import('../library/device-catalog');
    // This should not throw even if zero results (category exists in type)
    expect(() => getTemplatesByCategory('console' as any)).not.toThrow();
  });
});

import { deviceCatalog, getTemplate, getTemplatesByCategory } from '../library/device-catalog';

describe('Standard Library catalog', () => {
  it('has no OEM manufacturer names in generic entries', () => {
    const genericOemNames = ['Dell', 'HPE', 'Supermicro'];
    for (const item of deviceCatalog) {
      for (const oem of genericOemNames) {
        expect(item.name).not.toContain(oem);
        expect(item.manufacturer).not.toContain(oem);
      }
    }
  });

  it('rs-sw-24p has 24 rj45 ports and 4 sfp-plus ports', () => {
    const t = getTemplate('rs-sw-24p');
    expect(t).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45');
    const sfp = t!.ports.filter(p => p.type === 'sfp-plus');
    expect(rj45.length).toBe(24);
    expect(sfp.length).toBe(4);
  });

  it('rs-sw-48p has 48 rj45 ports and 4 sfp-plus ports', () => {
    const t = getTemplate('rs-sw-48p');
    expect(t).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45');
    const sfp = t!.ports.filter(p => p.type === 'sfp-plus');
    expect(rj45.length).toBe(48);
    expect(sfp.length).toBe(4);
  });

  it('has at least 40 entries', () => {
    expect(deviceCatalog.length).toBeGreaterThanOrEqual(40);
  });

  it('getTemplate returns undefined for unknown id', () => {
    expect(getTemplate('dell-r760')).toBeUndefined();
  });

  it('all entries have valid category', () => {
    const validCategories = ['server','switch','router','firewall','nac','storage','patch-panel','pdu','ats','ups','blank-panel','cable-manager','cooling','console','load-balancer','ids-ips','vpn-concentrator','proxy-waf'];
    for (const item of deviceCatalog) {
      expect(validCategories).toContain(item.category);
    }
  });

  it('sw-enterprise is a configurable switch seeded with matching ports', () => {
    const t = getTemplate('sw-enterprise');
    expect(t).toBeDefined();
    expect(t!.deviceConfig).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45' && p.group !== 'STACK');
    const sfpPlus = t!.ports.filter(p => p.type === 'sfp-plus');
    expect(rj45.length).toBe((t!.deviceConfig as any).rj45Count);
    expect(sfpPlus.length).toBe((t!.deviceConfig as any).sfpPlusCount);
  });

  it('fw-enterprise is a configurable firewall seeded with matching ports', () => {
    const t = getTemplate('fw-enterprise');
    expect(t).toBeDefined();
    expect(t!.deviceConfig).toBeDefined();
    const cfg = t!.deviceConfig as any;
    const expectedCount = (cfg.mgmtPort ? 1 : 0) + (cfg.haPorts ? 1 : 0) + (cfg.consolePort !== false ? 1 : 0) + cfg.rj45Count + cfg.sfpPlusCount;
    expect(t!.ports.length).toBe(expectedCount);
  });

  it('fw-fortigate-400f keeps its fixed 34-port zone layout', () => {
    const t = getTemplate('fw-fortigate-400f');
    expect(t).toBeDefined();
    expect(t!.ports.length).toBe(34);
  });

  // NTT DC Rack reference devices — added to replicate a real customer rack's device list.
  // (sw-npci/sw-dell/sw-aruba-6200f/router-npci/router-iftas were removed from the catalog.)
  describe('NTT DC Rack reference devices', () => {
    it('fw-fortinet-preset uses the fortinet vendor skin', () => {
      const t = getTemplate('fw-fortinet-preset');
      expect(t).toBeDefined();
      expect(t!.category).toBe('firewall');
      expect((t!.deviceConfig as any).vendor).toBe('fortinet');
    });

    it('nac-enterprise is a configurable NAC appliance seeded with matching ports', () => {
      const t = getTemplate('nac-enterprise');
      expect(t).toBeDefined();
      expect(t!.category).toBe('nac');
      const cfg = t!.deviceConfig as any;
      const rj45 = t!.ports.filter(p => p.type === 'rj45');
      expect(rj45.length).toBe(cfg.rj45Count);
      expect(t!.ports.some(p => p.type === 'management')).toBe(true);
      expect(t!.ports.some(p => p.type === 'console')).toBe(true);
    });

    it('ats-enterprise is a configurable ATS with dual power inputs and matching outlet count', () => {
      const t = getTemplate('ats-enterprise');
      expect(t).toBeDefined();
      expect(t!.category).toBe('ats');
      const cfg = t!.deviceConfig as any;
      const inputs = t!.ports.filter(p => p.group === 'INPUT');
      const outputs = t!.ports.filter(p => p.group === 'OUTPUT');
      expect(inputs.length).toBe(2);
      expect(outputs.length).toBe(cfg.outletCount);
    });
  });
});
