import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode } from '../core/types';

export class StatusBar {
  private container: HTMLElement;
  private currentMode: ToolMode = 'select';
  private mousePos = { x: 0, y: 0 };
  private zoomLevel = 100;
  private stats = { racks: 0, devices: 0, cables: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    
    EventBus.on('tool:changed', (mode: ToolMode) => {
      this.currentMode = mode;
      this.updateDisplay();
    });

    EventBus.on('canvas:mousemove', (pos: {x: number, y: number}) => {
      this.mousePos = pos;
      this.updateDisplay();
    });

    EventBus.on('canvas:zoom', (level: number) => {
      this.zoomLevel = Math.round(level * 100);
      this.updateDisplay();
    });

    EventBus.on('state:changed', () => {
      this.updateStats();
    });

    EventBus.on('autosave:status-changed' as any, (data: any) => {
      this.updateAutosaveStatus(data);
    });
  }

  private autosaveText: string = '☁ Auto-Recovery Active';
  private autosaveColor: string = '#34d399';

  render() {
    this.container.innerHTML = '';
    this.container.className = 'status-bar';

    const toolSection = document.createElement('div');
    toolSection.className = 'status-section';
    toolSection.id = 'status-tool';

    const divider1 = document.createElement('div');
    divider1.className = 'status-divider';

    const mouseSection = document.createElement('div');
    mouseSection.className = 'status-section';
    mouseSection.id = 'status-mouse';

    const divider2 = document.createElement('div');
    divider2.className = 'status-divider';

    const statsSection = document.createElement('div');
    statsSection.className = 'status-section';
    statsSection.id = 'status-stats';

    const divider3 = document.createElement('div');
    divider3.className = 'status-divider';

    const autosaveSection = document.createElement('div');
    autosaveSection.className = 'status-section';
    autosaveSection.id = 'status-autosave';
    autosaveSection.style.cssText = 'cursor: pointer; display: flex; align-items: center; gap: 4px;';
    autosaveSection.title = 'Click to open Auto-Recovery Vault';
    autosaveSection.addEventListener('click', () => {
      EventBus.emit('autosave:open-vault' as any, undefined);
    });

    this.container.appendChild(toolSection);
    this.container.appendChild(divider1);
    this.container.appendChild(mouseSection);
    this.container.appendChild(divider2);
    this.container.appendChild(statsSection);
    this.container.appendChild(divider3);
    this.container.appendChild(autosaveSection);

    this.updateStats();
    this.updateDisplay();
  }

  private updateAutosaveStatus(data: any) {
    if (!data) return;
    if (data.status === 'unsaved') {
      this.autosaveText = '● Unsaved Draft (Autosaving...)';
      this.autosaveColor = '#fbbf24';
    } else if (data.status === 'autosaved') {
      const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      this.autosaveText = `☁ Autosaved (${time})`;
      this.autosaveColor = '#38bdf8';
    } else {
      this.autosaveText = '✓ Saved to File';
      this.autosaveColor = '#34d399';
    }
    this.updateDisplay();
  }

  private updateStats() {
    const state = (State as any).getState?.() || {};
    this.stats = {
      racks: state.racks?.length || 0,
      devices: state.devices?.length || 0,
      cables: state.cables?.length || 0
    };
    this.updateDisplay();
  }

  private updateDisplay() {
    const toolEl = this.container.querySelector('#status-tool');
    const mouseEl = this.container.querySelector('#status-mouse');
    const statsEl = this.container.querySelector('#status-stats');

    const toolIcons: Record<ToolMode, string> = {
      'select': '🔲',
      'pan': '✋',
      'cable': '🔗',
      'power': '🔌',
      'text': '🔤',
      'label': '🏷️',
      'zoom-in': '🔍+',
      'zoom-out': '🔍-',
      'export-area': '📐',
      'cloud-container': '⬚',
      'cloud-connect': '📡',
      'cloud-export-area': '📐'
    };

    if (toolEl) {
      toolEl.innerHTML = `<span>${toolIcons[this.currentMode] || ''}</span> ${this.currentMode.charAt(0).toUpperCase() + this.currentMode.slice(1)}`;
    }
    
    if (mouseEl) {
      mouseEl.innerHTML = `X: ${Math.round(this.mousePos.x)} Y: ${Math.round(this.mousePos.y)}`;
    }

    if (statsEl) {
      statsEl.innerHTML = `Zoom: ${this.zoomLevel}% | Racks: ${this.stats.racks} | Devices: ${this.stats.devices} | Cables: ${this.stats.cables}`;
    }

    const autosaveEl = this.container.querySelector('#status-autosave') as HTMLElement;
    if (autosaveEl) {
      autosaveEl.innerHTML = `<span style="color:${this.autosaveColor};font-weight:600;">${this.autosaveText}</span>`;
    }
  }
}
