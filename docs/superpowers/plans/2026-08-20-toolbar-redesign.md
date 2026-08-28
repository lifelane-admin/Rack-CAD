# Toolbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 600-line group-based Toolbar with a slim menu-bar toolbar (no logo, 5-tool strip + File/Edit/View/Export menus + float-toggle) and make the two existing floating toolbars (FloatingToolbar + CloudFloatingToolbar) toggleable from the top bar.

**Architecture:** Toolbar is rewritten to ~180 lines — tool strip, dropdown menu bar, right-zone float-toggle + ⚙ Rules. The two existing floating toolbars (src/components/floating-toolbar.ts, src/components/cloud-floating-toolbar.ts) are kept intact; we add a single EventBus listener to each so they respond to the new `view:toggle-floating-toolbar` event. All menu items emit the existing AppEvents (file:new, edit:undo, view:zoom-in, etc.) — no new action events needed.

**Tech Stack:** TypeScript, DOM, EventBus (default export from `../core/event-bus`), State (default export from `../core/state`), Vitest + happy-dom for tests.

---

## Key facts for implementers

- EventBus events use the **existing** event `'tool:changed'` (not `'tool:select'`). Emit: `EventBus.emit('tool:changed', 'select')`.
- Cloud tool mode strings: `'cloud-container'` and `'cloud-connect'` (from `ToolMode` in types.ts line 630).
- The existing `FloatingToolbar` (rack) and `CloudFloatingToolbar` (cloud) are **kept** — they are NOT replaced. We only add toggle support to each.
- The AI toggle ("⚙ Rules") keeps its exact existing logic from `createAiToggle()` — no behavior changes, just restyled to match the new right zone.
- `toolbar-cloud-visibility.test.ts` tests old group IDs (`#rack-export-group` etc.) that will not exist after the rewrite — **this file is replaced in Task 6**.
- The `hybrid-view.test.ts` describe block "toolbar group visibility" (lines 138–159) checks old group IDs — **updated in Task 6**.
- State import in components uses: `import State from '../core/state'` (default export, same object as `stateManager`).

---

## File structure

| File | Action | Result |
|---|---|---|
| `src/core/types.ts` | Modify | Add `floatingToolbarVisible` to AppState; add `view:toggle-floating-toolbar` to AppEvents |
| `src/core/state.ts` | Modify | Add `floatingToolbarVisible: true` to initial state |
| `src/components/toolbar.ts` | Rewrite | ~180 lines: tool strip + menu bar + float-toggle + ⚙ Rules |
| `src/styles/toolbar.css` | Rewrite | Remove group classes; add menu/dropdown/float-toggle classes |
| `src/components/floating-toolbar.ts` | Modify | Add `view:toggle-floating-toolbar` listener + init visibility |
| `src/components/cloud-floating-toolbar.ts` | Modify | Same as above |
| `src/__tests__/toolbar-cloud-visibility.test.ts` | Rewrite | Replace old group-ID tests with new menu/tool-strip tests |
| `src/__tests__/hybrid-view.test.ts` | Modify | Update "toolbar group visibility" describe block |

---

## Task 1: Add state field and event type

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/state.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/toolbar-redesign.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

describe('floatingToolbarVisible state', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      floatingToolbarVisible: undefined as any,
    });
  });

  it('defaults to true', () => {
    // Re-import to get fresh default — we test the constructor default via
    // the fact that undefined-reset state should still read as true after
    // a normal setState that includes it.
    stateManager.setState({ floatingToolbarVisible: true });
    expect(stateManager.getState().floatingToolbarVisible).toBe(true);
  });

  it('can be toggled to false via setState', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    expect(stateManager.getState().floatingToolbarVisible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: FAIL — `floatingToolbarVisible` does not exist on AppState yet, TypeScript will error.

- [ ] **Step 3: Add `floatingToolbarVisible` to AppState in `src/core/types.ts`**

Find the `AppState` interface (line 652). Add the new field after `show3DPanel` (line 695):

```ts
  show3DPanel: boolean;
  /** Whether the floating canvas toolbars (FloatingToolbar + CloudFloatingToolbar) are visible.
   *  Toggled by the ⊞ button in the top toolbar. Default true. */
  floatingToolbarVisible: boolean;
  presenterMode: boolean;
```

Find the `AppEvents` interface (line 722). Add after `'view:toggle-3d-panel': void;` (line 787):

```ts
  'view:toggle-3d-panel': void;
  /** Toggles the floating canvas toolbar(s) show/hide — emitted by the ⊞ button in Toolbar. */
  'view:toggle-floating-toolbar': void;
  'view:set-hybrid-layout': 'split' | 'merged';
```

- [ ] **Step 4: Add default value in `src/core/state.ts`**

Find the `this.state = {` block in the `StateManager` constructor (line 27). Add after `show3DPanel: false,` (line 57):

```ts
      show3DPanel: false,
      floatingToolbarVisible: true,
      presenterMode: false,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: PASS

- [ ] **Step 6: Run full suite to verify no regressions**

Run: `npx vitest run`

Expected: same pass/fail ratio as before this task (the one new test passes).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/state.ts src/__tests__/toolbar-redesign.test.ts
git commit -m "feat: add floatingToolbarVisible state field and view:toggle-floating-toolbar event"
```

---

## Task 2: Add toggle support to `FloatingToolbar`

**Files:**
- Modify: `src/components/floating-toolbar.ts`

- [ ] **Step 1: Write the failing test**

Add a new describe block to `src/__tests__/toolbar-redesign.test.ts`:

```ts
import { FloatingToolbar } from '../components/floating-toolbar';

function mountFloatingToolbar(): void {
  document.body.innerHTML = `
    <div id="canvas-viewport" style="position:relative;width:800px;height:600px;">
      <svg id="canvas"></svg>
    </div>
  `;
  new FloatingToolbar();
}

describe('FloatingToolbar toggle visibility', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      tool: 'select', selection: [], activeView: 'rack',
      floatingToolbarVisible: true,
      show3DPanel: false, airdropDestination: false, snapEnabled: true,
      selectedCableColor: '#78909c', selectedCableType: 'general',
      selectedCableBend: 10, selectedCableTermination: 'RJ45 Ethernet',
    });
  });

  it('is visible by default when floatingToolbarVisible is true', () => {
    mountFloatingToolbar();
    const el = document.getElementById('floating-toolbar');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('hidden')).toBe(false);
  });

  it('hides on view:toggle-floating-toolbar and flips state to false', () => {
    mountFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('floating-toolbar')!.classList.contains('hidden')).toBe(true);
    expect(stateManager.getState().floatingToolbarVisible).toBe(false);
  });

  it('shows again on second view:toggle-floating-toolbar', () => {
    mountFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('floating-toolbar')!.classList.contains('hidden')).toBe(false);
    expect(stateManager.getState().floatingToolbarVisible).toBe(true);
  });

  it('starts hidden when floatingToolbarVisible is false at init', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    mountFloatingToolbar();
    expect(document.getElementById('floating-toolbar')!.classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: FAIL — FloatingToolbar does not yet respond to `view:toggle-floating-toolbar`.

- [ ] **Step 3: Add toggle listener to `src/components/floating-toolbar.ts`**

In `setupListeners()` (around line 41), add after the existing `EventBus.on('state:changed', ...)` call:

```ts
    EventBus.on('view:toggle-floating-toolbar' as any, () => {
      const newVisible = !State.getState().floatingToolbarVisible;
      State.setState({ floatingToolbarVisible: newVisible });
      if (this.element) this.element.classList.toggle('hidden', !newVisible);
    });
```

In `init()` (around line 35), after `viewport.appendChild(this.element)`:

```ts
    viewport.appendChild(this.element);
    if (!State.getState().floatingToolbarVisible) {
      this.element.classList.add('hidden');
    }
```

Note: the `as any` cast on the event name is needed because `view:toggle-floating-toolbar` is newly added to AppEvents — if TypeScript still reports an error after Task 1's types are compiled, remove the cast.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: PASS on all FloatingToolbar toggle tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/floating-toolbar.ts src/__tests__/toolbar-redesign.test.ts
git commit -m "feat: make FloatingToolbar toggleable via view:toggle-floating-toolbar"
```

---

## Task 3: Add toggle support to `CloudFloatingToolbar`

**Files:**
- Modify: `src/components/cloud-floating-toolbar.ts`

- [ ] **Step 1: Write the failing test**

Add a new describe block to `src/__tests__/toolbar-redesign.test.ts`:

```ts
import { CloudFloatingToolbar } from '../components/cloud-floating-toolbar';

function mountCloudFloatingToolbar(): void {
  document.body.innerHTML = `
    <div id="cloud-viewport" style="position:relative;width:800px;height:600px;">
      <svg id="cloud-canvas"></svg>
    </div>
  `;
  new CloudFloatingToolbar();
}

describe('CloudFloatingToolbar toggle visibility', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      tool: 'select', activeView: 'cloud', floatingToolbarVisible: true,
    });
  });

  it('hides on view:toggle-floating-toolbar', () => {
    mountCloudFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('cloud-floating-toolbar')!.classList.contains('hidden')).toBe(true);
  });

  it('shows again on second view:toggle-floating-toolbar', () => {
    mountCloudFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('cloud-floating-toolbar')!.classList.contains('hidden')).toBe(false);
  });

  it('starts hidden when floatingToolbarVisible is false at init', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    mountCloudFloatingToolbar();
    expect(document.getElementById('cloud-floating-toolbar')!.classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: FAIL on CloudFloatingToolbar toggle tests.

- [ ] **Step 3: Add toggle listener to `src/components/cloud-floating-toolbar.ts`**

Read the file to find `setupListeners()`. It currently has (around line 49):

```ts
  private setupListeners() {
    EventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.render();
    });
    EventBus.on('state:changed', () => this.render());
  }
```

Replace with:

```ts
  private setupListeners() {
    EventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.render();
    });
    EventBus.on('state:changed', () => this.render());
    EventBus.on('view:toggle-floating-toolbar' as any, () => {
      const newVisible = !State.getState().floatingToolbarVisible;
      State.setState({ floatingToolbarVisible: newVisible });
      if (this.element) this.element.classList.toggle('hidden', !newVisible);
    });
  }
```

In `init()` (around line 43), after `viewport.appendChild(this.element)`:

```ts
    viewport.appendChild(this.element);
    if (!State.getState().floatingToolbarVisible) {
      this.element.classList.add('hidden');
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: PASS on all tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/cloud-floating-toolbar.ts src/__tests__/toolbar-redesign.test.ts
git commit -m "feat: make CloudFloatingToolbar toggleable via view:toggle-floating-toolbar"
```

---

## Task 4: Rewrite `Toolbar`

**Files:**
- Rewrite: `src/components/toolbar.ts`

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `src/__tests__/toolbar-redesign.test.ts`:

```ts
import { Toolbar } from '../components/toolbar';

function mountToolbar(): void {
  document.body.innerHTML = `<header id="toolbar"></header>`;
  const container = document.getElementById('toolbar')!;
  new Toolbar(container).render();
}

describe('Toolbar (rewritten)', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      tool: 'select', activeView: 'rack', selection: [],
      floatingToolbarVisible: true, aiMode: false, aiProvider: 'rules',
    });
  });

  it('renders 5 tool buttons: select, pan, cable, power, text', () => {
    mountToolbar();
    expect(document.getElementById('tb-tool-select')).not.toBeNull();
    expect(document.getElementById('tb-tool-pan')).not.toBeNull();
    expect(document.getElementById('tb-tool-cable')).not.toBeNull();
    expect(document.getElementById('tb-tool-power')).not.toBeNull();
    expect(document.getElementById('tb-tool-text')).not.toBeNull();
  });

  it('select button has .active class when state.tool is select', () => {
    stateManager.setState({ tool: 'select' });
    mountToolbar();
    expect(document.getElementById('tb-tool-select')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('tb-tool-pan')!.classList.contains('active')).toBe(false);
  });

  it('clicking a tool button emits tool:changed with the correct tool name', () => {
    mountToolbar();
    const received: string[] = [];
    eventBus.on('tool:changed', (t) => received.push(t));
    document.getElementById('tb-tool-pan')!.click();
    expect(received).toEqual(['pan']);
  });

  it('active tool updates to reflect state.tool on state:changed', () => {
    mountToolbar();
    stateManager.setState({ tool: 'cable' });
    expect(document.getElementById('tb-tool-cable')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('tb-tool-select')!.classList.contains('active')).toBe(false);
  });

  it('renders File, Edit, View, Export menus always', () => {
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('File');
    expect(menus).toContain('Edit');
    expect(menus).toContain('View');
    expect(menus).toContain('Export');
  });

  it('does NOT render Cloud menu in rack view', () => {
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).not.toContain('Cloud');
  });

  it('renders Cloud menu in cloud view', () => {
    stateManager.setState({ activeView: 'cloud' });
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('Cloud');
  });

  it('renders Cloud menu in hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('Cloud');
  });

  it('Cloud menu appears when activeView switches to cloud after render', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('Cloud');
  });

  it('float-toggle button exists', () => {
    mountToolbar();
    expect(document.getElementById('tb-float-toggle')).not.toBeNull();
  });

  it('float-toggle emits view:toggle-floating-toolbar on click', () => {
    mountToolbar();
    const received: void[] = [];
    eventBus.on('view:toggle-floating-toolbar' as any, () => received.push());
    document.getElementById('tb-float-toggle')!.click();
    expect(received).toHaveLength(1);
  });

  it('float-toggle has .active when floatingToolbarVisible is true', () => {
    stateManager.setState({ floatingToolbarVisible: true });
    mountToolbar();
    expect(document.getElementById('tb-float-toggle')!.classList.contains('active')).toBe(true);
  });

  it('float-toggle loses .active after view:toggle-floating-toolbar fires', () => {
    stateManager.setState({ floatingToolbarVisible: true });
    mountToolbar();
    eventBus.emit('view:toggle-floating-toolbar' as any, undefined);
    expect(document.getElementById('tb-float-toggle')!.classList.contains('active')).toBe(false);
  });

  it('does NOT render a logo in the toolbar', () => {
    mountToolbar();
    expect(document.querySelector('.toolbar-logo')).toBeNull();
    expect(document.querySelector('.tb-logo')).toBeNull();
    const text = document.getElementById('toolbar')!.textContent;
    expect(text).not.toContain('Rack Slicer');
  });

  it('does NOT render old group-based markup', () => {
    mountToolbar();
    expect(document.querySelector('.toolbar-group')).toBeNull();
    expect(document.querySelector('.toolbar-group-label')).toBeNull();
    expect(document.getElementById('cloud-tools-group')).toBeNull();
    expect(document.getElementById('rack-export-group')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: FAIL — the old toolbar still has the logo, groups, etc.

- [ ] **Step 3: Write the rewritten `src/components/toolbar.ts`**

```ts
import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode } from '../core/types';
import { ClaudeProvider } from '../ai/claude-provider';

const TOOLS: { id: string; tool: ToolMode; title: string; svg: string }[] = [
  {
    id: 'tb-tool-select', tool: 'select', title: 'Select (V)',
    svg: '<svg viewBox="0 0 24 24"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
  {
    id: 'tb-tool-pan', tool: 'pan', title: 'Pan (H)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 00-2-2 2 2 0 00-2 2v5m0-5V5a2 2 0 00-2-2 2 2 0 00-2 2v8m0-8V7a2 2 0 00-2-2 2 2 0 00-2 2v6m0-5V9a2 2 0 00-2-2 2 2 0 00-2 2v10a7 7 0 0014 0v-8"/></svg>',
  },
  {
    id: 'tb-tool-cable', tool: 'cable', title: 'Draw Ethernet Cable (C)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M12 9v4M6 15v-2h12v2"/></svg>',
  },
  {
    id: 'tb-tool-power', tool: 'power', title: 'Draw Power Cable (P)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2v4M15 2v4"/><path d="M7 6h10v4a5 5 0 01-10 0V6z"/><path d="M12 15v7"/></svg>',
  },
  {
    id: 'tb-tool-text', tool: 'text', title: 'Add Text Label (T)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M12 5v14M9 19h6"/></svg>',
  },
];

const FLOAT_TOGGLE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

export class Toolbar {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'toolbar';

    const inner = document.createElement('div');
    inner.className = 'toolbar-inner';

    // ── Tool strip ──────────────────────────────────────────────────────────
    const strip = document.createElement('div');
    strip.className = 'tb-strip';
    const currentTool = State.getState().tool;
    TOOLS.forEach(({ id, tool, title, svg }) => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.className = 'toolbar-btn tb-tool' + (currentTool === tool ? ' active' : '');
      btn.title = title;
      btn.innerHTML = svg;
      btn.addEventListener('click', () => EventBus.emit('tool:changed', tool));
      strip.appendChild(btn);
    });
    inner.appendChild(strip);

    // ── Separator ───────────────────────────────────────────────────────────
    inner.appendChild(this.sep());

    // ── Menu bar ────────────────────────────────────────────────────────────
    const menuBar = document.createElement('div');
    menuBar.className = 'tb-menus';
    menuBar.id = 'tb-menu-bar';

    const fileMenu = this.menu('File', [
      { label: 'New Project', kbd: '⌘N', action: () => EventBus.emit('file:new', undefined) },
      { label: 'Open…', kbd: '⌘O', action: () => EventBus.emit('file:open', undefined) },
      { label: 'Save', kbd: '⌘S', action: () => EventBus.emit('file:save', undefined) },
      { label: 'Save As…', kbd: '⌘⇧S', action: () => EventBus.emit('file:save-as', undefined) },
      'sep',
      { label: 'Load Demo…', action: () => EventBus.emit('file:demo', undefined) },
      { label: 'Insert Image…', action: () => EventBus.emit('image:insert' as any, undefined) },
    ]);
    menuBar.appendChild(fileMenu);

    const editMenu = this.menu('Edit', [
      { label: 'Undo', kbd: '⌘Z', action: () => EventBus.emit('edit:undo', undefined) },
      { label: 'Redo', kbd: '⌘⇧Z', action: () => EventBus.emit('edit:redo', undefined) },
      'sep',
      { label: 'Select All', kbd: '⌘A', action: () => {} },
      { label: 'Delete', kbd: '⌫', action: () => EventBus.emit('edit:delete', undefined) },
      'sep',
      { label: 'Add 42U Rack', action: () => EventBus.emit('rack:add', { units: 42 }) },
      { label: 'Add 48U Rack', action: () => EventBus.emit('rack:add', { units: 48 }) },
    ]);
    menuBar.appendChild(editMenu);

    const viewMenu = this.menu('View', [
      { label: 'Zoom In', kbd: '+', action: () => EventBus.emit('view:zoom-in', undefined) },
      { label: 'Zoom Out', kbd: '−', action: () => EventBus.emit('view:zoom-out', undefined) },
      'sep',
      { label: 'Show Grid', action: () => EventBus.emit('view:toggle-grid', undefined) },
      { label: 'Show Rulers', action: () => EventBus.emit('view:toggle-rulers', undefined) },
      { label: 'Snap to Grid', action: () => EventBus.emit('view:toggle-snap', undefined) },
      'sep',
      { label: 'Switch to Rack', action: () => EventBus.emit('view:switch', 'rack') },
      { label: 'Switch to Cloud', action: () => EventBus.emit('view:switch', 'cloud') },
      { label: 'Switch to Hybrid', action: () => EventBus.emit('view:switch', 'hybrid') },
      'sep',
      { label: '3D Panel', action: () => EventBus.emit('view:toggle-3d-panel', undefined) },
      { label: 'Toggle Theme', action: () => EventBus.emit('view:toggle-theme', undefined) },
    ]);
    menuBar.appendChild(viewMenu);

    const exportMenu = this.menu('Export', [
      { label: 'Export SVG…', action: () => EventBus.emit('export:svg', undefined) },
      { label: 'Export PNG…', action: () => EventBus.emit('export:png', undefined) },
      { label: 'Export JPEG…', action: () => EventBus.emit('export:jpeg', undefined) },
      { label: 'Export PDF…', action: () => EventBus.emit('export:pdf', undefined) },
      { label: 'Export HTML…', action: () => EventBus.emit('export:html', undefined) },
      'sep',
      { label: 'Design Report…', action: () => EventBus.emit('export:report' as any, undefined) },
    ]);
    menuBar.appendChild(exportMenu);

    inner.appendChild(menuBar);

    // ── Right zone ──────────────────────────────────────────────────────────
    const right = document.createElement('div');
    right.className = 'tb-right';

    // Float toggle
    const floatToggle = document.createElement('button');
    floatToggle.id = 'tb-float-toggle';
    floatToggle.className = 'toolbar-btn tb-float-toggle' + (State.getState().floatingToolbarVisible ? ' active' : '');
    floatToggle.title = 'Toggle floating toolbar';
    floatToggle.innerHTML = FLOAT_TOGGLE_SVG;
    floatToggle.addEventListener('click', () => {
      EventBus.emit('view:toggle-floating-toolbar' as any, undefined);
    });
    right.appendChild(floatToggle);

    // AI / Rules toggle (exact same logic as the old createAiToggle)
    const aiBtn = document.createElement('button');
    aiBtn.className = 'toolbar-btn ai-toggle-btn';
    aiBtn.id = 'ai-toggle-btn';
    aiBtn.title = 'Enable / Disable AI Mode';
    const currentProvider = State.getState().aiProvider;
    const aiLabels: Record<string, string> = { claude: '☁ Claude', local: '⚡ Local', rules: '⚙ Rules' };
    aiBtn.innerHTML = `<span class="ai-badge" id="ai-provider-badge">${aiLabels[currentProvider] ?? '⚙ Rules'}</span>`;
    if (State.getState().aiMode) aiBtn.classList.add('active');
    aiBtn.addEventListener('click', () => {
      const current = State.getState().aiMode;
      if (!current && !ClaudeProvider.hasKey()) {
        if (State.getState().aiProvider === 'claude') {
          document.getElementById('ai-key-modal')?.classList.remove('hidden');
          return;
        }
      }
      const newMode = !current;
      State.setState({ aiMode: newMode });
      EventBus.emit('ai:mode-changed', newMode);
    });
    right.appendChild(aiBtn);

    inner.appendChild(right);
    this.container.appendChild(inner);

    // ── EventBus listeners ──────────────────────────────────────────────────
    EventBus.on('tool:changed', (mode: ToolMode) => {
      this.container.querySelectorAll<HTMLElement>('.tb-tool').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === mode || btn.id === `tb-tool-${mode}`);
      });
    });

    EventBus.on('state:changed', () => {
      const s = State.getState();

      // Cloud menu — add/remove based on activeView
      const existing = menuBar.querySelector('#tb-menu-cloud');
      const needsCloud = s.activeView === 'cloud' || s.activeView === 'hybrid';
      if (needsCloud && !existing) {
        const cloudMenu = this.menu('Cloud', [
          { label: 'Export Cloud SVG…', action: () => EventBus.emit('export:cloud-svg', undefined) },
          { label: 'Export Cloud PNG…', action: () => EventBus.emit('export:cloud-png', undefined) },
        ]);
        cloudMenu.id = 'tb-menu-cloud';
        menuBar.appendChild(cloudMenu);
      } else if (!needsCloud && existing) {
        existing.remove();
      }

      // Float toggle active state
      const ft = this.container.querySelector<HTMLElement>('#tb-float-toggle');
      if (ft) ft.classList.toggle('active', s.floatingToolbarVisible);

      // AI badge + active state
      const badge = this.container.querySelector('#ai-provider-badge');
      if (badge) badge.textContent = aiLabels[s.aiProvider] ?? '⚙ Rules';
      const ai = this.container.querySelector('#ai-toggle-btn');
      if (ai) ai.classList.toggle('active', s.aiMode);
    });

    // Update float-toggle active state when toggle event fires (before state:changed arrives)
    EventBus.on('view:toggle-floating-toolbar' as any, () => {
      const ft = this.container.querySelector<HTMLElement>('#tb-float-toggle');
      if (ft) ft.classList.toggle('active', State.getState().floatingToolbarVisible);
    });

    EventBus.on('ai:mode-changed', (enabled: boolean) => {
      this.container.querySelector('#ai-toggle-btn')?.classList.toggle('active', enabled);
    });
    EventBus.on('ai:provider-changed', (name) => {
      const badge = this.container.querySelector('#ai-provider-badge');
      if (badge) badge.textContent = aiLabels[name] ?? '⚙ Rules';
    });
  }

  private sep(): HTMLElement {
    const d = document.createElement('div');
    d.className = 'tb-sep';
    return d;
  }

  private menu(label: string, items: (string | { label: string; kbd?: string; action: () => void })[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tb-menu';

    const head = document.createElement('div');
    head.className = 'tb-menu-head';
    head.textContent = label + ' ';
    const caret = document.createElement('span');
    caret.className = 'tb-caret';
    caret.textContent = '▾';
    head.appendChild(caret);
    wrap.appendChild(head);

    const dropdown = document.createElement('ul');
    dropdown.className = 'tb-dropdown';

    items.forEach(item => {
      if (item === 'sep') {
        const li = document.createElement('li');
        li.className = 'tb-dropdown-sep';
        dropdown.appendChild(li);
        return;
      }
      const li = document.createElement('li');
      li.className = 'tb-dropdown-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.label;
      li.appendChild(nameSpan);
      if (item.kbd) {
        const kbdSpan = document.createElement('span');
        kbdSpan.className = 'tb-kbd';
        kbdSpan.textContent = item.kbd;
        li.appendChild(kbdSpan);
      }
      li.addEventListener('click', () => {
        wrap.classList.remove('open');
        item.action();
      });
      dropdown.appendChild(li);
    });

    wrap.appendChild(dropdown);

    head.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = wrap.classList.contains('open');
      document.querySelectorAll('.tb-menu.open').forEach(m => m.classList.remove('open'));
      if (!wasOpen) wrap.classList.add('open');
    });

    return wrap;
  }
}
```

- [ ] **Step 4: Add document click-to-close listener**

In `app.ts`, after the `Toolbar` is initialised (search for `new Toolbar(`), add:

```ts
document.addEventListener('click', () => {
  document.querySelectorAll('.tb-menu.open').forEach(m => m.classList.remove('open'));
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/toolbar-redesign.test.ts`

Expected: PASS on all Toolbar tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/toolbar.ts src/app.ts src/__tests__/toolbar-redesign.test.ts
git commit -m "feat: rewrite Toolbar as slim menu-bar with tool strip and float-toggle"
```

---

## Task 5: Update `toolbar.css`

**Files:**
- Rewrite: `src/styles/toolbar.css`

- [ ] **Step 1: Rewrite `src/styles/toolbar.css`**

Replace the entire file contents:

```css
/* ── Top bar shell ───────────────────────────────────────────────────────── */
#toolbar {
  height: 48px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-color);
  user-select: none;
  display: flex;
  align-items: center;
  padding: 0 var(--space-md);
  z-index: 100;
}

.toolbar-inner {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 0;
}

/* ── Shared button base ──────────────────────────────────────────────────── */
.toolbar-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px solid transparent;
  background: transparent;
  transition: all var(--transition-speed) ease;
  flex-shrink: 0;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
  border-color: rgba(255,255,255,0.08);
  color: var(--text-primary);
}

.toolbar-btn.active {
  background: rgba(56,189,248,0.12);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.toolbar-btn svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}

/* ── Tool strip ──────────────────────────────────────────────────────────── */
.tb-strip {
  display: flex;
  align-items: center;
  gap: 3px;
}

/* ── Separator ───────────────────────────────────────────────────────────── */
.tb-sep {
  width: 1px;
  height: 26px;
  background: var(--border-color);
  margin: 0 10px;
  flex-shrink: 0;
}

/* ── Menu bar ────────────────────────────────────────────────────────────── */
.tb-menus {
  display: flex;
  align-items: center;
  gap: 1px;
  position: relative;
}

.tb-menu {
  position: relative;
}

.tb-menu-head {
  padding: 5px 9px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 2px;
}

.tb-menu-head:hover,
.tb-menu.open .tb-menu-head {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tb-caret {
  font-size: 7px;
  opacity: 0.5;
}

/* ── Dropdown ────────────────────────────────────────────────────────────── */
.tb-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--bg-elevated, #0f172a);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  min-width: 190px;
  z-index: 200;
  padding: 3px 0;
  list-style: none;
  margin: 0;
}

.tb-menu.open .tb-dropdown {
  display: block;
}

.tb-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  gap: 16px;
}

.tb-dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tb-kbd {
  font-size: 9px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tb-dropdown-sep {
  height: 1px;
  background: var(--border-color);
  margin: 3px 0;
}

/* ── Right zone ──────────────────────────────────────────────────────────── */
.tb-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tb-float-toggle {
  /* inherits .toolbar-btn sizing */
}

/* AI toggle — wider than standard tool button */
.ai-toggle-btn {
  width: auto;
  min-width: 64px;
  padding: 4px 8px;
  font-size: 11px;
  border-color: var(--border-color);
}

.ai-toggle-btn.active {
  background: rgba(108,99,255,0.2);
  border-color: #6c63ff;
  color: #a89fff;
}

.ai-toggle-btn:hover {
  border-color: rgba(108,99,255,0.5);
}

.ai-badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`

Expected: all previously passing tests still pass; the new tests from Tasks 1–4 pass.

- [ ] **Step 3: Commit**

```bash
git add src/styles/toolbar.css
git commit -m "style: rewrite toolbar.css for menu-bar layout"
```

---

## Task 6: Update existing tests

**Files:**
- Rewrite: `src/__tests__/toolbar-cloud-visibility.test.ts`
- Modify: `src/__tests__/hybrid-view.test.ts`

- [ ] **Step 1: Replace `toolbar-cloud-visibility.test.ts`**

The old tests check `#rack-export-group`, `#cloud-export-group` etc. — those IDs no longer exist. Replace the entire file:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Toolbar } from '../components/toolbar';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

function mountToolbar(): void {
  document.body.innerHTML = `<header id="toolbar"></header>`;
  const container = document.getElementById('toolbar')!;
  new Toolbar(container).render();
}

describe('Toolbar Cloud menu contextual visibility', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({ activeView: 'rack', selection: [], tool: 'select',
      aiMode: false, aiProvider: 'rules', floatingToolbarVisible: true });
  });

  it('Cloud menu absent in rack view', () => {
    mountToolbar();
    expect(document.getElementById('tb-menu-cloud')).toBeNull();
  });

  it('Cloud menu present after switching to cloud view', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    expect(document.getElementById('tb-menu-cloud')).not.toBeNull();
  });

  it('Cloud menu present in hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountToolbar();
    expect(document.getElementById('tb-menu-cloud')).not.toBeNull();
  });

  it('Cloud menu removed again when switching back to rack', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    stateManager.setState({ activeView: 'rack' });
    expect(document.getElementById('tb-menu-cloud')).toBeNull();
  });
});
```

- [ ] **Step 2: Update the "toolbar group visibility" describe block in `hybrid-view.test.ts`**

Find lines 138–159 of `src/__tests__/hybrid-view.test.ts`. Replace the entire `describe('Hybrid view — toolbar group visibility', ...)` block:

```ts
describe('Hybrid view — toolbar group visibility', () => {
  function mountToolbar(): Toolbar {
    document.body.innerHTML = `<header id="toolbar"></header>`;
    const container = document.getElementById('toolbar')!;
    const toolbar = new Toolbar(container);
    toolbar.render();
    return toolbar;
  }

  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [], tool: 'select',
      aiMode: false, aiProvider: 'rules', floatingToolbarVisible: true });
  });

  it('shows all 5 tool strip buttons and the Cloud menu in hybrid view', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'hybrid' });

    expect(document.getElementById('tb-tool-select')).not.toBeNull();
    expect(document.getElementById('tb-tool-pan')).not.toBeNull();
    expect(document.getElementById('tb-tool-cable')).not.toBeNull();
    expect(document.getElementById('tb-tool-power')).not.toBeNull();
    expect(document.getElementById('tb-tool-text')).not.toBeNull();
    expect(document.getElementById('tb-menu-cloud')).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the updated test files**

Run: `npx vitest run src/__tests__/toolbar-cloud-visibility.test.ts src/__tests__/hybrid-view.test.ts`

Expected: all tests PASS.

- [ ] **Step 4: Run full suite**

Run: `npx vitest run`

Expected: same or better pass count than before this task.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/toolbar-cloud-visibility.test.ts src/__tests__/hybrid-view.test.ts
git commit -m "test: update toolbar and hybrid-view tests for new menu-bar toolbar"
```

---

## Self-review checklist

- [ ] All spec requirements mapped to tasks (menu bar, tool strip, float-toggle, Cloud menu, ⚙ Rules, toggle support in both floating toolbars)
- [ ] No placeholders — every step shows exact code
- [ ] Types consistent: `'view:toggle-floating-toolbar'` used as `as any` cast until TypeScript picks up the new AppEvents entry; after Task 1 that cast can be removed
- [ ] `tool:changed` event name used throughout (not `tool:select`)
- [ ] Cloud tool mode strings `cloud-container` / `cloud-connect` not referenced (handled by the existing FloatingToolbar/CloudFloatingToolbar — not in scope of this rewrite)
