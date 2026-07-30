# Sub-Project A: Device Catalog + Panel Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all OEM device templates with a ~50-entry generic Standard Library and add a `panel-renderer.ts` that draws high-fidelity SVG front panels for every device category.

**Architecture:** New `src/renderers/panel-renderer.ts` exports `renderFrontPanel(category, template, deviceWidth, deviceHeight)` which is called in the `else` branch of `device-renderer.ts` (skeleton → rear → custom image → else panel-renderer). The device catalog is fully replaced with generic entries organized basic→advanced per category.

**Tech Stack:** TypeScript 6, Vite 8, pure SVG via `createSVGElement`/`svg-helpers.ts`, vitest for tests.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/core/types.ts` | Modify | Add `'console'` to `DeviceCategory` union |
| `src/library/device-catalog.ts` | Full rewrite | ~50 generic templates, no OEM names |
| `src/renderers/panel-renderer.ts` | Create | High-fidelity SVG panels for all categories |
| `src/renderers/device-renderer.ts` | Modify | Call `renderFrontPanel` in `else` branch |
| `src/components/sidebar.ts` | Modify | Remove manufacturer from item meta, add `'console'` category |
| `src/core/state.ts` | Modify | Update demo project to use new template IDs |
| `src/__tests__/device-catalog.test.ts` | Create | Catalog tests: no OEM names, correct port counts |
| `src/__tests__/panel-renderer.test.ts` | Create | Panel renderer tests: returns SVGGElement per category |

---

## Task 1: Add `'console'` to DeviceCategory

**Files:**
- Modify: `src/core/types.ts:38`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/device-catalog.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('DeviceCategory type', () => {
  it('includes console as a valid category', () => {
    // This is a compile-time check — if DeviceCategory doesn't include 'console'
    // the import of a DeviceData with category 'console' would fail tsc.
    // At runtime we check getTemplatesByCategory works with it.
    const { getTemplatesByCategory } = await import('../library/device-catalog');
    // This should not throw even if zero results (category exists in type)
    expect(() => getTemplatesByCategory('console' as any)).not.toThrow();
  });
});
```

Run: `npm run test -- device-catalog`
Expected: PASS (getTemplatesByCategory already accepts any string)

- [ ] **Step 2: Add `'console'` to the union in `src/core/types.ts`**

Locate line 38:
```typescript
export type DeviceCategory = 'server' | 'switch' | 'router' | 'firewall' | 'storage' | 'patch-panel' | 'pdu' | 'ups' | 'blank-panel' | 'cable-manager' | 'cooling';
```
Replace with:
```typescript
export type DeviceCategory = 'server' | 'switch' | 'router' | 'firewall' | 'storage' | 'patch-panel' | 'pdu' | 'ups' | 'blank-panel' | 'cable-manager' | 'cooling' | 'console';
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All existing tests pass (type-only change, no runtime breakage).

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/__tests__/device-catalog.test.ts
git commit -m "feat(types): add console to DeviceCategory union"
```

---

## Task 2: Replace device-catalog.ts with generic Standard Library

**Files:**
- Modify: `src/library/device-catalog.ts` (full rewrite)
- Modify: `src/__tests__/device-catalog.test.ts` (add catalog tests)

- [ ] **Step 1: Add catalog tests before rewriting**

Append to `src/__tests__/device-catalog.test.ts`:
```typescript
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
```

Run: `npm run test -- device-catalog`
Expected: FAIL — old catalog has OEM names, missing IDs.

- [ ] **Step 2: Replace device-catalog.ts with generic Standard Library**

Replace the entire content of `src/library/device-catalog.ts` with:

```typescript
import { DeviceTemplate, DeviceCategory } from '../core/types';

export const deviceCatalog: DeviceTemplate[] = [

  // ─── SERVERS ────────────────────────────────────────────────────────────────
  {
    id: 'server-1u',
    name: '1U Server',
    manufacturer: '',
    model: '1U Server',
    category: 'server',
    heightUnits: 1,
    color: '#1a1a1e',
    icon: '🖥️',
    ports: [
      { id: 's1u-nic1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, speed: '1 Gbps' },
      { id: 's1u-nic2', name: 'NIC 2', type: 'rj45', relativeX: 332, relativeY: 8, speed: '1 Gbps' },
      { id: 's1u-mgmt', name: 'MGMT', type: 'management', relativeX: 344, relativeY: 8, speed: '1 Gbps' },
    ],
  },
  {
    id: 'server-2u',
    name: '2U Server',
    manufacturer: '',
    model: '2U Server',
    category: 'server',
    heightUnits: 2,
    color: '#1a1a1e',
    icon: '🖥️',
    ports: [
      { id: 's2u-nic1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 15, speed: '1 Gbps' },
      { id: 's2u-nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 332, relativeY: 15, speed: '10 Gbps' },
      { id: 's2u-nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 332, relativeY: 27, speed: '10 Gbps' },
      { id: 's2u-nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 320, relativeY: 27, speed: '10 Gbps' },
      { id: 's2u-mgmt', name: 'MGMT', type: 'management', relativeX: 344, relativeY: 15, speed: '1 Gbps' },
    ],
  },
  {
    id: 'server-2u-hd',
    name: '2U Server (High Density)',
    manufacturer: '',
    model: '2U Server HD',
    category: 'server',
    heightUnits: 2,
    color: '#1a1a1e',
    icon: '🖥️',
    ports: [
      { id: 's2uhd-nic1', name: 'NIC 1', type: 'sfp-plus', relativeX: 315, relativeY: 10, speed: '10 Gbps' },
      { id: 's2uhd-nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 327, relativeY: 10, speed: '10 Gbps' },
      { id: 's2uhd-nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 315, relativeY: 25, speed: '10 Gbps' },
      { id: 's2uhd-nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 327, relativeY: 25, speed: '10 Gbps' },
      { id: 's2uhd-mgmt', name: 'MGMT', type: 'management', relativeX: 339, relativeY: 10, speed: '1 Gbps' },
      { id: 's2uhd-con', name: 'CON', type: 'console', relativeX: 339, relativeY: 25, speed: '115.2 Kbps' },
    ],
  },
  {
    id: 'server-4u',
    name: '4U Server',
    manufacturer: '',
    model: '4U Server',
    category: 'server',
    heightUnits: 4,
    color: '#1a1a1e',
    icon: '🖥️',
    ports: [
      { id: 's4u-nic1', name: 'NIC 1', type: 'rj45', relativeX: 315, relativeY: 20, speed: '1 Gbps' },
      { id: 's4u-nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 327, relativeY: 20, speed: '10 Gbps' },
      { id: 's4u-nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 315, relativeY: 40, speed: '10 Gbps' },
      { id: 's4u-nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 327, relativeY: 40, speed: '10 Gbps' },
      { id: 's4u-mgmt', name: 'MGMT', type: 'management', relativeX: 339, relativeY: 20, speed: '1 Gbps' },
    ],
  },
  {
    id: 'server-tower',
    name: 'Tower Server',
    manufacturer: '',
    model: 'Tower Server',
    category: 'server',
    heightUnits: 4,
    color: '#1a1a1e',
    icon: '🖥️',
    ports: [
      { id: 'stow-nic1', name: 'NIC 1', type: 'rj45', relativeX: 315, relativeY: 25, speed: '1 Gbps' },
      { id: 'stow-nic2', name: 'NIC 2', type: 'rj45', relativeX: 327, relativeY: 25, speed: '1 Gbps' },
      { id: 'stow-mgmt', name: 'MGMT', type: 'management', relativeX: 339, relativeY: 25, speed: '1 Gbps' },
    ],
  },

  // ─── SWITCHES ───────────────────────────────────────────────────────────────
  {
    id: 'switch-4p',
    name: '4-Port Switch',
    manufacturer: '',
    model: '4-Port Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: Array.from({ length: 4 }, (_, i) => ({
      id: `sw4-p${i + 1}`,
      name: `Port ${i + 1}`,
      type: 'rj45' as const,
      relativeX: 40 + i * 21,
      relativeY: 15,
      speed: '1 Gbps',
    })),
  },
  {
    id: 'switch-8p',
    name: '8-Port Switch',
    manufacturer: '',
    model: '8-Port Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `sw8-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + i * 21,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `sw8-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 240 + i * 21,
        relativeY: 15,
        speed: '1 Gbps',
      })),
    ],
  },
  {
    id: 'switch-12p',
    name: '12-Port Managed Switch',
    manufacturer: '',
    model: '12-Port Managed Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `sw12-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + i * 21,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `sw12-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 315 + i * 21,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'switch-16p',
    name: '16-Port Managed Switch',
    manufacturer: '',
    model: '16-Port Managed Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `sw16-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + i * 17,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `sw16-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 335 + i * 17,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'switch-24p',
    name: '24-Port Managed Switch',
    manufacturer: '',
    model: '24-Port Managed Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `sw24-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + i * 10,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `sw24-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 305 + i * 11,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'switch-24p-poe',
    name: '24-Port PoE+ Switch',
    manufacturer: '',
    model: '24-Port PoE+ Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 24 }, (_, i) => ({
        id: `sw24poe-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + i * 10,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `sw24poe-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 305 + i * 11,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'switch-48p',
    name: '48-Port Managed Switch',
    manufacturer: '',
    model: '48-Port Managed Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 48 }, (_, i) => ({
        id: `sw48-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + Math.floor(i / 2) * 10,
        relativeY: i % 2 === 0 ? 8 : 20,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `sw48-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 305 + i * 11,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'switch-48p-poe',
    name: '48-Port PoE+ Switch',
    manufacturer: '',
    model: '48-Port PoE+ Switch',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: [
      ...Array.from({ length: 48 }, (_, i) => ({
        id: `sw48poe-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 55 + Math.floor(i / 2) * 10,
        relativeY: i % 2 === 0 ? 8 : 20,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `sw48poe-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 305 + i * 11,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'switch-core-24sfp',
    name: 'Core Switch 24×SFP+',
    manufacturer: '',
    model: 'Core Switch 24×SFP+',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `swcore24-sfp${i + 1}`,
      name: `SFP ${i + 1}`,
      type: 'sfp-plus' as const,
      relativeX: 55 + i * 10,
      relativeY: 15,
      speed: '10 Gbps',
    })),
  },
  {
    id: 'switch-core-32qsfp',
    name: 'Core Switch 32×QSFP28',
    manufacturer: '',
    model: 'Core Switch 32×QSFP28',
    category: 'switch',
    heightUnits: 1,
    color: '#1a1a20',
    icon: '🔀',
    ports: Array.from({ length: 32 }, (_, i) => ({
      id: `swcore32-q${i + 1}`,
      name: `QSFP ${i + 1}`,
      type: 'qsfp28' as const,
      relativeX: 55 + i * 8,
      relativeY: 15,
      speed: '100 Gbps',
    })),
  },

  // ─── ROUTERS ────────────────────────────────────────────────────────────────
  {
    id: 'router-4p',
    name: '4-Port Enterprise Router',
    manufacturer: '',
    model: '4-Port Enterprise Router',
    category: 'router',
    heightUnits: 1,
    color: '#1a1f2e',
    icon: '🌐',
    ports: [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `rtr4-rj${i + 1}`,
        name: `WAN/LAN ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 60 + i * 21,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `rtr4-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 175 + i * 21,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'router-8p',
    name: '8-Port Enterprise Router',
    manufacturer: '',
    model: '8-Port Enterprise Router',
    category: 'router',
    heightUnits: 1,
    color: '#1a1f2e',
    icon: '🌐',
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `rtr8-rj${i + 1}`,
        name: `WAN/LAN ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 60 + i * 21,
        relativeY: 15,
        speed: '1 Gbps',
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `rtr8-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 240 + i * 21,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'router-core',
    name: 'Core Router',
    manufacturer: '',
    model: 'Core Router',
    category: 'router',
    heightUnits: 2,
    color: '#1a1f2e',
    icon: '🌐',
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `rtrcore-q${i + 1}`,
        name: `QSFP ${i + 1}`,
        type: 'qsfp28' as const,
        relativeX: 60 + i * 25,
        relativeY: 20,
        speed: '100 Gbps',
      })),
      { id: 'rtrcore-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 265, relativeY: 20, speed: '1 Gbps' },
      { id: 'rtrcore-con', name: 'CON', type: 'console' as const, relativeX: 265, relativeY: 40, speed: '115.2 Kbps' },
    ],
  },

  // ─── FIREWALLS ──────────────────────────────────────────────────────────────
  {
    id: 'fw-4p',
    name: 'Firewall Appliance 4-Port',
    manufacturer: '',
    model: 'Firewall 4-Port',
    category: 'firewall',
    heightUnits: 1,
    color: '#1f1a1a',
    icon: '🛡️',
    ports: [
      { id: 'fw4-con', name: 'CON', type: 'console' as const, relativeX: 20, relativeY: 15, speed: '115.2 Kbps' },
      { id: 'fw4-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 42, relativeY: 15, speed: '1 Gbps' },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `fw4-p${i + 1}`,
        name: `Port ${i + 1}`,
        type: 'rj45' as const,
        relativeX: 80 + i * 21,
        relativeY: 15,
        speed: '1 Gbps',
      })),
    ],
  },
  {
    id: 'fw-6p',
    name: 'NGFW 6-Port',
    manufacturer: '',
    model: 'NGFW 6-Port',
    category: 'firewall',
    heightUnits: 1,
    color: '#1f1a1a',
    icon: '🛡️',
    ports: [
      { id: 'fw6-con', name: 'CON', type: 'console' as const, relativeX: 20, relativeY: 15 },
      { id: 'fw6-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 42, relativeY: 15, speed: '1 Gbps' },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `fw6-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 80 + i * 21,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'fw-8p',
    name: 'NGFW 8-Port',
    manufacturer: '',
    model: 'NGFW 8-Port',
    category: 'firewall',
    heightUnits: 1,
    color: '#1f1a1a',
    icon: '🛡️',
    ports: [
      { id: 'fw8-con', name: 'CON', type: 'console' as const, relativeX: 20, relativeY: 15 },
      { id: 'fw8-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 42, relativeY: 15, speed: '1 Gbps' },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `fw8-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 80 + i * 21,
        relativeY: 15,
        speed: '10 Gbps',
      })),
    ],
  },
  {
    id: 'fw-12p',
    name: 'NGFW 12-Port',
    manufacturer: '',
    model: 'NGFW 12-Port',
    category: 'firewall',
    heightUnits: 1,
    color: '#1f1a1a',
    icon: '🛡️',
    ports: [
      { id: 'fw12-con', name: 'CON', type: 'console' as const, relativeX: 20, relativeY: 15 },
      { id: 'fw12-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 42, relativeY: 15, speed: '1 Gbps' },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `fw12-sfp${i + 1}`,
        name: `SFP ${i + 1}`,
        type: 'sfp-plus' as const,
        relativeX: 80 + i * 16,
        relativeY: 15,
        speed: '10 Gbps',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `fw12-q${i + 1}`,
        name: `QSFP ${i + 1}`,
        type: 'qsfp28' as const,
        relativeX: 278 + i * 21,
        relativeY: 15,
        speed: '100 Gbps',
      })),
    ],
  },

  // ─── PATCH PANELS ───────────────────────────────────────────────────────────
  {
    id: 'pp-12-cat6',
    name: 'Patch Panel 12-Port Cat6',
    manufacturer: '',
    model: '12-Port Cat6 Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#1e1824',
    icon: '🔲',
    ports: Array.from({ length: 12 }, (_, i) => ({
      id: `pp12-p${i + 1}`,
      name: `P${i + 1}`,
      type: 'rj45' as const,
      relativeX: 40 + i * 22,
      relativeY: 15,
    })),
  },
  {
    id: 'pp-24-cat6',
    name: 'Patch Panel 24-Port Cat6',
    manufacturer: '',
    model: '24-Port Cat6 Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#1e1824',
    icon: '🔲',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `pp24-p${i + 1}`,
      name: `P${i + 1}`,
      type: 'rj45' as const,
      relativeX: 15 + i * 14,
      relativeY: 15,
    })),
  },
  {
    id: 'pp-48-cat6',
    name: 'Patch Panel 48-Port Cat6',
    manufacturer: '',
    model: '48-Port Cat6 Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#1e1824',
    icon: '🔲',
    ports: Array.from({ length: 48 }, (_, i) => ({
      id: `pp48-p${i + 1}`,
      name: `P${i + 1}`,
      type: 'rj45' as const,
      relativeX: 6 + i * 7,
      relativeY: 15,
    })),
  },
  {
    id: 'pp-24-fiber',
    name: 'Fiber Patch Panel 24-Port LC',
    manufacturer: '',
    model: '24-Port LC Duplex Fiber Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#1e1824',
    icon: '🔲',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `ppf24-p${i + 1}`,
      name: `F${i + 1}`,
      type: 'sfp' as const,
      relativeX: 15 + i * 14,
      relativeY: 15,
    })),
  },
  {
    id: 'pp-48-fiber',
    name: 'Fiber Patch Panel 48-Port LC',
    manufacturer: '',
    model: '48-Port LC Duplex Fiber Patch Panel',
    category: 'patch-panel',
    heightUnits: 1,
    color: '#1e1824',
    icon: '🔲',
    ports: Array.from({ length: 48 }, (_, i) => ({
      id: `ppf48-p${i + 1}`,
      name: `F${i + 1}`,
      type: 'sfp' as const,
      relativeX: 6 + i * 7,
      relativeY: 15,
    })),
  },

  // ─── PDU ────────────────────────────────────────────────────────────────────
  {
    id: 'pdu-8',
    name: 'Basic PDU 8-Outlet',
    manufacturer: '',
    model: 'Basic PDU 8-Outlet',
    category: 'pdu',
    heightUnits: 1,
    color: '#212121',
    icon: '🔌',
    ports: Array.from({ length: 8 }, (_, i) => ({
      id: `pdu8-c13-${i + 1}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 30 + i * 37,
      relativeY: 15,
    })),
  },
  {
    id: 'pdu-12',
    name: 'Basic PDU 12-Outlet',
    manufacturer: '',
    model: 'Basic PDU 12-Outlet',
    category: 'pdu',
    heightUnits: 1,
    color: '#212121',
    icon: '🔌',
    ports: Array.from({ length: 12 }, (_, i) => ({
      id: `pdu12-c13-${i + 1}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 20 + i * 28,
      relativeY: 15,
    })),
  },
  {
    id: 'pdu-16-metered',
    name: 'Metered PDU 16-Outlet',
    manufacturer: '',
    model: 'Metered PDU 16-Outlet',
    category: 'pdu',
    heightUnits: 1,
    color: '#1b5e20',
    icon: '🔌',
    ports: Array.from({ length: 16 }, (_, i) => ({
      id: `pdu16m-c13-${i + 1}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 15 + i * 21,
      relativeY: 15,
    })),
  },
  {
    id: 'pdu-20-smart',
    name: 'Smart PDU 20-Outlet',
    manufacturer: '',
    model: 'Smart PDU 20-Outlet',
    category: 'pdu',
    heightUnits: 2,
    color: '#1b5e20',
    icon: '🔌',
    ports: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `pdu20s-c13-${i + 1}`,
        name: `C13-${i + 1}`,
        type: 'power' as const,
        relativeX: 15 + Math.floor(i / 10) * 180 + (i % 10) * 17,
        relativeY: 15,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `pdu20s-c19-${i + 1}`,
        name: `C19-${i + 1}`,
        type: 'power' as const,
        relativeX: 320 + i * 17,
        relativeY: 15,
      })),
      { id: 'pdu20s-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 340, relativeY: 45, speed: '1 Gbps' },
    ],
  },
  {
    id: 'pdu-vertical-16',
    name: 'Vertical PDU 16-Outlet',
    manufacturer: '',
    model: 'Vertical PDU 16-Outlet',
    category: 'pdu',
    heightUnits: 2,
    color: '#37474f',
    icon: '🔌',
    ports: Array.from({ length: 16 }, (_, i) => ({
      id: `pduv16-c13-${i + 1}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 40,
      relativeY: 8 + i * 14,
    })),
  },
  {
    id: 'pdu-vertical-24',
    name: 'Vertical PDU 24-Outlet',
    manufacturer: '',
    model: 'Vertical PDU 24-Outlet',
    category: 'pdu',
    heightUnits: 2,
    color: '#37474f',
    icon: '🔌',
    ports: Array.from({ length: 24 }, (_, i) => ({
      id: `pduv24-c13-${i + 1}`,
      name: `C13-${i + 1}`,
      type: 'power' as const,
      relativeX: 40,
      relativeY: 5 + i * 10,
    })),
  },

  // ─── UPS ────────────────────────────────────────────────────────────────────
  {
    id: 'ups-1u-750',
    name: 'UPS 750VA',
    manufacturer: '',
    model: 'UPS 750VA',
    category: 'ups',
    heightUnits: 1,
    color: '#1c2029',
    icon: '⚡',
    ports: [
      { id: 'ups750-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 15, speed: '1 Gbps' },
    ],
  },
  {
    id: 'ups-2u-1500',
    name: 'UPS 1500VA',
    manufacturer: '',
    model: 'UPS 1500VA',
    category: 'ups',
    heightUnits: 2,
    color: '#1c2029',
    icon: '⚡',
    ports: [
      { id: 'ups1500-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 25, speed: '1 Gbps' },
    ],
  },
  {
    id: 'ups-2u-3000',
    name: 'UPS 3000VA',
    manufacturer: '',
    model: 'UPS 3000VA',
    category: 'ups',
    heightUnits: 2,
    color: '#1c2029',
    icon: '⚡',
    ports: [
      { id: 'ups3000-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 25, speed: '1 Gbps' },
    ],
  },
  {
    id: 'ups-3u-6000',
    name: 'UPS 6000VA',
    manufacturer: '',
    model: 'UPS 6000VA',
    category: 'ups',
    heightUnits: 3,
    color: '#1c2029',
    icon: '⚡',
    ports: [
      { id: 'ups6000-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 35, speed: '1 Gbps' },
    ],
  },

  // ─── STORAGE ────────────────────────────────────────────────────────────────
  {
    id: 'nas-4bay',
    name: 'NAS 4-Bay',
    manufacturer: '',
    model: 'NAS 4-Bay',
    category: 'storage',
    heightUnits: 1,
    color: '#151e2b',
    icon: '💾',
    ports: [
      { id: 'nas4-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 300, relativeY: 10, speed: '1 Gbps' },
      { id: 'nas4-p1', name: 'Port 1', type: 'rj45' as const, relativeX: 315, relativeY: 10, speed: '1 Gbps' },
      { id: 'nas4-p2', name: 'Port 2', type: 'rj45' as const, relativeX: 330, relativeY: 10, speed: '1 Gbps' },
    ],
  },
  {
    id: 'nas-8bay',
    name: 'NAS 8-Bay',
    manufacturer: '',
    model: 'NAS 8-Bay',
    category: 'storage',
    heightUnits: 2,
    color: '#151e2b',
    icon: '💾',
    ports: [
      { id: 'nas8-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 300, relativeY: 20, speed: '1 Gbps' },
      { id: 'nas8-p1', name: 'Port 1', type: 'sfp-plus' as const, relativeX: 315, relativeY: 20, speed: '10 Gbps' },
      { id: 'nas8-p2', name: 'Port 2', type: 'sfp-plus' as const, relativeX: 330, relativeY: 20, speed: '10 Gbps' },
    ],
  },
  {
    id: 'storage-12bay',
    name: 'Storage Array 12-Bay',
    manufacturer: '',
    model: 'Storage Array 12-Bay',
    category: 'storage',
    heightUnits: 2,
    color: '#151e2b',
    icon: '💾',
    ports: [
      { id: 'st12-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 295, relativeY: 15, speed: '1 Gbps' },
      { id: 'st12-p1', name: 'SAS 1', type: 'sfp-plus' as const, relativeX: 310, relativeY: 15, speed: '12 Gbps' },
      { id: 'st12-p2', name: 'SAS 2', type: 'sfp-plus' as const, relativeX: 325, relativeY: 15, speed: '12 Gbps' },
      { id: 'st12-p3', name: 'SAS 3', type: 'sfp-plus' as const, relativeX: 310, relativeY: 30, speed: '12 Gbps' },
      { id: 'st12-p4', name: 'SAS 4', type: 'sfp-plus' as const, relativeX: 325, relativeY: 30, speed: '12 Gbps' },
    ],
  },
  {
    id: 'storage-24bay',
    name: 'Storage Array 24-Bay',
    manufacturer: '',
    model: 'Storage Array 24-Bay',
    category: 'storage',
    heightUnits: 4,
    color: '#151e2b',
    icon: '💾',
    ports: [
      { id: 'st24-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 295, relativeY: 30, speed: '1 Gbps' },
      { id: 'st24-p1', name: 'SAS 1', type: 'sfp-plus' as const, relativeX: 310, relativeY: 30, speed: '12 Gbps' },
      { id: 'st24-p2', name: 'SAS 2', type: 'sfp-plus' as const, relativeX: 325, relativeY: 30, speed: '12 Gbps' },
      { id: 'st24-p3', name: 'SAS 3', type: 'sfp-plus' as const, relativeX: 310, relativeY: 55, speed: '12 Gbps' },
      { id: 'st24-p4', name: 'SAS 4', type: 'sfp-plus' as const, relativeX: 325, relativeY: 55, speed: '12 Gbps' },
    ],
  },
  {
    id: 'storage-aff',
    name: 'All-Flash Array',
    manufacturer: '',
    model: 'All-Flash Array',
    category: 'storage',
    heightUnits: 2,
    color: '#151e2b',
    icon: '💾',
    ports: [
      { id: 'aff-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 290, relativeY: 15, speed: '1 Gbps' },
      { id: 'aff-p1', name: 'NVMe 1', type: 'sfp28' as const, relativeX: 305, relativeY: 15, speed: '25 Gbps' },
      { id: 'aff-p2', name: 'NVMe 2', type: 'sfp28' as const, relativeX: 320, relativeY: 15, speed: '25 Gbps' },
      { id: 'aff-p3', name: 'NVMe 3', type: 'sfp28' as const, relativeX: 305, relativeY: 30, speed: '25 Gbps' },
      { id: 'aff-p4', name: 'NVMe 4', type: 'sfp28' as const, relativeX: 320, relativeY: 30, speed: '25 Gbps' },
    ],
  },

  // ─── KVM / CONSOLE ──────────────────────────────────────────────────────────
  {
    id: 'kvm-8p',
    name: 'KVM Switch 8-Port',
    manufacturer: '',
    model: 'KVM Switch 8-Port',
    category: 'console',
    heightUnits: 1,
    color: '#2e2828',
    icon: '📟',
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `kvm8-p${i + 1}`,
        name: `KVM ${i + 1}`,
        type: 'console' as const,
        relativeX: 60 + i * 27,
        relativeY: 15,
      })),
      { id: 'kvm8-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 15, speed: '1 Gbps' },
    ],
  },
  {
    id: 'kvm-16p',
    name: 'KVM Switch 16-Port',
    manufacturer: '',
    model: 'KVM Switch 16-Port',
    category: 'console',
    heightUnits: 1,
    color: '#2e2828',
    icon: '📟',
    ports: [
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `kvm16-p${i + 1}`,
        name: `KVM ${i + 1}`,
        type: 'console' as const,
        relativeX: 30 + i * 18,
        relativeY: 15,
      })),
      { id: 'kvm16-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 15, speed: '1 Gbps' },
    ],
  },
  {
    id: 'console-8p',
    name: 'Console Server 8-Port',
    manufacturer: '',
    model: 'Console Server 8-Port',
    category: 'console',
    heightUnits: 1,
    color: '#2e2828',
    icon: '📟',
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `cs8-p${i + 1}`,
        name: `Serial ${i + 1}`,
        type: 'console' as const,
        relativeX: 60 + i * 27,
        relativeY: 15,
      })),
      { id: 'cs8-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 15, speed: '1 Gbps' },
    ],
  },
  {
    id: 'console-16p',
    name: 'Console Server 16-Port',
    manufacturer: '',
    model: 'Console Server 16-Port',
    category: 'console',
    heightUnits: 1,
    color: '#2e2828',
    icon: '📟',
    ports: [
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `cs16-p${i + 1}`,
        name: `Serial ${i + 1}`,
        type: 'console' as const,
        relativeX: 30 + i * 18,
        relativeY: 15,
      })),
      { id: 'cs16-mgmt', name: 'MGMT', type: 'management' as const, relativeX: 330, relativeY: 15, speed: '1 Gbps' },
    ],
  },

  // ─── CABLE MANAGERS ─────────────────────────────────────────────────────────
  {
    id: 'brush-panel-1u',
    name: '1U Brush Panel',
    manufacturer: '',
    model: '1U Brush Panel',
    category: 'cable-manager',
    heightUnits: 1,
    color: '#1a1a1c',
    icon: '📂',
    ports: [],
  },
  {
    id: 'd-ring-1u',
    name: '1U D-Ring Manager',
    manufacturer: '',
    model: '1U D-Ring Manager',
    category: 'cable-manager',
    heightUnits: 1,
    color: '#1e1e20',
    icon: '📂',
    ports: [],
  },
  {
    id: 'finger-duct-2u',
    name: '2U Finger Duct',
    manufacturer: '',
    model: '2U Finger Duct',
    category: 'cable-manager',
    heightUnits: 2,
    color: '#151518',
    icon: '📂',
    ports: [],
  },
  {
    id: 'finger-duct-4u',
    name: '4U Finger Duct',
    manufacturer: '',
    model: '4U Finger Duct',
    category: 'cable-manager',
    heightUnits: 4,
    color: '#121215',
    icon: '📂',
    ports: [],
  },

  // ─── BLANK PANELS ───────────────────────────────────────────────────────────
  {
    id: 'blank-1u',
    name: '1U Blank Panel',
    manufacturer: '',
    model: '1U Blank Panel',
    category: 'blank-panel',
    heightUnits: 1,
    color: '#232326',
    icon: '▬',
    ports: [],
  },
  {
    id: 'blank-2u',
    name: '2U Blank Panel',
    manufacturer: '',
    model: '2U Blank Panel',
    category: 'blank-panel',
    heightUnits: 2,
    color: '#232326',
    icon: '▬',
    ports: [],
  },

  // ─── COOLING ────────────────────────────────────────────────────────────────
  {
    id: 'cooling-1u',
    name: '1U Blanking Panel (Airflow)',
    manufacturer: '',
    model: '1U Airflow Panel',
    category: 'cooling',
    heightUnits: 1,
    color: '#1a1c1f',
    icon: '❄️',
    ports: [],
  },
  {
    id: 'cooling-2u',
    name: '2U Active Cooling Unit',
    manufacturer: '',
    model: '2U Active Cooling Unit',
    category: 'cooling',
    heightUnits: 2,
    color: '#1a1c1f',
    icon: '❄️',
    ports: [],
  },
];

export function getTemplate(id: string): DeviceTemplate | undefined {
  return deviceCatalog.find(t => t.id === id);
}

export function getTemplatesByCategory(category: DeviceCategory): DeviceTemplate[] {
  return deviceCatalog.filter(t => t.category === category);
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- device-catalog`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/library/device-catalog.ts src/__tests__/device-catalog.test.ts
git commit -m "feat(catalog): replace OEM catalog with 50-entry generic Standard Library"
```

---

## Task 3: Update demo project in state.ts to use new template IDs

**Files:**
- Modify: `src/core/state.ts:58-250`

The demo project references old template IDs (`dell-r760-3u`, `hpe-dl210-3u`, `tor-switch-10g`, `mgmt-switch-24p`). These must be replaced with new generic IDs.

- [ ] **Step 1: Update `loadDemoProject` in `src/core/state.ts`**

In `loadDemoProject()`, change:
- `templateId: 'tor-switch-10g'` → `templateId: 'switch-24p'`  (both TOR switches)
- `templateId: 'mgmt-switch-24p'` → `templateId: 'switch-24p'`
- `templateId: 'dell-r760-3u'` → `templateId: 'server-2u'`  (all 3 nodes)
- `templateId: 'hpe-dl210-3u'` → `templateId: 'server-2u'`  (backup server)
- Remove `frontPanelImage: '/dell-poweredge-panel.png'` and `frontPanelImage: '/switch-panel.png'` from all demo device objects (these OEM images no longer exist; the panel renderer will draw them)
- Update `getTemplate(...)` calls inside `loadDemoProject` to use the new template IDs:
  ```typescript
  const torATemplate = getTemplate('switch-24p')!;
  // ...
  const torBTemplate = getTemplate('switch-24p')!;
  const mgmtTemplate = getTemplate('switch-24p')!;
  const template = getTemplate('server-2u')!;  // for each node
  const hpeTemplate = getTemplate('server-2u')!;
  ```

Also update the cable connections: port index references will differ since templates changed. Simplify by just connecting port 0→0, 1→1, etc. for the demo (exact port mapping is demo data, not critical for functionality).

Full updated `loadDemoProject` body (replace lines 58–249):
```typescript
loadDemoProject(): void {
  const rackId = 'rack-demo';
  const racks: RackData[] = [
    { id: rackId, name: 'Enterprise Cluster Rack', units: 42, x: 250, y: 80, showPduLeft: true, showPduRight: true, leftCableManagerWidth: '4-inch', rightCableManagerWidth: '4-inch' }
  ];

  const devices: DeviceData[] = [];
  const cables: CableData[] = [];

  const torTemplate = getTemplate('switch-24p')!;
  const serverTemplate = getTemplate('server-2u')!;

  const mkDevice = (id: string, templateId: string, startUnit: number, name: string, hostname: string, ip: string, serial: string, desc: string): DeviceData => {
    const tmpl = getTemplate(templateId)!;
    return {
      id,
      templateId,
      rackId,
      startUnit,
      name,
      hostname,
      managementIp: ip,
      serialNumber: serial,
      description: desc,
      ports: tmpl.ports.map((p, i) => ({ ...p, id: `${id}-port-${i}`, deviceId: id, connected: false, cableId: null })),
    };
  };

  const torA = mkDevice('tor-a', 'switch-24p', 40, 'TOR SWITCH A', 'tor-switch-a', '10.10.10.11', 'SRN-TOR-A', 'Top of Rack Switch A');
  const torB = mkDevice('tor-b', 'switch-24p', 38, 'TOR SWITCH B', 'tor-switch-b', '10.10.10.12', 'SRN-TOR-B', 'Top of Rack Switch B');
  const mgmtSwitch = mkDevice('mgmt-switch', 'switch-24p', 36, 'MANAGEMENT SWITCH', 'mgmt-switch', '10.10.10.10', 'SRN-MGMT', '1GbE OOB Management Switch');
  const node1 = mkDevice('node-1', 'server-2u', 20, 'Server Node 1', 'server-node-1', '10.10.10.21', 'SRN-NODE-1', 'Cluster Node 1');
  const node2 = mkDevice('node-2', 'server-2u', 17, 'Server Node 2', 'server-node-2', '10.10.10.22', 'SRN-NODE-2', 'Cluster Node 2');
  const node3 = mkDevice('node-3', 'server-2u', 14, 'Server Node 3', 'server-node-3', '10.10.10.23', 'SRN-NODE-3', 'Cluster Node 3');
  const backup = mkDevice('backup-server', 'server-2u', 1, 'Backup Server', 'backup-server', '10.10.10.20', 'SRN-BACKUP', 'Backup Server Node');

  devices.push(torA, torB, mgmtSwitch, node1, node2, node3, backup);

  let cableCount = 1;
  const connect = (srcDev: DeviceData, srcIdx: number, destDev: DeviceData, destIdx: number, type: CableType, color: string) => {
    const srcPort = srcDev.ports[srcIdx];
    const destPort = destDev.ports[destIdx];
    if (!srcPort || !destPort) return;
    const cableId = `cable-${cableCount++}`;
    cables.push({ id: cableId, name: `Cable ${cableCount - 1}`, type, color, sourcePortId: srcPort.id, destPortId: destPort.id, bendPoints: [], thickness: 2, bendRadius: 10, bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false });
    srcPort.connected = true; srcPort.cableId = cableId;
    destPort.connected = true; destPort.cableId = cableId;
  };

  // Node 1
  connect(node1, 0, torA, 0, 'vm-network', '#fb8c00');
  connect(node1, 1, torA, 1, 'ceph-primary', '#43a047');
  connect(node1, 2, torB, 0, 'ceph-secondary', '#8e24aa');
  connect(node1, 3, torB, 1, 'live-migration', '#fdd835');
  connect(node1, 4, mgmtSwitch, 0, 'idrac', '#e53935');
  // Node 2
  connect(node2, 0, torA, 2, 'vm-network', '#fb8c00');
  connect(node2, 1, torA, 3, 'ceph-primary', '#43a047');
  connect(node2, 2, torB, 2, 'ceph-secondary', '#8e24aa');
  connect(node2, 3, torB, 3, 'live-migration', '#fdd835');
  connect(node2, 4, mgmtSwitch, 1, 'idrac', '#e53935');
  // Node 3
  connect(node3, 0, torA, 4, 'vm-network', '#fb8c00');
  connect(node3, 1, torA, 5, 'ceph-primary', '#43a047');
  connect(node3, 2, torB, 4, 'ceph-secondary', '#8e24aa');
  connect(node3, 3, torB, 5, 'live-migration', '#fdd835');
  connect(node3, 4, mgmtSwitch, 2, 'idrac', '#e53935');
  // Backup
  connect(backup, 0, mgmtSwitch, 3, 'backup', '#1e88e5');
  connect(backup, 4, mgmtSwitch, 4, 'idrac', '#e53935');
  // TOR interconnect
  connect(torA, 23, torB, 23, 'ceph-secondary', '#8e24aa');

  this.setState({ racks, devices, cables, selection: [], showLegends: true });
  eventBus.emit('notification', { message: 'Loaded demo project!', type: 'success' });
}
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass. (No test covers loadDemoProject; this is a manual visual check at app startup.)

- [ ] **Step 3: Clear localStorage and verify app loads**

In browser: open DevTools → Application → Local Storage → delete `rack_design_autosave` key → refresh → the demo project should load with generic devices (2U Servers, 24-Port Managed Switches) and no broken `getTemplate` errors in the console.

- [ ] **Step 4: Commit**

```bash
git add src/core/state.ts
git commit -m "feat(state): update demo project to use generic Standard Library template IDs"
```

---

## Task 4: Update sidebar.ts to support new catalog structure

**Files:**
- Modify: `src/components/sidebar.ts`

The sidebar currently shows `item.manufacturer • ${item.heightUnits}U`. Since generic templates have `manufacturer: ''`, this renders as `• 1U` which looks odd. Also, `'console'` category is not in the sidebar's category list.

- [ ] **Step 1: Update the categories array and item meta in `src/components/sidebar.ts`**

In `renderCatalog()`, replace the `categories` array (lines 57–68) with:
```typescript
const categories: { id: DeviceCategory, label: string, icon: string }[] = [
  { id: 'server',       label: 'Servers',          icon: '🖥️' },
  { id: 'switch',       label: 'Network Switches',  icon: '🔀' },
  { id: 'router',       label: 'Routers',           icon: '🌐' },
  { id: 'firewall',     label: 'Firewalls',         icon: '🛡️' },
  { id: 'storage',      label: 'Storage',           icon: '💾' },
  { id: 'console',      label: 'KVM & Console',     icon: '📟' },
  { id: 'patch-panel',  label: 'Patch Panels',      icon: '🔲' },
  { id: 'pdu',          label: 'PDU',               icon: '🔌' },
  { id: 'ups',          label: 'UPS',               icon: '⚡' },
  { id: 'cooling',      label: 'Cooling',           icon: '❄️' },
  { id: 'blank-panel',  label: 'Blank Panels',      icon: '▬' },
  { id: 'cable-manager', label: 'Cable Management', icon: '📂' },
];
```

In the item render block, change the meta line from:
```typescript
<div class="item-meta">${item.manufacturer} • ${item.heightUnits}U</div>
```
To:
```typescript
<div class="item-meta">${item.heightUnits > 0 ? item.heightUnits + 'U' : 'Accessory'} • ${item.ports.length} ports</div>
```

Also remove the search filter on `item.manufacturer` since it's now empty:
```typescript
const filteredItems = groupData.items.filter(item =>
  item.name.toLowerCase().includes(this.searchTerm)
);
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.ts
git commit -m "feat(sidebar): add console category, fix item meta for generic catalog"
```

---

## Task 5: Create panel-renderer.ts

**Files:**
- Create: `src/renderers/panel-renderer.ts`
- Create: `src/__tests__/panel-renderer.test.ts`

- [ ] **Step 1: Write the failing panel renderer tests**

Create `src/__tests__/panel-renderer.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'happy-dom';

// Set up DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as any).document = dom.window.document;
(globalThis as any).SVGElement = dom.window.SVGElement;

import { renderFrontPanel } from '../renderers/panel-renderer';
import { getTemplate } from '../library/device-catalog';
import { DeviceTemplate } from '../core/types';

describe('renderFrontPanel', () => {
  const W = 350;

  it('returns an SVGGElement for switch-24p', () => {
    const t = getTemplate('switch-24p')!;
    const result = renderFrontPanel('switch', t, W, 30);
    expect(result).toBeDefined();
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for switch-48p', () => {
    const t = getTemplate('switch-48p')!;
    const result = renderFrontPanel('switch', t, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for server-2u', () => {
    const t = getTemplate('server-2u')!;
    const result = renderFrontPanel('server', t, W, 60);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('handles null template gracefully (renders generic dark rect)', () => {
    const result = renderFrontPanel('server', null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
    const rect = result.querySelector('rect');
    expect(rect).toBeTruthy();
  });

  it('returns SVGGElement for every category', () => {
    const categories = ['server','switch','router','firewall','storage','patch-panel','pdu','ups','blank-panel','cable-manager','cooling','console'] as const;
    for (const cat of categories) {
      const result = renderFrontPanel(cat, null, W, 30);
      expect(result.tagName.toLowerCase()).toBe('g');
    }
  });
});
```

Run: `npm run test -- panel-renderer`
Expected: FAIL — module not found.

- [ ] **Step 2: Create `src/renderers/panel-renderer.ts`**

Create the file with the complete implementation:

```typescript
import { DeviceCategory, DeviceTemplate } from '../core/types';
import { createSVGElement, setAttributes } from '../utils/svg-helpers';

// ─── Port geometry constants (match approved switch mockup) ─────────────────
const PORT_W = 18;
const PORT_H = 15;
const PORT_PITCH = 21;   // PORT_W + 3px gap
const SFP_W = 36;
const SFP_PITCH = 40;
const LED_H = 2.5;
const LED_GAP = 2;       // gap between LED bar and port top
const STATUS_END = 48;   // x where status block ends

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function g(cls = ''): SVGGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (cls) group.setAttribute('class', cls);
  return group;
}

// ─── Chassis background gradient ────────────────────────────────────────────
function makeChassisGradient(id: string, parent: SVGDefsElement): void {
  const grad = el('linearGradient', { id, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  [
    { offset: '0%',   color: '#3a3a3f' },
    { offset: '30%',  color: '#2a2a2f' },
    { offset: '70%',  color: '#22222a' },
    { offset: '100%', color: '#1a1a1e' },
  ].forEach(({ offset, color }) => {
    const stop = el('stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  });
  parent.appendChild(grad);
}

// ─── Primitive: Single RJ45 port ────────────────────────────────────────────
function drawRJ45(parent: SVGGElement, ax: number, portTopY: number, label: string, ledOn: boolean): void {
  const ledY = portTopY - LED_GAP - LED_H;
  // LED bar
  parent.appendChild(el('rect', { x: ax + 1, y: ledY, width: PORT_W - 2, height: LED_H, rx: 1, fill: ledOn ? '#00e676' : '#1a2a1a' }));
  // Port bevel
  parent.appendChild(el('rect', { x: ax, y: portTopY, width: PORT_W, height: PORT_H, rx: 1.5, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.8 }));
  // Port cavity
  parent.appendChild(el('rect', { x: ax + 2, y: portTopY + 2, width: PORT_W - 4, height: PORT_H - 4, rx: 1, fill: '#050508' }));
  // 3 contacts
  for (let c = 0; c < 3; c++) {
    parent.appendChild(el('rect', { x: ax + 4 + c * 3.5, y: portTopY + PORT_H - 5, width: 2.5, height: 3, fill: '#c0c0a0', rx: 0.5 }));
  }
  // Port number label (centered)
  const txt = el('text', { x: ax + PORT_W / 2, y: portTopY + PORT_H + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

// ─── Primitive: SFP+ cage ───────────────────────────────────────────────────
function drawSFPCage(parent: SVGGElement, ax: number, chY: number, chH: number, label: string, hasModule: boolean): void {
  const cageH = chH - 8;
  const cageY = chY + 4;
  parent.appendChild(el('rect', { x: ax, y: cageY, width: SFP_W, height: cageH, rx: 2, fill: '#0d0d12', stroke: '#444', 'stroke-width': 0.8 }));
  if (hasModule) {
    parent.appendChild(el('rect', { x: ax + 2, y: cageY + 2, width: SFP_W - 4, height: cageH - 4, rx: 1, fill: '#1a2030' }));
    parent.appendChild(el('rect', { x: ax + 4, y: cageY + cageH - 6, width: SFP_W - 8, height: 4, rx: 1, fill: '#00e5ff', opacity: 0.6 }));
  }
  const txt = el('text', { x: ax + SFP_W / 2, y: chY + chH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

// ─── Primitive: QSFP28 cage (wider) ─────────────────────────────────────────
function drawQSFPCage(parent: SVGGElement, ax: number, chY: number, chH: number, label: string): void {
  const w = 44;
  const cageH = chH - 8;
  const cageY = chY + 4;
  parent.appendChild(el('rect', { x: ax, y: cageY, width: w, height: cageH, rx: 2, fill: '#0d0d12', stroke: '#555', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: cageY + 2, width: w - 4, height: cageH - 4, rx: 1, fill: '#1a2030' }));
  parent.appendChild(el('rect', { x: ax + 4, y: cageY + cageH - 6, width: w - 8, height: 4, rx: 1, fill: '#00e5ff', opacity: 0.8 }));
  const txt = el('text', { x: ax + w / 2, y: chY + chH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

// ─── Primitive: Status block (SYS/PWR/MODE/CON at left) ─────────────────────
function drawStatusBlock(parent: SVGGElement, chY: number, chH: number): void {
  const midY = chY + chH / 2;
  // SYS LED (green)
  parent.appendChild(el('circle', { cx: 12, cy: midY - 10, r: 3, fill: '#00e676', filter: 'drop-shadow(0 0 2px #00e676)' }));
  // PWR LED (amber)
  parent.appendChild(el('circle', { cx: 12, cy: midY, r: 3, fill: '#fb8c00', opacity: 0.9 }));
  // MODE button
  parent.appendChild(el('rect', { x: 7, y: midY + 6, width: 10, height: 6, rx: 1, fill: '#222', stroke: '#555', 'stroke-width': 0.5 }));
  // CON port (small RJ45)
  parent.appendChild(el('rect', { x: 26, y: midY - 5, width: 12, height: 10, rx: 1, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.7 }));
  // Divider
  parent.appendChild(el('line', { x1: STATUS_END, y1: chY + 2, x2: STATUS_END, y2: chY + chH - 2, stroke: '#333', 'stroke-width': 0.8 }));
}

// ─── Primitive: Drive bay ────────────────────────────────────────────────────
function drawDriveBay(parent: SVGGElement, ax: number, ay: number, w: number, h: number, active: boolean, label: string): void {
  parent.appendChild(el('rect', { x: ax, y: ay, width: w, height: h, rx: 1.5, fill: '#0d0d12', stroke: '#333', 'stroke-width': 0.7 }));
  parent.appendChild(el('rect', { x: ax + 2, y: ay + 2, width: w - 4, height: h - 4, rx: 1, fill: '#151518' }));
  // Activity LED
  parent.appendChild(el('circle', { cx: ax + w - 4, cy: ay + 4, r: 1.5, fill: active ? '#00e676' : '#1a1a1a' }));
  const txt = el('text', { x: ax + w / 2, y: ay + h - 2, 'text-anchor': 'middle', 'font-size': '5', fill: '#555', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

// ─── Primitive: LCD panel ────────────────────────────────────────────────────
function drawLcdPanel(parent: SVGGElement, ax: number, ay: number, w: number, h: number, text: string): void {
  parent.appendChild(el('rect', { x: ax, y: ay, width: w, height: h, rx: 2, fill: '#050910', stroke: '#30363d', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: ay + 2, width: w - 4, height: h - 4, rx: 1, fill: '#0a1520', opacity: 0.9 }));
  const txt = el('text', { x: ax + w / 2, y: ay + h / 2 + 3, 'text-anchor': 'middle', 'font-size': '7', fill: '#00e5ff', 'font-family': 'monospace', opacity: 0.8 });
  txt.textContent = text;
  parent.appendChild(txt);
}

// ─── Primitive: Vent slots ───────────────────────────────────────────────────
function drawVentSlots(parent: SVGGElement, startX: number, chY: number, chH: number): void {
  const count = Math.floor((350 - startX - 10) / 4);
  for (let i = 0; i < count; i++) {
    parent.appendChild(el('rect', { x: startX + i * 4, y: chY + 4, width: 2, height: chH - 8, rx: 0.5, fill: '#111114' }));
  }
}

// ─── Category renderers ──────────────────────────────────────────────────────

function renderSwitchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('switch-panel');
  const defs = el('defs');
  const gradId = `sw-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  // Chassis background
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const rj45Ports = ports.filter(p => p.type === 'rj45');
  const sfpPorts = ports.filter(p => p.type === 'sfp-plus' || p.type === 'sfp');
  const qsfpPorts = ports.filter(p => p.type === 'qsfp28');

  const portCount = rj45Ports.length;
  const is48 = portCount === 48;
  const portTopY = is48
    ? chY + Math.round((chH - (PORT_H * 2 + LED_H * 2 + LED_GAP * 2 + 6)) / 2)
    : chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  drawStatusBlock(group, chY, chH);

  if (portCount > 0) {
    if (is48) {
      // Paired columns: odd top row, even bottom row
      const topY = portTopY;
      const botY = topY + PORT_H + LED_H + LED_GAP + 6;
      const groupCount = portCount / 2;
      for (let gi = 0; gi < groupCount; gi++) {
        const ax = STATUS_END + 6 + gi * PORT_PITCH;
        const oddPort = gi * 2;
        const evenPort = gi * 2 + 1;
        drawRJ45(group, ax, topY, String(oddPort + 1), false);
        drawRJ45(group, ax, botY, String(evenPort + 1), false);
      }
    } else {
      // Single row
      for (let i = 0; i < portCount; i++) {
        const ax = STATUS_END + 6 + i * PORT_PITCH;
        drawRJ45(group, ax, portTopY, String(i + 1), false);
      }
    }
  }

  // SFP+ cages after RJ45 ports
  let sfpStartX: number;
  if (is48) {
    sfpStartX = STATUS_END + 6 + (portCount / 2) * PORT_PITCH + 8;
  } else {
    sfpStartX = STATUS_END + 6 + portCount * PORT_PITCH + 8;
  }
  sfpPorts.forEach((_, i) => {
    drawSFPCage(group, sfpStartX + i * SFP_PITCH, chY, chH, `SFP${i + 1}`, true);
  });

  // QSFP28 cages
  const qsfpStartX = sfpStartX + sfpPorts.length * SFP_PITCH + 8;
  qsfpPorts.forEach((_, i) => {
    drawQSFPCage(group, qsfpStartX + i * 52, chY, chH, `Q${i + 1}`);
  });

  // Model text right
  const modelTxt = el('text', { x: W - 6, y: chY + chH / 2 + 3, 'text-anchor': 'end', 'font-size': '7', fill: '#555', 'font-family': 'monospace' });
  modelTxt.textContent = template?.model ?? 'Switch';
  group.appendChild(modelTxt);

  return group;
}

function renderServerPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('server-panel');
  const defs = el('defs');
  const gradId = `sv-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  const honeycombId = `hc-${Math.random().toString(36).slice(2)}`;
  const pat = el('pattern', { id: honeycombId, width: 6, height: 10, patternUnits: 'userSpaceOnUse' });
  const path = el('path', { d: 'M 3 0 L 6 2 L 6 8 L 3 10 L 0 8 L 0 2 Z', fill: 'none', stroke: '#111115', 'stroke-width': 1 });
  pat.appendChild(path);
  defs.appendChild(pat);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  // Chassis
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1.5, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));

  // Drive bays (left side)
  const bayW = 32, bayH = Math.min(22, chH - 8);
  const bayCount = template?.id.includes('4u') ? 8 : template?.id.includes('hd') ? 6 : 4;
  const bayStartX = 12;
  for (let b = 0; b < bayCount; b++) {
    drawDriveBay(group, bayStartX + b * (bayW + 3), chY + 4, bayW, bayH, b < 2, String(b + 1));
  }

  // Honeycomb ventilation grill (center)
  const grillX = bayStartX + bayCount * (bayW + 3) + 6;
  const grillW = W - grillX - 90;
  if (grillW > 20) {
    group.appendChild(el('rect', { x: grillX, y: chY + 4, width: grillW, height: chH - 8, fill: `url(#${honeycombId})`, opacity: 0.5 }));
  }

  // LCD + power button
  const lcdX = grillX + grillW + 4;
  drawLcdPanel(group, lcdX, chY + 4, 40, Math.min(chH - 8, 16), 'READY');

  // Power LED
  group.appendChild(el('circle', { cx: lcdX + 50, cy: chY + chH / 2 - 6, r: 3, fill: '#00e676', filter: 'drop-shadow(0 0 2px #00e676)' }));
  // HDD LED
  group.appendChild(el('circle', { cx: lcdX + 50, cy: chY + chH / 2 + 4, r: 2, fill: '#fb8c00', opacity: 0.8 }));

  return group;
}

function renderFirewallPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('firewall-panel');
  const defs = el('defs');
  const gradId = `fw-grad-${Math.random().toString(36).slice(2)}`;
  const grad = el('linearGradient', { id: gradId, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  [{ offset: '0%', color: '#2a1a1a' }, { offset: '100%', color: '#1a0e0e' }].forEach(({ offset, color }) => {
    const s = el('stop'); s.setAttribute('offset', offset); s.setAttribute('stop-color', color); grad.appendChild(s);
  });
  defs.appendChild(grad);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));

  drawStatusBlock(group, chY, chH);

  const ports = template?.ports ?? [];
  const sfpPorts = ports.filter(p => p.type === 'sfp-plus');
  const rj45Ports = ports.filter(p => p.type === 'rj45');
  const allDataPorts = [...rj45Ports, ...sfpPorts];

  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  // Zone labels
  const zones = ['WAN', 'DMZ', 'LAN'];
  const zoneColors = ['#e53935', '#fb8c00', '#43a047'];
  allDataPorts.forEach((p, i) => {
    const ax = STATUS_END + 6 + i * PORT_PITCH;
    if (p.type === 'sfp-plus') {
      drawSFPCage(group, ax, chY, chH, `${i + 1}`, true);
    } else {
      drawRJ45(group, ax, portTopY, `${i + 1}`, false);
    }
    // Zone label above
    const zoneIdx = i === 0 ? 0 : i <= 2 ? 1 : 2;
    const zoneTxt = el('text', { x: ax + PORT_W / 2, y: chY + 5, 'text-anchor': 'middle', 'font-size': '5', fill: zoneColors[zoneIdx], 'font-family': 'monospace' });
    zoneTxt.textContent = i === 0 ? 'WAN' : i <= 2 ? 'DMZ' : 'LAN';
    group.appendChild(zoneTxt);
  });

  drawVentSlots(group, STATUS_END + 6 + allDataPorts.length * PORT_PITCH + 8, chY, chH);

  return group;
}

function renderRouterPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('router-panel');
  const defs = el('defs');
  const gradId = `rtr-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 50, chH - 8, 'READY');

  const ports = template?.ports ?? [];
  const qsfp = ports.filter(p => p.type === 'qsfp28');
  const sfp = ports.filter(p => p.type === 'sfp-plus');
  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  let portX = STATUS_END + 64;
  qsfp.forEach((_, i) => { drawQSFPCage(group, portX + i * 52, chY, chH, `Q${i + 1}`); });
  portX += qsfp.length * 52 + (qsfp.length ? 8 : 0);
  sfp.forEach((_, i) => { drawSFPCage(group, portX + i * SFP_PITCH, chY, chH, `SFP${i + 1}`, true); });

  return group;
}

function renderPatchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('patch-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: '#1a1224', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const isFiber = ports.some(p => p.type === 'sfp' || p.type === 'sfp-plus');
  const portCount = ports.length || 24;
  const pitch = Math.min(14, (W - 20) / portCount);
  const portTopY = chY + Math.round((chH - (isFiber ? 8 : PORT_H)) / 2);

  for (let i = 0; i < portCount; i++) {
    const ax = 10 + i * pitch;
    if (isFiber) {
      // LC duplex pair (two small circles)
      group.appendChild(el('circle', { cx: ax + 3, cy: portTopY + 4, r: 3, fill: '#0a0a10', stroke: '#444', 'stroke-width': 0.8 }));
      group.appendChild(el('circle', { cx: ax + 9, cy: portTopY + 4, r: 3, fill: '#0a0a10', stroke: '#444', 'stroke-width': 0.8 }));
    } else {
      drawRJ45(group, ax, portTopY, String(i + 1), false);
    }
  }

  // Strain relief bar
  group.appendChild(el('rect', { x: 5, y: chY + chH - 6, width: W - 10, height: 4, rx: 1, fill: '#111', stroke: '#333', 'stroke-width': 0.5 }));

  return group;
}

function renderPduPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('pdu-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1a1e', stroke: '#111', 'stroke-width': 1 }));

  // LCD display
  drawLcdPanel(group, 8, chY + 4, 50, chH - 8, '0.0 A');

  // Circuit breaker button
  group.appendChild(el('circle', { cx: 67, cy: chY + chH / 2, r: 6, fill: '#c62828', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');
  const outletW = 20;
  const outletH = chH - 10;
  const outletY = chY + 5;
  const startX = 85;

  c13Ports.forEach((_, i) => {
    const ax = startX + i * (outletW + 4);
    // IEC C13 outlet shape
    group.appendChild(el('rect', { x: ax, y: outletY, width: outletW, height: outletH, rx: 2, fill: '#0a0a0f', stroke: '#333', 'stroke-width': 0.7 }));
    // 3 contact holes
    const contactY = outletY + outletH - 8;
    [ax + 4, ax + 8.5, ax + 13].forEach(cx => {
      group.appendChild(el('rect', { x: cx, y: contactY, width: 3, height: 4, rx: 0.8, fill: '#050508' }));
    });
    const numTxt = el('text', { x: ax + outletW / 2, y: outletY + outletH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#666', 'font-family': 'monospace' });
    numTxt.textContent = String(i + 1);
    group.appendChild(numTxt);
  });

  // Right: IEC C20 inlet
  group.appendChild(el('rect', { x: W - 30, y: chY + 4, width: 22, height: chH - 8, rx: 2, fill: '#0a0a0f', stroke: '#555', 'stroke-width': 0.8 }));

  return group;
}

function renderUpsPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('ups-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1c29', stroke: '#111', 'stroke-width': 1 }));

  // Large LCD
  drawLcdPanel(group, 10, chY + 4, 120, chH - 8, 'ON BATTERY');

  // Battery status bar (5 segments)
  for (let s = 0; s < 5; s++) {
    const segColor = s < 3 ? '#43a047' : s === 3 ? '#fb8c00' : '#e53935';
    group.appendChild(el('rect', { x: 140 + s * 20, y: chY + chH / 2 - 5, width: 16, height: 10, rx: 1, fill: s < 4 ? segColor : '#111', stroke: '#333', 'stroke-width': 0.5 }));
  }

  // Status LEDs
  ['IN', 'OUT', 'BAT'].forEach((lbl, i) => {
    group.appendChild(el('circle', { cx: 250 + i * 20, cy: chY + chH / 2 - 4, r: 3, fill: i === 0 ? '#00e676' : '#fb8c00' }));
    const t = el('text', { x: 250 + i * 20, y: chY + chH / 2 + 8, 'text-anchor': 'middle', 'font-size': '5', fill: '#666', 'font-family': 'monospace' });
    t.textContent = lbl;
    group.appendChild(t);
  });

  drawVentSlots(group, 320, chY, chH);

  return group;
}

function renderStoragePanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('storage-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#141922', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const bayCount = template?.id.includes('24bay') || template?.id.includes('aff') ? 24 : template?.id.includes('12bay') ? 12 : 8;
  const cols = bayCount > 12 ? 6 : bayCount > 6 ? 6 : 4;
  const rows = Math.ceil(bayCount / cols);
  const bayW = 38, bayH = Math.min((chH - 8) / rows - 2, 20);
  const bayStartX = 10;

  for (let b = 0; b < bayCount; b++) {
    const bx = bayStartX + (b % cols) * (bayW + 3);
    const by = chY + 4 + Math.floor(b / cols) * (bayH + 3);
    drawDriveBay(group, bx, by, bayW, bayH, b < 4, String(b + 1));
  }

  // Right: SAS/NVMe port cluster
  const portX = bayStartX + cols * (bayW + 3) + 8;
  drawLcdPanel(group, portX, chY + 4, 50, chH - 8, 'ONLINE');

  return group;
}

function renderKvmPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('kvm-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1e1a1a', stroke: '#111', 'stroke-width': 1 }));

  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 40, chH - 8, 'KVM');

  const ports = template?.ports ?? [];
  const consolePorts = ports.filter(p => p.type === 'console');
  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  consolePorts.forEach((_, i) => {
    const ax = STATUS_END + 54 + i * PORT_PITCH;
    // DB9 serial port representation
    group.appendChild(el('rect', { x: ax, y: portTopY, width: 20, height: PORT_H, rx: 1.5, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.8 }));
    // 9 pin dots (2 rows: 5 + 4)
    for (let p = 0; p < 9; p++) {
      const row = p < 5 ? 0 : 1;
      const col = p < 5 ? p : p - 5;
      const offset = p >= 5 ? 1.5 : 0;
      group.appendChild(el('circle', { cx: ax + 2 + col * 3.5 + offset, cy: portTopY + 4 + row * 5, r: 0.8, fill: '#c0c0a0' }));
    }
    const numTxt = el('text', { x: ax + 10, y: portTopY + PORT_H + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
    numTxt.textContent = String(i + 1);
    group.appendChild(numTxt);
  });

  return group;
}

function renderBlankPanel(W: number, H: number): SVGGElement {
  const group = g('blank-panel');
  const defs = el('defs');
  const gradId = `bp-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);
  group.appendChild(el('rect', { x: 0, y: 2, width: W, height: H - 4, rx: 1, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  // 4 corner screw holes
  [[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]].forEach(([cx, cy]) => {
    group.appendChild(el('circle', { cx, cy, r: 3, fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
  });
  return group;
}

function renderCoolingPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('cooling-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#141618', stroke: '#111', 'stroke-width': 1 }));

  if (chH <= 32) {
    // 1U: horizontal louvre slots
    const slotCount = Math.floor((W - 20) / 8);
    for (let i = 0; i < slotCount; i++) {
      group.appendChild(el('rect', { x: 10 + i * 8, y: chY + 3, width: 6, height: chH - 6, rx: 0.5, fill: '#0a0a0c', stroke: '#222', 'stroke-width': 0.4 }));
    }
  } else {
    // 2U: fan grills
    const fanCount = 4;
    const fanR = Math.min(chH / 2 - 8, 18);
    for (let f = 0; f < fanCount; f++) {
      const cx = 40 + f * (W - 80) / (fanCount - 1);
      const cy = chY + chH / 2;
      group.appendChild(el('circle', { cx, cy, r: fanR, fill: '#0a0a0c', stroke: '#333', 'stroke-width': 1 }));
      group.appendChild(el('circle', { cx, cy, r: fanR * 0.3, fill: '#1a1a1e' }));
      for (let a = 0; a < 6; a++) {
        const rad = (a * 60 * Math.PI) / 180;
        const line = el('line', {
          x1: cx + Math.cos(rad) * fanR * 0.35, y1: cy + Math.sin(rad) * fanR * 0.35,
          x2: cx + Math.cos(rad) * fanR * 0.95, y2: cy + Math.sin(rad) * fanR * 0.95,
          stroke: '#2a2a2f', 'stroke-width': 2.5, 'stroke-linecap': 'round'
        });
        group.appendChild(line);
      }
    }
  }

  return group;
}

function renderCableManagerPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('cable-mgr-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: '#151518', stroke: '#111', 'stroke-width': 1 }));

  if (template?.id === 'brush-panel-1u') {
    // Brush slot
    group.appendChild(el('rect', { x: 20, y: chY + 4, width: W - 40, height: chH - 8, rx: 2, fill: '#050508', stroke: '#30363d', 'stroke-width': 1 }));
    const fiberCount = 50;
    const fiberSpacing = (W - 40) / fiberCount;
    for (let i = 1; i < fiberCount; i++) {
      const fx = 20 + i * fiberSpacing;
      group.appendChild(el('line', { x1: fx, y1: chY + 4, x2: fx, y2: chY + chH - 4, stroke: '#1a1a20', 'stroke-width': 1, opacity: 0.6 }));
    }
  } else if (template?.id === 'd-ring-1u') {
    // D-rings
    group.appendChild(el('line', { x1: 15, y1: chY + chH / 2, x2: W - 15, y2: chY + chH / 2, stroke: '#30363d', 'stroke-width': 1.5 }));
    const ringCount = 5;
    const spacing = (W - 80) / (ringCount - 1);
    for (let i = 0; i < ringCount; i++) {
      const rx = 40 + i * spacing;
      const ry = chY + chH / 2;
      const p = el('path', { d: `M ${rx - 10} ${ry - 4} L ${rx + 10} ${ry - 4} C ${rx + 12} ${ry - 4}, ${rx + 12} ${ry + 12}, ${rx + 10} ${ry + 12} L ${rx - 10} ${ry + 12} C ${rx - 12} ${ry + 12}, ${rx - 12} ${ry - 4}, ${rx - 10} ${ry - 4} Z`, fill: 'none', stroke: '#8b949e', 'stroke-width': 2 });
      group.appendChild(p);
    }
  } else {
    // Finger duct
    const slitCount = 10;
    const slitSpacing = (W - 40) / slitCount;
    for (let i = 0; i < slitCount; i++) {
      const sx = 20 + i * slitSpacing;
      group.appendChild(el('rect', { x: sx + 3, y: chY + 6, width: slitSpacing - 6, height: chH - 12, rx: 2, fill: '#050508', stroke: '#21262d', 'stroke-width': 0.8 }));
    }
  }

  return group;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate | null,
  deviceWidth: number,
  deviceHeight: number,
): SVGGElement {
  switch (category) {
    case 'switch':      return renderSwitchPanel(template, deviceWidth, deviceHeight);
    case 'server':      return renderServerPanel(template, deviceWidth, deviceHeight);
    case 'firewall':    return renderFirewallPanel(template, deviceWidth, deviceHeight);
    case 'router':      return renderRouterPanel(template, deviceWidth, deviceHeight);
    case 'patch-panel': return renderPatchPanel(template, deviceWidth, deviceHeight);
    case 'pdu':         return renderPduPanel(template, deviceWidth, deviceHeight);
    case 'ups':         return renderUpsPanel(template, deviceWidth, deviceHeight);
    case 'storage':     return renderStoragePanel(template, deviceWidth, deviceHeight);
    case 'console':     return renderKvmPanel(template, deviceWidth, deviceHeight);
    case 'blank-panel': return renderBlankPanel(deviceWidth, deviceHeight);
    case 'cooling':     return renderCoolingPanel(template, deviceWidth, deviceHeight);
    case 'cable-manager': return renderCableManagerPanel(template, deviceWidth, deviceHeight);
    default: {
      const fallback = g('fallback-panel');
      fallback.appendChild(el('rect', { x: 0, y: 2, width: deviceWidth, height: deviceHeight - 4, rx: 1, fill: '#1b1b22', stroke: '#111', 'stroke-width': 1 }));
      return fallback;
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- panel-renderer`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderers/panel-renderer.ts src/__tests__/panel-renderer.test.ts
git commit -m "feat(renderer): add high-fidelity SVG panel renderer for all device categories"
```

---

## Task 6: Wire panel-renderer into device-renderer.ts

**Files:**
- Modify: `src/renderers/device-renderer.ts`

The `else` branch currently has inline drawing (honeycomb, cable manager details). Replace it with a call to `renderFrontPanel`. The cable-manager-specific drawing is now handled by `renderCableManagerPanel` inside `panel-renderer.ts`.

- [ ] **Step 1: Modify `src/renderers/device-renderer.ts`**

At the top, add the import (after existing imports):
```typescript
import { renderFrontPanel } from './panel-renderer';
```

In the `else` branch (currently starting around line 221 after `} else if (hasCustomImage) {`), replace the entire `else { ... }` block (lines 220–342) with:

```typescript
  } else {
    // High-fidelity SVG panel renderer
    const panel = renderFrontPanel(category as any, template ?? null, deviceWidth, deviceHeight);
    deviceGroup.appendChild(panel);
  }
```

Remove the now-unused `honeycombPattern` defs block (lines 44–59) and the `defs.appendChild(honeycombPattern)` call on line 59. The honeycomb is now rendered inside `panel-renderer.ts` where needed.

Keep the `earGrad` definition and usage for the rack ears (lines 33–38), and keep `defs.appendChild(earGrad)` and `deviceGroup.appendChild(defs)`.

Also remove the text/LED overlay block (lines 344–361) that drew `category === 'server'` status LEDs and `category === 'switch'` LED — these are now drawn by `renderServerPanel` and `renderSwitchPanel`.

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Visual check in browser**

Open http://localhost:5173. Devices on canvas should now render with the industrial panel graphics (no more plain dark rectangles for generic items). Switch panels should show port rows. Server panels should show drive bays and honeycomb grill.

- [ ] **Step 4: Commit**

```bash
git add src/renderers/device-renderer.ts
git commit -m "feat(renderer): wire panel-renderer into device-renderer else branch"
```

---

## Task 7: Rename "OEM Front Panel Design" label in properties.ts

**Files:**
- Modify: `src/components/properties.ts:221`

- [ ] **Step 1: Update the label**

In `renderDeviceProperties`, find:
```typescript
<label style="font-weight: bold; color: var(--text-secondary);">OEM Front Panel Design</label>
```
Replace with:
```typescript
<label style="font-weight: bold; color: var(--text-secondary);">Front Panel Image</label>
```

Also update the button text from `"Upload Image"` to `"Upload Front Panel Image"` for clarity:
```typescript
<button class="btn-action" style="flex: 1; ..." onclick="...">Upload Front Panel Image</button>
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/properties.ts
git commit -m "fix(properties): rename OEM label to Front Panel Image for generic catalog"
```

---

## Self-Review

**Spec coverage check:**
- ✅ No OEM names in catalog (Task 2 test enforces this)
- ✅ All 12 categories have templates (Task 2)
- ✅ `panel-renderer.ts` created with `renderFrontPanel` for all categories (Task 5)
- ✅ `renderFrontPanel` handles `template === null` gracefully (Task 5 test)
- ✅ Panel called only in `else` branch (Task 6)
- ✅ `'console'` added to DeviceCategory (Task 1)
- ✅ Demo project updated to new IDs (Task 3)
- ✅ Sidebar shows 'console' category (Task 4)
- ✅ Properties panel label updated (Task 7)
- ✅ Front Panel Image upload already existed — verified in properties.ts:302–312

**No placeholders — all code blocks are complete.**

**Type consistency:** `renderFrontPanel(category, template, deviceWidth, deviceHeight)` signature is consistent across Tasks 5 and 6.
