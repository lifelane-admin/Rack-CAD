// "Rack Load Summary" and "Cable Types" as independent floating, draggable HTML panels
// overlaid on the canvas viewport — previously drawn as fixed SVG cards parallel to each rack
// (dashboard-renderer.ts); now screen-space overlays the user can drag anywhere, decoupled from
// canvas pan/zoom, matching how the floating toolbar already behaves. Both stay live via the
// same 'state:changed' subscription pattern used elsewhere (floating-toolbar.ts, statusbar.ts).
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { computeRackSummary, RackSummary } from '../utils/rack-summary';
import { makeDraggable, escapeHtml } from './floating-panel-utils';

function panelHeader(title: string, rackSelectHtml: string): string {
  return `
    <div class="fsp-header">
      <span class="fsp-drag-handle" title="Drag to reposition">⋮⋮</span>
      <span class="fsp-title">${title}</span>
      ${rackSelectHtml}
      <button class="fsp-collapse" title="Collapse/Expand">▾</button>
    </div>
  `;
}

function rackSelectHtml(racks: { id: string; name: string }[], selectedId: string): string {
  if (racks.length <= 1) return '';
  const options = racks.map(r => `<option value="${escapeHtml(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  return `<select class="fsp-rack-select">${options}</select>`;
}

abstract class BaseFloatingPanel {
  protected el: HTMLElement | null = null;
  protected selectedRackId: string | null = null;
  protected collapsed = false;
  private panelId: string;
  private defaultTop: number;
  private defaultRight: number;

  constructor(panelId: string, defaultTop: number, defaultRight: number) {
    this.panelId = panelId;
    this.defaultTop = defaultTop;
    this.defaultRight = defaultRight;
    this.init();
    eventBus.on('state:changed', () => this.render());
  }

  private init(): void {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;
    this.el = document.createElement('div');
    this.el.id = this.panelId;
    this.el.className = 'floating-summary-panel';
    this.el.style.top = `${this.defaultTop}px`;
    this.el.style.right = `${this.defaultRight}px`;
    viewport.appendChild(this.el);
    makeDraggable(this.el, '.fsp-drag-handle');
    this.render();
  }

  protected currentRack(racks: { id: string }[]): string {
    if (!this.selectedRackId || !racks.some(r => r.id === this.selectedRackId)) {
      this.selectedRackId = racks[0]?.id ?? null;
    }
    return this.selectedRackId ?? '';
  }

  protected wireCommon(): void {
    if (!this.el) return;
    this.el.querySelector('.fsp-collapse')?.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.render();
    });
    this.el.querySelector('.fsp-rack-select')?.addEventListener('change', (e: any) => {
      this.selectedRackId = e.target.value;
      this.render();
    });
  }

  abstract render(): void;
}

export class FloatingRackSummaryPanel extends BaseFloatingPanel {
  constructor() {
    super('floating-rack-summary', 16, 16);
  }

  render(): void {
    if (!this.el) return;
    const state = stateManager.getState();
    if (!state.showLegends || state.racks.length === 0) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';

    const rackId = this.currentRack(state.racks);
    const rack = state.racks.find(r => r.id === rackId)!;
    const summary = computeRackSummary(rack, state.devices, state.cables, state.customLegendItems);

    this.el.innerHTML = panelHeader('📊 RACK LOAD SUMMARY', rackSelectHtml(state.racks, rack.id));
    if (!this.collapsed) {
      this.el.insertAdjacentHTML('beforeend', `<div class="fsp-body">${this.bodyHtml(summary)}</div>`);
    }
    this.wireCommon();
  }

  private bodyHtml(s: RackSummary): string {
    const bullets = [
      `Objects: ${s.deviceCount} device${s.deviceCount === 1 ? '' : 's'}`,
      `Cables: ${s.cableCount}`,
      ...s.categoryRows.map(([label, count]) => `${label}: ${count}`),
      `PDUs: ${s.pduCount}`,
    ].map(t => `<div class="fsp-bullet">• ${escapeHtml(t)}</div>`).join('');

    return `
      ${bullets}
      ${this.gaugeHtml('Rack Capacity', s.usedRUs, s.totalRUs, 'U', s.capacitySeverityColor)}
      ${this.gaugeHtml('Power Draw', s.usedW, s.capacityW, 'W', s.powerSeverityColor)}
    `;
  }

  private gaugeHtml(label: string, used: number, capacity: number, unit: string, color: string): string {
    const text = capacity > 0
      ? `${label}: ${Math.round(used).toLocaleString()} / ${Math.round(capacity).toLocaleString()} ${unit} (${Math.round((used / capacity) * 100)}%)`
      : `${label}: ${Math.round(used).toLocaleString()} ${unit} (no capacity configured)`;
    const ratio = capacity > 0 ? Math.min(1, used / capacity) : (used > 0 ? 1 : 0);
    return `
      <div class="fsp-gauge">
        <div class="fsp-gauge-label">${escapeHtml(text)}</div>
        <div class="fsp-gauge-track"><div class="fsp-gauge-fill" style="width:${Math.max(0, ratio * 100)}%;background:${color};"></div></div>
      </div>
    `;
  }
}

export class FloatingCableSummaryPanel extends BaseFloatingPanel {
  constructor() {
    super('floating-cable-summary', 16, 320);
  }

  render(): void {
    if (!this.el) return;
    const state = stateManager.getState();
    if (!state.showLegends || state.racks.length === 0) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';

    const rackId = this.currentRack(state.racks);
    const rack = state.racks.find(r => r.id === rackId)!;
    const summary = computeRackSummary(rack, state.devices, state.cables, state.customLegendItems);

    this.el.innerHTML = panelHeader('🔌 CABLE TYPES', rackSelectHtml(state.racks, rack.id));
    if (!this.collapsed) {
      this.el.insertAdjacentHTML('beforeend', `<div class="fsp-body">${this.bodyHtml(summary)}</div>`);
    }
    this.wireCommon();
  }

  private bodyHtml(s: RackSummary): string {
    if (s.cableTypeRows.length === 0) {
      return `<div class="fsp-empty">(No cables routed yet)</div>`;
    }
    return s.cableTypeRows.map(row => `
      <div class="fsp-cable-row">
        <span class="fsp-swatch" style="background:${row.color}"></span>
        <span class="fsp-cable-label">${escapeHtml(row.label)}</span>
        ${row.count !== null ? `<span class="fsp-cable-count">× ${row.count}</span>` : ''}
      </div>
    `).join('');
  }
}
