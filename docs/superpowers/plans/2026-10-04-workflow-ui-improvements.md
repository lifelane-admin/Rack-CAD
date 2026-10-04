# Workflow UI Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Features 1–5 from the workflow UI enhancements spec: N+1 toggle, rack preview zoom, auto-labels, engineering metrics bar, and full cable laying on canvas deployment.

**Architecture:** All changes are incremental and isolated. Three new classes (`RackPreviewZoom`, `LabelSyncManager`, `CableLayingOrchestrator`) are added as separate files. The orchestrator gains `syncSpareNode()` and `hasCanvasDeployment` flag. Stage renderers wire everything together. Each feature can be reverted independently.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4, happy-dom, vanilla DOM — no new dependencies.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/ai/workflow/workflow-orchestrator.ts` | Add `syncSpareNode()`, `hasCanvasDeployment`, `subscribe()` if missing |
| Modify | `src/ai/workflow/types.ts` | Add `hasCanvasDeployment: boolean` to `WorkflowStateData` |
| Modify | `src/ai/workflow/stage-renderers.ts` | Wire N+1 handler; inject metrics bar + preview zoom; post-deploy hooks |
| Create | `src/ai/workflow/rack-preview-zoom.ts` | Scroll-to-zoom class for rack preview panels |
| Create | `src/ai/workflow/label-sync-manager.ts` | Create/update/remove TextLabel objects on canvas |
| Create | `src/ai/workflow/cable-laying-orchestrator.ts` | Auto-wire power, data, management cables |
| Modify | `src/styles/ai-panel.css` | Preview height, zoom badge, metrics bar styles |
| Create | `src/__tests__/ai/n1-toggle.test.ts` | Feature 1 tests |
| Create | `src/__tests__/ai/rack-preview-zoom.test.ts` | Feature 2 tests |
| Create | `src/__tests__/ai/label-sync-manager.test.ts` | Feature 3 tests |
| Create | `src/__tests__/ai/engineering-metrics.test.ts` | Feature 4 tests |
| Create | `src/__tests__/ai/cable-laying.test.ts` | Feature 5 tests |

---

## Task 1: Extend WorkflowStateData with `hasCanvasDeployment`

**Files:**
- Modify: `src/ai/workflow/types.ts`
- Modify: `src/ai/workflow/workflow-orchestrator.ts`
- Create: `src/__tests__/ai/n1-toggle.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/ai/n1-toggle.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

describe('AIWorkflowOrchestrator - hasCanvasDeployment', () => {
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
    orc = new AIWorkflowOrchestrator();
  });

  it('starts with hasCanvasDeployment false', () => {
    expect(orc.getState().hasCanvasDeployment).toBe(false);
  });

  it('setCanvasDeployed(true) sets flag to true', () => {
    orc.setCanvasDeployed(true);
    expect(orc.getState().hasCanvasDeployment).toBe(true);
  });

  it('setCanvasDeployed(false) resets flag', () => {
    orc.setCanvasDeployed(true);
    orc.setCanvasDeployed(false);
    expect(orc.getState().hasCanvasDeployment).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```powershell
cd "G:\Claude\RackSlicer_October\Final_Backup_3rd_Oct\Workspace_Files"
npx vitest run src/__tests__/ai/n1-toggle.test.ts
```
Expected: FAIL — `hasCanvasDeployment` does not exist on `WorkflowStateData`.

- [ ] **Step 3: Add `hasCanvasDeployment` to `WorkflowStateData` in `types.ts`**

Find the `WorkflowStateData` interface and add the field after `lastModifiedTimestamp`:

```typescript
  lastModifiedTimestamp: number;
  hasCanvasDeployment: boolean;   // ← add this line
```

- [ ] **Step 4: Add `setCanvasDeployed()` to the orchestrator**

In `workflow-orchestrator.ts`, find the public methods section and add after `approveCurrentStage`:

```typescript
  public setCanvasDeployed(value: boolean): void {
    this.state.hasCanvasDeployment = value;
    this.notify();
  }
```

- [ ] **Step 5: Set default in `createInitialState()`**

Find the `createInitialState()` method (or wherever the initial state object is built) and add:

```typescript
hasCanvasDeployment: false,
```

- [ ] **Step 6: Run test to confirm it passes**

```powershell
npx vitest run src/__tests__/ai/n1-toggle.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/ai/workflow/types.ts src/ai/workflow/workflow-orchestrator.ts src/__tests__/ai/n1-toggle.test.ts
git commit -m "feat(workflow): add hasCanvasDeployment flag to orchestrator state"
```

---

## Task 2: N+1 Spare Node Toggle — `syncSpareNode()`

**Files:**
- Modify: `src/ai/workflow/workflow-orchestrator.ts`
- Modify: `src/__tests__/ai/n1-toggle.test.ts`

- [ ] **Step 1: Add tests for syncSpareNode**

Append to `src/__tests__/ai/n1-toggle.test.ts`:

```typescript
describe('AIWorkflowOrchestrator - syncSpareNode', () => {
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
    orc = new AIWorkflowOrchestrator();
    // Seed a spare BOM item
    orc.addBomItem({
      name: 'Dell PowerEdge R760 (N+1 Standby Node)',
      model: 'PowerEdge R760 Hot Spare',
      category: 'Compute',
      qty: 1,
      unitCost: 8900,
      units: 2,
      power: 310,
      specs: '2U | Standby Hot-Spare',
      whySuggested: 'N+1 spare',
      badge: 'Redundancy N+1',
      alternatives: [],
    });
  });

  it('syncSpareNode(false) removes the spare BOM item', () => {
    orc.syncSpareNode(false);
    const spare = orc.getBomItems().find(b => b.badge === 'Redundancy N+1');
    expect(spare).toBeUndefined();
  });

  it('syncSpareNode(true) when spare missing adds it back', () => {
    orc.syncSpareNode(false); // remove first
    orc.syncSpareNode(true);
    const spare = orc.getBomItems().find(b => b.badge === 'Redundancy N+1');
    expect(spare).toBeDefined();
    expect(spare?.name).toContain('N+1 Standby Node');
  });

  it('syncSpareNode(true) when spare already exists does not duplicate', () => {
    orc.syncSpareNode(true); // spare already present from beforeEach
    const spares = orc.getBomItems().filter(b => b.badge === 'Redundancy N+1');
    expect(spares).toHaveLength(1);
  });

  it('syncSpareNode(false) notifies listeners', () => {
    let called = 0;
    orc.subscribe(() => { called++; });
    orc.syncSpareNode(false);
    expect(called).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
npx vitest run src/__tests__/ai/n1-toggle.test.ts
```
Expected: FAIL — `syncSpareNode` and `subscribe` not defined.

- [ ] **Step 3: Add `subscribe()` to orchestrator (if not already present)**

Check if a `subscribe` or `addListener` public method exists. If not, add after `setCanvasDeployed`:

```typescript
  public subscribe(listener: (state: WorkflowStateData) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
```

- [ ] **Step 4: Add `syncSpareNode()` to orchestrator**

Add after `subscribe()`:

```typescript
  public syncSpareNode(enabled: boolean): void {
    if (!enabled) {
      const spare = this.getBomItems().find(
        b => b.badge === 'Redundancy N+1' || b.name.includes('N+1 Standby Node')
      );
      if (spare) this.removeBomItem(spare.id);
    } else {
      const already = this.getBomItems().find(
        b => b.badge === 'Redundancy N+1' || b.name.includes('N+1 Standby Node')
      );
      if (!already) {
        this.addBomItem({
          name: 'Dell PowerEdge R760 (N+1 Standby Node)',
          model: 'PowerEdge R760 Hot Spare',
          category: 'Compute',
          qty: 1,
          unitCost: 8900,
          units: 2,
          power: 310,
          specs: '2U | 2x Xeon Silver 4410Y | 128GB DDR5 | Standby Hot-Spare Node',
          whySuggested: 'N+1 compute tolerance for hypervisor maintenance',
          badge: 'Redundancy N+1',
          alternatives: [],
        });
      }
    }
  }
```

- [ ] **Step 5: Run tests**

```powershell
npx vitest run src/__tests__/ai/n1-toggle.test.ts
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/ai/workflow/workflow-orchestrator.ts src/__tests__/ai/n1-toggle.test.ts
git commit -m "feat(workflow): add syncSpareNode() to orchestrator — N+1 toggle updates BOM"
```

---

## Task 3: Wire N+1 Checkbox + Update Stage 2 Cluster Size Display

**Files:**
- Modify: `src/ai/workflow/stage-renderers.ts`

- [ ] **Step 1: Update the asm_spare checkbox handler**

In `stage-renderers.ts`, find the assumption checkbox change handler (around line 350):

```typescript
      row.querySelector('.asm-checkbox')?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        orchestrator.updateAssumption(asmId, { enabled: checked });
        this.renderRequirementBrief(container, orchestrator);
      });
```

Replace with:

```typescript
      row.querySelector('.asm-checkbox')?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        orchestrator.updateAssumption(asmId, { enabled: checked });
        if (asmId === 'asm_spare') {
          orchestrator.syncSpareNode(checked);
        }
        this.renderRequirementBrief(container, orchestrator);
      });
```

- [ ] **Step 2: Update Stage 2 "Cluster Size" row to show spare status**

In `renderArchitectureStage()` (around line 439), find:

```typescript
              <div class="metric-row"><span>Cluster Size:</span> <strong>${req.nodeCount} Host Nodes</strong></div>
```

Replace with:

```typescript
              <div class="metric-row"><span>Cluster Size:</span> <strong>${(() => {
                const spareAsm = req.assumptions.find(a => a.id === 'asm_spare');
                return spareAsm?.enabled
                  ? `${req.nodeCount} Host Nodes + 1 N+1 Spare`
                  : `${req.nodeCount} Host Nodes`;
              })()}</strong></div>
```

- [ ] **Step 3: Verify in browser**

Start the dev server (`npm run dev`), navigate to Stage 1, uncheck the N+1 assumption, navigate to Stage 2. Verify:
- Cluster Size shows `${n} Host Nodes` (no spare)
- Re-check N+1: Cluster Size shows `${n} Host Nodes + 1 N+1 Spare`
- BOM totals in Stage 3 change accordingly

- [ ] **Step 4: Commit**

```powershell
git add src/ai/workflow/stage-renderers.ts
git commit -m "feat(workflow): wire N+1 checkbox to syncSpareNode and update Stage 2 display"
```

---

## Task 4: RackPreviewZoom Class

**Files:**
- Create: `src/ai/workflow/rack-preview-zoom.ts`
- Create: `src/__tests__/ai/rack-preview-zoom.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/ai/rack-preview-zoom.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RackPreviewZoom } from '../../ai/workflow/rack-preview-zoom';

function makeContainer() {
  const inner = document.createElement('div');
  inner.className = 'rack-frame-inner';
  const outer = document.createElement('div');
  outer.className = 'rack-preview-container';
  outer.appendChild(inner);
  document.body.appendChild(outer);
  return { outer, inner };
}

describe('RackPreviewZoom', () => {
  let outer: HTMLElement;
  let inner: HTMLElement;
  let zoom: RackPreviewZoom;

  beforeEach(() => {
    ({ outer, inner } = makeContainer());
    zoom = new RackPreviewZoom(outer, inner);
  });

  it('initialises at scale 1.0', () => {
    expect(zoom.getScale()).toBe(1.0);
  });

  it('scrolling up increases scale', () => {
    outer.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    expect(zoom.getScale()).toBeGreaterThan(1.0);
  });

  it('scrolling down decreases scale', () => {
    outer.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(zoom.getScale()).toBeLessThan(1.0);
  });

  it('clamps scale to minimum 0.4', () => {
    for (let i = 0; i < 30; i++) {
      outer.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true }));
    }
    expect(zoom.getScale()).toBeGreaterThanOrEqual(0.4);
  });

  it('clamps scale to maximum 3.0', () => {
    for (let i = 0; i < 30; i++) {
      outer.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true }));
    }
    expect(zoom.getScale()).toBeLessThanOrEqual(3.0);
  });

  it('reset() returns scale to 1.0', () => {
    outer.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    zoom.reset();
    expect(zoom.getScale()).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
npx vitest run src/__tests__/ai/rack-preview-zoom.test.ts
```
Expected: FAIL — `RackPreviewZoom` not found.

- [ ] **Step 3: Implement `RackPreviewZoom`**

Create `src/ai/workflow/rack-preview-zoom.ts`:

```typescript
export class RackPreviewZoom {
  private scale = 1.0;
  private readonly min = 0.4;
  private readonly max = 3.0;
  private readonly step = 0.1;
  private badge: HTMLElement | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly inner: HTMLElement,
  ) {
    this.badge = this.createBadge();
    container.appendChild(this.badge);
    container.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private createBadge(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'zoom-badge';
    el.textContent = '100%';
    el.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:10;';
    return el;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -this.step : this.step;
    this.scale = Math.min(this.max, Math.max(this.min, parseFloat((this.scale + delta).toFixed(2))));
    this.inner.style.transform = `scale(${this.scale})`;
    this.inner.style.transformOrigin = 'top center';
    this.showBadge();
  };

  private showBadge(): void {
    if (!this.badge) return;
    this.badge.textContent = `${Math.round(this.scale * 100)}%`;
    this.badge.style.opacity = '1';
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      if (this.badge) this.badge.style.opacity = '0';
    }, 1500);
  }

  getScale(): number {
    return this.scale;
  }

  reset(): void {
    this.scale = 1.0;
    this.inner.style.transform = 'scale(1)';
    if (this.badge) this.badge.style.opacity = '0';
  }

  destroy(): void {
    this.container.removeEventListener('wheel', this.onWheel);
    this.badge?.remove();
  }
}
```

- [ ] **Step 4: Run tests**

```powershell
npx vitest run src/__tests__/ai/rack-preview-zoom.test.ts
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ai/workflow/rack-preview-zoom.ts src/__tests__/ai/rack-preview-zoom.test.ts
git commit -m "feat(workflow): add RackPreviewZoom — scroll-to-zoom for rack preview panels"
```

---

## Task 5: CSS — Rack Preview Height + Metrics Bar Skeleton

**Files:**
- Modify: `src/styles/ai-panel.css`

- [ ] **Step 1: Add preview height and zoom badge styles**

Find the existing rack preview rules in `ai-panel.css` (search for `.rack-frame-mock` or `.physical-preview-col`). Add/update:

```css
/* ── Rack Preview Panel ─────────────────────────── */
.rack-preview-container {
  position: relative;
  min-height: 450px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #0d1117;
  border-radius: 8px;
}

.rack-frame-inner {
  transform-origin: top center;
  transition: transform 0.05s linear;
  width: 100%;
}

/* ── Engineering Metrics Bar ────────────────────── */
.eng-metrics-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 12px 16px;
  background: #0f172a;
  border-radius: 8px;
  margin-top: 12px;
  border: 1px solid #1e293b;
}

.eng-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.eng-metric-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.eng-metric-value {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.eng-metric-value.status-ok   { color: #22c55e; }
.eng-metric-value.status-warn { color: #f59e0b; }
.eng-metric-value.status-err  { color: #ef4444; }

.eng-metrics-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px;
  border-top: 1px solid #1e293b;
  margin-top: 4px;
}

.btn-undo-deploy {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.btn-export-bom {
  background: #1d4ed8;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/styles/ai-panel.css
git commit -m "style(workflow): rack preview height 450px, zoom badge, engineering metrics bar"
```

---

## Task 6: Wire Zoom to Stage 2 + Engineering Metrics Bar Renderer

**Files:**
- Modify: `src/ai/workflow/stage-renderers.ts`
- Create: `src/__tests__/ai/engineering-metrics.test.ts`

- [ ] **Step 1: Write failing metrics test**

```typescript
// src/__tests__/ai/engineering-metrics.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { StageRenderers } from '../../ai/workflow/stage-renderers';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

describe('StageRenderers.renderEngineeringMetricsBar', () => {
  let container: HTMLElement;
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    orc = new AIWorkflowOrchestrator();
  });

  it('renders metrics bar with U%, kW, BTU/hr, BOM$, redundancy', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const bar = container.querySelector('.eng-metrics-bar');
    expect(bar).not.toBeNull();
    expect(bar!.innerHTML).toContain('kW');
    expect(bar!.innerHTML).toContain('BTU');
    expect(bar!.innerHTML).toContain('USD');
  });

  it('shows Dual Feed Verified when powerFeed is A/B Redundant', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const bar = container.querySelector('.eng-metrics-bar');
    // Default requirement has A/B Redundant feed
    expect(bar!.innerHTML).toMatch(/Dual Feed|A\/B/i);
  });

  it('Undo AI Deployment button exists', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const btn = container.querySelector('.btn-undo-deploy');
    expect(btn).not.toBeNull();
  });

  it('Export BOM Report button exists', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const btn = container.querySelector('.btn-export-bom');
    expect(btn).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
npx vitest run src/__tests__/ai/engineering-metrics.test.ts
```
Expected: FAIL — `renderEngineeringMetricsBar` not defined.

- [ ] **Step 3: Add `renderEngineeringMetricsBar()` static method to StageRenderers**

In `stage-renderers.ts`, add this static method before the closing brace of the `StageRenderers` class:

```typescript
  public static renderEngineeringMetricsBar(container: HTMLElement, orchestrator: AIWorkflowOrchestrator): void {
    const totals = orchestrator.getBomTotals();
    const req = orchestrator.getState().requirement;
    const kw = (totals.totalWatts / 1000).toFixed(2);
    const btu = Math.round(totals.totalWatts * 3.412142).toLocaleString();
    const uPercent = Math.round((totals.totalUnits / 42) * 100);
    const bom = totals.totalCost.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const isRedundant = req.powerFeed === 'A/B Redundant' || req.powerFeed === 'A/B/C 3-Phase';
    const redundancyLabel = isRedundant ? 'Dual Feed Verified' : 'Single Feed';
    const redundancyClass = isRedundant ? 'status-ok' : 'status-warn';

    const existing = container.querySelector('.eng-metrics-bar-wrapper');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'eng-metrics-bar-wrapper';
    wrapper.innerHTML = `
      <div class="eng-metrics-bar">
        <div class="eng-metric">
          <span class="eng-metric-label">U Space Used</span>
          <span class="eng-metric-value">${totals.totalUnits} / 42 U (${uPercent}%)</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">Rack IT Draw</span>
          <span class="eng-metric-value">${kw} kW</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">Heat Load</span>
          <span class="eng-metric-value">${btu} BTU/hr</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">Estimated BOM</span>
          <span class="eng-metric-value">${bom} USD</span>
        </div>
        <div class="eng-metric">
          <span class="eng-metric-label">A/B Redundancy</span>
          <span class="eng-metric-value ${redundancyClass}">${redundancyLabel}</span>
        </div>
      </div>
      <div class="eng-metrics-actions">
        <button class="btn-undo-deploy">↩ Undo AI Deployment</button>
        <button class="btn-export-bom">📊 Export BOM Report</button>
      </div>
    `;

    wrapper.querySelector('.btn-undo-deploy')?.addEventListener('click', () => {
      orchestrator.setCanvasDeployed(false);
      orchestrator.undoDeployment?.();
    });

    wrapper.querySelector('.btn-export-bom')?.addEventListener('click', () => {
      orchestrator.exportBom?.();
    });

    container.appendChild(wrapper);
  }
```

- [ ] **Step 4: Attach zoom + metrics bar in `renderArchitectureStage()`**

Add this import at the top of `stage-renderers.ts` (after existing imports):

```typescript
import { RackPreviewZoom } from './rack-preview-zoom';
```

At the end of `renderArchitectureStage()`, after the event listeners are attached (after the `#btn-accept-arch` listener):

```typescript
    // Attach scroll-to-zoom on the rack preview column
    const previewCol = container.querySelector('.rack-preview-col') as HTMLElement | null;
    const previewInner = container.querySelector('.rack-frame-inner') as HTMLElement | null;
    if (previewCol && previewInner) {
      new RackPreviewZoom(previewCol, previewInner);
    }

    // Engineering metrics bar
    const stageCard = container.querySelector('.workflow-stage-card') as HTMLElement | null;
    if (stageCard) StageRenderers.renderEngineeringMetricsBar(stageCard, orchestrator);
```

Also add the metrics bar to `renderResourceBomStage()` — find where the `bom-summary-bar` is rendered and replace that block's container call with `StageRenderers.renderEngineeringMetricsBar(stageCard, orchestrator)` after setting innerHTML.

- [ ] **Step 5: Run tests**

```powershell
npx vitest run src/__tests__/ai/engineering-metrics.test.ts
```
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/ai/workflow/stage-renderers.ts src/__tests__/ai/engineering-metrics.test.ts
git commit -m "feat(workflow): add engineering metrics bar + wire scroll-to-zoom to Stage 2"
```

---

## Task 7: LabelSyncManager

**Files:**
- Create: `src/ai/workflow/label-sync-manager.ts`
- Create: `src/__tests__/ai/label-sync-manager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/ai/label-sync-manager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LabelSyncManager } from '../../ai/workflow/label-sync-manager';
import { stateManager } from '../../core/state';

vi.mock('../../core/state', () => ({
  stateManager: {
    getState: vi.fn(() => ({ labels: [], devices: [], racks: [], cables: [] })),
    setState: vi.fn(),
  },
}));

const mockDevice = (id: string, templateId: string, name: string) => ({
  id, templateId, rackId: 'r1', startUnit: 1, name,
  hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
});

describe('LabelSyncManager', () => {
  let mgr: LabelSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new LabelSyncManager();
  });

  it('syncLabels creates a label for each device', () => {
    const devices = [
      mockDevice('d1', 'server-2u-enterprise', 'Compute Host 1'),
      mockDevice('d2', 'pdu-basic-8c13', 'PDU A'),
    ];
    mgr.syncLabels(devices);
    expect(stateManager.setState).toHaveBeenCalled();
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.labels).toHaveLength(2);
  });

  it('label text uses short name from device name', () => {
    const devices = [mockDevice('d1', 'server-2u-enterprise', 'Dell Proxmox Host 1')];
    mgr.syncLabels(devices);
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.labels[0].text).toBe('Dell Proxmox Host 1');
  });

  it('syncLabels is idempotent — does not duplicate existing labels', () => {
    const existingLabel = { id: 'lbl-d1', pointerDeviceId: 'd1', text: 'Dell Proxmox Host 1',
      x: 100, y: 100, fontFamily: 'Inter', fontSize: 12, fontWeight: 'normal' as const,
      fontStyle: 'normal' as const, underline: false, color: '#fff', align: 'left' as const,
      backgroundColor: null, rotation: 0, pointerStyle: 'elbow' as const };
    (stateManager.getState as any).mockReturnValue({ labels: [existingLabel], devices: [], racks: [], cables: [] });

    const devices = [mockDevice('d1', 'server-2u-enterprise', 'Dell Proxmox Host 1')];
    mgr.syncLabels(devices);
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.labels).toHaveLength(1);
  });

  it('clearAll removes all labels created by the manager', () => {
    const existingLabel = { id: 'lbl-d1', pointerDeviceId: 'd1', text: 'Host 1',
      x: 0, y: 0, fontFamily: 'Inter', fontSize: 12, fontWeight: 'normal' as const,
      fontStyle: 'normal' as const, underline: false, color: '#fff', align: 'left' as const,
      backgroundColor: null, rotation: 0 };
    (stateManager.getState as any).mockReturnValue({ labels: [existingLabel], devices: [], racks: [], cables: [] });

    mgr.clearAll();
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.labels).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
npx vitest run src/__tests__/ai/label-sync-manager.test.ts
```
Expected: FAIL — `LabelSyncManager` not found.

- [ ] **Step 3: Implement `LabelSyncManager`**

Create `src/ai/workflow/label-sync-manager.ts`:

```typescript
import { stateManager } from '../../core/state';
import { TextLabel, DeviceData } from '../../core/types';
import { generateId } from '../../utils/geometry';

const LABEL_PREFIX = 'ai-label-';

export class LabelSyncManager {
  syncLabels(devices: DeviceData[]): void {
    const state = stateManager.getState();
    const existing = state.labels ?? [];

    // Keep labels not created by this manager
    const unmanaged = existing.filter(l => !l.id.startsWith(LABEL_PREFIX));

    // Build managed labels: one per device, idempotent by pointerDeviceId
    const managed: TextLabel[] = devices.map((device, idx) => {
      const existingLabel = existing.find(
        l => l.id.startsWith(LABEL_PREFIX) && l.pointerDeviceId === device.id
      );
      if (existingLabel) {
        // Update text in case device name changed
        return { ...existingLabel, text: device.name };
      }
      return {
        id: `${LABEL_PREFIX}${device.id}`,
        x: 520,
        y: 60 + idx * 48,
        text: device.name,
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: 'normal' as const,
        fontStyle: 'normal' as const,
        underline: false,
        color: '#e2e8f0',
        align: 'left' as const,
        backgroundColor: 'rgba(15,23,42,0.85)',
        backgroundPaddingX: 6,
        backgroundPaddingY: 3,
        rotation: 0,
        pointerDeviceId: device.id,
        pointerAnchorX: 350,
        pointerAnchorY: 16,
        pointerStyle: 'elbow' as const,
        pointerLineColor: '#3b82f6',
      };
    });

    // Remove managed labels for devices that no longer exist
    const deviceIds = new Set(devices.map(d => d.id));
    const staleManagedRemoved = existing
      .filter(l => l.id.startsWith(LABEL_PREFIX) && !deviceIds.has(l.pointerDeviceId ?? ''))
      .map(l => l.id);

    const updatedLabels = [
      ...unmanaged,
      ...managed,
    ].filter(l => !staleManagedRemoved.includes(l.id));

    stateManager.setState({ labels: updatedLabels } as any);
  }

  clearAll(): void {
    const state = stateManager.getState();
    const labels = (state.labels ?? []).filter(l => !l.id.startsWith(LABEL_PREFIX));
    stateManager.setState({ labels } as any);
  }
}
```

- [ ] **Step 4: Run tests**

```powershell
npx vitest run src/__tests__/ai/label-sync-manager.test.ts
```
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ai/workflow/label-sync-manager.ts src/__tests__/ai/label-sync-manager.test.ts
git commit -m "feat(workflow): add LabelSyncManager — auto-creates elbow TextLabels for deployed devices"
```

---

## Task 8: CableLayingOrchestrator — Power Cables

**Files:**
- Create: `src/ai/workflow/cable-laying-orchestrator.ts`
- Create: `src/__tests__/ai/cable-laying.test.ts`

- [ ] **Step 1: Write failing power cable tests**

```typescript
// src/__tests__/ai/cable-laying.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CableLayingOrchestrator } from '../../ai/workflow/cable-laying-orchestrator';
import { stateManager } from '../../core/state';

vi.mock('../../core/state', () => ({
  stateManager: {
    getState: vi.fn(() => ({ cables: [], devices: [], racks: [], labels: [] })),
    setState: vi.fn(),
  },
}));

const psuPort = (id: string, deviceId: string) => ({
  id, deviceId, name: 'PSU 1', type: 'power' as const, relativeX: 0, relativeY: 0,
  connected: false, cableId: null,
});

const outletPort = (id: string, deviceId: string) => ({
  id, deviceId, name: 'Outlet 1', type: 'power' as const, relativeX: 0, relativeY: 0,
  connected: false, cableId: null,
});

const makeServer = (id: string) => ({
  id, templateId: 'server-2u-enterprise', rackId: 'r1', startUnit: 1,
  name: 'Host 1', hostname: '', managementIp: '', serialNumber: '', description: '',
  ports: [
    { ...psuPort(`${id}-psu1`, id), name: 'PSU 1 (C14)' },
    { ...psuPort(`${id}-psu2`, id), name: 'PSU 2 (C14)' },
  ],
});

const makePdu = (id: string, feedLabel: 'A' | 'B') => ({
  id, templateId: 'pdu-basic-8c13', rackId: 'r1', startUnit: 40,
  name: `PDU ${feedLabel}`, hostname: '', managementIp: '', serialNumber: '', description: '',
  ports: [
    { ...outletPort(`outlet-${id}-0`, id), name: 'Outlet 1' },
    { ...outletPort(`outlet-${id}-1`, id), name: 'Outlet 2' },
  ],
});

describe('CableLayingOrchestrator — power cables', () => {
  let orch: CableLayingOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orch = new CableLayingOrchestrator();
  });

  it('creates a power cable from PSU1 to Feed-A PDU outlet', () => {
    const server = makeServer('srv1');
    const pduA = makePdu('pdu-a', 'A');
    const pduB = makePdu('pdu-b', 'B');
    orch.syncCables([server, pduA, pduB], [], {} as any);

    const call = (stateManager.setState as any).mock.calls[0][0];
    const powerCables = call.cables.filter((c: any) => c.type === 'power');
    expect(powerCables.length).toBeGreaterThanOrEqual(1);

    const psu1Cable = powerCables.find((c: any) => c.sourcePortId === 'srv1-psu1');
    expect(psu1Cable).toBeDefined();
    expect(psu1Cable.destPortId).toBe('outlet-pdu-a-0');
    expect(psu1Cable.sidePreference).toBe('right');
  });

  it('creates a power cable from PSU2 to Feed-B PDU outlet', () => {
    const server = makeServer('srv1');
    const pduA = makePdu('pdu-a', 'A');
    const pduB = makePdu('pdu-b', 'B');
    orch.syncCables([server, pduA, pduB], [], {} as any);

    const call = (stateManager.setState as any).mock.calls[0][0];
    const cables = call.cables;
    const psu2Cable = cables.find((c: any) => c.sourcePortId === 'srv1-psu2');
    expect(psu2Cable).toBeDefined();
    expect(psu2Cable.destPortId).toBe('outlet-pdu-b-0');
  });

  it('syncCables is idempotent — does not duplicate existing power cables', () => {
    const server = makeServer('srv1');
    const pduA = makePdu('pdu-a', 'A');
    const pduB = makePdu('pdu-b', 'B');
    const existingCable = {
      id: 'c-existing', name: 'Power', type: 'power' as const, color: '#f97316',
      sourcePortId: 'srv1-psu1', destPortId: 'outlet-pdu-a-0',
      bendPoints: [], thickness: 2, bendRadius: 0, bundleId: null, notes: '',
      sidePreference: 'right' as const,
    };
    (stateManager.getState as any).mockReturnValue({
      cables: [existingCable], devices: [], racks: [], labels: [],
    });

    orch.syncCables([server, pduA, pduB], [existingCable], {} as any);
    const call = (stateManager.setState as any).mock.calls[0][0];
    const psu1Cables = call.cables.filter((c: any) => c.sourcePortId === 'srv1-psu1');
    expect(psu1Cables).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
npx vitest run src/__tests__/ai/cable-laying.test.ts
```
Expected: FAIL — `CableLayingOrchestrator` not found.

- [ ] **Step 3: Implement `CableLayingOrchestrator` with power cables**

Create `src/ai/workflow/cable-laying-orchestrator.ts`:

```typescript
import { stateManager } from '../../core/state';
import { DeviceData, CableData, PortData } from '../../core/types';
import { RequirementSpec } from './types';
import { getTemplate } from '../../library/device-catalog';
import { generateId } from '../../utils/geometry';

const CABLE_PREFIX = 'ai-cable-';

function isPsuPort(p: PortData): boolean {
  return p.type === 'power' || p.name.toLowerCase().includes('psu') || p.name.toLowerCase().includes('c14') || p.name.toLowerCase().includes('c13');
}

function isNicPort(p: PortData): boolean {
  return ['sfp28', 'sfp-plus', 'qsfp28', 'sfp'].includes(p.type) ||
    p.name.toLowerCase().includes('nic') ||
    p.name.toLowerCase().includes('sfp') ||
    p.name.toLowerCase().includes('25g') ||
    p.name.toLowerCase().includes('100g');
}

function isMgmtPort(p: PortData): boolean {
  return p.type === 'management' || p.name.toLowerCase().includes('mgmt') ||
    p.name.toLowerCase().includes('bmc') || p.name.toLowerCase().includes('idrac') ||
    p.name.toLowerCase().includes('ilo');
}

function isPduDevice(d: DeviceData): boolean {
  return getTemplate(d.templateId)?.category === 'pdu';
}

function isSwitchDevice(d: DeviceData): boolean {
  return getTemplate(d.templateId)?.category === 'switch';
}

function makeAiCable(
  sourcePortId: string,
  destPortId: string,
  type: CableData['type'],
  color: string,
  sidePreference: 'left' | 'right',
  name: string,
): CableData {
  return {
    id: `${CABLE_PREFIX}${generateId()}`,
    name,
    type,
    color,
    sourcePortId,
    destPortId,
    bendPoints: [],
    thickness: 2,
    bendRadius: 4,
    bundleId: null,
    notes: 'Auto-laid by AI workflow',
    sidePreference,
  };
}

export class CableLayingOrchestrator {
  syncCables(
    devices: DeviceData[],
    existingCables: CableData[],
    _req: RequirementSpec,
  ): void {
    const state = stateManager.getState();
    const allCables: CableData[] = state.cables ?? [];

    // Keep cables not created by this manager
    const unmanaged = allCables.filter(c => !c.id.startsWith(CABLE_PREFIX));
    const managedExisting = allCables.filter(c => c.id.startsWith(CABLE_PREFIX));

    const existingPairs = new Set(
      managedExisting.map(c => `${c.sourcePortId}|${c.destPortId}`)
    );

    const newCables: CableData[] = [];

    const pdus = devices.filter(isPduDevice);
    const pduA = pdus[0];
    const pduB = pdus[1];

    const switches = devices.filter(isSwitchDevice);
    const torA = switches[0];
    const torB = switches[1];

    // Track outlet usage per PDU
    const outletIdx: Record<string, number> = {};
    if (pduA) outletIdx[pduA.id] = 0;
    if (pduB) outletIdx[pduB.id] = 0;

    // Track switch port usage
    const switchPortIdx: Record<string, number> = {};
    if (torA) switchPortIdx[torA.id] = 0;
    if (torB) switchPortIdx[torB.id] = 0;

    for (const device of devices) {
      if (isPduDevice(device) || isSwitchDevice(device)) continue;

      const psuPorts = device.ports.filter(isPsuPort);
      const nicPorts = device.ports.filter(isNicPort);
      const mgmtPorts = device.ports.filter(isMgmtPort);

      // ── Power cables ──────────────────────────────────────────────
      if (pduA && psuPorts[0]) {
        const outletId = `outlet-${pduA.id}-${outletIdx[pduA.id]}`;
        const pair = `${psuPorts[0].id}|${outletId}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(psuPorts[0].id, outletId, 'power', '#f97316', 'right', 'Power — PSU1 → Feed A'));
          existingPairs.add(pair);
        }
        outletIdx[pduA.id]++;
      }

      if (pduB && psuPorts[1]) {
        const outletId = `outlet-${pduB.id}-${outletIdx[pduB.id]}`;
        const pair = `${psuPorts[1].id}|${outletId}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(psuPorts[1].id, outletId, 'power', '#f97316', 'right', 'Power — PSU2 → Feed B'));
          existingPairs.add(pair);
        }
        outletIdx[pduB.id]++;
      }

      // ── Data cables ───────────────────────────────────────────────
      if (torA && nicPorts[0]) {
        const torAPort = torA.ports[switchPortIdx[torA.id]];
        if (torAPort) {
          const pair = `${nicPorts[0].id}|${torAPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(nicPorts[0].id, torAPort.id, 'ethernet', '#3b82f6', 'left', 'Data — NIC1 → ToR-A'));
            existingPairs.add(pair);
          }
          switchPortIdx[torA.id]++;
        }
      }

      if (torB && nicPorts[1]) {
        const torBPort = torB.ports[switchPortIdx[torB.id]];
        if (torBPort) {
          const pair = `${nicPorts[1].id}|${torBPort.id}`;
          if (!existingPairs.has(pair)) {
            newCables.push(makeAiCable(nicPorts[1].id, torBPort.id, 'ethernet', '#06b6d4', 'left', 'Data — NIC2 → ToR-B'));
            existingPairs.add(pair);
          }
          switchPortIdx[torB.id]++;
        }
      }

      // ── Management cables ─────────────────────────────────────────
      // (OOB switch support added in Task 9)
      void mgmtPorts;
    }

    // ToR-A ↔ ToR-B peer link (highest-index ports of each switch)
    if (torA && torB && torA.ports.length > 0 && torB.ports.length > 0) {
      const torAUplink = torA.ports[torA.ports.length - 1];
      const torBUplink = torB.ports[torB.ports.length - 1];
      if (torAUplink && torBUplink) {
        const pair = `${torAUplink.id}|${torBUplink.id}`;
        if (!existingPairs.has(pair)) {
          newCables.push(makeAiCable(torAUplink.id, torBUplink.id, 'ethernet', '#8b5cf6', 'left', 'ISL — ToR-A ↔ ToR-B'));
        }
      }
    }

    // Remove managed cables for ports that no longer exist
    const allPortIds = new Set(devices.flatMap(d => d.ports.map(p => p.id)));
    const validManaged = managedExisting.filter(
      c => allPortIds.has(c.sourcePortId ?? '') && allPortIds.has(c.destPortId ?? '')
    );

    stateManager.setState({ cables: [...unmanaged, ...validManaged, ...newCables] } as any);
  }

  clearAll(): void {
    const state = stateManager.getState();
    const cables = (state.cables ?? []).filter((c: CableData) => !c.id.startsWith(CABLE_PREFIX));
    stateManager.setState({ cables } as any);
  }
}
```

- [ ] **Step 4: Run tests**

```powershell
npx vitest run src/__tests__/ai/cable-laying.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/ai/workflow/cable-laying-orchestrator.ts src/__tests__/ai/cable-laying.test.ts
git commit -m "feat(workflow): add CableLayingOrchestrator — power + data + ISL cables on deploy"
```

---

## Task 9: Management Cables + Wire Everything to Canvas Deploy

**Files:**
- Modify: `src/ai/workflow/cable-laying-orchestrator.ts`
- Modify: `src/ai/workflow/stage-renderers.ts`
- Modify: `src/__tests__/ai/cable-laying.test.ts`

- [ ] **Step 1: Add management cable test**

Append to `src/__tests__/ai/cable-laying.test.ts`:

```typescript
describe('CableLayingOrchestrator — management cables', () => {
  it('creates grey management cable when OOB switch present', () => {
    vi.clearAllMocks();
    (stateManager.getState as any).mockReturnValue({ cables: [], devices: [], racks: [], labels: [] });

    const orch = new CableLayingOrchestrator();

    const server: DeviceData = {
      id: 'srv1', templateId: 'server-2u-enterprise', rackId: 'r1', startUnit: 1,
      name: 'Host 1', hostname: '', managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 'srv1-mgmt', deviceId: 'srv1', name: 'BMC / MGMT', type: 'management',
          relativeX: 0, relativeY: 0, connected: false, cableId: null },
      ],
    } as any;

    const oobSwitch: DeviceData = {
      id: 'oob1', templateId: 'switch-1u-oob', rackId: 'r1', startUnit: 42,
      name: 'OOB Switch', hostname: '', managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 'oob1-p1', deviceId: 'oob1', name: 'Port 1', type: 'rj45',
          relativeX: 0, relativeY: 0, connected: false, cableId: null },
      ],
    } as any;

    // Mock getTemplate so OOB switch is identified as a switch
    orch.syncCables([server, oobSwitch], [], {} as any);

    const call = (stateManager.setState as any).mock.calls[0][0];
    const mgmtCable = call.cables.find((c: any) =>
      c.sourcePortId === 'srv1-mgmt' || c.destPortId === 'srv1-mgmt'
    );
    expect(mgmtCable).toBeDefined();
    expect(mgmtCable.color).toBe('#64748b');
    expect(mgmtCable.sidePreference).toBe('left');
  });
});
```

- [ ] **Step 2: Add management cable logic to `syncCables()`**

In `cable-laying-orchestrator.ts`, replace the `// (OOB switch support added in Task 9)` comment block with:

```typescript
      // ── Management cables ─────────────────────────────────────────
      const oobSwitch = devices.find(d => {
        const tpl = getTemplate(d.templateId);
        return tpl?.category === 'switch' && d.name.toLowerCase().includes('oob');
      });

      if (oobSwitch && mgmtPorts.length > 0) {
        const oobPortIdx = oobSwitch.ports.findIndex(p => !p.connected);
        const oobPort = oobSwitch.ports[oobPortIdx >= 0 ? oobPortIdx : 0];
        if (oobPort) {
          const pair = `${mgmtPorts[0].id}|${oobPort.id}`;
          if (!existingPairs.has(pair)) {
            const cable = makeAiCable(mgmtPorts[0].id, oobPort.id, 'ethernet', '#64748b', 'left', `MGMT — ${device.name} → OOB`);
            (cable as any).finish = 'dashed';
            newCables.push(cable);
            existingPairs.add(pair);
          }
        }
      }
```

- [ ] **Step 3: Wire `LabelSyncManager` and `CableLayingOrchestrator` to canvas deploy**

In `stage-renderers.ts`, find the Stage 10/11 "Deploy to Canvas" button handler. Add after a successful `applyTransaction` call:

```typescript
import { LabelSyncManager } from './label-sync-manager';
import { CableLayingOrchestrator } from './cable-laying-orchestrator';

// After successful deployment:
const labelMgr = new LabelSyncManager();
const cableMgr = new CableLayingOrchestrator();

const canvasDevices = stateManager.getState().devices;
labelMgr.syncLabels(canvasDevices);
cableMgr.syncCables(canvasDevices, stateManager.getState().cables, orchestrator.getState().requirement);
orchestrator.setCanvasDeployed(true);
```

- [ ] **Step 4: Subscribe to orchestrator for dynamic re-sync**

In the stage render function for Stage 10, after attaching the deploy button, add:

```typescript
    orchestrator.subscribe((state) => {
      if (state.hasCanvasDeployment) {
        const labelMgr = new LabelSyncManager();
        const cableMgr = new CableLayingOrchestrator();
        const canvasDevices = stateManager.getState().devices;
        labelMgr.syncLabels(canvasDevices);
        cableMgr.syncCables(canvasDevices, stateManager.getState().cables, state.requirement);
      }
    });
```

- [ ] **Step 5: Run all AI tests**

```powershell
npx vitest run src/__tests__/ai/
```
Expected: all test files PASS.

- [ ] **Step 6: Run build**

```powershell
npm run build
```
Expected: `✓ built in` with no TypeScript errors.

- [ ] **Step 7: Commit**

```powershell
git add src/ai/workflow/cable-laying-orchestrator.ts src/ai/workflow/stage-renderers.ts src/__tests__/ai/cable-laying.test.ts
git commit -m "feat(workflow): wire LabelSyncManager + CableLayingOrchestrator to canvas deploy with mgmt cables"
```

---

## Task 10: Stage 2 Device Label Pills (HTML Overlay)

**Files:**
- Modify: `src/ai/workflow/stage-renderers.ts`
- Modify: `src/styles/ai-panel.css`

- [ ] **Step 1: Add CSS for label pills**

Add to `ai-panel.css`:

```css
/* ── Device Label Pills in Stage 2 preview ──────── */
.device-label-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.device-label-leader {
  width: 24px;
  height: 1px;
  background: #3b82f6;
  flex-shrink: 0;
}

.device-label-pill {
  font-size: 10px;
  font-weight: 600;
  background: rgba(59,130,246,0.15);
  color: #93c5fd;
  border: 1px solid rgba(59,130,246,0.3);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 2: Add device label pills to Stage 2 rack frame mock**

In `renderArchitectureStage()`, find where device rows are generated in the rack frame mock. For each device row, append after the device name span:

```typescript
`<div class="device-label-row">
  <div class="device-label-leader"></div>
  <div class="device-label-pill">${deviceShortName}</div>
</div>`
```

Where `deviceShortName` is derived from the BOM item name — truncated to the first two meaningful words (e.g., `"Dell PowerEdge R760 2U"` → `"Dell Proxmox Host ${n}"`).

Helper function to add at the top of the `renderArchitectureStage` method body:

```typescript
    const shortLabel = (name: string, idx: number): string => {
      const lower = name.toLowerCase();
      if (lower.includes('pdu')) return `PDU-${idx === 0 ? 'A' : 'B'}`;
      if (lower.includes('switch') || lower.includes('tor')) return `ToR-${idx === 0 ? 'A' : 'B'}`;
      if (lower.includes('san') || lower.includes('nvme')) return `NVMe SAN`;
      if (lower.includes('server') || lower.includes('poweredge') || lower.includes('host')) return `Host ${idx + 1}`;
      return name.split(' ').slice(0, 3).join(' ');
    };
```

- [ ] **Step 3: Commit**

```powershell
git add src/ai/workflow/stage-renderers.ts src/styles/ai-panel.css
git commit -m "feat(workflow): add device label pills with CSS elbow leaders to Stage 2 rack preview"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

```powershell
npx vitest run src/__tests__/ai/
```
Expected: 17+ test files pass, 0 failures.

- [ ] **Step 2: Run build**

```powershell
npm run build
```
Expected: `✓ built in` — no TypeScript errors, only pre-existing chunk size warnings.

- [ ] **Step 3: Manual browser verification checklist**

Start the dev server (`npm run dev`) and verify each feature:

```
Feature 1 — N+1 Toggle:
  [ ] Stage 1: uncheck N+1 assumption → Stage 2 shows "${n} Host Nodes" (no spare)
  [ ] Stage 1: re-check N+1 → Stage 2 shows "${n} Host Nodes + 1 N+1 Spare"
  [ ] Stage 3 BOM totals change (cost/power/U) when N+1 toggled

Feature 2 — Rack Preview Zoom:
  [ ] Stage 2 rack preview is at least 450px tall
  [ ] Scroll wheel over preview zooms in/out (badge appears then fades)
  [ ] Zoom resets to 100% on stage re-render

Feature 3 — Label Pills (Stage 2):
  [ ] Each device row has a short pill label with blue leader line

Feature 4 — Engineering Metrics Bar:
  [ ] Visible from Stage 2 onward: U Space, kW, BTU/hr, BOM $, Redundancy status
  [ ] Updates when N+1 is toggled
  [ ] "Undo AI Deployment" button exists
  [ ] "Export BOM Report" button exists

Feature 5 — Cable Laying:
  [ ] Deploy to canvas → red power cables connect PSUs to PDUs (Right Cable Manager)
  [ ] Deploy to canvas → blue/teal data cables connect NICs to ToR-A/B (Left Cable Manager)
  [ ] Re-deploy after config change → no duplicate cables
  [ ] Canvas labels appear alongside devices after deploy
```

- [ ] **Step 4: Final commit**

```powershell
git add -A
git commit -m "feat(workflow): complete Features 1-5 — N+1 toggle, zoom, labels, metrics bar, cable laying"
```
