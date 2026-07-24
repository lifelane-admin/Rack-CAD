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
      { id: 'btn-new', icon: '📄', title: 'New', action: () => EventBus.emit('file:new', undefined) },
      { id: 'btn-open', icon: '📂', title: 'Open', action: () => this.handleOpen() },
      { id: 'btn-save', icon: '💾', title: 'Save', action: () => EventBus.emit('file:save', undefined) },
      { id: 'btn-demo', icon: '⭐', title: 'Load Demo Cluster', action: () => EventBus.emit('file:demo', undefined) }
    ]));
    
    inner.appendChild(this.createGroup('Tools', [
      { id: 'tool-select', icon: '🔲', title: 'Select', action: () => this.setTool('select'), toggle: true, defaultActive: true },
      { id: 'tool-pan', icon: '✋', title: 'Pan', action: () => this.setTool('pan'), toggle: true },
      { id: 'tool-cable', icon: '🔗', title: 'Cable', action: () => this.setTool('cable'), toggle: true },
      { id: 'tool-zoomin', icon: '🔍+', title: 'Zoom In', action: () => EventBus.emit('view:zoom-in', undefined) },
      { id: 'tool-zoomout', icon: '🔍-', title: 'Zoom Out', action: () => EventBus.emit('view:zoom-out', undefined) }
    ]));

    inner.appendChild(this.createGroup('Edit', [
      { id: 'btn-undo', icon: '↩️', title: 'Undo', action: () => EventBus.emit('edit:undo', undefined) },
      { id: 'btn-redo', icon: '↪️', title: 'Redo', action: () => EventBus.emit('edit:redo', undefined) },
      { id: 'btn-delete', icon: '🗑️', title: 'Delete', action: () => EventBus.emit('edit:delete', undefined) }
    ]));

    inner.appendChild(this.createGroup('View', [
      { id: 'btn-grid', icon: '▦', title: 'Grid Toggle', action: () => EventBus.emit('view:toggle-grid', undefined) },
      { id: 'btn-snap', icon: '🧲', title: 'Snap Toggle', action: () => EventBus.emit('view:toggle-snap', undefined) },
      { id: 'btn-rulers', icon: '📏', title: 'Rulers Toggle', action: () => EventBus.emit('view:toggle-rulers', undefined) },
      { id: 'btn-theme', icon: '🌓', title: 'Theme Toggle', action: () => EventBus.emit('view:toggle-theme', undefined) },
      { id: 'btn-legends', icon: '📝', title: 'Toggle Legends & Tables', action: () => EventBus.emit('view:toggle-legends', undefined) },
      { id: 'btn-legend-custom', icon: '🎨', title: 'Customize Network Legend & Cable Colors', action: () => EventBus.emit('legend:edit' as any, undefined) },
      { id: 'btn-reset-routing', icon: '🔄', title: 'Reset All Cable Routing (recalculate through side holes)', action: () => EventBus.emit('cable:reset-routing' as any, undefined) },
      { id: 'btn-reports', icon: '📊', title: 'Reports & Schedule', action: () => EventBus.emit('reports:toggle', undefined) }
    ]));

    inner.appendChild(this.createGroup('Add', [
      { id: 'btn-add-42u', icon: '➕', title: 'Add 42U Rack', action: () => EventBus.emit('rack:add', { units: 42 }) },
      { id: 'btn-add-48u', icon: '➕', title: 'Add 48U Rack', action: () => EventBus.emit('rack:add', { units: 48 }) }
    ]));

    inner.appendChild(this.createGroup('Export', [
      { id: 'btn-exp-svg', icon: '🖼️', title: 'Export SVG', action: () => EventBus.emit('export:svg', undefined) },
      { id: 'btn-exp-png', icon: '🖼️', title: 'Export PNG', action: () => EventBus.emit('export:png', undefined) },
      { id: 'btn-exp-jpg', icon: '📷', title: 'Export JPG', action: () => EventBus.emit('export:jpeg', undefined) },
      { id: 'btn-exp-pdf', icon: '📄', title: 'Export PDF', action: () => EventBus.emit('export:pdf', undefined) }
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
      if (file) {
        EventBus.emit('file:open', file);
      }
    };
    input.click();
  }
}
