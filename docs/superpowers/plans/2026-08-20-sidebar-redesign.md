# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the emoji nav tree and always-expanded catalog with workspace tabs (Rack | Cloud | Hybrid), flat accordion category rows with SVG icons, and a compact My Library strip.

**Architecture:** All changes isolated to `src/components/sidebar.ts` (logic) and `src/styles/sidebar.css` (styles). The nav tree `renderNavTree()` method is deleted and replaced by `renderTabBar()`. `renderMyLibrary()` is replaced by `renderMyLibraryStrip()`. `renderCatalog()` is rewritten with accordion rows. Existing event bus calls, state shape, drag-and-drop, and cloud palette inner structure are unchanged.

**Tech Stack:** TypeScript, DOM manipulation, CSS custom properties (`src/styles/index.css`), Vitest + happy-dom.

---

## File Map

| File | Change |
|---|---|
| `src/styles/sidebar.css` | Remove `.sidebar-nav-tree`, `.nav-tree-*`; add `.sb-tabs`, `.sb-tab`, `.sb-library-strip`, `.sb-library-panel`, `.cat-row`, `.cat-accent`, `.cat-icon`, `.cat-label`, `.cat-count`, `.cat-chevron`, `.cat-items`, `.cat-item`, `.cat-item-dot`, `.cat-item-meta` |
| `src/components/sidebar.ts` | Delete `renderNavTree()`; add `renderTabBar()`, `renderMyLibraryStrip()`; rewrite `render()` and `renderCatalog()`; add `RACK_CATEGORIES` and `CABLE_TEMPLATES` module-level constants; add `icon()` helper |
| `src/tests/sidebar-nav-tree.test.ts` | Rewrite tests: replace `.nav-tree-leaf` selectors with `.sb-tab`; add accordion tests; keep view-switch and search-scope behaviour tests |

---

## Task 1: CSS — Remove Old Rules, Add New Ones

**Files:**
- Modify: `src/styles/sidebar.css`

- [ ] **Step 1: Remove the nav tree block**

In `sidebar.css`, delete everything from the `.sidebar-nav-tree {` rule through to the end of the nav-tree section. The block to remove spans these selectors (search for each and delete the entire rule):

```
.sidebar-nav-tree
.nav-tree-group
.nav-tree-group-title
.nav-tree-group.collapsed .nav-tree-children
.nav-tree-caret
.nav-tree-children
.nav-tree-leaf
.nav-tree-leaf:hover
.nav-tree-leaf.active
.cloud-icon-category
.cloud-icon-category-title
.cloud-icon-category.collapsed .cloud-icon-category-content
.cloud-icon-category-content
```

- [ ] **Step 2: Add workspace tab styles**

Append to `sidebar.css` after the existing `.sidebar-search` block:

```css
/* ── Workspace Tabs ── */
.sb-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  background: rgba(9, 12, 18, 0.85);
  flex-shrink: 0;
}
.sb-tab {
  flex: 1;
  padding: 8px 4px 7px;
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  text-transform: uppercase;
  cursor: pointer;
  transition: color var(--transition-speed), border-color var(--transition-speed), background-color var(--transition-speed);
}
.sb-tab:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.02);
}
.sb-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  background: rgba(56, 189, 248, 0.04);
}
```

- [ ] **Step 3: Add My Library strip styles**

```css
/* ── My Library Strip ── */
.sb-library-strip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  height: 32px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.01);
  transition: background-color var(--transition-speed);
}
.sb-library-strip:hover {
  background: rgba(255, 255, 255, 0.03);
}
.sb-library-strip svg {
  width: 12px;
  height: 12px;
  stroke: #fbbf24;
  fill: none;
  stroke-width: 2;
  flex-shrink: 0;
}
.sb-library-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #fbbf24;
}
.sb-library-count {
  margin-left: auto;
  font-size: 9px;
  color: var(--text-muted);
}
.sb-library-add {
  font-size: 16px;
  line-height: 1;
  color: #fbbf24;
  opacity: 0.6;
  margin-left: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
}
.sb-library-panel {
  display: none;
  padding: 4px 0;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid var(--border-color);
}
.sb-library-panel.open {
  display: block;
}
```

- [ ] **Step 4: Add flat catalog row styles**

```css
/* ── Flat Accordion Catalog Rows ── */
.cat-row {
  display: flex;
  align-items: center;
  height: 34px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.025);
  transition: background-color var(--transition-speed);
}
.cat-row:hover {
  background: rgba(255, 255, 255, 0.025);
}
.cat-row:hover .cat-label {
  color: var(--text-primary);
}
.cat-row:hover .cat-icon svg {
  stroke: var(--text-secondary);
}
.cat-accent {
  width: 3px;
  height: 100%;
  flex-shrink: 0;
}
.cat-icon {
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cat-icon svg {
  width: 12px;
  height: 12px;
  stroke: var(--text-muted);
  fill: none;
  stroke-width: 2;
  transition: stroke var(--transition-speed);
}
.cat-label {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: color var(--transition-speed);
}
.cat-count {
  font-size: 9px;
  color: #2d3748;
  padding-right: 4px;
}
.cat-chevron {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding-right: 6px;
  transition: transform var(--transition-speed);
}
.cat-chevron svg {
  width: 9px;
  height: 9px;
  stroke: var(--text-muted);
  fill: none;
  stroke-width: 2.5;
}
.cat-row.open .cat-chevron {
  transform: rotate(90deg);
}
.cat-row.open .cat-label {
  color: var(--text-secondary);
}
.cat-items {
  display: none;
  background: rgba(0, 0, 0, 0.15);
}
.cat-items.open {
  display: block;
}
.cat-item {
  display: flex;
  align-items: center;
  padding: 5px 10px 5px 35px;
  gap: 7px;
  font-size: 11px;
  color: #64748b;
  cursor: grab;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
  transition: background-color var(--transition-speed), color var(--transition-speed);
}
.cat-item:hover {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
}
.cat-item:active {
  cursor: grabbing;
}
.cat-item-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cat-item-meta {
  margin-left: auto;
  font-size: 9px;
  color: #2d3748;
}
```

- [ ] **Step 5: Add cloud provider row styles**

```css
/* ── Cloud Provider Rows (Cloud tab) ── */
.cloud-icon-category {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.cloud-icon-category-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: background-color var(--transition-speed), color var(--transition-speed);
}
.cloud-icon-category-title:hover {
  background: rgba(255, 255, 255, 0.025);
  color: var(--text-secondary);
}
.cloud-icon-category-content {
  display: block;
  padding: 2px 0;
  background: rgba(0, 0, 0, 0.12);
}
.cloud-icon-category.collapsed .cloud-icon-category-content {
  display: none;
}
.nav-tree-caret {
  display: inline-block;
  transition: transform var(--transition-speed);
  font-size: 10px;
  color: var(--text-muted);
}
.cloud-icon-category.collapsed .nav-tree-caret {
  transform: rotate(-90deg);
}
```

- [ ] **Step 6: Verify TypeScript + tests still pass**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npx tsc --noEmit 2>&1 | head -20
npm test 2>&1 | tail -20
```

Expected: 0 TypeScript errors; existing tests may show failures for `sidebar-nav-tree.test.ts` selectors (those get fixed in Task 2). All other tests pass.

- [ ] **Step 7: Commit**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design"
git add src/styles/sidebar.css
git commit -m "style: sidebar — replace nav-tree CSS with tabs, accordion, library strip"
```

---

## Task 2: Update Tests for New Tab-Based Sidebar

**Files:**
- Modify: `src/__tests__/sidebar-nav-tree.test.ts`

- [ ] **Step 1: Replace entire file contents**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sidebar } from '../components/sidebar';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

function mountSidebar(): Sidebar {
  document.body.innerHTML = `<aside id="sidebar"></aside>`;
  const container = document.getElementById('sidebar')!;
  const sidebar = new Sidebar(container);
  sidebar.render();
  return sidebar;
}

function wireViewSwitch(sidebar: Sidebar): void {
  eventBus.on('view:switch', (view) => {
    stateManager.setState({ activeView: view });
    sidebar.render();
  });
}

describe('Sidebar workspace tabs', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('renders three tabs: Rack, Cloud, Hybrid', () => {
    mountSidebar();
    const tabs = [...document.querySelectorAll('.sb-tab')].map(el => el.textContent?.trim());
    expect(tabs).toEqual(['Rack', 'Cloud', 'Hybrid']);
  });

  it('Rack tab is active by default when activeView is rack', () => {
    mountSidebar();
    const tabs = document.querySelectorAll('.sb-tab');
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);
    expect(tabs[2].classList.contains('active')).toBe(false);
  });

  it('Cloud tab is active when activeView is cloud', () => {
    stateManager.setState({ activeView: 'cloud' });
    mountSidebar();
    const tabs = document.querySelectorAll('.sb-tab');
    expect(tabs[1].classList.contains('active')).toBe(true);
  });

  it('Hybrid tab is active when activeView is hybrid', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountSidebar();
    const tabs = document.querySelectorAll('.sb-tab');
    expect(tabs[2].classList.contains('active')).toBe(true);
  });

  it('clicking Cloud tab from Rack view switches to hybrid (preserves the rack)', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const cloudTab = document.querySelectorAll('.sb-tab')[1] as HTMLElement;
    cloudTab.click();
    expect(stateManager.getState().activeView).toBe('hybrid');
  });

  it('clicking Cloud tab while already in cloud view stays in cloud', () => {
    stateManager.setState({ activeView: 'cloud' });
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const cloudTab = document.querySelectorAll('.sb-tab')[1] as HTMLElement;
    cloudTab.click();
    expect(stateManager.getState().activeView).toBe('cloud');
  });

  it('clicking Rack tab switches to rack', () => {
    stateManager.setState({ activeView: 'hybrid' });
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const rackTab = document.querySelectorAll('.sb-tab')[0] as HTMLElement;
    rackTab.click();
    expect(stateManager.getState().activeView).toBe('rack');
  });

  it('clicking Hybrid tab switches to hybrid', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const hybridTab = document.querySelectorAll('.sb-tab')[2] as HTMLElement;
    hybridTab.click();
    expect(stateManager.getState().activeView).toBe('hybrid');
  });

  it('search placeholder is "Search components..." on Rack tab', () => {
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder).toContain('Search components');
  });

  it('search placeholder reflects cloud context on Cloud tab', () => {
    stateManager.setState({ activeView: 'cloud' });
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder.toLowerCase()).toContain('search');
    expect(input.placeholder.toLowerCase()).toMatch(/aws|azure|gcp|cloud/);
  });

  it('search placeholder covers both catalogs in Hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder).toContain('rack devices + cloud');
  });
});

describe('Sidebar catalog accordion', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('all category rows are collapsed by default', () => {
    mountSidebar();
    const openItems = document.querySelectorAll('.cat-items.open');
    expect(openItems.length).toBe(0);
  });

  it('clicking a category row expands it', () => {
    mountSidebar();
    const firstRow = document.querySelector('.cat-row') as HTMLElement;
    firstRow.click();
    expect(firstRow.classList.contains('open')).toBe(true);
    const firstItems = firstRow.nextElementSibling as HTMLElement;
    expect(firstItems.classList.contains('open')).toBe(true);
  });

  it('clicking an open row collapses it', () => {
    mountSidebar();
    const firstRow = document.querySelector('.cat-row') as HTMLElement;
    firstRow.click(); // open
    firstRow.click(); // close
    expect(firstRow.classList.contains('open')).toBe(false);
    const firstItems = firstRow.nextElementSibling as HTMLElement;
    expect(firstItems.classList.contains('open')).toBe(false);
  });

  it('accordion: opening a second row collapses the first', () => {
    mountSidebar();
    const rows = document.querySelectorAll('.cat-row');
    const firstRow = rows[0] as HTMLElement;
    const secondRow = rows[1] as HTMLElement;

    firstRow.click(); // open first
    expect(firstRow.classList.contains('open')).toBe(true);

    secondRow.click(); // open second — first should close
    expect(secondRow.classList.contains('open')).toBe(true);
    expect(firstRow.classList.contains('open')).toBe(false);
    expect((firstRow.nextElementSibling as HTMLElement).classList.contains('open')).toBe(false);
  });

  it('expanded row contains draggable catalog items', () => {
    mountSidebar();
    const firstRow = document.querySelector('.cat-row') as HTMLElement;
    firstRow.click();
    const items = firstRow.nextElementSibling!.querySelectorAll('.cat-item');
    expect(items.length).toBeGreaterThan(0);
    expect((items[0] as HTMLElement).draggable).toBe(true);
  });

  it('My Library strip is always visible at top of Rack catalog', () => {
    mountSidebar();
    const strip = document.querySelector('.sb-library-strip');
    expect(strip).not.toBeNull();
  });
});

describe('Sidebar cloud palette', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'cloud', selection: [] });
  });

  it('cloud palette sections use .cloud-icon-category for AWS/Azure/GCP/Local', () => {
    mountSidebar();
    const sections = document.querySelectorAll('.sidebar-section');
    const labels = [...sections].map(s => s.querySelector('.sidebar-section-title')?.textContent ?? '');
    expect(labels.some(l => l.includes('AWS'))).toBe(true);
    expect(labels.some(l => l.includes('Azure'))).toBe(true);
    expect(labels.some(l => l.includes('Google Cloud'))).toBe(true);
  });

  it('category items inside a collapsed cloud category are not visible', () => {
    mountSidebar();
    const categories = document.querySelectorAll('.cloud-icon-category');
    expect(categories.length).toBeGreaterThan(0);
    const firstCategoryContent = categories[0].querySelector('.cloud-icon-category-content') as HTMLElement;
    expect(firstCategoryContent).not.toBeNull();
    // Collapsed by default — content hidden via CSS (`.collapsed .cloud-icon-category-content { display:none }`)
    expect(categories[0].classList.contains('collapsed')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect sidebar tab tests to FAIL**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npm test -- sidebar-nav-tree 2>&1 | tail -30
```

Expected: Multiple FAIL — `Cannot find .sb-tab`, accordion tests fail. This confirms tests are wired correctly before implementation.

- [ ] **Step 3: Commit failing tests**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design"
git add src/__tests__/sidebar-nav-tree.test.ts
git commit -m "test: rewrite sidebar tests for tabs + accordion (currently failing)"
```

---

## Task 3: Add `renderTabBar()` + Update `render()` in sidebar.ts

**Files:**
- Modify: `src/components/sidebar.ts`

- [ ] **Step 1: Add the `icon()` helper and `RACK_CATEGORIES` constant at module level**

Add these directly before the `export class Sidebar {` line:

```typescript
function icon(d: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

const RACK_CATEGORIES: Array<{ id: DeviceCategory; label: string; accent: string; svg: string }> = [
  { id: 'server',        label: 'Servers',       accent: '#fb8c00', svg: icon('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>') },
  { id: 'switch',        label: 'Switches',      accent: '#00f2fe', svg: icon('<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 11h.01M10 11h.01"/>') },
  { id: 'router',        label: 'Routers',       accent: '#00f2fe', svg: icon('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20"/>') },
  { id: 'firewall',      label: 'Firewalls',     accent: '#ef4444', svg: icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>') },
  { id: 'nac',           label: 'NAC',           accent: '#ef4444', svg: icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>') },
  { id: 'storage',       label: 'Storage',       accent: '#8e24aa', svg: icon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>') },
  { id: 'console',       label: 'KVM & Console', accent: '#64748b', svg: icon('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M7 8h10M7 12h5"/>') },
  { id: 'patch-panel',   label: 'Patch Panels',  accent: '#64748b', svg: icon('<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v8M10 8v8M14 8v8M18 8v8"/>') },
  { id: 'pdu',           label: 'PDU',           accent: '#fdd835', svg: icon('<path d="M18 20V10M12 20V4M6 20v-6"/>') },
  { id: 'ats',           label: 'ATS',           accent: '#fdd835', svg: icon('<path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M9 12l2 2 4-4"/>') },
  { id: 'ups',           label: 'UPS',           accent: '#fdd835', svg: icon('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/>') },
  { id: 'cooling',       label: 'Cooling',       accent: '#38bdf8', svg: icon('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/><circle cx="12" cy="12" r="3"/>') },
  { id: 'cable-manager', label: 'Cable Mgmt',    accent: '#64748b', svg: icon('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>') },
  { id: 'blank-panel',   label: 'Blanks',        accent: '#2d3748', svg: icon('<rect x="2" y="9" width="20" height="6" rx="1"/>') },
];

const CABLE_TEMPLATES = [
  { id: 'cable-eth',     name: 'Cat6 Ethernet Cable',   type: 'vm-network',   color: '#fb8c00', termination: 'RJ45 Ethernet', description: 'Orange VM/Data' },
  { id: 'cable-mgmt',    name: 'iDRAC / Mgmt Cable',    type: 'idrac',        color: '#e53935', termination: 'RJ45 Ethernet', description: 'Red Out-of-band' },
  { id: 'cable-fiber',   name: 'Fiber Patch Cable',      type: 'ceph-primary', color: '#43a047', termination: 'LC-Fiber',      description: 'Green High-speed' },
  { id: 'cable-power',   name: 'C13/C14 Power Cord',     type: 'power',        color: '#212529', termination: 'C13/C14 Power', description: 'Black AC Power' },
  { id: 'cable-console', name: 'Console Serial Cable',   type: 'general',      color: '#78909c', termination: 'Console DB9',   description: 'Grey Console' },
];
```

- [ ] **Step 2: Replace the `render()` method entirely**

Find the `render()` method (starts at `render() {`) and replace the full method body:

```typescript
render() {
  const activeView = State.getState().activeView;
  const isCloud = activeView === 'cloud';
  const isHybrid = activeView === 'hybrid';

  this.container.innerHTML = '';
  this.container.className = 'sidebar';

  // Header
  const header = document.createElement('div');
  header.className = 'sidebar-header';
  header.innerHTML = `<h3>Rack Slicer</h3><button class="collapse-btn" title="Collapse">«</button>`;
  header.querySelector('.collapse-btn')!.addEventListener('click', () => {
    this.container.classList.toggle('collapsed');
  });

  // Workspace tab bar (replaces nav tree)
  const tabBar = document.createElement('div');
  tabBar.className = 'sb-tabs';
  this.renderTabBar(tabBar, activeView);

  // Search
  const searchContainer = document.createElement('div');
  searchContainer.className = 'sidebar-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  const providerLabels: Record<CloudProvider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP', onprem: 'Local Resources' };
  searchInput.placeholder = isHybrid
    ? 'Search rack devices + cloud services...'
    : isCloud
      ? (this.focusedCloudProvider ? `Search ${providerLabels[this.focusedCloudProvider]} services...` : 'Search AWS/Azure/GCP/Local services...')
      : 'Search components...';
  searchContainer.appendChild(searchInput);

  const catalogContainer = document.createElement('div');
  catalogContainer.className = 'sidebar-catalog';
  catalogContainer.id = 'catalog-container';

  const cloudCatalogContainer = document.createElement('div');
  cloudCatalogContainer.className = 'sidebar-catalog';
  cloudCatalogContainer.id = 'cloud-catalog-container';

  searchInput.oninput = (e: any) => {
    this.searchTerm = e.target.value.toLowerCase();
    if (isHybrid) {
      this.renderCatalog();
      if (cloudSearchDebounceTimer) clearTimeout(cloudSearchDebounceTimer);
      cloudSearchDebounceTimer = setTimeout(() => this.renderCloudPalette(cloudCatalogContainer), 150);
    } else if (isCloud) {
      if (cloudSearchDebounceTimer) clearTimeout(cloudSearchDebounceTimer);
      cloudSearchDebounceTimer = setTimeout(() => this.renderCloudPalette(), 150);
    } else {
      this.renderCatalog();
    }
  };

  this.container.appendChild(header);
  this.container.appendChild(tabBar);
  this.container.appendChild(searchContainer);
  this.container.appendChild(catalogContainer);
  if (isHybrid) this.container.appendChild(cloudCatalogContainer);

  if (isHybrid) {
    this.renderCatalog();
    this.renderCloudPalette(cloudCatalogContainer);
  } else if (isCloud) {
    this.renderCloudPalette();
  } else {
    this.renderCatalog();
  }
}
```

- [ ] **Step 3: Add `renderTabBar()` private method**

Add this method after the `render()` method, before `renderMyLibrary()`:

```typescript
private renderTabBar(container: HTMLElement, activeView: string): void {
  const tabs: Array<{ label: string; view: 'rack' | 'cloud' | 'hybrid' }> = [
    { label: 'Rack', view: 'rack' },
    { label: 'Cloud', view: 'cloud' },
    { label: 'Hybrid', view: 'hybrid' },
  ];

  for (const tab of tabs) {
    const isActive =
      tab.view === 'rack' ? activeView === 'rack'
      : tab.view === 'hybrid' ? activeView === 'hybrid'
      : activeView === 'cloud';

    const el = document.createElement('div');
    el.className = `sb-tab${isActive ? ' active' : ''}`;
    el.textContent = tab.label;
    el.setAttribute('data-view', tab.view);

    el.addEventListener('click', () => {
      this.focusedCloudProvider = null;
      this.searchTerm = '';
      // Preserve rack when navigating to cloud from a non-cloud view — same logic as old nav-tree leaves
      const currentView = State.getState().activeView;
      const target = tab.view === 'cloud' && currentView !== 'cloud' ? 'hybrid' : tab.view;
      EventBus.emit('view:switch', target);
    });

    container.appendChild(el);
  }
}
```

- [ ] **Step 4: Delete `renderNavTree()` method entirely**

Find the `private renderNavTree(container: HTMLElement): void {` method and delete the whole method (from its declaration through the closing `}`).

- [ ] **Step 5: Run sidebar tab tests — expect them to PASS now**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npm test -- sidebar-nav-tree 2>&1 | grep -E "PASS|FAIL|✓|×" | head -30
```

Expected: The "Sidebar workspace tabs" describe block passes. The accordion and cloud palette tests still fail (implemented in Tasks 4 and 5).

- [ ] **Step 6: Commit**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design"
git add src/components/sidebar.ts
git commit -m "feat: replace nav tree with workspace tab bar (Rack | Cloud | Hybrid)"
```

---

## Task 4: Add `renderMyLibraryStrip()` to sidebar.ts

**Files:**
- Modify: `src/components/sidebar.ts`

- [ ] **Step 1: Add `renderMyLibraryStrip()` private method**

Add this method after `renderTabBar()`:

```typescript
private renderMyLibraryStrip(catalogContainer: HTMLElement): void {
  const state = State.getState();
  const customTemplates = state.customTemplates ?? [];

  const strip = document.createElement('div');
  strip.className = 'sb-library-strip';
  strip.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
    <span class="sb-library-label">My Library</span>
    <span class="sb-library-count">${customTemplates.length} item${customTemplates.length !== 1 ? 's' : ''}</span>
  `;

  const importBtn = document.createElement('button');
  importBtn.className = 'sb-library-add';
  importBtn.textContent = '+';
  importBtn.title = 'Import custom library from JSON file';
  importBtn.onclick = (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (evt: any) => {
      const file: File = evt.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (r: any) => {
        try {
          const imported = parseCustomLibraryJSON(r.target.result);
          const existing = state.customTemplates ?? [];
          const existingIds = new Set(existing.map(t => t.id));
          const merged = [...existing, ...imported.filter(t => !existingIds.has(t.id))];
          State.setState({ customTemplates: merged });
          EventBus.emit('notification' as any, { message: `Imported ${imported.length} asset(s)`, type: 'success' });
          this.render();
        } catch (err) {
          EventBus.emit('notification' as any, { message: `Import failed: ${err}`, type: 'error' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  strip.appendChild(importBtn);

  const panel = document.createElement('div');
  panel.className = 'sb-library-panel';

  strip.addEventListener('click', (e) => {
    if (e.target === importBtn) return;
    panel.classList.toggle('open');
  });

  if (customTemplates.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:11px;color:#8b949e;font-style:italic;padding:8px 12px;margin:0;';
    empty.textContent = 'No custom assets yet. Select a device and click "Save as Custom Asset" in Properties.';
    panel.appendChild(empty);
  } else {
    customTemplates.forEach(item => {
      const el = document.createElement('div');
      el.className = `catalog-item category-${item.category}`;
      el.draggable = true;
      el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding-right:4px;';

      const leftPart = document.createElement('div');
      leftPart.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;';
      leftPart.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-details" style="min-width:0;overflow:hidden;">
          <div class="item-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</div>
          <div class="item-meta">${item.heightUnits > 0 ? item.heightUnits + 'U' : 'Accessory'} · Custom</div>
        </div>
      `;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:2px;flex-shrink:0;';

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.title = 'Edit';
      editBtn.style.cssText = 'background:none;border:none;color:#8b949e;cursor:pointer;font-size:13px;padding:2px 4px;';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        const fakeDevice: any = {
          id: '__edit__', name: item.name, hostname: '', managementIp: '',
          serialNumber: '', description: item.customDescription ?? '',
          templateId: item.id, rackId: '', startUnit: 1,
          ports: item.ports.map(p => ({ ...p, deviceId: '__edit__', connected: false, cableId: null })),
          frontPanelImage: item.frontPanelImage,
        };
        const base = getTemplate(item.basedOnTemplateId ?? '') ?? null;
        this.customAssetModal.show(fakeDevice, base, item, () => this.render());
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = 'Delete';
      delBtn.style.cssText = 'background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:2px 4px;';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${item.name}"?`)) return;
        deleteCustomTemplate(item.id);
        const newTemplates = (State.getState().customTemplates ?? []).filter(t => t.id !== item.id);
        State.setState({ customTemplates: newTemplates });
        this.render();
      };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      el.appendChild(leftPart);
      el.appendChild(actions);
      el.ondragstart = (e) => {
        e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
      };
      panel.appendChild(el);
    });

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export My Library';
    exportBtn.style.cssText = 'margin:6px 4px 2px;font-size:11px;padding:4px 10px;border:1px solid #30363d;background:transparent;color:#8b949e;border-radius:4px;cursor:pointer;width:calc(100% - 8px);';
    exportBtn.onclick = () => exportCustomLibraryJSON(customTemplates);
    panel.appendChild(exportBtn);
  }

  catalogContainer.appendChild(strip);
  catalogContainer.appendChild(panel);
}
```

- [ ] **Step 2: Run tests**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npm test -- sidebar-nav-tree 2>&1 | grep -E "✓|×|PASS|FAIL" | head -20
```

Expected: "My Library strip is always visible at top of Rack catalog" now passes.

- [ ] **Step 3: Commit**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design"
git add src/components/sidebar.ts
git commit -m "feat: add My Library compact strip (replaces expandable section)"
```

---

## Task 5: Rewrite `renderCatalog()` with Flat Accordion Rows

**Files:**
- Modify: `src/components/sidebar.ts`

- [ ] **Step 1: Replace the entire `renderCatalog()` method**

Find `private renderCatalog(containerEl?: HTMLElement) {` and replace the full method body:

```typescript
private renderCatalog(containerEl?: HTMLElement) {
  const container = containerEl ?? this.container.querySelector('#catalog-container') as HTMLElement;
  if (!container) return;
  container.innerHTML = '';

  this.renderMyLibraryStrip(container);

  // Track the currently open row for accordion behaviour
  let openRow: HTMLElement | null = null;
  let openItems: HTMLElement | null = null;

  const appendRow = (
    label: string,
    accent: string,
    svgHtml: string,
    itemEls: HTMLElement[],
  ): void => {
    if (itemEls.length === 0) return;

    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div class="cat-accent" style="background:${accent}"></div>
      <div class="cat-icon">${svgHtml}</div>
      <span class="cat-label">${label}</span>
      <span class="cat-count">${itemEls.length}</span>
      <div class="cat-chevron">${icon('<path d="M9 18l6-6-6-6"/>')}</div>
    `;

    const itemsEl = document.createElement('div');
    itemsEl.className = 'cat-items';
    itemEls.forEach(el => itemsEl.appendChild(el));

    row.addEventListener('click', () => {
      const isOpen = row.classList.contains('open');
      // Accordion: collapse previous
      if (openRow && openRow !== row) {
        openRow.classList.remove('open');
        openItems?.classList.remove('open');
      }
      row.classList.toggle('open', !isOpen);
      itemsEl.classList.toggle('open', !isOpen);
      openRow = isOpen ? null : row;
      openItems = isOpen ? null : itemsEl;
    });

    container.appendChild(row);
    container.appendChild(itemsEl);
  };

  // Device catalog categories
  for (const cat of RACK_CATEGORIES) {
    const allItems = [
      ...deviceCatalog.filter(d => d.category === cat.id),
      ...(State.getState().customTemplates ?? []).filter(d => d.category === cat.id),
    ].filter(item => item.name.toLowerCase().includes(this.searchTerm));

    const itemEls = allItems.map(item => {
      const el = document.createElement('div');
      el.className = 'cat-item';
      el.draggable = true;
      const meta = item.mountType === 'side' ? 'Side' : `${item.heightUnits}U`;
      el.innerHTML = `
        <div class="cat-item-dot" style="background:${cat.accent}"></div>
        ${item.name}
        <span class="cat-item-meta">${meta}</span>
      `;
      el.ondragstart = (e) => {
        e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
      };
      return el;
    });

    appendRow(cat.label, cat.accent, cat.svg, itemEls);
  }

  // Cables (virtual category — not in deviceCatalog)
  const filteredCables = CABLE_TEMPLATES.filter(c =>
    c.name.toLowerCase().includes(this.searchTerm) ||
    c.description.toLowerCase().includes(this.searchTerm),
  );

  const cableItemEls = filteredCables.map(item => {
    const el = document.createElement('div');
    el.className = 'cat-item';
    el.style.borderLeft = `3px solid ${item.color}`;
    el.innerHTML = `
      <div class="cat-item-dot" style="background:${item.color}"></div>
      ${item.name}
      <span class="cat-item-meta">${item.description}</span>
    `;
    el.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'cable');
      State.setState({
        selectedCableType: item.type as any,
        selectedCableColor: item.color,
        selectedCableTermination: item.termination,
        selectedCableBend: 15,
      });
      EventBus.emit('notification', {
        message: `Selected ${item.name}. Click any port to start routing!`,
        type: 'info',
      });
    });
    return el;
  });

  appendRow(
    'Cables',
    '#10b981',
    icon('<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/>'),
    cableItemEls,
  );
}
```

- [ ] **Step 2: Delete the old `renderMyLibrary()` method entirely**

Find `private renderMyLibrary(container: HTMLElement): void {` and delete the whole method (from its declaration through the closing `}`).

- [ ] **Step 3: Run all sidebar tests**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npm test -- sidebar-nav-tree 2>&1 | tail -20
```

Expected: All tests in `sidebar-nav-tree.test.ts` pass.

- [ ] **Step 4: Run full test suite**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npm test 2>&1 | tail -10
```

Expected: All 70+ tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design"
git add src/components/sidebar.ts
git commit -m "feat: rewrite rack catalog as flat accordion rows with SVG icons"
```

---

## Task 6: Final Verification

**Files:**
- No new changes — verification only

- [ ] **Step 1: TypeScript check**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Full test suite**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design" && npm test 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 3: Browser smoke test**

Open http://localhost:5173 and verify:

1. Left sidebar shows "Rack Slicer" header, 3 tabs (Rack / Cloud / Hybrid)
2. No emoji characters in any category label
3. All 14 device categories render as flat rows with colored accent bars and SVG icons
4. All rows are collapsed by default
5. Clicking a row expands it; clicking another row collapses the first (accordion)
6. My Library strip is pinned above the category list; clicking `+` opens file picker
7. Clicking Cloud tab switches view (or goes to Hybrid from Rack view)
8. Clicking Hybrid tab shows both rack catalog and cloud palette
9. Search still filters devices and cloud services correctly
10. Dragging a device from an expanded row onto the canvas works

- [ ] **Step 4: Final commit if any fixups were made**

```bash
cd "G:\Claude\Rack_Design_export Aug19\Rack_Design"
git add -p   # stage only intentional fixup changes
git commit -m "fix: sidebar redesign post-review fixups"
```

---

## Self-Review

**Spec coverage:**
- [x] Workspace tabs (Rack | Cloud | Hybrid) replace nav tree — Task 3
- [x] Search placeholder changes per active tab — preserved in `render()` (Task 3)
- [x] My Library as compact pinned strip — Task 4
- [x] All 14 device categories as flat rows, collapsed by default — Task 5
- [x] SVG icons + color accent bars per category — Task 3 (`RACK_CATEGORIES`) + Task 5
- [x] Accordion behavior (one open at a time) — Task 5 `appendRow()`
- [x] Draggable items in expanded sub-rows — Task 5
- [x] Cables virtual category — Task 5
- [x] Cloud tab: provider rows, recently used, categories — `renderCloudPalette()` unchanged
- [x] Hybrid tab: both catalogs at once — `render()` isHybrid branch preserved (Task 3)
- [x] No emojis — confirmed: all category labels use text strings + SVG icons

**Type consistency:**
- `RACK_CATEGORIES` uses `DeviceCategory` for `.id` — same type as `deviceCatalog[n].category`
- `CABLE_TEMPLATES` `.type` cast to `any` to match existing `selectedCableType` state shape
- `appendRow()` inner function visible only within `renderCatalog()` — no cross-task naming conflict
- `icon()` is a module-level function, referenced by both `RACK_CATEGORIES` and inline in `appendRow()`
