# Toolbar Redesign Design

## Goals

Replace the current monolithic 600-line toolbar (14+ groups, many hidden) with two focused components:

- **`Toolbar`** — slim top bar (~180 lines): tool strip + menu bar + right zone
- **`FloatingToolbar`** — canvas overlay (~220 lines): per-view drawing tools, toggleable from the top bar

Outcome: decluttered top bar, modernised look that matches the new sidebar, and drawing tools that live where the user's hands already are.

---

## Architecture

### Components

**`src/components/toolbar.ts`** (rewrite, 608 → ~180 lines)

Three zones rendered left-to-right:

1. **Tool strip** — 5 `<button class="tb-tool">` with SVG icons: Select, Pan, Cable, Power, Text. Active state read from `state.tool` on every `state:changed`. Cable and Power are visually dimmed (`opacity: .35; pointer-events: none`) in Cloud view — strip width never shifts.
2. **Menu bar** — `File ▾` `Edit ▾` `View ▾` `Export ▾` always present. `Cloud ▾` appended only when `activeView` is `cloud` or `hybrid`. Each menu is a `<div class="tb-menu">` with a `<ul class="tb-dropdown">` child; click toggles `.open`, document-click listener closes all open menus. ~60 lines of vanilla dropdown logic, no library.
3. **Right zone** — float-toggle button (`⊞`, class `tb-float-toggle`) + `⚙ Rules` button (`tb-rules`). Float-toggle gains `.active` class when the floating toolbar is visible.

**`src/components/floating-toolbar.ts`** (new, ~220 lines)

- Mounts a `<div class="floating-toolbar">` **inside** the canvas viewport element passed on init.
- Position: `position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%)` — centered above the status bar.
- Tool sets:
  - **Rack view**: Select · Pan · Cable · Power · Text · `|` · Zoom− · `100%` · Zoom+
  - **Cloud view**: Select · Pan · Container · Connector · Text · `|` · Zoom− · `100%` · Zoom+
    *(implementer: verify tool name strings against existing `tool:select` values in `toolbar.ts` and state type before hardcoding)*
  - **Hybrid view**: two independent `FloatingToolbar` instances, one per pane (rack pane = rack set, cloud pane = cloud set). Each instance has its own active-tool state.
- Listens to `state:changed` to re-render the correct tool set when `activeView` changes.
- Listens to `view:toggle-floating-toolbar` to toggle the `hidden` class.
- On init, reads `state.floatingToolbarVisible` so visibility is correct after re-mount.

### Communication

```
Toolbar  ──emit──▶  tool:select               ◀──listen──  FloatingToolbar
Toolbar  ──emit──▶  view:toggle-floating-toolbar ◀──listen──  FloatingToolbar
FloatingToolbar ──emit──▶  tool:select
FloatingToolbar ──emit──▶  view:zoom-in / view:zoom-out
View menu items ──emit──▶  view:switch
View menu "3D Panel" ──emit──▶  view:toggle-3d-panel
```

No direct reference between `Toolbar` and `FloatingToolbar`. EventBus is the only coupling.

---

## State

One new field added to the state shape:

```ts
floatingToolbarVisible: boolean   // default: true
```

All other fields (`tool`, `activeView`, `zoom`, `show3DPanel`) are reused unchanged.

### New EventBus event

| Event | Emitter | Listener | Payload |
|---|---|---|---|
| `view:toggle-floating-toolbar` | `Toolbar` (⊞ button) | `FloatingToolbar` | `undefined` — toggles and flips state |

### Removed events

- `view:toggle-cloud-tools` — no longer needed; `FloatingToolbar` handles cloud tools natively by reacting to `state.activeView`.

---

## Menu Contents

### File
- New Project `⌘N`
- Open… `⌘O`
- Save `⌘S` / Save As… `⌘⇧S`
- — separator —
- Import JSON…
- Import Custom Asset…

### Edit
- Undo `⌘Z` / Redo `⌘⇧Z`
- — separator —
- Select All `⌘A` / Delete `⌫`
- — separator —
- Add Rack… *(previously in the standalone Add toolbar group)*

### View
- Zoom In `+` / Zoom Out `−` / Fit to Screen `⌘0`
- — separator —
- Show Rulers *(checkmark toggle)* / Show Grid / Show Minimap
- — separator —
- Switch to Rack / Switch to Cloud / Switch to Hybrid
- — separator —
- 3D Panel *(checkmark toggle; greyed out when `activeView` is `hybrid`)*

### Export
- Export PNG… / Export SVG… / Export PDF…
- — separator —
- BOM Report… / Power Report…

### Cloud *(appended only when `activeView` is `cloud` or `hybrid`)*
- Connect to AWS… / Connect to Azure… / Connect to GCP…
- — separator —
- Import Cloud Diagram… / Sync to Cloud…

### What disappears from the toolbar entirely
- All `toolbar-group` / `toolbar-group-label` scaffolding
- The standalone Add group (Add 42U / Add 48U → Edit → Add Rack…)
- Cloud shape buttons (Container, Connector → FloatingToolbar)
- Cloud export buttons (→ Export menu)
- All `display:none` show/hide logic in the `state:changed` listener

---

## CSS

### `src/styles/toolbar.css` — rewritten (~120 lines)

All colours use existing CSS custom properties. No new variables.

```css
/* Top bar */
#toolbar                  { height: 48px; background: var(--bg-header); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; padding: 0 10px; gap: 0; }

/* Tool strip */
.tb-sep                   { width: 1px; height: 26px; background: var(--border-color); margin: 0 10px; }
.tb-tool                  { width: 28px; height: 28px; border-radius: 5px; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; }
.tb-tool:hover            { background: var(--bg-hover); }
.tb-tool.active           { background: rgba(56,189,248,.12); border-color: var(--accent-primary); }
.tb-tool.dimmed           { opacity: .35; pointer-events: none; }

/* Menu bar */
.tb-menus                 { display: flex; align-items: center; gap: 1px; position: relative; }
.tb-menu                  { padding: 5px 9px; font-size: 11px; font-weight: 500; color: var(--text-secondary); border-radius: 4px; cursor: pointer; position: relative; user-select: none; }
.tb-menu:hover,
.tb-menu.open             { background: var(--bg-hover); color: var(--text-primary); }

/* Dropdown */
.tb-dropdown              { display: none; position: absolute; top: calc(100% + 4px); left: 0; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.4); min-width: 200px; z-index: 100; padding: 3px 0; }
.tb-menu.open .tb-dropdown { display: block; }
.tb-dropdown-item         { padding: 6px 12px; font-size: 11px; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
.tb-dropdown-item:hover   { background: var(--bg-hover); color: var(--text-primary); }
.tb-dropdown-item.checked::before { content: '✓'; margin-right: 6px; color: var(--accent-primary); }
.tb-dropdown-item.disabled { opacity: .35; pointer-events: none; }
.tb-dropdown-item .kbd    { font-size: 9px; color: var(--text-muted); }
.tb-dropdown-sep          { height: 1px; background: var(--border-color); margin: 3px 0; }

/* Right zone */
.tb-right                 { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.tb-float-toggle          { width: 28px; height: 28px; border-radius: 5px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; }
.tb-float-toggle:hover    { background: var(--bg-hover); }
.tb-float-toggle.active   { background: rgba(56,189,248,.12); border-color: var(--accent-primary); }
.tb-rules                 { padding: 4px 9px; font-size: 10px; font-weight: 600; color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; }
.tb-rules:hover           { color: var(--text-secondary); border-color: var(--text-muted); }
```

### `src/styles/floating-toolbar.css` — new (~60 lines)

```css
.floating-toolbar         { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: rgba(9,12,18,.92); border: 1px solid var(--border-color); border-radius: 8px; padding: 4px 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); backdrop-filter: blur(8px); display: flex; align-items: center; gap: 3px; z-index: 10; }
.floating-toolbar.hidden  { display: none; }
.ft-tool                  { width: 26px; height: 26px; border-radius: 4px; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ft-tool:hover            { background: var(--bg-hover); }
.ft-tool.active           { background: rgba(56,189,248,.12); border-color: var(--accent-primary); }
.ft-sep                   { width: 1px; height: 18px; background: var(--border-color); margin: 0 3px; flex-shrink: 0; }
.ft-zoom-out,
.ft-zoom-in               { width: 22px; height: 22px; border-radius: 4px; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; color: var(--text-muted); }
.ft-zoom-out:hover,
.ft-zoom-in:hover         { background: var(--bg-hover); color: var(--text-secondary); }
.ft-zoom-label            { font-size: 10px; color: var(--text-muted); min-width: 36px; text-align: center; }
```

---

## Testing

### `src/__tests__/toolbar.test.ts` — rewritten

- Renders tool strip with 5 buttons (select / pan / cable / power / text)
- Active tool reflects `state.tool` on `state:changed`
- Clicking a tool button emits `tool:select` with the correct name
- Cable + Power buttons carry `.dimmed` in cloud view; not in rack view
- Menu bar renders File / Edit / View / Export always
- Cloud menu appended when `activeView` is `cloud` or `hybrid`; absent in rack
- Clicking a menu button toggles `.open` on its dropdown
- A document click closes all open dropdowns
- Float-toggle button emits `view:toggle-floating-toolbar` on click
- Float-toggle gains `.active` on first click; loses it on second click

### `src/__tests__/floating-toolbar.test.ts` — new file

- Renders rack tool set in rack view (Select Pan Cable Power Text + zoom controls)
- Renders cloud tool set in cloud view (Select Pan Container Connector Text + zoom controls)
- Switching `activeView` via `state:changed` re-renders the correct tool set
- Clicking a tool button emits `tool:select`
- Active tool reflects `state.tool` on `state:changed`
- `hidden` class added on `view:toggle-floating-toolbar`; removed on second emit
- `state.floatingToolbarVisible: false` on init → toolbar starts hidden
- Zoom label updates when `state.zoom` changes
- Zoom− button emits `view:zoom-out`; Zoom+ emits `view:zoom-in`
- In hybrid view, two independent instances do not share active-tool state

### Existing tests

- `hybrid-view.test.ts` — "toolbar group visibility" describe block replaced with a simpler check that the float-toggle button exists in hybrid view; all other tests unchanged
- `sidebar-nav-tree.test.ts`, `startup-modal.test.ts` — no changes needed

---

## App integration (`app.ts`)

Both `FloatingToolbar` instances are created once at `app.init()` and persist for the session. Visibility is controlled by their parent viewport's `hidden` class — instances are never destroyed and recreated on view switch.

```ts
const rackFloatToolbar  = new FloatingToolbar(document.getElementById('canvas-viewport')!,  'rack');
const cloudFloatToolbar = new FloatingToolbar(document.getElementById('cloud-viewport')!,   'cloud');
```

- `setActiveView('rack')` — `#canvas-viewport` visible, `#cloud-viewport` hidden; `rackFloatToolbar` visible (subject to `floatingToolbarVisible` state), `cloudFloatToolbar` hidden inside its hidden viewport
- `setActiveView('cloud')` — reversed; `cloudFloatToolbar` becomes active
- `setActiveView('hybrid')` — both viewports visible; both `FloatingToolbar` instances visible; each tracks its own active tool independently

`floating-toolbar.css` imported in `app.ts` alongside `toolbar.css`.
