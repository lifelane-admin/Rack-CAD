import EventBus from '../core/event-bus';
import State from '../core/state';
import { deviceCatalog, getTemplate } from '../library/device-catalog';
import { DeviceCategory, DeviceTemplate, CloudProvider, CloudContainer } from '../core/types';
import { CustomAssetModal } from './custom-asset-modal';
import { deleteCustomTemplate, exportCustomLibraryJSON, parseCustomLibraryJSON } from '../library/custom-catalog';
import { RACK_TEMPLATES, VCM_TEMPLATES, createRackFromTemplate } from '../library/rack-catalog';
import { customRackModal } from './custom-rack-modal';
import { cloudIconManifest, CloudIconEntry, getCloudIcon, isBoundaryIcon, BOUNDARY_MENU_KINDS, getBoundaryIconsByKind } from '../library/cloud-icon-catalog';
import { recordIconUse, recordBoundaryUse, getRecentUsage } from '../library/recent-usage';
import { getPortBadgeSvg, getCableGraphicSvg, ALL_CABLE_ITEMS } from './cable-graphics';

const CLOUD_SEARCH_RESULT_CAP = 150;
let cloudSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
  { id: 'blank-panel',   label: 'Blanks',        accent: '#2d3748', svg: icon('<rect x="2" y="9" width="20" height="6" rx="1"/>') },
];

export class Sidebar {
  private container: HTMLElement;
  private searchTerm: string = '';
  private customAssetModal = new CustomAssetModal();
  /** Which cloud provider's palette section to auto-expand — set when the user navigates via
   *  the Cloud > AWS/Azure/GCP tree leaf, so landing on the Cloud Architecture view drops them
   *  straight into that provider's icons instead of an all-collapsed palette. */
  private focusedCloudProvider: CloudProvider | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Sets which cloud provider's palette section auto-expands, from outside the nav-tree click
   *  itself — used by the startup screen (see startup-modal.ts) to land the sidebar in the same
   *  state a manual Cloud > AWS/Azure/GCP/Local Resources click would, or fully unscoped (null)
   *  for the Hybrid choice, which shows every section collapsed with unscoped search. */
  focusCloudProvider(provider: CloudProvider | null): void {
    this.focusedCloudProvider = provider;
    this.searchTerm = '';
  }

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

  private renderTabBar(container: HTMLElement, activeView: string): void {
    const tabs: Array<{ label: string; view: 'rack' | 'cloud' | 'hybrid' }> = [
      { label: 'Rack', view: 'rack' },
      { label: 'Cloud', view: 'cloud' },
      { label: 'Hybrid', view: 'hybrid' },
    ];

    for (const tab of tabs) {
      const isActive = tab.view === activeView;

      const el = document.createElement('div');
      el.className = `sb-tab${isActive ? ' active' : ''}`;
      el.textContent = tab.label;
      el.setAttribute('data-view', tab.view);

      el.addEventListener('click', () => {
        this.focusedCloudProvider = null;
        this.searchTerm = '';
        const currentView = State.getState().activeView;
        const target = tab.view === 'cloud' && currentView !== 'cloud' ? 'hybrid' : tab.view;
        EventBus.emit('view:switch', target);
      });

      container.appendChild(el);
    }
  }

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
      if ((e.target as HTMLElement) === importBtn || importBtn.contains(e.target as HTMLElement)) return;
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

  /** metaMode 'provider' is used in cross-provider contexts (Boundaries, Recently Used) where
   *  showing the raw manifest category (e.g. "Groups") is less useful than which cloud it's from. */
  private makeCloudIconItem(icon: CloudIconEntry, opts?: { metaMode?: 'category' | 'provider' }): HTMLElement {
    const el = document.createElement('div');
    el.className = 'catalog-item cloud-icon-item';
    el.draggable = true;
    el.title = `${icon.name} (${icon.provider.toUpperCase()})`;
    const meta = opts?.metaMode === 'provider' ? icon.provider.toUpperCase() : icon.category;
    el.innerHTML = `
      <img class="cloud-icon-thumb" src="${icon.path}" alt="" loading="lazy" width="24" height="24" />
      <div class="item-details" style="min-width:0;overflow:hidden;">
        <div class="item-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${icon.name}</div>
        <div class="item-meta">${meta}</div>
      </div>
    `;
    el.ondragstart = (e) => {
      e.dataTransfer?.setData('application/json', JSON.stringify({ iconId: icon.id }));
      recordIconUse(icon.id);
      this.refreshRecentUsedSection();
    };
    return el;
  }

  /** A click-to-draw row for a boundary kind with no matching manifest icon (e.g. Availability
   *  Zone has none in any of the three official packs) — mirrors the floating toolbar's shape
   *  buttons (see cloud-floating-toolbar.ts) but reachable from inside the Boundaries submenu. */
  private makeBoundaryDrawItem(kind: CloudContainer['kind'], label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'catalog-item cloud-boundary-draw-item';
    el.title = `Draw ${label}`;
    el.innerHTML = `
      <div class="item-icon">✏️</div>
      <div class="item-details" style="min-width:0;overflow:hidden;">
        <div class="item-name">${label}</div>
        <div class="item-meta">Draw boundary</div>
      </div>
    `;
    el.onclick = () => {
      EventBus.emit('cloud-shape:prime' as any, kind);
      recordBoundaryUse(kind);
      this.refreshRecentUsedSection();
    };
    return el;
  }

  /** "Describe infra in one line" quick-entry (see hierarchy-input-modal.ts), reached from inside
   *  this provider's own Boundaries submenu — opens the modal pre-scoped to `provider` instead of
   *  defaulting to Azure. */
  private makeDescribeInfraItem(provider: CloudProvider): HTMLElement {
    const el = document.createElement('div');
    el.className = 'catalog-item cloud-boundary-draw-item';
    el.title = 'Describe Infra in one line (Subscription/Region/Resource Group/VNet)';
    el.innerHTML = `
      <div class="item-icon">⚡</div>
      <div class="item-details" style="min-width:0;overflow:hidden;">
        <div class="item-name">Subscription+Region+RG+vNET</div>
        <div class="item-meta">Describe in one line</div>
      </div>
    `;
    el.onclick = () => EventBus.emit('cloudhierarchy:prime' as any, provider);
    return el;
  }

  /** "Recently Used" — real usage history (localStorage-backed, see recent-usage.ts), not seeded
   *  placeholder data; empty until the user actually drags an icon or draws a boundary. Holds up
   *  to the last 10 distinct icons/boundary-kinds used, most-recent first. */
  private renderRecentUsedSection(startExpanded = false): HTMLElement {
    const section = document.createElement('div');
    section.id = 'recent-used-section';
    section.className = startExpanded ? 'sidebar-section expanded' : 'sidebar-section';

    const title = document.createElement('div');
    title.className = 'sidebar-section-title';
    title.textContent = '🕐 Recently Used';
    title.onclick = () => section.classList.toggle('expanded');
    section.appendChild(title);

    const content = document.createElement('div');
    content.className = 'sidebar-section-content';

    const entries = getRecentUsage();
    if (entries.length === 0) {
      const hint = document.createElement('p');
      hint.style.cssText = 'font-size:11px;color:#8b949e;font-style:italic;padding:6px 12px;margin:0;';
      hint.textContent = 'Icons you drag in and boundaries you draw will show up here.';
      content.appendChild(hint);
    } else {
      for (const entry of entries) {
        if (entry.type === 'icon') {
          const icon = getCloudIcon(entry.iconId);
          if (icon) content.appendChild(this.makeCloudIconItem(icon, { metaMode: 'provider' }));
        } else {
          const shape = BOUNDARY_MENU_KINDS.find(s => s.kind === entry.kind);
          content.appendChild(this.makeBoundaryDrawItem(entry.kind, shape?.label ?? entry.kind));
        }
      }
    }

    section.appendChild(content);
    return section;
  }

  /** Swaps just the Recently Used section's DOM after a new use is recorded, instead of
   *  rebuilding the whole palette (which would collapse every other section's expand state). */
  private refreshRecentUsedSection(): void {
    const existing = this.container.querySelector('#recent-used-section');
    if (!existing) return;
    existing.replaceWith(this.renderRecentUsedSection(existing.classList.contains('expanded')));
  }

  /** Per-provider "Boundaries" group — Region/AZ/VPC/Subnet/Resource Group/Account/Generic as
   *  kind submenus scoped to that single cloud's own icons only. Inserted as the first group
   *  inside each of AWS/Azure/GCP's own palette section (not a merged cross-cloud menu), so
   *  browsing AWS boundaries never surfaces an Azure or GCP icon and vice versa. */
  private renderProviderBoundariesGroup(provider: CloudProvider): HTMLElement {
    const byKind = getBoundaryIconsByKind(provider);
    const total = [...byKind.values()].reduce((n, arr) => n + arr.length, 0);

    const catGroup = document.createElement('div');
    catGroup.className = 'cloud-icon-category collapsed';

    const catTitle = document.createElement('div');
    catTitle.className = 'cloud-icon-category-title';
    catTitle.innerHTML = `<span class="nav-tree-caret">▾</span> 📐 Boundaries <span style="opacity:0.6;font-weight:normal;">(${total})</span>`;
    catTitle.onclick = () => catGroup.classList.toggle('collapsed');
    catGroup.appendChild(catTitle);

    const catContent = document.createElement('div');
    catContent.className = 'cloud-icon-category-content';
    catContent.appendChild(this.makeDescribeInfraItem(provider));

    for (const { kind, label } of BOUNDARY_MENU_KINDS) {
      const items = byKind.get(kind) ?? [];

      const subGroup = document.createElement('div');
      subGroup.className = 'cloud-icon-category collapsed';

      const subTitle = document.createElement('div');
      subTitle.className = 'cloud-icon-category-title';
      subTitle.innerHTML = `<span class="nav-tree-caret">▾</span> ${label} <span style="opacity:0.6;font-weight:normal;">(${items.length})</span>`;
      subTitle.onclick = () => subGroup.classList.toggle('collapsed');
      subGroup.appendChild(subTitle);

      const subContent = document.createElement('div');
      subContent.className = 'cloud-icon-category-content';
      subContent.appendChild(this.makeBoundaryDrawItem(kind, label));
      for (const icon of items) {
        subContent.appendChild(this.makeCloudIconItem(icon));
      }
      subGroup.appendChild(subContent);

      catContent.appendChild(subGroup);
    }

    catGroup.appendChild(catContent);
    return catGroup;
  }

  /** Cloud icon palette (see cloud-icon-catalog.ts) — 1274 official AWS/Azure/GCP icons.
   *  Provider sections collapsed by default with category sub-groupings inside; typing in the
   *  search box switches to a flat, capped, cross-provider results list instead. */
  private renderCloudPalette(containerEl?: HTMLElement): void {
    const container = containerEl ?? this.container.querySelector('#catalog-container') as HTMLElement;
    if (!container) return;
    container.innerHTML = '';

    if (this.searchTerm) {
      // Scoped to whichever provider was entered via the nav tree (Cloud > AWS/Azure/GCP) —
      // searching "ec2" while under Azure shouldn't surface AWS results. Only unscoped if the
      // palette was reached some other way (e.g. reopening a project with activeView: 'cloud'
      // and no tree click yet), matching focusedCloudProvider's existing null default.
      const scope = this.focusedCloudProvider;
      const matches = cloudIconManifest.filter(icon =>
        (!scope || icon.provider === scope) &&
        (icon.name.toLowerCase().includes(this.searchTerm) || icon.category.toLowerCase().includes(this.searchTerm))
      );

      const section = document.createElement('div');
      section.className = 'sidebar-section expanded';
      const title = document.createElement('div');
      title.className = 'sidebar-section-title';
      const scopeLabel = scope ? ` in ${scope.toUpperCase()}` : '';
      title.textContent = `🔎 Results${scopeLabel} (${matches.length})`;
      section.appendChild(title);

      const content = document.createElement('div');
      content.className = 'sidebar-section-content';
      for (const icon of matches.slice(0, CLOUD_SEARCH_RESULT_CAP)) {
        content.appendChild(this.makeCloudIconItem(icon));
      }
      section.appendChild(content);
      container.appendChild(section);

      if (matches.length > CLOUD_SEARCH_RESULT_CAP) {
        const hint = document.createElement('p');
        hint.style.cssText = 'font-size:11px;color:#8b949e;font-style:italic;padding:6px 8px;margin:0;';
        hint.textContent = `${matches.length - CLOUD_SEARCH_RESULT_CAP} more match — refine your search to narrow the list.`;
        container.appendChild(hint);
      }
      return;
    }

    container.appendChild(this.renderRecentUsedSection());

    const providers: { id: CloudProvider; label: string; icon: string }[] = [
      { id: 'onprem', label: 'Local Resources', icon: '🏠' },
      { id: 'aws', label: 'AWS', icon: '🟧' },
      { id: 'azure', label: 'Azure', icon: '🔷' },
      { id: 'gcp', label: 'Google Cloud', icon: '🔴' },
    ];

    for (const provider of providers) {
      const items = cloudIconManifest.filter(icon => icon.provider === provider.id);
      if (items.length === 0) continue;

      const section = document.createElement('div');
      section.className = provider.id === this.focusedCloudProvider ? 'sidebar-section expanded' : 'sidebar-section';
      const title = document.createElement('div');
      title.className = 'sidebar-section-title';
      title.innerHTML = `${provider.icon} ${provider.label} <span style="opacity:0.6;font-weight:normal;">(${items.length})</span>`;
      title.onclick = () => section.classList.toggle('expanded');

      const content = document.createElement('div');
      content.className = 'sidebar-section-content';

      // Boundary icons (Region/VPC/Subnet/...) get their own "📐 Boundaries" group instead of
      // sitting in their raw manifest category — pulled out here so they don't also show up a
      // second time under e.g. AWS's "Groups" or Azure's "Networking"/"General".
      if (provider.id !== 'onprem') {
        content.appendChild(this.renderProviderBoundariesGroup(provider.id));
      }

      const byCategory = new Map<string, CloudIconEntry[]>();
      for (const icon of items) {
        if (isBoundaryIcon(icon)) continue;
        if (!byCategory.has(icon.category)) byCategory.set(icon.category, []);
        byCategory.get(icon.category)!.push(icon);
      }
      // Each category folds independently, collapsed by default — expanding a provider used to
      // dump every one of its icons (up to 714 for Azure) into view at once, grouped under
      // always-visible plain labels. Now expanding e.g. "Compute" only reveals Compute's items.
      for (const [category, categoryItems] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const catGroup = document.createElement('div');
        catGroup.className = 'cloud-icon-category collapsed';

        const catTitle = document.createElement('div');
        catTitle.className = 'cloud-icon-category-title';
        catTitle.innerHTML = `<span class="nav-tree-caret">▾</span> ${category} <span style="opacity:0.6;font-weight:normal;">(${categoryItems.length})</span>`;
        catTitle.onclick = () => catGroup.classList.toggle('collapsed');
        catGroup.appendChild(catTitle);

        const catContent = document.createElement('div');
        catContent.className = 'cloud-icon-category-content';
        for (const icon of categoryItems) {
          catContent.appendChild(this.makeCloudIconItem(icon));
        }
        catGroup.appendChild(catContent);

        content.appendChild(catGroup);
      }

      section.appendChild(title);
      section.appendChild(content);
      container.appendChild(section);
    }
  }

  private renderCatalog(containerEl?: HTMLElement) {
    const container = containerEl ?? this.container.querySelector('#catalog-container') as HTMLElement;
    if (!container) return;
    container.innerHTML = '';

    this.renderMyLibraryStrip(container);

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
        <div class="cat-icon" style="color:${accent}">${svgHtml}</div>
        <span class="cat-label">${label}</span>
        <span class="cat-count">${itemEls.length}</span>
        <div class="cat-chevron">${icon('<path d="M9 18l6-6-6-6"/>')}</div>
      `;

      const itemsEl = document.createElement('div');
      itemsEl.className = 'cat-items';
      itemEls.forEach(el => itemsEl.appendChild(el));

      row.addEventListener('click', () => {
        const isOpen = row.classList.contains('open');
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

    // ── 1. Racks Gallery Section ──
    const filteredRacks = RACK_TEMPLATES.filter(r =>
      r.name.toLowerCase().includes(this.searchTerm) ||
      r.description.toLowerCase().includes(this.searchTerm) ||
      r.badge.toLowerCase().includes(this.searchTerm)
    );

    const rackItemEls: HTMLElement[] = [];

    const customRackBtn = document.createElement('div');
    customRackBtn.className = 'cat-item';
    customRackBtn.setAttribute('draggable', 'true');
    customRackBtn.draggable = true;
    customRackBtn.style.cssText = 'border: 1px dashed rgba(0,229,255,0.4); background: rgba(0,229,255,0.06); font-weight: 600; color: #00e5ff; cursor: pointer;';
    customRackBtn.innerHTML = `
      <div class="cat-item-dot" style="background: #00e5ff;"></div>
      + Custom Rack Builder…
      <span class="cat-item-meta" style="color: #00e5ff;">Configurator</span>
    `;
    customRackBtn.onclick = () => customRackModal.show();
    rackItemEls.push(customRackBtn);

    filteredRacks.forEach(tpl => {
      const el = document.createElement('div');
      el.className = 'cat-item';
      el.draggable = true;
      el.title = `${tpl.name}\n${tpl.description}`;
      el.innerHTML = `
        <div class="cat-item-dot" style="background: #00e5ff;"></div>
        <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tpl.name}</div>
        <span class="cat-item-meta">${tpl.badge}</span>
      `;
      el.ondragstart = (e) => {
        e.dataTransfer?.setData('application/json', JSON.stringify({ rackTemplateId: tpl.id }));
      };
      el.onclick = () => {
        const nextX = 200 + State.getState().racks.length * 520;
        const newRack = createRackFromTemplate(tpl, nextX, 100);
        State.addRack(newRack);
        EventBus.emit('notification', { message: `Deployed ${tpl.name}`, type: 'success' });
      };
      rackItemEls.push(el);
    });

    appendRow(
      'Racks & Cabinets',
      '#00e5ff',
      icon('<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>'),
      rackItemEls
    );

    // ── Standard Device Categories ──
    for (const cat of RACK_CATEGORIES) {
      const allItems = [
        ...deviceCatalog.filter(d => d.category === cat.id),
        ...(State.getState().customTemplates ?? []).filter(d => d.category === cat.id),
      ].filter(item => item.name.toLowerCase().includes(this.searchTerm));

      if (cat.id === 'pdu') {
        const pduElements: HTMLElement[] = [];
        const verticalPdus = allItems.filter(item => item.mountType === 'side' || item.heightUnits === 0);
        const horizontalPdus = allItems.filter(item => item.mountType !== 'side' && item.heightUnits > 0);

        if (verticalPdus.length > 0) {
          const vPduHeader = document.createElement('div');
          vPduHeader.className = 'cat-subgroup-header';
          vPduHeader.style.cssText = 'padding: 6px 10px 4px; font-size: 10px; font-weight: 700; color: #fdd835; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(253,216,53,0.15); margin: 4px 0 2px; display: flex; align-items: center; justify-content: space-between;';
          vPduHeader.innerHTML = `<span>Vertical PDUs (0U Side-Mount)</span><span style="font-size: 9px; opacity: 0.8; color: #8b949e;">0U Rails</span>`;
          pduElements.push(vPduHeader);

          verticalPdus.forEach(item => {
            const el = document.createElement('div');
            el.className = 'cat-item';
            el.draggable = true;
            el.title = `${item.name}\nVertical 0U Side-Mount PDU\nDrag near rack rails to mount!`;
            el.innerHTML = `
              <div class="cat-item-dot" style="background: #fdd835;"></div>
              <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</div>
              <span class="cat-item-meta" style="color: #fdd835;">0U Side</span>
            `;
            el.ondragstart = (e) => {
              e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
            };
            pduElements.push(el);
          });
        }

        if (horizontalPdus.length > 0) {
          const hPduHeader = document.createElement('div');
          hPduHeader.className = 'cat-subgroup-header';
          hPduHeader.style.cssText = 'padding: 8px 10px 4px; font-size: 10px; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(251,191,36,0.15); margin: 6px 0 2px; display: flex; align-items: center; justify-content: space-between;';
          hPduHeader.innerHTML = `<span>Horizontal PDUs (Rackmount)</span><span style="font-size: 9px; opacity: 0.8; color: #8b949e;">1U / 2U</span>`;
          pduElements.push(hPduHeader);

          horizontalPdus.forEach(item => {
            const el = document.createElement('div');
            el.className = 'cat-item';
            el.draggable = true;
            el.title = `${item.name} (${item.heightUnits}U)`;
            el.innerHTML = `
              <div class="cat-item-dot" style="background: #fbbf24;"></div>
              <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</div>
              <span class="cat-item-meta">${item.heightUnits}U</span>
            `;
            el.ondragstart = (e) => {
              e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
            };
            pduElements.push(el);
          });
        }

        appendRow(cat.label, cat.accent, cat.svg, pduElements);
        continue;
      }

      const itemEls = allItems.map(item => {
        const el = document.createElement('div');
        el.className = 'cat-item';
        el.draggable = true;
        const meta = item.mountType === 'side' ? 'Side' : `${item.heightUnits}U`;
        const dot = document.createElement('div');
        dot.className = 'cat-item-dot';
        dot.style.background = cat.accent;
        const nameNode = document.createTextNode(item.name);
        const metaSpan = document.createElement('span');
        metaSpan.className = 'cat-item-meta';
        metaSpan.textContent = meta;
        el.append(dot, nameNode, metaSpan);
        el.ondragstart = (e) => {
          e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
        };
        return el;
      });

      appendRow(cat.label, cat.accent, cat.svg, itemEls);
    }

    // ── 2. Unified Cable Managers Category (Vertical & Horizontal Subtypes) ──
    const filteredVcms = VCM_TEMPLATES.filter(v =>
      v.name.toLowerCase().includes(this.searchTerm) ||
      v.description.toLowerCase().includes(this.searchTerm)
    );

    const horizontalCmItems = [
      ...deviceCatalog.filter(d => d.category === 'cable-manager'),
      ...(State.getState().customTemplates ?? []).filter(d => d.category === 'cable-manager'),
    ].filter(item => item.name.toLowerCase().includes(this.searchTerm));

    const cmElements: HTMLElement[] = [];

    // Vertical Cable Managers Sub-Type
    if (filteredVcms.length > 0) {
      const vcmSubHeader = document.createElement('div');
      vcmSubHeader.className = 'cat-subgroup-header';
      vcmSubHeader.style.cssText = 'padding: 6px 10px 4px; font-size: 10px; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(16,185,129,0.15); margin: 4px 0 2px; display: flex; align-items: center; justify-content: space-between;';
      vcmSubHeader.innerHTML = `<span>Vertical Cable Managers (VCM)</span><span style="font-size: 9px; opacity: 0.8; color: #8b949e;">Side Ducts</span>`;
      cmElements.push(vcmSubHeader);

      filteredVcms.forEach(tpl => {
        const el = document.createElement('div');
        el.className = 'cat-item';
        el.draggable = true;
        el.title = `${tpl.name}\n${tpl.description}\nDrag next to any rack to attach!`;
        el.innerHTML = `
          <div class="cat-item-dot" style="background: #10b981;"></div>
          <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${tpl.name}</div>
          <span class="cat-item-meta" style="color: #10b981;">${tpl.badge}</span>
        `;
        el.ondragstart = (e) => {
          e.dataTransfer?.setData('application/json', JSON.stringify({ vcmTemplateId: tpl.id }));
        };
        el.onclick = () => {
          const racks = State.getState().racks;
          if (racks.length === 0) {
            EventBus.emit('notification', { message: 'Add a rack to the canvas first, then attach VCM!', type: 'warning' });
            return;
          }
          const lastRack = racks[racks.length - 1];
          const updatedRacks = racks.map(r => r.id === lastRack.id ? { ...r, leftCableManagerWidth: tpl.width, rightCableManagerWidth: tpl.width } : r);
          State.setState({ racks: updatedRacks });
          EventBus.emit('notification', { message: `Attached Dual ${tpl.badge} VCM to ${lastRack.name}!`, type: 'success' });
        };
        cmElements.push(el);
      });
    }

    // Horizontal Cable Managers Sub-Type
    if (horizontalCmItems.length > 0) {
      const hcmSubHeader = document.createElement('div');
      hcmSubHeader.className = 'cat-subgroup-header';
      hcmSubHeader.style.cssText = 'padding: 8px 10px 4px; font-size: 10px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(56,189,248,0.15); margin: 6px 0 2px; display: flex; align-items: center; justify-content: space-between;';
      hcmSubHeader.innerHTML = `<span>Horizontal Cable Managers</span><span style="font-size: 9px; opacity: 0.8; color: #8b949e;">RU Panels</span>`;
      cmElements.push(hcmSubHeader);

      horizontalCmItems.forEach(item => {
        const el = document.createElement('div');
        el.className = 'cat-item';
        el.draggable = true;
        el.title = `${item.name} (${item.heightUnits}U)`;
        el.innerHTML = `
          <div class="cat-item-dot" style="background: #38bdf8;"></div>
          <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</div>
          <span class="cat-item-meta">${item.heightUnits}U</span>
        `;
        el.ondragstart = (e) => {
          e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
        };
        cmElements.push(el);
      });
    }

    appendRow(
      'Cable Managers',
      '#10b981',
      icon('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
      cmElements
    );

    const filteredCables = ALL_CABLE_ITEMS.filter(c =>
      c.name.toLowerCase().includes(this.searchTerm) ||
      c.label.toLowerCase().includes(this.searchTerm) ||
      c.description.toLowerCase().includes(this.searchTerm) ||
      c.category.toLowerCase().includes(this.searchTerm),
    );

    const cableItemEls = filteredCables.map(item => {
      const el = document.createElement('div');
      el.className = 'cat-item cat-cable-item';
      el.title = `${item.label} (${item.description}) — Click to start cabling`;
      el.innerHTML = `
        <div class="cat-cable-left">
          <div class="cat-cable-badge">
            ${getPortBadgeSvg(item.portBadgeType)}
          </div>
          <div class="cat-cable-graphic">
            ${getCableGraphicSvg(item.type, 75, 18)}
          </div>
        </div>
        <div class="cat-cable-info">
          <div class="cat-cable-name">${item.name}</div>
          <div class="cat-cable-meta">${item.description}</div>
        </div>
      `;
      el.addEventListener('click', () => {
        EventBus.emit('tool:changed', item.isPower ? 'power' : 'cable');
        State.setState({
          selectedCableType: item.type as any,
          selectedCableColor: item.defaultColor,
          selectedCableTermination: item.termination,
          selectedCableBend: 15,
        });
        EventBus.emit('state:changed', State.getState());
        EventBus.emit('notification', {
          message: `Selected ${item.label}. Click any port to start routing!`,
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
}
