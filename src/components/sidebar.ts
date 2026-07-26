import EventBus from '../core/event-bus';
import State from '../core/state';
import { deviceCatalog } from '../library/device-catalog';
import { DeviceCategory, DeviceTemplate } from '../core/types';

export class Sidebar {
  private container: HTMLElement;
  private searchTerm: string = '';

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

  private renderCatalog() {
    const container = this.container.querySelector('#catalog-container') as HTMLElement;
    if (!container) return;
    
    container.innerHTML = '';

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
            <div class="item-meta">${item.heightUnits > 0 ? item.heightUnits + 'U' : 'Accessory'} • ${item.ports.length} ports</div>
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
