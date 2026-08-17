import EventBus from '../core/event-bus';
import State from '../core/state';
import { deviceCatalog, getTemplate } from '../library/device-catalog';
import { DeviceCategory, DeviceTemplate, CloudProvider, CloudContainer } from '../core/types';
import { CustomAssetModal } from './custom-asset-modal';
import { deleteCustomTemplate, exportCustomLibraryJSON, parseCustomLibraryJSON } from '../library/custom-catalog';
import { cloudIconManifest, CloudIconEntry, getCloudIcon, isBoundaryIcon, BOUNDARY_MENU_KINDS, getBoundaryIconsByKind } from '../library/cloud-icon-catalog';
import { recordIconUse, recordBoundaryUse, getRecentUsage } from '../library/recent-usage';

const CLOUD_SEARCH_RESULT_CAP = 150;
let cloudSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

interface NavLeaf {
  label: string;
  icon: string;
  view: 'rack' | 'cloud';
  provider?: CloudProvider;
}
interface NavGroup {
  label: string;
  icon: string;
  children: NavLeaf[];
}

/** Top-level workspace navigation — the primary way to switch between the On-Prem rack
 *  elevation workspace and the Cloud Architecture canvas (per-provider entry points). Always
 *  rendered above the search/catalog, regardless of which view is currently active. */
const NAV_TREE: NavGroup[] = [
  {
    label: 'On-Prem Infrastructure', icon: '🏢', children: [
      { label: 'Rack Development', icon: '📦', view: 'rack' },
    ],
  },
  {
    label: 'Cloud', icon: '☁️', children: [
      { label: 'AWS', icon: '🟧', view: 'cloud', provider: 'aws' },
      { label: 'Azure', icon: '🔷', view: 'cloud', provider: 'azure' },
      { label: 'GCP', icon: '🔴', view: 'cloud', provider: 'gcp' },
      { label: 'Local Resources', icon: '🏠', view: 'cloud', provider: 'onprem' },
    ],
  },
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
    const isCloud = State.getState().activeView === 'cloud';

    this.container.innerHTML = '';
    this.container.className = 'sidebar';

    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.innerHTML = `
      <h3>${isCloud ? 'Cloud Services' : 'Components'}</h3>
      <button class="collapse-btn" title="Collapse">«</button>
    `;

    const navTree = document.createElement('div');
    navTree.className = 'sidebar-nav-tree';
    this.renderNavTree(navTree);

    const searchContainer = document.createElement('div');
    searchContainer.className = 'sidebar-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    const providerLabels: Record<CloudProvider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP', onprem: 'Local Resources' };
    searchInput.placeholder = isCloud
      ? (this.focusedCloudProvider ? `Search ${providerLabels[this.focusedCloudProvider]} services...` : 'Search AWS/Azure/GCP/Local services...')
      : 'Search components...';
    searchInput.oninput = (e: any) => {
      this.searchTerm = e.target.value.toLowerCase();
      if (isCloud) {
        // Debounced — filtering runs across all 1274 manifest entries + a full DOM rebuild on
        // every keystroke would otherwise feel sluggish at this list size (unlike the ~77-item
        // device catalog this search box normally filters).
        if (cloudSearchDebounceTimer) clearTimeout(cloudSearchDebounceTimer);
        cloudSearchDebounceTimer = setTimeout(() => this.renderCloudPalette(), 150);
      } else {
        this.renderCatalog();
      }
    };
    searchContainer.appendChild(searchInput);

    const catalogContainer = document.createElement('div');
    catalogContainer.className = 'sidebar-catalog';
    catalogContainer.id = 'catalog-container';

    this.container.appendChild(header);
    this.container.appendChild(navTree);
    this.container.appendChild(searchContainer);
    this.container.appendChild(catalogContainer);

    header.querySelector('.collapse-btn')?.addEventListener('click', () => {
      this.container.classList.toggle('collapsed');
    });

    if (isCloud) {
      this.renderCloudPalette();
    } else {
      this.renderCatalog();
    }
  }

  private renderMyLibrary(container: HTMLElement): void {
    const state = State.getState();
    const customTemplates = state.customTemplates ?? [];

    const section = document.createElement('div');
    section.className = 'sidebar-section expanded';
    section.id = 'my-library-section';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

    const title = document.createElement('div');
    title.className = 'sidebar-section-title';
    title.style.flex = '1';
    title.textContent = '⭐ My Library';
    title.onclick = () => section.classList.toggle('expanded');
    titleRow.appendChild(title);

    const importBtn = document.createElement('button');
    importBtn.textContent = '+ Import';
    importBtn.title = 'Import custom library from JSON file';
    importBtn.style.cssText = 'font-size:10px;padding:2px 6px;border:1px solid #30363d;background:transparent;color:#8b949e;border-radius:3px;cursor:pointer;margin-right:4px;';
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
            this.renderCatalog();
          } catch (err) {
            EventBus.emit('notification' as any, { message: `Import failed: ${err}`, type: 'error' });
          }
        };
        reader.readAsText(file);
      };
      input.click();
    };
    titleRow.appendChild(importBtn);
    section.appendChild(titleRow);

    const content = document.createElement('div');
    content.className = 'sidebar-section-content';

    if (customTemplates.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:11px;color:#8b949e;font-style:italic;padding:8px 4px;margin:0;';
      empty.textContent = 'No custom assets yet. Select a device on canvas and click "Save as Custom Asset" in Properties.';
      content.appendChild(empty);
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
            <div class="item-meta">${item.heightUnits > 0 ? item.heightUnits + 'U' : 'Accessory'} • Custom</div>
          </div>
        `;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:2px;flex-shrink:0;';

        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.title = 'Edit custom asset';
        editBtn.style.cssText = 'background:none;border:none;color:#8b949e;cursor:pointer;font-size:13px;padding:2px 4px;';
        editBtn.onclick = (e) => {
          e.stopPropagation();
          const fakeDevice: any = {
            id: '__edit__',
            name: item.name,
            hostname: '',
            managementIp: '',
            serialNumber: '',
            description: item.customDescription ?? '',
            templateId: item.id,
            rackId: '',
            startUnit: 1,
            ports: item.ports.map(p => ({ ...p, deviceId: '__edit__', connected: false, cableId: null })),
            frontPanelImage: item.frontPanelImage,
          };
          const base = getTemplate(item.basedOnTemplateId ?? '') ?? null;
          this.customAssetModal.show(fakeDevice, base, item, (_saved) => {
            this.renderCatalog();
          });
        };

        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.title = 'Delete custom asset';
        delBtn.style.cssText = 'background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:2px 4px;';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`Delete custom asset "${item.name}"? Devices already placed on the canvas will keep their appearance.`)) return;
          deleteCustomTemplate(item.id);
          const newTemplates = (State.getState().customTemplates ?? []).filter(t => t.id !== item.id);
          State.setState({ customTemplates: newTemplates });
          this.renderCatalog();
        };

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        el.appendChild(leftPart);
        el.appendChild(actions);

        el.ondragstart = (e) => {
          e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
        };

        content.appendChild(el);
      });

      const exportBtn = document.createElement('button');
      exportBtn.textContent = 'Export My Library';
      exportBtn.title = 'Download all custom assets as JSON';
      exportBtn.style.cssText = 'margin:6px 4px 2px;font-size:11px;padding:4px 10px;border:1px solid #30363d;background:transparent;color:#8b949e;border-radius:4px;cursor:pointer;width:calc(100% - 8px);';
      exportBtn.onclick = () => exportCustomLibraryJSON(customTemplates);
      content.appendChild(exportBtn);
    }

    section.appendChild(content);
    container.appendChild(section);
  }

  private renderNavTree(container: HTMLElement): void {
    const state = State.getState();
    container.innerHTML = '';

    for (const group of NAV_TREE) {
      const groupEl = document.createElement('div');
      groupEl.className = 'nav-tree-group';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'nav-tree-group-title';
      groupTitle.innerHTML = `<span class="nav-tree-caret">▾</span> ${group.icon} ${group.label}`;
      groupTitle.onclick = () => groupEl.classList.toggle('collapsed');
      groupEl.appendChild(groupTitle);

      const childrenEl = document.createElement('div');
      childrenEl.className = 'nav-tree-children';
      for (const leaf of group.children) {
        const isActive = leaf.view === 'rack'
          ? state.activeView === 'rack'
          : state.activeView === 'cloud' && (leaf.provider ?? null) === this.focusedCloudProvider;

        const leafEl = document.createElement('div');
        leafEl.className = `nav-tree-leaf${isActive ? ' active' : ''}`;
        leafEl.innerHTML = `${leaf.icon} <span>${leaf.label}</span>`;
        leafEl.onclick = () => {
          this.focusedCloudProvider = leaf.provider ?? null;
          this.searchTerm = '';
          EventBus.emit('view:switch', leaf.view);
        };
        childrenEl.appendChild(leafEl);
      }
      groupEl.appendChild(childrenEl);
      container.appendChild(groupEl);
    }
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
  private renderCloudPalette(): void {
    const container = this.container.querySelector('#catalog-container') as HTMLElement;
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

  private renderCatalog() {
    const container = this.container.querySelector('#catalog-container') as HTMLElement;
    if (!container) return;

    container.innerHTML = '';

    this.renderMyLibrary(container);

    const categories: { id: DeviceCategory, label: string, icon: string }[] = [
      { id: 'server',       label: 'Servers',          icon: '🖥️' },
      { id: 'switch',       label: 'Network Switches',  icon: '🔀' },
      { id: 'router',       label: 'Routers',           icon: '🌐' },
      { id: 'firewall',     label: 'Firewalls',         icon: '🛡️' },
      { id: 'nac',          label: 'NAC Appliances',    icon: '🔐' },
      { id: 'storage',      label: 'Storage',           icon: '💾' },
      { id: 'console',      label: 'KVM & Console',     icon: '📟' },
      { id: 'patch-panel',  label: 'Patch Panels',      icon: '🔲' },
      { id: 'pdu',          label: 'PDU',               icon: '🔌' },
      { id: 'ats',          label: 'ATS Switches',      icon: '🔁' },
      { id: 'ups',          label: 'UPS',               icon: '⚡' },
      { id: 'cooling',      label: 'Cooling',           icon: '❄️' },
      { id: 'blank-panel',  label: 'Blank Panels',      icon: '▬' },
      { id: 'cable-manager', label: 'Cable Management', icon: '📂' },
    ];

    const grouped = categories.reduce((acc, cat) => {
      if (!acc[cat.label]) acc[cat.label] = { icon: cat.icon, items: [] };
      acc[cat.label].items.push(...deviceCatalog.filter(d => d.category === cat.id));
      return acc;
    }, {} as Record<string, { icon: string, items: DeviceTemplate[] }>);

    for (const [groupName, groupData] of Object.entries(grouped)) {
      const filteredItems = groupData.items.filter(item =>
        item.name.toLowerCase().includes(this.searchTerm)
      );

      if (filteredItems.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'sidebar-section';
      
      const title = document.createElement('div');
      title.className = 'sidebar-section-title';
      title.innerHTML = `${groupData.icon} ${groupName}`;
      title.onclick = () => {
        section.classList.toggle('expanded');
      };
      
      const content = document.createElement('div');
      content.className = 'sidebar-section-content';

      filteredItems.forEach(item => {
        const el = document.createElement('div');
        el.className = `catalog-item category-${item.category}`;
        el.draggable = true;
        el.innerHTML = `
          <div class="item-icon">${item.icon}</div>
          <div class="item-details">
            <div class="item-name">${item.name}</div>
            <div class="item-meta">${item.mountType === 'side' ? '0U · Side-Mount' : item.heightUnits + 'U'} • ${item.ports.length > 0 ? item.ports.length + ' ports' : item.outletConfig ? item.outletConfig.reduce((s, r) => s + r.count, 0) + ' outlets' : 'no ports'}</div>
          </div>
        `;
        
        el.ondragstart = (e) => {
          e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
        };

        content.appendChild(el);
      });

      section.appendChild(title);
      section.appendChild(content);
      section.classList.add('expanded');
      container.appendChild(section);
    }

    // Add custom "Cables" section
    const cableTemplates = [
      { id: 'cable-eth', name: 'Cat6 Ethernet Cable (RJ45)', icon: '🔗', type: 'vm-network', color: '#fb8c00', termination: 'RJ45 Ethernet', description: 'Orange VM/Data Ethernet' },
      { id: 'cable-mgmt', name: 'iDRAC / Mgmt Cable (RJ45)', icon: '🔗', type: 'idrac', color: '#e53935', termination: 'RJ45 Ethernet', description: 'Red Out-of-band management' },
      { id: 'cable-fiber', name: 'Fiber Patch Cable (LC-Fiber)', icon: '⚡', type: 'ceph-primary', color: '#43a047', termination: 'LC-Fiber', description: 'Green High-speed Fiber' },
      { id: 'cable-power', name: 'C13/C14 Power Cord (Power)', icon: '🔌', type: 'power', color: '#212529', termination: 'C13/C14 Power', description: 'Black Heavy-duty AC Power' },
      { id: 'cable-console', name: 'Console Serial Cable (DB9)', icon: '📟', type: 'general', color: '#78909c', termination: 'Console DB9', description: 'Grey Console connection' }
    ];

    const filteredCables = cableTemplates.filter(c =>
      c.name.toLowerCase().includes(this.searchTerm) ||
      c.description.toLowerCase().includes(this.searchTerm)
    );

    if (filteredCables.length > 0) {
      const section = document.createElement('div');
      section.className = 'sidebar-section expanded';
      
      const title = document.createElement('div');
      title.className = 'sidebar-section-title';
      title.innerHTML = `🔗 Cables & Connections`;
      title.onclick = () => {
        section.classList.toggle('expanded');
      };
      
      const content = document.createElement('div');
      content.className = 'sidebar-section-content';

      filteredCables.forEach(item => {
        const el = document.createElement('div');
        el.className = 'catalog-item';
        el.style.borderLeft = `4px solid ${item.color}`;
        el.innerHTML = `
          <div class="item-icon">${item.icon}</div>
          <div class="item-details">
            <div class="item-name" style="font-weight: 500;">${item.name}</div>
            <div class="item-meta" style="font-size: 10px;">${item.description}</div>
          </div>
        `;
        
        el.onclick = () => {
          EventBus.emit('tool:changed', 'cable');
          State.setState({
            selectedCableType: item.type as any,
            selectedCableColor: item.color,
            selectedCableTermination: item.termination,
            selectedCableBend: 15
          });
          EventBus.emit('notification', { 
            message: `Selected ${item.name}. Click any port to start routing!`, 
            type: 'info' 
          });
        };

        content.appendChild(el);
      });

      section.appendChild(title);
      section.appendChild(content);
      container.appendChild(section);
    }
  }
}
