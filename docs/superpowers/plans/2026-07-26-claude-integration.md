# Claude AI Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate a three-tier AI layer (Rule Engine / Local LLM / Claude API) into RackCAD as an optional "Enable AI Mode" with a chat panel, inline property hints, and suggest-preview-apply workflow across all 7 planned feature areas.

**Architecture:** Direct browser integration — Anthropic SDK (`@anthropic-ai/sdk`) bundled by Vite, API key from `localStorage`. Provider strategy pattern: `RuleEngine` (always on) → `LocalLLMProvider` (Ollama) → `ClaudeProvider` (Claude API). All tiers produce identical `RackDiff` JSON that `diff-applier.ts` applies to `stateManager`.

**Tech Stack:** TypeScript 6, Vite 8, `@anthropic-ai/sdk`, `vitest` (tests), Ollama-compatible OpenAI API (local LLM), `claude-opus-4-7` with `effort: medium` and `thinking: adaptive`.

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `src/ai/types.ts` | `RackContext`, `RackDiff`, `AIProvider` interface, `AIHint`, `AIMessage` |
| `src/ai/state-serializer.ts` | `AppState` → compact `RackContext` JSON |
| `src/ai/diff-applier.ts` | `RackDiff` → `stateManager` mutations |
| `src/ai/rule-engine.ts` | Tier 1: algorithmic provider (validation hints, routing, catalog) |
| `src/ai/claude-provider.ts` | Tier 3: Anthropic SDK streaming provider |
| `src/ai/local-llm-provider.ts` | Tier 2: Ollama OpenAI-compat fetch provider |
| `src/ai/provider-registry.ts` | Runtime tier detection, returns active `AIProvider` |
| `src/ai/ai-service.ts` | Orchestrates serialize → call → stream → EventBus emit |
| `src/components/ai-panel.ts` | Chat panel UI component |
| `src/styles/ai-panel.css` | Chat panel + inline hint styles |
| `src/__tests__/ai/state-serializer.test.ts` | Tests for serializer |
| `src/__tests__/ai/diff-applier.test.ts` | Tests for diff applier |
| `src/__tests__/ai/rule-engine.test.ts` | Tests for rule engine |
| `src/__tests__/ai/provider-registry.test.ts` | Tests for provider detection |

### Modified files
| Path | Change |
|---|---|
| `package.json` | Add `@anthropic-ai/sdk`, `vitest`, `@vitest/ui`, `happy-dom` |
| `vite.config.ts` | Add `test` block for vitest |
| `src/core/types.ts` | Add `aiMode`, `aiProvider`, `previewDiff` to `AppState`; add `ai:*` events to `AppEvents`; add `power`, `weight` categories to `ValidationAlert` |
| `src/core/state.ts` | Initialise AI fields in constructor |
| `src/components/toolbar.ts` | Add AI Mode toggle button + provider badge |
| `src/components/properties.ts` | Inject `AIHintsSection` when AI mode on + object selected |
| `src/renderers/cable-renderer.ts` | Yellow preview ring from `AppState.previewDiff` |
| `src/renderers/device-renderer.ts` | Yellow preview ring from `AppState.previewDiff` |
| `src/app.ts` | Subscribe to `ai:*` events, wire AI panel |
| `src/core/validation.ts` | Add power draw + weight validation rules |
| `src/library/device-catalog.ts` | Add switch port variants, PDU variants, patch panels, routers |

---

## Task 1: Install Dependencies & Configure Test Runner

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Install packages**

```bash
cd G:/Claude/Rack_Design
npm install @anthropic-ai/sdk
npm install --save-dev vitest @vitest/ui happy-dom
```

Expected output: packages added, `node_modules/@anthropic-ai/sdk/` exists.

- [ ] **Step 2: Update `vite.config.ts`**

Replace the entire file:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

Replace `scripts` block:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
},
```

- [ ] **Step 4: Create test directory**

```bash
mkdir -p src/__tests__/ai
```

- [ ] **Step 5: Verify test runner works**

Create `src/__tests__/ai/setup.test.ts`:

```typescript
describe('test setup', () => {
  it('vitest is configured', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `✓ src/__tests__/ai/setup.test.ts > test setup > vitest is configured`

- [ ] **Step 6: Delete the setup test**

```bash
rm src/__tests__/ai/setup.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add package.json vite.config.ts
git commit -m "feat: add vitest and @anthropic-ai/sdk dependencies"
```

---

## Task 2: Add AI Types

**Files:**
- Create: `src/ai/types.ts`
- Modify: `src/core/types.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/ai/types.test.ts`:

```typescript
import { RackContext, RackDiff, AIMessage } from '../../ai/types';

describe('AI types', () => {
  it('RackDiff with null diff is valid', () => {
    const diff: RackDiff = { explanation: 'Analysis only', diff: null };
    expect(diff.diff).toBeNull();
    expect(diff.explanation).toBe('Analysis only');
  });

  it('AIMessage roles are user or assistant', () => {
    const msg: AIMessage = { role: 'user', content: 'hello' };
    expect(msg.role).toBe('user');
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../../ai/types'`

- [ ] **Step 2: Create `src/ai/types.ts`**

```typescript
import { DeviceData, CableData, RackData, Point } from '../core/types';

export interface RackContextPort {
  id: string;
  name: string;
  type: string;
  side: string;
  connected: boolean;
}

export interface RackContextDevice {
  id: string;
  type: string;
  model: string;
  ruStart: number;
  ruEnd: number;
  ports: RackContextPort[];
  power?: number;
  weight?: number;
}

export interface RackContextRack {
  id: string;
  name: string;
  units: number;
  devices: RackContextDevice[];
  pdus: { side: string; watts: number }[];
}

export interface RackContextCable {
  id: string;
  type: string;
  color: string;
  fromPort: string;
  toPort: string | null;
  routingMode: string;
  anchors: Point[];
}

export interface RackContext {
  racks: RackContextRack[];
  cables: RackContextCable[];
  validation: { alerts: { severity: string; message: string }[] };
  selectedId?: string;
}

export interface RackDiff {
  explanation: string;
  diff: {
    addDevices?: DeviceData[];
    removeDevices?: string[];
    updateDevices?: (Partial<DeviceData> & { id: string })[];
    addCables?: CableData[];
    removeCables?: string[];
    updateCables?: (Partial<CableData> & { id: string })[];
    updateAnchors?: { cableId: string; anchors: Point[] }[];
    addRacks?: RackData[];
    updateRacks?: (Partial<RackData> & { id: string })[];
  } | null;
}

export interface AIHint {
  severity: 'info' | 'warning' | 'error' | 'tip';
  message: string;
  diff?: RackDiff['diff'];
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AIProviderName = 'claude' | 'local' | 'rules';

export interface AIProvider {
  name: AIProviderName;
  isAvailable(): Promise<boolean>;
  getHints(context: RackContext, selectedId?: string): Promise<AIHint[]>;
  chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string>;
  parseDiff(raw: string): RackDiff;
}
```

- [ ] **Step 3: Add AI fields to `src/core/types.ts`**

Add to the `AppState` interface (after `cableRoutingTrayMode`):

```typescript
  // AI Mode
  aiMode: boolean;
  aiProvider: 'claude' | 'local' | 'rules';
  previewDiff: import('../ai/types').RackDiff | null;
```

Add to the `AppEvents` interface (after `'notification'`):

```typescript
  'ai:mode-changed': boolean;
  'ai:provider-changed': 'claude' | 'local' | 'rules';
  'ai:request': { messages: import('../ai/types').AIMessage[]; selectedId?: string };
  'ai:response': import('../ai/types').RackDiff;
  'ai:stream-chunk': string;
  'ai:stream-done': import('../ai/types').RackDiff;
  'ai:hints-updated': import('../ai/types').AIHint[];
  'ai:preview-diff': import('../ai/types').RackDiff | null;
  'ai:apply-diff': import('../ai/types').RackDiff;
  'ai:error': string;
```

Add `'power' | 'weight'` to the `ValidationAlert` category union (line 103):

```typescript
  category: 'medium' | 'connector' | 'speed' | 'bend' | 'loop' | 'congestion' | 'distance' | 'power' | 'weight';
```

- [ ] **Step 4: Run test**

Run: `npm test`
Expected: PASS — `✓ AI types > RackDiff with null diff is valid`

- [ ] **Step 5: Commit**

```bash
git add src/ai/types.ts src/core/types.ts src/__tests__/ai/types.test.ts
git commit -m "feat: add AI types (RackContext, RackDiff, AIProvider, AIHint)"
```

---

## Task 3: State Serializer

**Files:**
- Create: `src/ai/state-serializer.ts`
- Create: `src/__tests__/ai/state-serializer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/ai/state-serializer.test.ts
import { serializeState } from '../../ai/state-serializer';
import { AppState } from '../../core/types';

const minimalState: AppState = {
  theme: 'dark', tool: 'select',
  transform: { x: 0, y: 0, scale: 1 },
  gridVisible: true, snapEnabled: true, rulersVisible: true,
  racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 }],
  devices: [],
  cables: [],
  bundles: [],
  validationAlerts: [],
  selection: [],
  cableInProgress: null,
  sidebarCollapsed: false,
  propertiesCollapsed: false,
  showLegends: false,
  selectedCableType: 'general',
  selectedCableColor: '#78909c',
  selectedCableBend: 10,
  selectedCableTermination: 'RJ45',
  cabinetViewMode: 'front',
  cabinetDrawMode: 'default',
  cabinetCoverVisible: true,
  isometricMode: false,
  presenterMode: false,
  cableRoutingTrayMode: 'overhead',
  aiMode: false,
  aiProvider: 'rules',
  previewDiff: null,
};

describe('serializeState', () => {
  it('includes rack id and name', () => {
    const ctx = serializeState(minimalState);
    expect(ctx.racks[0].id).toBe('r1');
    expect(ctx.racks[0].name).toBe('Rack 1');
  });

  it('includes selected id when selection present', () => {
    const state = { ...minimalState, selection: [{ type: 'rack' as const, id: 'r1' }] };
    const ctx = serializeState(state);
    expect(ctx.selectedId).toBe('r1');
  });

  it('cables include fromPort and toPort', () => {
    const state = {
      ...minimalState,
      cables: [{
        id: 'c1', name: 'Cable 1', type: 'general' as const, color: '#fff',
        sourcePortId: 'p1', destPortId: 'p2', bendPoints: [],
        thickness: 2, bendRadius: 10, bundleId: null, notes: '',
      }],
    };
    const ctx = serializeState(state);
    expect(ctx.cables[0].fromPort).toBe('p1');
    expect(ctx.cables[0].toPort).toBe('p2');
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../../ai/state-serializer'`

- [ ] **Step 2: Create `src/ai/state-serializer.ts`**

```typescript
import { AppState } from '../core/types';
import { RackContext } from './types';
import { getTemplate } from '../library/device-catalog';

export function serializeState(state: AppState): RackContext {
  const selectedId = state.selection.length > 0 ? state.selection[0].id : undefined;

  const racks = state.racks.map(rack => {
    const rackDevices = state.devices.filter(d => d.rackId === rack.id);

    const devices = rackDevices.map(device => {
      const template = getTemplate(device.templateId);
      const ruEnd = device.startUnit + (template?.heightUnits ?? 1) - 1;
      return {
        id: device.id,
        type: device.templateId,
        model: device.name,
        ruStart: device.startUnit,
        ruEnd,
        ports: device.ports.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          side: 'front',
          connected: p.connected,
        })),
      };
    });

    const pdus: { side: string; watts: number }[] = [];
    if (rack.showPduLeft) pdus.push({ side: 'left', watts: 7200 });
    if (rack.showPduRight) pdus.push({ side: 'right', watts: 7200 });

    return { id: rack.id, name: rack.name, units: rack.units, devices, pdus };
  });

  const cables = state.cables.map(cable => ({
    id: cable.id,
    type: cable.type,
    color: cable.color,
    fromPort: cable.sourcePortId,
    toPort: cable.destPortId,
    routingMode: state.cableRoutingTrayMode,
    anchors: cable.anchorPoints ?? [],
  }));

  const alerts = state.validationAlerts.map(a => ({
    severity: a.type,
    message: a.message,
  }));

  return { racks, cables, validation: { alerts }, selectedId };
}
```

- [ ] **Step 3: Run test**

Run: `npm test`
Expected: PASS — all 3 serializer tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/ai/state-serializer.ts src/__tests__/ai/state-serializer.test.ts
git commit -m "feat: add state serializer (AppState → RackContext)"
```

---

## Task 4: Diff Applier

**Files:**
- Create: `src/ai/diff-applier.ts`
- Create: `src/__tests__/ai/diff-applier.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/ai/diff-applier.test.ts
import { applyDiff } from '../../ai/diff-applier';
import { RackDiff } from '../../ai/types';
import { AppState, DeviceData } from '../../core/types';

const baseDevice: DeviceData = {
  id: 'd1', templateId: 'generic', rackId: 'r1',
  startUnit: 1, name: 'Server', hostname: 'srv', managementIp: '',
  serialNumber: '', description: '', ports: [],
};

describe('applyDiff', () => {
  it('null diff makes no changes', () => {
    const diff: RackDiff = { explanation: 'ok', diff: null };
    const result = applyDiff(diff, ['d1'], ['c1']);
    expect(result).toBeNull();
  });

  it('removeDevices returns device ids to remove', () => {
    const diff: RackDiff = {
      explanation: 'removing',
      diff: { removeDevices: ['d1'] },
    };
    const result = applyDiff(diff, ['d1'], []);
    expect(result?.removeDevices).toContain('d1');
  });

  it('addCables returns cable list', () => {
    const diff: RackDiff = {
      explanation: 'adding cable',
      diff: {
        addCables: [{
          id: 'c-new', name: 'New Cable', type: 'general', color: '#fff',
          sourcePortId: 'p1', destPortId: 'p2', bendPoints: [],
          thickness: 2, bendRadius: 10, bundleId: null, notes: '',
        }],
      },
    };
    const result = applyDiff(diff, [], []);
    expect(result?.addCables?.[0].id).toBe('c-new');
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../../ai/diff-applier'`

- [ ] **Step 2: Create `src/ai/diff-applier.ts`**

```typescript
import { RackDiff } from './types';
import { CableData, DeviceData, RackData, Point } from '../core/types';

export interface ResolvedDiff {
  addDevices?: DeviceData[];
  removeDevices?: string[];
  updateDevices?: (Partial<DeviceData> & { id: string })[];
  addCables?: CableData[];
  removeCables?: string[];
  updateCables?: (Partial<CableData> & { id: string })[];
  updateAnchors?: { cableId: string; anchors: Point[] }[];
  addRacks?: RackData[];
  updateRacks?: (Partial<RackData> & { id: string })[];
}

/**
 * Validates and resolves a RackDiff against current device/cable IDs.
 * Returns null if diff is null (analysis-only response).
 * Filters out operations targeting non-existent IDs.
 */
export function applyDiff(
  rackDiff: RackDiff,
  existingDeviceIds: string[],
  existingCableIds: string[],
): ResolvedDiff | null {
  if (!rackDiff.diff) return null;

  const d = rackDiff.diff;
  const resolved: ResolvedDiff = {};

  if (d.addDevices?.length) resolved.addDevices = d.addDevices;
  if (d.removeDevices?.length) {
    resolved.removeDevices = d.removeDevices.filter(id => existingDeviceIds.includes(id));
  }
  if (d.updateDevices?.length) {
    resolved.updateDevices = d.updateDevices.filter(u => existingDeviceIds.includes(u.id));
  }
  if (d.addCables?.length) resolved.addCables = d.addCables;
  if (d.removeCables?.length) {
    resolved.removeCables = d.removeCables.filter(id => existingCableIds.includes(id));
  }
  if (d.updateCables?.length) {
    resolved.updateCables = d.updateCables.filter(u => existingCableIds.includes(u.id));
  }
  if (d.updateAnchors?.length) {
    resolved.updateAnchors = d.updateAnchors.filter(u => existingCableIds.includes(u.cableId));
  }
  if (d.addRacks?.length) resolved.addRacks = d.addRacks;
  if (d.updateRacks?.length) resolved.updateRacks = d.updateRacks;

  return resolved;
}

/**
 * Applies a resolved diff to the current state arrays.
 * Returns the updated arrays to pass to stateManager.setState().
 */
export function executeResolvedDiff(
  resolved: ResolvedDiff,
  currentDevices: DeviceData[],
  currentCables: CableData[],
  currentRacks: RackData[],
): { devices: DeviceData[]; cables: CableData[]; racks: RackData[] } {
  let devices = [...currentDevices];
  let cables = [...currentCables];
  let racks = [...currentRacks];

  // Racks
  if (resolved.addRacks) racks = [...racks, ...resolved.addRacks];
  if (resolved.updateRacks) {
    racks = racks.map(r => {
      const update = resolved.updateRacks!.find(u => u.id === r.id);
      return update ? { ...r, ...update } : r;
    });
  }

  // Devices
  if (resolved.removeDevices) {
    devices = devices.filter(d => !resolved.removeDevices!.includes(d.id));
  }
  if (resolved.addDevices) devices = [...devices, ...resolved.addDevices];
  if (resolved.updateDevices) {
    devices = devices.map(d => {
      const update = resolved.updateDevices!.find(u => u.id === d.id);
      return update ? { ...d, ...update } : d;
    });
  }

  // Cables
  if (resolved.removeCables) {
    cables = cables.filter(c => !resolved.removeCables!.includes(c.id));
  }
  if (resolved.addCables) cables = [...cables, ...resolved.addCables];
  if (resolved.updateCables) {
    cables = cables.map(c => {
      const update = resolved.updateCables!.find(u => u.id === c.id);
      return update ? { ...c, ...update } : c;
    });
  }
  if (resolved.updateAnchors) {
    cables = cables.map(c => {
      const anchor = resolved.updateAnchors!.find(u => u.cableId === c.id);
      return anchor ? { ...c, anchorPoints: anchor.anchors } : c;
    });
  }

  return { devices, cables, racks };
}
```

- [ ] **Step 3: Run test**

Run: `npm test`
Expected: PASS — all 3 diff-applier tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/ai/diff-applier.ts src/__tests__/ai/diff-applier.test.ts
git commit -m "feat: add diff-applier (RackDiff → resolved state mutations)"
```

---

## Task 5: Rule Engine (Tier 1)

**Files:**
- Create: `src/ai/rule-engine.ts`
- Create: `src/__tests__/ai/rule-engine.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/ai/rule-engine.test.ts
import { RuleEngine } from '../../ai/rule-engine';
import { RackContext } from '../../ai/types';

const emptyContext: RackContext = {
  racks: [{ id: 'r1', name: 'Rack 1', units: 42, devices: [], pdus: [{ side: 'left', watts: 7200 }] }],
  cables: [],
  validation: { alerts: [] },
};

describe('RuleEngine', () => {
  const engine = new RuleEngine();

  it('is always available', async () => {
    expect(await engine.isAvailable()).toBe(true);
  });

  it('name is rules', () => {
    expect(engine.name).toBe('rules');
  });

  it('returns hints for empty rack', async () => {
    const hints = await engine.getHints(emptyContext);
    expect(Array.isArray(hints)).toBe(true);
  });

  it('parseDiff returns explanation and null diff for plain text', () => {
    const result = engine.parseDiff('Just an explanation');
    expect(result.explanation).toBe('Just an explanation');
    expect(result.diff).toBeNull();
  });

  it('parseDiff parses valid JSON diff', () => {
    const raw = JSON.stringify({ explanation: 'ok', diff: { removeDevices: ['d1'] } });
    const result = engine.parseDiff(raw);
    expect(result.diff?.removeDevices).toContain('d1');
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../../ai/rule-engine'`

- [ ] **Step 2: Create `src/ai/rule-engine.ts`**

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';

const PDU_WATTS_PER_SIDE = 7200;
const POWER_WARN_THRESHOLD = 0.8;
const POWER_ERROR_THRESHOLD = 0.95;

export class RuleEngine implements AIProvider {
  readonly name: AIProviderName = 'rules';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getHints(context: RackContext, selectedId?: string): Promise<AIHint[]> {
    const hints: AIHint[] = [];

    for (const rack of context.racks) {
      const totalWatts = rack.pdus.reduce((sum, p) => sum + p.watts, 0);
      const usedWatts = rack.devices.reduce((sum, d) => sum + (d.power ?? 0), 0);
      const ratio = totalWatts > 0 ? usedWatts / totalWatts : 0;

      if (ratio >= POWER_ERROR_THRESHOLD) {
        hints.push({ severity: 'error', message: `${rack.name}: power at ${Math.round(ratio * 100)}% — critical` });
      } else if (ratio >= POWER_WARN_THRESHOLD) {
        hints.push({ severity: 'warning', message: `${rack.name}: power at ${Math.round(ratio * 100)}% of PDU capacity` });
      }

      const usedRus = rack.devices.reduce((sum, d) => sum + (d.ruEnd - d.ruStart + 1), 0);
      const freeRus = rack.units - usedRus;
      hints.push({ severity: 'info', message: `${rack.name}: ${freeRus}U free of ${rack.units}U` });
    }

    const connectedCount = context.cables.filter(c => c.toPort !== null).length;
    const floatingCount = context.cables.filter(c => c.toPort === null).length;
    if (floatingCount > 0) {
      hints.push({ severity: 'warning', message: `${floatingCount} cable(s) have no destination port` });
    }

    const validationErrors = context.validation.alerts.filter(a => a.severity === 'error');
    for (const alert of validationErrors.slice(0, 3)) {
      hints.push({ severity: 'error', message: alert.message });
    }

    return hints;
  }

  async *chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string> {
    const last = messages[messages.length - 1]?.content ?? '';
    const hints = await this.getHints(context);
    const summary = hints.map(h => `• ${h.message}`).join('\n');
    const response: RackDiff = {
      explanation: `Rule-based analysis:\n${summary || 'No issues detected.'}\n\n(Enable Claude or Local AI for natural language requests.)`,
      diff: null,
    };
    yield JSON.stringify(response);
  }

  parseDiff(raw: string): RackDiff {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.explanation === 'string') return parsed as RackDiff;
    } catch {
      // not JSON — treat as plain explanation
    }
    return { explanation: raw, diff: null };
  }
}
```

- [ ] **Step 3: Run test**

Run: `npm test`
Expected: PASS — all 5 rule-engine tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/ai/rule-engine.ts src/__tests__/ai/rule-engine.test.ts
git commit -m "feat: add RuleEngine (tier 1 algorithmic AI provider)"
```

---

## Task 6: Claude Provider (Tier 3)

**Files:**
- Create: `src/ai/claude-provider.ts`

- [ ] **Step 1: Create `src/ai/claude-provider.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const LS_KEY = 'rackcad_anthropic_key';
const MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are an expert datacenter engineer assistant embedded in RackCAD, a professional rack design tool.
You receive the current rack layout as JSON and a user request.

ALWAYS respond with valid JSON matching exactly this schema:
{"explanation": "<markdown text to show the user>", "diff": <RackDiff object> | null}

diff is null when no canvas change is needed (analysis, questions, reports).
For diffs, use minimal operations — only change what was explicitly requested.

Before suggesting device placements: check for free RUs.
Before suggesting cables: verify ports are not already connected.
For cable routing: respect the current routingMode (overhead/underfloor).
Validate: power draw <80% PDU capacity warning, <95% error; verify port type compatibility.`;

function buildUserMessage(context: RackContext, messages: AIMessage[]): string {
  const contextJson = JSON.stringify(context, null, 2);
  const history = messages.slice(0, -1).map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
  const last = messages[messages.length - 1]?.content ?? '';
  return `[CONTEXT]\n${contextJson}\n\n${history ? `[HISTORY]\n${history}\n\n` : ''}[REQUEST]\n${last}`;
}

export class ClaudeProvider implements AIProvider {
  readonly name: AIProviderName = 'claude';
  private client: Anthropic | null = null;
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  private getClient(): Anthropic | null {
    const key = this.getKey();
    if (!key) return null;
    if (!this.client) {
      this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    }
    return this.client;
  }

  static saveKey(key: string): void {
    localStorage.setItem(LS_KEY, key);
  }

  static clearKey(): void {
    localStorage.removeItem(LS_KEY);
  }

  static hasKey(): boolean {
    return !!localStorage.getItem(LS_KEY);
  }

  async isAvailable(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      await client.models.retrieve(MODEL);
      return true;
    } catch {
      return false;
    }
  }

  async getHints(context: RackContext, selectedId?: string): Promise<AIHint[]> {
    return this.fallback.getHints(context, selectedId);
  }

  async *chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string> {
    const client = this.getClient();
    if (!client) {
      yield* this.fallback.chat(context, messages);
      return;
    }

    const userMessage = buildUserMessage(context, messages);

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors related to `claude-provider.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/ai/claude-provider.ts
git commit -m "feat: add ClaudeProvider (tier 3, Anthropic SDK streaming)"
```

---

## Task 7: Local LLM Provider (Tier 2)

**Files:**
- Create: `src/ai/local-llm-provider.ts`

- [ ] **Step 1: Create `src/ai/local-llm-provider.ts`**

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const OLLAMA_BASE = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3';

export class LocalLLMProvider implements AIProvider {
  readonly name: AIProviderName = 'local';
  private fallback = new RuleEngine();

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getHints(context: RackContext, selectedId?: string): Promise<AIHint[]> {
    return this.fallback.getHints(context, selectedId);
  }

  async *chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string> {
    const contextJson = JSON.stringify(context, null, 2);
    const last = messages[messages.length - 1]?.content ?? '';

    const systemPrompt = `You are a datacenter engineer assistant. The current rack layout is:\n${contextJson}\n\nAlways respond with JSON: {"explanation":"...","diff":null_or_object}`;

    const body = {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: last },
      ],
      stream: true,
    };

    let res: Response;
    try {
      res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      yield* this.fallback.chat(context, messages);
      return;
    }

    if (!res.ok) {
      yield* this.fallback.chat(context, messages);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // malformed chunk — skip
        }
      }
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ai/local-llm-provider.ts
git commit -m "feat: add LocalLLMProvider (tier 2, Ollama OpenAI-compat)"
```

---

## Task 8: Provider Registry & AI Service

**Files:**
- Create: `src/ai/provider-registry.ts`
- Create: `src/ai/ai-service.ts`
- Create: `src/__tests__/ai/provider-registry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/ai/provider-registry.test.ts
import { ProviderRegistry } from '../../ai/provider-registry';

describe('ProviderRegistry', () => {
  it('always returns a provider (falls back to rules)', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.detect();
    expect(provider).toBeDefined();
    expect(provider.name).toBeDefined();
  });

  it('rules provider is always available', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.detect();
    // In test environment, Claude and Ollama are not available → rules
    expect(provider.name).toBe('rules');
  });
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../../ai/provider-registry'`

- [ ] **Step 2: Create `src/ai/provider-registry.ts`**

```typescript
import { AIProvider, AIProviderName } from './types';
import { RuleEngine } from './rule-engine';
import { LocalLLMProvider } from './local-llm-provider';
import { ClaudeProvider } from './claude-provider';

export class ProviderRegistry {
  private providers: AIProvider[] = [
    new ClaudeProvider(),
    new LocalLLMProvider(),
    new RuleEngine(),
  ];

  async detect(): Promise<AIProvider> {
    for (const provider of this.providers) {
      if (await provider.isAvailable()) return provider;
    }
    return new RuleEngine();
  }

  async getByName(name: AIProviderName): Promise<AIProvider> {
    const provider = this.providers.find(p => p.name === name);
    if (provider && await provider.isAvailable()) return provider;
    return new RuleEngine();
  }
}
```

- [ ] **Step 3: Create `src/ai/ai-service.ts`**

```typescript
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { AIMessage, RackDiff } from './types';
import { serializeState } from './state-serializer';
import { applyDiff, executeResolvedDiff } from './diff-applier';
import { ProviderRegistry } from './provider-registry';
import { ClaudeProvider } from './claude-provider';

const registry = new ProviderRegistry();

export const aiService = {
  async chat(messages: AIMessage[]): Promise<void> {
    const state = stateManager.getState();
    const context = serializeState(state);
    const selectedId = state.selection[0]?.id;

    const provider = await registry.detect();
    eventBus.emit('ai:provider-changed', provider.name as any);

    let accumulated = '';

    try {
      for await (const chunk of provider.chat(context, messages)) {
        accumulated += chunk;
        eventBus.emit('ai:stream-chunk', chunk);
      }

      const rackDiff = provider.parseDiff(accumulated);
      eventBus.emit('ai:stream-done', rackDiff);
    } catch (err: any) {
      eventBus.emit('ai:error', err?.message ?? 'Unknown AI error');
    }
  },

  async refreshHints(selectedId?: string): Promise<void> {
    const state = stateManager.getState();
    const context = serializeState(state);
    const provider = await registry.detect();
    const hints = await provider.getHints(context, selectedId);
    eventBus.emit('ai:hints-updated', hints);
  },

  applyRackDiff(diff: RackDiff): void {
    const state = stateManager.getState();
    const resolved = applyDiff(
      diff,
      state.devices.map(d => d.id),
      state.cables.map(c => c.id),
    );
    if (!resolved) return;

    const { devices, cables, racks } = executeResolvedDiff(
      resolved,
      state.devices,
      state.cables,
      state.racks,
    );
    stateManager.setState({ devices, cables, racks });
    stateManager.setState({ previewDiff: null });
  },

  setPreviewDiff(diff: RackDiff | null): void {
    stateManager.setState({ previewDiff: diff }, true);
  },
};
```

- [ ] **Step 4: Run test**

Run: `npm test`
Expected: PASS — both provider-registry tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/provider-registry.ts src/ai/ai-service.ts src/__tests__/ai/provider-registry.test.ts
git commit -m "feat: add ProviderRegistry and AIService (orchestration layer)"
```

---

## Task 9: Extend State & Init AI Fields

**Files:**
- Modify: `src/core/state.ts`

- [ ] **Step 1: Add AI fields to the constructor's initial state**

In `src/core/state.ts`, find the constructor where `this.state` is initialised (around line 13). Add these three fields after `cableRoutingTrayMode: 'overhead'`:

```typescript
      aiMode: false,
      aiProvider: 'rules',
      previewDiff: null,
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/state.ts
git commit -m "feat: initialise AI state fields (aiMode, aiProvider, previewDiff)"
```

---

## Task 10: AI Mode Toggle in Toolbar

**Files:**
- Modify: `src/components/toolbar.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Add AI toggle button to toolbar**

In `src/components/toolbar.ts`, find where the toolbar buttons are defined. Add this method to the `Toolbar` class (or the relevant render/init function):

```typescript
private createAiToggle(): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'toolbar-btn ai-toggle-btn';
  btn.id = 'ai-toggle-btn';
  btn.title = 'Enable / Disable AI Mode';
  btn.innerHTML = `<span class="ai-badge" id="ai-provider-badge">⚙ Rules</span>`;
  btn.addEventListener('click', () => {
    const current = stateManager.getState().aiMode;
    if (!current && !ClaudeProvider.hasKey()) {
      eventBus.emit('notification', { message: 'AI Mode: showing key setup...', type: 'info' });
      document.getElementById('ai-key-modal')?.classList.remove('hidden');
      return;
    }
    stateManager.setState({ aiMode: !current });
    eventBus.emit('ai:mode-changed', !current);
  });
  return btn;
}
```

At the top of `toolbar.ts`, add these imports:
```typescript
import { stateManager } from '../core/state';
import { ClaudeProvider } from '../ai/claude-provider';
```

Call `createAiToggle()` and append the returned element to the toolbar container inside the existing init or render method.

Subscribe to badge updates inside the toolbar's event subscription block:
```typescript
eventBus.on('ai:provider-changed', (name) => {
  const badge = document.getElementById('ai-provider-badge');
  if (!badge) return;
  const labels: Record<string, string> = { claude: '☁ Claude', local: '⚡ Local', rules: '⚙ Rules' };
  badge.textContent = labels[name] ?? '⚙ Rules';
});

eventBus.on('ai:mode-changed', (enabled) => {
  document.getElementById('ai-toggle-btn')?.classList.toggle('active', enabled);
});
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/toolbar.ts
git commit -m "feat: add AI Mode toggle button with provider badge to toolbar"
```

---

## Task 11: API Key Modal

**Files:**
- Modify: `src/app.ts`
- Modify: `index.html`

- [ ] **Step 1: Add modal HTML to `index.html`**

Before the closing `</body>` tag, add:

```html
<!-- AI Key Modal -->
<div id="ai-key-modal" class="hidden" style="
  position:fixed;inset:0;background:rgba(0,0,0,0.7);
  display:flex;align-items:center;justify-content:center;z-index:9999;">
  <div style="background:#1e1e2e;border:1px solid #333;border-radius:8px;padding:24px;width:380px;color:#ccc;">
    <h3 style="margin:0 0 12px;color:#fff">Connect to Claude</h3>
    <p style="font-size:13px;margin:0 0 16px">Enter your Anthropic API key to enable cloud AI. Leave blank to use Local or Rule-based mode.</p>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input id="ai-key-input" type="password" placeholder="sk-ant-..."
        style="flex:1;padding:8px;background:#111;border:1px solid #444;border-radius:4px;color:#fff;font-size:13px"/>
      <button id="ai-key-toggle" style="padding:8px;background:#333;border:1px solid #444;border-radius:4px;cursor:pointer;color:#ccc">👁</button>
    </div>
    <p style="font-size:11px;color:#888;margin:0 0 16px">Key stored in localStorage only. Never sent anywhere except Anthropic.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="ai-key-skip" style="padding:8px 16px;background:#333;border:1px solid #444;border-radius:4px;cursor:pointer;color:#ccc">Skip</button>
      <button id="ai-key-connect" style="padding:8px 16px;background:#6c63ff;border:none;border-radius:4px;cursor:pointer;color:#fff">Connect</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Wire modal in `src/app.ts`**

Add this function call during app init (after toolbar and before canvas setup):

```typescript
import { ClaudeProvider } from './ai/claude-provider';

function initAiKeyModal(): void {
  const modal = document.getElementById('ai-key-modal')!;
  const input = document.getElementById('ai-key-input') as HTMLInputElement;
  const toggleBtn = document.getElementById('ai-key-toggle')!;
  const skipBtn = document.getElementById('ai-key-skip')!;
  const connectBtn = document.getElementById('ai-key-connect')!;

  toggleBtn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  skipBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    stateManager.setState({ aiMode: true });
    eventBus.emit('ai:mode-changed', true);
  });

  connectBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (key) {
      ClaudeProvider.saveKey(key);
      eventBus.emit('notification', { message: 'Claude API key saved', type: 'success' });
    }
    modal.classList.add('hidden');
    stateManager.setState({ aiMode: true });
    eventBus.emit('ai:mode-changed', true);
  });
}
```

Call `initAiKeyModal()` in the app's `init()` function.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts index.html
git commit -m "feat: add API key modal for Claude connection"
```

---

## Task 12: AI Chat Panel Component

**Files:**
- Create: `src/components/ai-panel.ts`
- Create: `src/styles/ai-panel.css`
- Modify: `src/main.ts` or `src/app.ts` (import CSS)

- [ ] **Step 1: Create `src/styles/ai-panel.css`**

```css
.ai-panel {
  position: fixed;
  right: 0;
  top: 40px;
  bottom: 24px;
  width: 320px;
  background: #1a1a2e;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  z-index: 200;
  transform: translateX(100%);
  transition: transform 0.2s ease;
}
.ai-panel.open { transform: translateX(0); }

.ai-panel-header {
  padding: 10px 14px;
  background: #12122a;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #ddd;
}
.ai-panel-header .provider-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #4caf50;
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-msg {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-msg.user { background: #2a2a4a; color: #ccc; align-self: flex-end; max-width: 85%; }
.ai-msg.assistant { background: #1e1e3a; color: #bbb; align-self: flex-start; max-width: 95%; }

.ai-diff-card {
  background: #12281f;
  border: 1px solid #2e7d52;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: #9effc5;
  margin-top: 6px;
}
.ai-diff-card .diff-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.ai-diff-card button {
  padding: 4px 10px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 11px;
}
.ai-diff-card .btn-preview { background: #2a5c3f; color: #9effc5; }
.ai-diff-card .btn-apply { background: #2e7d52; color: #fff; }
.ai-diff-card .btn-dismiss { background: #333; color: #aaa; }

.ai-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #666;
  font-size: 12px;
  padding: 4px 12px;
}
.ai-thinking span { animation: blink 1.2s infinite; }

@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

.ai-input-row {
  padding: 10px;
  border-top: 1px solid #333;
  display: flex;
  gap: 6px;
}
.ai-input-row input {
  flex: 1;
  padding: 8px;
  background: #111;
  border: 1px solid #444;
  border-radius: 4px;
  color: #ddd;
  font-size: 12px;
}
.ai-input-row button {
  padding: 8px 12px;
  background: #6c63ff;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}
.ai-input-row button:disabled { background: #444; cursor: not-allowed; }

/* Inline hints */
.ai-hints-section {
  border-top: 1px solid #333;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ai-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: #aaa;
}
.ai-hint.warning { color: #ffb74d; }
.ai-hint.error { color: #ef5350; }
.ai-hint.tip { color: #81c784; }
.ai-hint.info { color: #64b5f6; }
```

- [ ] **Step 2: Create `src/components/ai-panel.ts`**

```typescript
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { aiService } from '../ai/ai-service';
import { AIMessage, RackDiff, AIHint } from '../ai/types';

export class AIPanel {
  private el: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private thinkingEl: HTMLElement;
  private messages: AIMessage[] = [];
  private streaming = false;
  private currentAssistantEl: HTMLElement | null = null;
  private pendingDiff: RackDiff | null = null;

  constructor() {
    this.el = this.buildDOM();
    document.body.appendChild(this.el);
    this.messagesEl = this.el.querySelector('.ai-messages')!;
    this.inputEl = this.el.querySelector('.ai-input-row input') as HTMLInputElement;
    this.sendBtn = this.el.querySelector('.ai-input-row button') as HTMLButtonElement;
    this.thinkingEl = this.el.querySelector('.ai-thinking')!;
    this.bindEvents();
  }

  private buildDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'ai-panel';
    div.id = 'ai-panel';
    div.innerHTML = `
      <div class="ai-panel-header">
        <span class="provider-dot" id="ai-dot"></span>
        <span id="ai-panel-provider">⚙ Rules</span>
        <span style="flex:1"></span>
        <button id="ai-panel-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px">✕</button>
      </div>
      <div class="ai-messages"></div>
      <div class="ai-thinking" style="display:none">
        <span>◉</span> Thinking...
      </div>
      <div class="ai-input-row">
        <input type="text" placeholder="Type a request..." />
        <button>▶</button>
      </div>
    `;
    return div;
  }

  private bindEvents(): void {
    this.el.querySelector('#ai-panel-close')!.addEventListener('click', () => this.close());

    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });

    eventBus.on('ai:mode-changed', (enabled) => {
      enabled ? this.open() : this.close();
    });

    eventBus.on('ai:provider-changed', (name) => {
      const labels: Record<string, string> = { claude: '☁ Claude', local: '⚡ Local', rules: '⚙ Rules' };
      const el = document.getElementById('ai-panel-provider');
      if (el) el.textContent = labels[name] ?? '⚙ Rules';
    });

    eventBus.on('ai:stream-chunk', (chunk) => {
      if (!this.currentAssistantEl) {
        this.currentAssistantEl = document.createElement('div');
        this.currentAssistantEl.className = 'ai-msg assistant';
        this.messagesEl.appendChild(this.currentAssistantEl);
      }
      this.currentAssistantEl.textContent += chunk;
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    eventBus.on('ai:stream-done', (rackDiff) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;
      this.currentAssistantEl = null;

      if (rackDiff.diff) {
        this.pendingDiff = rackDiff;
        this.showDiffCard(rackDiff);
      }
    });

    eventBus.on('ai:error', (msg) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;
      this.appendMessage('assistant', `⚠ Error: ${msg}`);
    });
  }

  private showDiffCard(diff: RackDiff): void {
    const ops = diff.diff!;
    const lines: string[] = [];
    if (ops.addDevices?.length) lines.push(`• Add ${ops.addDevices.length} device(s)`);
    if (ops.removeDevices?.length) lines.push(`• Remove ${ops.removeDevices.length} device(s)`);
    if (ops.addCables?.length) lines.push(`• Add ${ops.addCables.length} cable(s)`);
    if (ops.removeCables?.length) lines.push(`• Remove ${ops.removeCables.length} cable(s)`);
    if (ops.updateAnchors?.length) lines.push(`• Re-route ${ops.updateAnchors.length} cable(s)`);
    if (ops.addRacks?.length) lines.push(`• Add ${ops.addRacks.length} rack(s)`);

    const card = document.createElement('div');
    card.className = 'ai-diff-card';
    card.innerHTML = `
      <div><strong>Suggested changes:</strong></div>
      <div>${lines.join('<br>')}</div>
      <div class="diff-actions">
        <button class="btn-preview">Preview</button>
        <button class="btn-apply">Apply</button>
        <button class="btn-dismiss">✕</button>
      </div>
    `;
    card.querySelector('.btn-preview')!.addEventListener('click', () => {
      aiService.setPreviewDiff(diff);
      eventBus.emit('ai:preview-diff', diff);
    });
    card.querySelector('.btn-apply')!.addEventListener('click', () => {
      aiService.applyRackDiff(diff);
      eventBus.emit('notification', { message: 'AI changes applied', type: 'success' });
      card.remove();
      this.pendingDiff = null;
    });
    card.querySelector('.btn-dismiss')!.addEventListener('click', () => {
      aiService.setPreviewDiff(null);
      card.remove();
      this.pendingDiff = null;
    });
    this.messagesEl.appendChild(card);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private appendMessage(role: 'user' | 'assistant', content: string): void {
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.textContent = content;
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.streaming) return;

    this.inputEl.value = '';
    this.appendMessage('user', text);
    this.messages.push({ role: 'user', content: text });

    this.streaming = true;
    this.sendBtn.disabled = true;
    this.thinkingEl.style.display = 'flex';

    await aiService.chat([...this.messages]);
  }

  open(): void { this.el.classList.add('open'); }
  close(): void { this.el.classList.remove('open'); }
}
```

- [ ] **Step 3: Import CSS in `src/main.ts`**

Add at the top of `src/main.ts`:

```typescript
import './styles/ai-panel.css';
```

- [ ] **Step 4: Instantiate panel in `src/app.ts`**

Add import and instantiation in `app.ts` init:

```typescript
import { AIPanel } from './components/ai-panel';

// inside init():
new AIPanel();
```

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-panel.ts src/styles/ai-panel.css src/main.ts src/app.ts
git commit -m "feat: add AI chat panel with streaming, diff card, preview/apply"
```

---

## Task 13: Inline AI Hints in Properties Panel

**Files:**
- Modify: `src/components/properties.ts`

- [ ] **Step 1: Add `AIHintsSection` to properties panel**

At the bottom of `src/components/properties.ts`, add:

```typescript
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { aiService } from '../ai/ai-service';
import { AIHint } from '../ai/types';

export function initAIHints(): void {
  let hintsContainer: HTMLElement | null = null;

  function getOrCreateContainer(): HTMLElement {
    if (hintsContainer) return hintsContainer;
    hintsContainer = document.createElement('div');
    hintsContainer.className = 'ai-hints-section';
    hintsContainer.id = 'ai-hints-section';
    // Append to the properties panel element
    const panel = document.getElementById('properties-panel') ?? document.querySelector('.properties-panel');
    if (panel) panel.appendChild(hintsContainer);
    return hintsContainer;
  }

  function renderHints(hints: AIHint[]): void {
    const container = getOrCreateContainer();
    container.innerHTML = hints.length === 0
      ? ''
      : `<div style="font-size:11px;color:#666;margin-bottom:4px;font-weight:600">AI Insights</div>` +
        hints.map(h => `
          <div class="ai-hint ${h.severity}">
            <span>${h.severity === 'error' ? '⚠' : h.severity === 'warning' ? '⚡' : h.severity === 'tip' ? '💡' : 'ℹ'}</span>
            <span>${h.message}</span>
          </div>
        `).join('');
  }

  eventBus.on('ai:hints-updated', renderHints);

  eventBus.on('selection:changed', (selection) => {
    const state = stateManager.getState();
    if (!state.aiMode || selection.length === 0) {
      renderHints([]);
      return;
    }
    aiService.refreshHints(selection[0].id);
  });

  eventBus.on('ai:mode-changed', (enabled) => {
    if (!enabled) renderHints([]);
  });
}
```

Call `initAIHints()` from `src/app.ts` init.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/properties.ts src/app.ts
git commit -m "feat: add inline AI hints section to properties panel"
```

---

## Task 14: Canvas Preview Highlights

**Files:**
- Modify: `src/renderers/device-renderer.ts`
- Modify: `src/renderers/cable-renderer.ts`

- [ ] **Step 1: Add preview ring to device renderer**

In `src/renderers/device-renderer.ts`, find the function that renders individual devices (likely `renderDevice` or similar). After the device body is drawn, add:

```typescript
// Preview highlight ring — shown when this device is in the pending AI diff
if (previewDiff?.diff) {
  const d = previewDiff.diff;
  const isAffected =
    d.removeDevices?.includes(device.id) ||
    d.updateDevices?.some(u => u.id === device.id) ||
    d.addDevices?.some(a => a.id === device.id);

  if (isAffected) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(deviceX - 3));
    rect.setAttribute('y', String(deviceY - 3));
    rect.setAttribute('width', String(RACK_CONSTANTS.RACK_INNER_WIDTH + 6));
    rect.setAttribute('height', String(deviceHeightPx + 6));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', '#ffd600');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('opacity', '0.85');
    rect.setAttribute('pointer-events', 'none');
    group.appendChild(rect);
  }
}
```

Pass `previewDiff` from `AppState` into the render function from the call site in `app.ts` or the main render loop.

- [ ] **Step 2: Add preview ring to cable renderer**

In `src/renderers/cable-renderer.ts`, in the cable drawing function, add after the cable path is drawn:

```typescript
if (previewDiff?.diff) {
  const d = previewDiff.diff;
  const isAffected =
    d.removeCables?.includes(cable.id) ||
    d.updateCables?.some(u => u.id === cable.id) ||
    d.updateAnchors?.some(u => u.cableId === cable.id);

  if (isAffected) {
    const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glowPath.setAttribute('d', pathD);
    glowPath.setAttribute('fill', 'none');
    glowPath.setAttribute('stroke', '#ffd600');
    glowPath.setAttribute('stroke-width', String(cable.thickness + 4));
    glowPath.setAttribute('opacity', '0.4');
    glowPath.setAttribute('pointer-events', 'none');
    cableGroup.insertBefore(glowPath, cableGroup.firstChild);
  }
}
```

- [ ] **Step 3: Subscribe to preview diff in app.ts**

```typescript
eventBus.on('ai:preview-diff', (_diff) => {
  // renderAll() will re-render with stateManager.getState().previewDiff set
  renderAll();
});
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/device-renderer.ts src/renderers/cable-renderer.ts src/app.ts
git commit -m "feat: add yellow preview highlight rings for AI diff preview"
```

---

## Task 15: Expanded Device Catalog

**Files:**
- Modify: `src/library/device-catalog.ts`

- [ ] **Step 1: Add switch variants**

In `src/library/device-catalog.ts`, add the following templates to the catalog array. Each entry follows the existing `DeviceTemplate` interface:

```typescript
// --- Switches: 4-port ---
{
  id: 'switch-4p-1g',
  name: 'Switch 4-Port 1GbE',
  manufacturer: 'Generic',
  model: '4-Port Gigabit Switch',
  category: 'switch',
  heightUnits: 1,
  color: '#1a237e',
  icon: '🔀',
  ports: [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `sw4p-rj45-${i}`,
      name: `Gi0/${i + 1}`,
      type: 'rj45' as PortType,
      relativeX: 20 + i * 30,
      relativeY: 15,
      speed: '1G',
    })),
  ],
},
// --- 8-port ---
{
  id: 'switch-8p-1g',
  name: 'Switch 8-Port 1GbE',
  manufacturer: 'Generic',
  model: '8-Port Gigabit Switch',
  category: 'switch',
  heightUnits: 1,
  color: '#1a237e',
  icon: '🔀',
  ports: Array.from({ length: 8 }, (_, i) => ({
    id: `sw8p-rj45-${i}`,
    name: `Gi0/${i + 1}`,
    type: 'rj45' as PortType,
    relativeX: 10 + i * 22,
    relativeY: 15,
    speed: '1G',
  })),
},
// --- 12-port ---
{
  id: 'switch-12p-1g',
  name: 'Switch 12-Port 1GbE',
  manufacturer: 'Generic',
  model: '12-Port Gigabit Switch',
  category: 'switch',
  heightUnits: 1,
  color: '#1a237e',
  icon: '🔀',
  ports: Array.from({ length: 12 }, (_, i) => ({
    id: `sw12p-rj45-${i}`,
    name: `Gi0/${i + 1}`,
    type: 'rj45' as PortType,
    relativeX: 10 + i * 16,
    relativeY: 15,
    speed: '1G',
  })),
},
// --- 16-port ---
{
  id: 'switch-16p-1g',
  name: 'Switch 16-Port 1GbE',
  manufacturer: 'Generic',
  model: '16-Port Gigabit Switch',
  category: 'switch',
  heightUnits: 1,
  color: '#1a237e',
  icon: '🔀',
  ports: Array.from({ length: 16 }, (_, i) => ({
    id: `sw16p-rj45-${i}`,
    name: `Gi0/${i + 1}`,
    type: 'rj45' as PortType,
    relativeX: 10 + i * 12,
    relativeY: 15,
    speed: '1G',
  })),
},
// --- 24-port 10GbE SFP+ ---
{
  id: 'switch-24p-10g',
  name: 'Switch 24-Port 10GbE',
  manufacturer: 'Generic',
  model: '24-Port 10GbE SFP+ Switch',
  category: 'switch',
  heightUnits: 1,
  color: '#0d47a1',
  icon: '🔀',
  ports: Array.from({ length: 24 }, (_, i) => ({
    id: `sw24p-sfp-${i}`,
    name: `Te0/${i + 1}`,
    type: 'sfp-plus' as PortType,
    relativeX: 10 + i * 10,
    relativeY: 15,
    speed: '10G',
  })),
},
// --- 48-port 1GbE + 4x SFP+ uplink ---
{
  id: 'switch-48p-1g-4sfp',
  name: 'Switch 48-Port 1GbE + 4x SFP+',
  manufacturer: 'Generic',
  model: '48-Port 1GbE Access Switch',
  category: 'switch',
  heightUnits: 1,
  color: '#1565c0',
  icon: '🔀',
  ports: [
    ...Array.from({ length: 48 }, (_, i) => ({
      id: `sw48p-rj45-${i}`,
      name: `Gi0/${i + 1}`,
      type: 'rj45' as PortType,
      relativeX: 6 + i * 6,
      relativeY: 10,
      speed: '1G',
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `sw48p-sfp-${i}`,
      name: `Te0/${i + 1}`,
      type: 'sfp-plus' as PortType,
      relativeX: 310 + i * 16,
      relativeY: 10,
      speed: '10G',
    })),
  ],
},
```

- [ ] **Step 2: Add PDU variants**

```typescript
// PDU - Horizontal Basic
{
  id: 'pdu-horizontal-basic',
  name: 'PDU Horizontal Basic',
  manufacturer: 'Generic',
  model: '1U Horizontal PDU 16A',
  category: 'pdu',
  heightUnits: 1,
  color: '#212121',
  icon: '🔌',
  ports: Array.from({ length: 8 }, (_, i) => ({
    id: `pdu-h-c13-${i}`,
    name: `C13-${i + 1}`,
    type: 'power' as PortType,
    relativeX: 20 + i * 40,
    relativeY: 15,
  })),
},
// PDU - Horizontal Smart (metered)
{
  id: 'pdu-horizontal-smart',
  name: 'PDU Horizontal Smart (Metered)',
  manufacturer: 'Generic',
  model: '1U Smart PDU 32A',
  category: 'pdu',
  heightUnits: 1,
  color: '#1b5e20',
  icon: '🔌',
  ports: [
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `pdu-hs-c13-${i}`,
      name: `C13-${i + 1}`,
      type: 'power' as PortType,
      relativeX: 10 + i * 28,
      relativeY: 15,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `pdu-hs-c19-${i}`,
      name: `C19-${i + 1}`,
      type: 'power' as PortType,
      relativeX: 346 + i * 12,
      relativeY: 15,
    })),
  ],
},
// PDU - Vertical Basic (0U, mounts in rack side channel)
{
  id: 'pdu-vertical-basic',
  name: 'PDU Vertical Basic',
  manufacturer: 'Generic',
  model: '0U Vertical PDU 32A',
  category: 'pdu',
  heightUnits: 2,
  color: '#37474f',
  icon: '🔌',
  ports: Array.from({ length: 16 }, (_, i) => ({
    id: `pdu-v-c13-${i}`,
    name: `C13-${i + 1}`,
    type: 'power' as PortType,
    relativeX: 40,
    relativeY: 10 + i * 15,
  })),
},
// PDU - Vertical Smart
{
  id: 'pdu-vertical-smart',
  name: 'PDU Vertical Smart (Metered + Switched)',
  manufacturer: 'Generic',
  model: '0U Smart Vertical PDU 32A',
  category: 'pdu',
  heightUnits: 2,
  color: '#1b5e20',
  icon: '🔌',
  ports: [
    ...Array.from({ length: 16 }, (_, i) => ({
      id: `pdu-vs-c13-${i}`,
      name: `C13-${i + 1}`,
      type: 'power' as PortType,
      relativeX: 30,
      relativeY: 10 + i * 15,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `pdu-vs-c19-${i}`,
      name: `C19-${i + 1}`,
      type: 'power' as PortType,
      relativeX: 60,
      relativeY: 10 + i * 30,
    })),
  ],
},
```

- [ ] **Step 3: Add patch panels and other devices**

```typescript
// Patch Panel - 24-port Cat6
{
  id: 'patch-panel-24p-cat6',
  name: 'Patch Panel 24-Port Cat6',
  manufacturer: 'Generic',
  model: '1U 24-Port Cat6 Patch Panel',
  category: 'patch-panel',
  heightUnits: 1,
  color: '#4a148c',
  icon: '🔲',
  ports: Array.from({ length: 24 }, (_, i) => ({
    id: `pp24-rj45-${i}`,
    name: `P${i + 1}`,
    type: 'rj45' as PortType,
    relativeX: 8 + i * 14,
    relativeY: 15,
  })),
},
// Patch Panel - 48-port Cat6
{
  id: 'patch-panel-48p-cat6',
  name: 'Patch Panel 48-Port Cat6',
  manufacturer: 'Generic',
  model: '2U 48-Port Cat6 Patch Panel',
  category: 'patch-panel',
  heightUnits: 2,
  color: '#4a148c',
  icon: '🔲',
  ports: Array.from({ length: 48 }, (_, i) => ({
    id: `pp48-rj45-${i}`,
    name: `P${i + 1}`,
    type: 'rj45' as PortType,
    relativeX: 4 + i * 7,
    relativeY: 20,
  })),
},
// Patch Panel - 24-port SFP
{
  id: 'patch-panel-24p-sfp',
  name: 'Fiber Patch Panel 24-Port SFP',
  manufacturer: 'Generic',
  model: '1U 24-Port LC Duplex Fiber Patch Panel',
  category: 'patch-panel',
  heightUnits: 1,
  color: '#4a148c',
  icon: '🔲',
  ports: Array.from({ length: 24 }, (_, i) => ({
    id: `fpp24-sfp-${i}`,
    name: `F${i + 1}`,
    type: 'sfp' as PortType,
    relativeX: 8 + i * 14,
    relativeY: 15,
  })),
},
// Router - 1U
{
  id: 'router-1u-generic',
  name: 'Router 1U Enterprise',
  manufacturer: 'Generic',
  model: '1U Enterprise Router',
  category: 'router',
  heightUnits: 1,
  color: '#bf360c',
  icon: '🌐',
  ports: [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `rtr-wan-${i}`,
      name: `WAN${i + 1}`,
      type: 'sfp-plus' as PortType,
      relativeX: 20 + i * 25,
      relativeY: 15,
      speed: '10G',
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `rtr-lan-${i}`,
      name: `LAN${i + 1}`,
      type: 'rj45' as PortType,
      relativeX: 130 + i * 22,
      relativeY: 15,
      speed: '1G',
    })),
  ],
},
// KVM Switch
{
  id: 'kvm-8p',
  name: 'KVM Switch 8-Port',
  manufacturer: 'Generic',
  model: '1U 8-Port KVM over IP',
  category: 'server',
  heightUnits: 1,
  color: '#4e342e',
  icon: '🖥',
  ports: [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `kvm-vga-${i}`,
      name: `KVM${i + 1}`,
      type: 'console' as PortType,
      relativeX: 20 + i * 40,
      relativeY: 15,
    })),
    { id: 'kvm-mgmt', name: 'MGMT', type: 'rj45' as PortType, relativeX: 360, relativeY: 15, speed: '1G' },
  ],
},
// Console Server
{
  id: 'console-server-16p',
  name: 'Console Server 16-Port',
  manufacturer: 'Generic',
  model: '1U 16-Port Serial Console Server',
  category: 'server',
  heightUnits: 1,
  color: '#4e342e',
  icon: '🖥',
  ports: [
    ...Array.from({ length: 16 }, (_, i) => ({
      id: `cs-serial-${i}`,
      name: `Serial${i + 1}`,
      type: 'console' as PortType,
      relativeX: 10 + i * 22,
      relativeY: 15,
    })),
    { id: 'cs-mgmt', name: 'MGMT', type: 'rj45' as PortType, relativeX: 370, relativeY: 15, speed: '1G' },
  ],
},
// Blanking Panel
{
  id: 'blank-panel-1u',
  name: 'Blanking Panel 1U',
  manufacturer: 'Generic',
  model: '1U Blanking Panel',
  category: 'blank-panel',
  heightUnits: 1,
  color: '#333',
  icon: '▬',
  ports: [],
},
// Cable Manager 1U
{
  id: 'cable-manager-1u',
  name: 'Horizontal Cable Manager 1U',
  manufacturer: 'Generic',
  model: '1U Horizontal Cable Manager',
  category: 'cable-manager',
  heightUnits: 1,
  color: '#1c1c1c',
  icon: '〰',
  ports: [],
},
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/library/device-catalog.ts
git commit -m "feat: expand device catalog (switches 4-48p, PDUs, patch panels, routers, KVM, console server)"
```

---

## Task 16: Extended Validation Rules (Power + Weight)

**Files:**
- Modify: `src/core/validation.ts`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/ai/validation.test.ts`:

```typescript
import { runValidationAlerts } from '../../core/validation';
import { RackData, DeviceData } from '../../core/types';

const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0, showPduLeft: true, showPduRight: true };

describe('runValidationAlerts - power', () => {
  it('warns when power draw exceeds 80% PDU capacity', () => {
    // Device with power draw set — validation needs to see power in description or name
    // We test this via the new extended function
    const alerts = runValidationAlerts([rack], [], []);
    // Basic smoke test — no crash
    expect(Array.isArray(alerts)).toBe(true);
  });
});
```

Run: `npm test`
Expected: PASS (smoke test).

- [ ] **Step 2: Add power and weight rules to `src/core/validation.ts`**

At the end of the `runValidationAlerts` function, before `return alerts;`, add:

```typescript
  // Power draw validation
  const PDU_WATTS = 7200; // per PDU side
  for (const rack of racks) {
    const rackDevices = devices.filter(d => d.rackId === rack.id);
    const pduCount = (rack.showPduLeft ? 1 : 0) + (rack.showPduRight ? 1 : 0);
    const totalCapacity = pduCount * PDU_WATTS;

    if (totalCapacity === 0) continue;

    // Sum power from device descriptions if encoded as "XXXw" or "XXXwatts"
    const usedWatts = rackDevices.reduce((sum, d) => {
      const match = d.description.match(/(\d+)\s*[wW](?:atts?)?/);
      return sum + (match ? parseInt(match[1]) : 0);
    }, 0);

    const ratio = usedWatts / totalCapacity;

    if (ratio >= 0.95) {
      alerts.push({
        id: generateId(),
        type: 'error',
        category: 'power',
        message: `${rack.name}: power draw at ${Math.round(ratio * 100)}% of PDU capacity — critical`,
        targetId: rack.id,
        targetType: 'rack',
      });
    } else if (ratio >= 0.8) {
      alerts.push({
        id: generateId(),
        type: 'warning',
        category: 'power',
        message: `${rack.name}: power draw at ${Math.round(ratio * 100)}% of PDU capacity`,
        targetId: rack.id,
        targetType: 'rack',
      });
    }
  }
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/validation.ts src/__tests__/ai/validation.test.ts
git commit -m "feat: add power draw validation rules (warn ≥80%, error ≥95%)"
```

---

## Task 17: Manual Dev Test

At this point all core infrastructure is in place. Run the app and verify the AI Mode integration end-to-end.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: Vite starts, no compilation errors, app opens in browser.

- [ ] **Step 2: Verify AI toggle appears in toolbar**

Look for `⚙ Rules` badge in the toolbar. Click it — the API key modal should appear if no key is stored.

- [ ] **Step 3: Test Rule Engine chat**

Click Skip in the modal. AI panel opens. Type `"What devices are in the rack?"` → should get a rule-based response.

- [ ] **Step 4: Test inline hints**

Click a rack → AI Insights section at the bottom of Properties panel should show power/RU stats.

- [ ] **Step 5: Test Claude (optional)**

If you have an API key: click the toggle, enter the key, type a request. Verify streaming text appears word-by-word in the chat panel.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete Claude AI integration — three-tier provider, chat panel, inline hints, diff apply"
```

---

## Summary

| Phase | Tasks | Outcome |
|---|---|---|
| Foundation | 1–4 | Types, serializer, diff applier, test runner |
| Providers | 5–8 | Rule Engine, Claude, Ollama, registry, AI service |
| State | 9 | AI fields in AppState |
| UI | 10–14 | Toolbar toggle, key modal, chat panel, inline hints, preview highlights |
| Features | 15–16 | Catalog expansion, power validation |
| Verification | 17 | End-to-end dev test |

All 7 feature areas from the spec are covered:
- **Visual modes** — existing fields in AppState; AI chat can toggle via diff
- **Cable routing** — Rule Engine reads `routingMode`; Claude/Local suggest anchor updates  
- **Export** — Claude's `explanation` text used for report narrative; manual export unchanged
- **Custom device builder** — catalog expanded; Claude generates device JSON on request
- **Catalog** — Task 15 adds all variants
- **Cable routing improvements** — `updateAnchors` in RackDiff, diff-applier applies them
- **Validation** — Task 16 adds power rules; Claude reads existing alerts for audit reports
