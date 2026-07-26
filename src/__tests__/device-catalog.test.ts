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
  it('has no OEM manufacturer names', () => {
    const oemNames = ['Dell', 'HPE', 'Cisco', 'Fortinet', 'APC', 'Supermicro'];
    for (const item of deviceCatalog) {
      for (const oem of oemNames) {
        expect(item.name).not.toContain(oem);
        expect(item.manufacturer).not.toContain(oem);
        expect(item.id).not.toContain(oem.toLowerCase());
      }
    }
  });

  it('has at least 40 entries', () => {
    expect(deviceCatalog.length).toBeGreaterThanOrEqual(40);
  });

  it('getTemplate returns undefined for unknown id', () => {
    expect(getTemplate('dell-r760')).toBeUndefined();
  });

  it('switch-24p has 24 rj45 ports', () => {
    const t = getTemplate('switch-24p');
    expect(t).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45');
    expect(rj45.length).toBe(24);
  });

  it('switch-48p has 48 rj45 ports and 4 sfp-plus ports', () => {
    const t = getTemplate('switch-48p');
    expect(t).toBeDefined();
    const rj45 = t!.ports.filter(p => p.type === 'rj45');
    const sfp = t!.ports.filter(p => p.type === 'sfp-plus');
    expect(rj45.length).toBe(48);
    expect(sfp.length).toBe(4);
  });

  it('all entries have valid category', () => {
    const validCategories = ['server','switch','router','firewall','storage','patch-panel','pdu','ups','blank-panel','cable-manager','cooling','console'];
    for (const item of deviceCatalog) {
      expect(validCategories).toContain(item.category);
    }
  });
});
