import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode } from '../core/types';

export class Toolbar {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'toolbar';
    
    // Create inner container
    const inner = document.createElement('div');
    inner.className = 'toolbar-inner';
    
    // Logo
    const logo = document.createElement('div');
    logo.className = 'toolbar-logo';
    logo.innerHTML = '<strong>RackCAD</strong>';
    inner.appendChild(logo);

    // Groups
    inner.appendChild(this.createGroup('File', [
      { 
        id: 'btn-new', 
        icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>', 
        title: 'New Workspace', 
        action: () => EventBus.emit('file:new', undefined) 
      },
      { 
        id: 'btn-open', 
        icon: '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>', 
        title: 'Open File', 
        action: () => this.handleOpen() 
      },
      { 
        id: 'btn-save', 
        icon: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>', 
        title: 'Save Project', 
        action: () => EventBus.emit('file:save', undefined) 
      },
      { 
        id: 'btn-demo', 
        icon: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>', 
        title: 'Load Demo Cluster', 
        action: () => EventBus.emit('file:demo', undefined) 
      }
    ]));
    
    inner.appendChild(this.createGroup('Tools', [
      { 
        id: 'tool-select', 
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/><path d="M13 13l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>', 
        title: 'Select Tool (V)', 
        action: () => this.setTool('select'), 
        toggle: true, 
        defaultActive: true 
      },
      { 
        id: 'tool-pan', 
        icon: '<svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 00-2-2v0a2 2 0 00-2 2v5m0-5V5a2 2 0 00-2-2v0a2 2 0 00-2 2v8m0-8V7a2 2 0 00-2-2v0a2 2 0 00-2 2v6m0-5V9a2 2 0 00-2-2v0a2 2 0 00-2 2v10a7 7 0 0014 0v-8"/></svg>', 
        title: 'Pan Tool (H)', 
        action: () => this.setTool('pan'), 
        toggle: true 
      },
      { 
        id: 'tool-cable', 
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="6" rx="1"></rect><rect x="3" y="15" width="6" height="6" rx="1"></rect><rect x="15" y="15" width="6" height="6" rx="1"></rect><path d="M12 9v4M6 15v-2h12v2"></path></svg>', 
        title: 'Draw Ethernet Cable (C)', 
        action: () => this.setTool('cable'), 
        toggle: true 
      },
      { 
        id: 'tool-zoomin', 
        icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>', 
        title: 'Zoom In', 
        action: () => EventBus.emit('view:zoom-in', undefined) 
      },
      { 
        id: 'tool-zoomout', 
        icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>', 
        title: 'Zoom Out', 
        action: () => EventBus.emit('view:zoom-out', undefined) 
      }
    ]));

    inner.appendChild(this.createGroup('Edit', [
      { 
        id: 'btn-undo', 
        icon: '<svg viewBox="0 0 24 24"><path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>', 
        title: 'Undo', 
        action: () => EventBus.emit('edit:undo', undefined) 
      },
      { 
        id: 'btn-redo', 
        icon: '<svg viewBox="0 0 24 24"><path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>', 
        title: 'Redo', 
        action: () => EventBus.emit('edit:redo', undefined) 
      },
      { 
        id: 'btn-delete', 
        icon: '<svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>', 
        title: 'Delete Selected (Del)', 
        action: () => EventBus.emit('edit:delete', undefined) 
      }
    ]));

    inner.appendChild(this.createGroup('View', [
      { 
        id: 'btn-grid', 
        icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>', 
        title: 'Toggle Grid', 
        action: () => EventBus.emit('view:toggle-grid', undefined) 
      },
      { 
        id: 'btn-snap', 
        icon: '<svg viewBox="0 0 24 24"><path d="M5 12V4a3 3 0 016 0v8a3 3 0 006 0V4m-6 16v2m-4-2v2m8-2v2"/></svg>', 
        title: 'Toggle Grid Snapping', 
        action: () => EventBus.emit('view:toggle-snap', undefined) 
      },
      { 
        id: 'btn-rulers', 
        icon: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 6v3M9 6v2M12 6v3M15 6v2M18 6v3"/></svg>', 
        title: 'Toggle Grid Rulers', 
        action: () => EventBus.emit('view:toggle-rulers', undefined) 
      },
      { 
        id: 'btn-theme', 
        icon: '<svg viewBox="0 0 24 24"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 7a5 5 0 100 10V7z" fill="currentColor"/></svg>', 
        title: 'Toggle Theme', 
        action: () => EventBus.emit('view:toggle-theme', undefined) 
      },
      { 
        id: 'btn-legends', 
        icon: '<svg viewBox="0 0 24 24"><path d="M9 11H3v5h6v-5zm8 0h-6v5h6v-5zm4-8H3a2 2 0 00-2 2v14a2 2 0 002 2h18a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H3V5h18v14z"/></svg>', 
        title: 'Toggle Legends & Tables', 
        action: () => EventBus.emit('view:toggle-legends', undefined) 
      },
      { 
        id: 'btn-legend-custom', 
        icon: '<svg viewBox="0 0 24 24"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C4.85857 19 6.5 16.5 8 16.5C9.5 16.5 9 19.5 11 20C12 20.25 12 22 12 22Z" stroke="currentColor"/><circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="14.5" r="1.5" fill="currentColor"/></svg>', 
        title: 'Customize Network Legend & Cable Colors', 
        action: () => EventBus.emit('legend:edit' as any, undefined) 
      },
      { 
        id: 'btn-reset-routing', 
        icon: '<svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l6.13-5.19"/></svg>', 
        title: 'Reset All Cable Routing', 
        action: () => EventBus.emit('cable:reset-routing' as any, undefined) 
      },
      { 
        id: 'btn-reports', 
        icon: '<svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6" stroke-linecap="round"/></svg>', 
        title: 'Reports & BOM Schedule', 
        action: () => EventBus.emit('reports:toggle', undefined) 
      }
    ]));

    inner.appendChild(this.createGroup('Add', [
      { 
        id: 'btn-add-42u', 
        icon: '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 7h16M4 12h16M4 17h16M8 4.5h8"/></svg>', 
        title: 'Add 42U Server Cabinet', 
        action: () => EventBus.emit('rack:add', { units: 42 }) 
      },
      { 
        id: 'btn-add-48u', 
        icon: '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 7h16M4 12h16M4 17h16M8 4.5h8"/></svg>', 
        title: 'Add 48U Server Cabinet', 
        action: () => EventBus.emit('rack:add', { units: 48 }) 
      }
    ]));

    inner.appendChild(this.createGroup('Export', [
      { 
        id: 'btn-exp-svg', 
        icon: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>', 
        title: 'Export SVG Layout...', 
        action: () => EventBus.emit('export:svg', undefined) 
      },
      { 
        id: 'btn-exp-png', 
        icon: '<svg viewBox="0 0 24 24"><path d="M12 22C17.52 22 22 17.52 22 12S17.52 2 12 2 2 6.48 2 12s4.48 10 12 10z"/><path d="M8 12h8M12 8l4 4-4 4"/></svg>', 
        title: 'Export PNG Image...', 
        action: () => EventBus.emit('export:png', undefined) 
      },
      { 
        id: 'btn-exp-jpg', 
        icon: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>', 
        title: 'Export JPEG Image...', 
        action: () => EventBus.emit('export:jpeg', undefined) 
      },
      { 
        id: 'btn-exp-pdf', 
        icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/></svg>', 
        title: 'Export PDF Document...', 
        action: () => EventBus.emit('export:pdf', undefined) 
      }
    ]));

    this.container.appendChild(inner);

    EventBus.on('tool:changed', (mode: ToolMode) => {
      this.container.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = this.container.querySelector(`#tool-${mode}`);
      if (activeBtn) activeBtn.classList.add('active');
    });
  }

  private createGroup(name: string, buttons: any[]) {
    const group = document.createElement('div');
    group.className = 'toolbar-group';
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'toolbar-buttons';
    
    buttons.forEach(btnInfo => {
      const btn = document.createElement('button');
      btn.id = btnInfo.id;
      btn.className = `toolbar-btn ${btnInfo.toggle ? 'tool-btn' : ''} ${btnInfo.defaultActive ? 'active' : ''}`;
      btn.title = btnInfo.title;
      btn.innerHTML = btnInfo.icon;
      btn.onclick = btnInfo.action;
      buttonsContainer.appendChild(btn);
    });

    const label = document.createElement('div');
    label.className = 'toolbar-group-label';
    label.innerText = name;
    
    group.appendChild(buttonsContainer);
    group.appendChild(label);
    
    const separator = document.createElement('div');
    separator.className = 'toolbar-separator';
    group.appendChild(separator);

    return group;
  }

  private setTool(mode: ToolMode) {
    EventBus.emit('tool:changed', mode);
  }

  private handleOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt: any) => {
        EventBus.emit('project:load' as any, evt.target.result);
      };
      reader.readAsText(file);
    };
    input.click();
  }
}
