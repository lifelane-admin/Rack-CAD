# Spec: Sidebar Redesign — Workspace Tabs + Clean Catalog

**Date:** 2026-08-20
**Status:** Approved for implementation

---

## Overview

Replace the current left sidebar's emoji-heavy nav tree + always-expanded catalog sections with a professional, compact design: three workspace tabs (Rack | Cloud | Hybrid) at the top, a unified search bar, and a flat collapsible category list with SVG icons and color-coded accent bars.

---

## Goals

- Remove all emoji from section labels and category titles
- Replace the nav tree with three concise workspace tabs
- Collapse all device categories by default (reduce scroll overwhelm)
- Add per-category SVG icons and color-coded left accent bars for fast visual scanning
- Keep all existing functionality (My Library, drag-and-drop, cloud palette, hybrid view)

---

## Layout Structure

```
┌─────────────────────────────┐
│  Rack Slicer            [«] │  ← Header (44px, dark bg)
├─────────────────────────────┤
│  [  Rack  ] [Cloud] [Hybrid]│  ← Workspace tabs (32px)
├─────────────────────────────┤
│  🔍 Search components…      │  ← Search input with icon (36px)
├─────────────────────────────┤
│  ★ My Library    0 items  + │  ← Library strip (pinned, 32px)
├─────────────────────────────┤
│  ▌ 🖥 Servers          12 › │  ←  ┐
│    · Dell PowerEdge R750 2U │     │ Catalog (scrollable)
│    · HPE ProLiant DL380  2U │     │ collapsed by default
│  ▌ 🔀 Switches          8 › │     │ one opens at a time
│  ▌ 🛡 Firewalls          4 › │     │
│  …                          │  ←  ┘
└─────────────────────────────┘
```

---

## Section 1: Header

- Height: 44px, background: `var(--bg-header)` / `#090c12`
- Left: app name "Rack Slicer" — `font-size: 12px`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 1px`, color `var(--text-secondary)`
- Right: collapse button `«` — 26×26px, `background: rgba(255,255,255,0.03)`, `border: 1px solid var(--border-color)`, toggles `#sidebar.collapsed`

---

## Section 2: Workspace Tabs

Three tabs replace the current `sidebar-nav-tree`. Tabs switch `AppState.activeView` exactly as the nav tree leaves do today.

| Tab label | `activeView` value | Search placeholder |
|---|---|---|
| Rack | `'rack'` | `Search components…` |
| Cloud | `'cloud'` | `Search AWS / Azure / GCP…` |
| Hybrid | `'hybrid'` | `Search rack devices + cloud…` |

**Styling:**
- Tab bar height: 32px, background `#090c12`, `border-bottom: 1px solid var(--border-color)`
- Each tab: `flex: 1`, `font-size: 10px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.6px`
- Inactive: `color: var(--text-muted)` (`#475569`)
- Active: `color: var(--accent-primary)` (`#38bdf8`), `border-bottom: 2px solid var(--accent-primary)`, `background: rgba(56,189,248,0.04)`
- Clicking a tab calls the same handler as the old nav tree leaf: `EventBus.emit('view:switch', target)` and updates `focusedCloudProvider`

**Cloud tab provider scoping:**
- Clicking the Cloud tab sets `focusedCloudProvider` to the last-used provider (or `null` for all-providers search), matching existing behaviour.
- No sub-navigation inside the tab bar — provider selection happens inside the catalog panel.

---

## Section 3: Search Bar

- Padding: 8px 10px, `border-bottom: 1px solid var(--border-color)`
- Input: `background: rgba(0,0,0,0.28)`, `border: 1px solid var(--border-color)`, `border-radius: 4px`, `font-size: 11px`
- Prepend a search SVG icon (`<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>`) inside the input row — no functional change, purely visual
- Placeholder text changes per active tab (see table above)
- Existing `oninput` search logic is preserved exactly

---

## Section 4: My Library Strip (Rack tab only)

A single always-visible row pinned above the catalog, replacing the current expandable `#my-library-section`.

- Height: 32px, `padding: 0 12px`, `border-bottom: 1px solid var(--border-color)`
- Left: star SVG icon (stroke `#fbbf24`) + label "My Library" (`font-size: 10px`, `font-weight: 700`, `text-transform: uppercase`, `color: #fbbf24`)
- Right: item count badge (`font-size: 9px`, `color: var(--text-muted)`) + `+` button that opens `CustomAssetModal`
- Clicking the strip itself opens/expands a dropdown showing custom assets (if any), or the import JSON button — same content as today's expandable section, just triggered differently
- Hidden on Cloud and Hybrid tabs (not relevant there)

---

## Section 5: Rack Catalog — Flat Collapsible Rows

Each device category renders as a single collapsible row. All collapsed by default. Clicking a row header expands it; clicking again collapses it. Only one row can be open at a time (accordion behavior — closing the previous when a new one opens).

### Category row anatomy

```
[accent bar 3px] [icon 32px] [label flex-1] [count 9px] [chevron 20px]
```

- **Accent bar:** 3px wide, full row height, color per category (see table below)
- **Icon:** 12×12px SVG, `stroke: var(--text-muted)`, no fill, stroke-width 2
- **Label:** `font-size: 11px`, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.5px`, `color: var(--text-muted)`
- **Count badge:** item count, `font-size: 9px`, `color: var(--text-faint)` (`#2d3748`)
- **Chevron:** `›` rotates to `∨` when expanded; `font-size: 9px`, `color: var(--text-faint)`
- Row height: 34px, `border-bottom: 1px solid rgba(255,255,255,0.025)`
- Hover: `background: rgba(255,255,255,0.025)`, label color shifts to `var(--text-primary)`

### Category definitions

| Category | Label | Accent color | SVG icon hint |
|---|---|---|---|
| `server` | Servers | `#fb8c00` | monitor/screen |
| `switch` | Switches | `#00f2fe` | rack unit with dots |
| `router` | Routers | `#00f2fe` | globe |
| `firewall` | Firewalls | `#ef4444` | shield |
| `nac` | NAC | `#ef4444` | padlock |
| `storage` | Storage | `#8e24aa` | database cylinder |
| `console` | KVM & Console | `#64748b` | monitor with lines |
| `patch-panel` | Patch Panels | `#64748b` | rack with vertical lines |
| `pdu` | PDU | `#fdd835` | bar chart |
| `ats` | ATS | `#fdd835` | check circle |
| `ups` | UPS | `#fdd835` | lightning bolt |
| `cooling` | Cooling | `#38bdf8` | asterisk/fan |
| `cable-manager` | Cable Mgmt | `#64748b` | horizontal lines |
| `blank-panel` | Blanks | `#2d3748` | thin rect |
| Cables (virtual) | Cables | `#10b981` | wifi-like arc |

### Expanded sub-items

When a row is expanded, device items appear below it:

```
[35px indent] [5px dot accent color] [device name] [U-size right-aligned]
```

- `font-size: 11px`, `color: #64748b`
- Hover: `background: rgba(255,255,255,0.03)`, color `var(--text-secondary)`
- `cursor: grab` — draggable, same `ondragstart` as today
- U-size meta on the right: `font-size: 9px`, `color: var(--text-faint)`
- Side-mount devices show `Side` instead of a U-size

---

## Section 6: Cloud Catalog (Cloud tab)

Structure unchanged from today, but header rows gain the same styling treatment (no emojis, clean rows):

**Recently Used** — single non-collapsible label row at top:
- Clock SVG icon + "Recently Used" label, `font-size: 10px`, `font-weight: 700`, `text-transform: uppercase`
- If empty: hint text `"Icons you drag in will appear here."`

**Provider rows** (AWS / Azure / Google Cloud / Local Resources):
- Colored dot (AWS `#ff9900`, Azure `#0078d4`, GCP `#4285f4`, Local `#64748b`)
- Provider name + service count badge + chevron
- Expanding reveals the existing category sub-groups (boundaries + service categories) — no change to that inner structure

---

## Section 7: Hybrid Catalog (Hybrid tab)

Two top-level collapsible rows:

1. **Rack Components** — accent `#fb8c00`, expands to the same flat rack catalog as the Rack tab
2. **Cloud Providers** — expands to the same cloud palette as the Cloud tab (all providers)

Shared search covers both when typing.

---

## Files to Change

| File | Change |
|---|---|
| `src/components/sidebar.ts` | Replace `renderNavTree()` with tab bar; refactor `render()` header; new `renderMyLibraryStrip()`; new `renderFlatCatalog()` with accordion rows; update Cloud/Hybrid sections |
| `src/styles/sidebar.css` | Replace `.sidebar-nav-tree`, `.nav-tree-*` rules with `.sb-tabs`, `.sb-tab`; add `.cat-row`, `.cat-accent`, `.cat-icon`, `.cat-chevron`, `.cat-items`, `.cat-item` rules; add `.sb-library` strip rule |

---

## Out of Scope

- Top horizontal toolbar changes
- Properties panel redesign
- Canvas or renderer changes
- Any new device categories or cloud providers
- Drag-and-drop behaviour changes
