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
  }

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

    this.container.appendChild(toolSection);
    this.container.appendChild(divider1);
    this.container.appendChild(mouseSection);
    this.container.appendChild(divider2);
    this.container.appendChild(statsSection);

    this.updateStats();
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
      'zoom-in': '🔍+',
      'zoom-out': '🔍-',
      'export-area': '📐'
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
  }
}
