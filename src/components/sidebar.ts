import EventBus from '../core/event-bus';
import State from '../core/state';
import { deviceCatalog, getTemplate } from '../library/device-catalog';
import { DeviceCategory, DeviceTemplate } from '../core/types';
import { CustomAssetModal } from './custom-asset-modal';
import { deleteCustomTemplate, exportCustomLibraryJSON, parseCustomLibraryJSON } from '../library/custom-catalog';

export class Sidebar {
  private container: HTMLElement;
  private searchTerm: string = '';
  private customAssetModal = new CustomAssetModal();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'sidebar';

    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.innerHTML = `
      <h3>Components</h3>
      <button class="collapse-btn" title="Collapse">«</button>
    `;
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'sidebar-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search components...';
    searchInput.oninput = (e: any) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.renderCatalog();
    };
    searchContainer.appendChild(searchInput);

    const catalogContainer = document.createElement('div');
    catalogContainer.className = 'sidebar-catalog';
    catalogContainer.id = 'catalog-container';

    this.container.appendChild(header);
    this.container.appendChild(searchContainer);
    this.container.appendChild(catalogContainer);

    header.querySelector('.collapse-btn')?.addEventListener('click', () => {
      this.container.classList.toggle('collapsed');
    });

    this.renderCatalog();
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
