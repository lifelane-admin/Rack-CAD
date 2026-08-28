import EventBus from '../core/event-bus';
import State from '../core/state';
import { computeRackSummary, getCableTypeDisplayName } from '../utils/rack-summary';
import { CABLE_COLORS } from '../core/types';

export function getConnectorSvg(type: string, isPower: boolean): string {
  const t = type.toLowerCase();
  if (isPower || t.includes('power') || t.includes('pwr') || t.includes('c13') || t.includes('c14') || t.includes('c19')) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ffb020" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;" title="Power Plug">
      <path d="M9 2v6"/>
      <path d="M15 2v6"/>
      <path d="M6 8h12a2 2 0 0 1 2 2v2a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2z" fill="rgba(255, 176, 32, 0.18)"/>
      <path d="M12 18v4"/>
    </svg>`;
  }
  if (t.includes('om') || t.includes('fiber') || t.includes('lc') || t.includes('sc') || t.includes('opt')) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;" title="Fiber Optic">
      <circle cx="7" cy="12" r="4" fill="rgba(0, 229, 255, 0.18)"/>
      <circle cx="17" cy="12" r="4" fill="rgba(0, 229, 255, 0.18)"/>
      <circle cx="7" cy="12" r="1.5" fill="#00e5ff"/>
      <circle cx="17" cy="12" r="1.5" fill="#00e5ff"/>
      <path d="M11 7h2"/>
      <path d="M11 17h2"/>
    </svg>`;
  }
  if (t.includes('sfp') || t.includes('qsfp') || t.includes('dac')) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a5d6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;" title="SFP Transceiver">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="rgba(165, 214, 255, 0.15)"/>
      <path d="M8 6v12"/>
      <path d="M16 10l-3 4-2-2"/>
    </svg>`;
  }
  // Default Ethernet / RJ45 Modular Port
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;" title="Ethernet Port">
    <rect x="3" y="4" width="18" height="16" rx="3" fill="rgba(88, 166, 255, 0.15)"/>
    <path d="M8 20v-4h8v4"/>
    <circle cx="8" cy="9" r="1" fill="#58a6ff"/>
    <circle cx="12" cy="9" r="1" fill="#58a6ff"/>
    <circle cx="16" cy="9" r="1" fill="#58a6ff"/>
  </svg>`;
}

export class ReportsFloat {
  private container: HTMLElement;
  private element: HTMLElement | null = null;
  private panelX = 16;
  private panelY = 80;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    const el = document.createElement('div');
    el.id = 'reports-float';
    el.className = 'reports-float';
    el.style.left = `${this.panelX}px`;
    el.style.top = `${this.panelY}px`;
    this.element = el;
    this.container.appendChild(el);

    this.render();
    this.setupDrag();

    // Comprehensive real-time event bindings
    const updateEvents = [
      'state:changed', 'cable:create', 'cable:update', 'cable:delete', 'cable:connected', 'cable:disconnected',
      'device:add', 'device:update', 'device:remove', 'device:move',
      'rack:add', 'rack:update', 'rack:remove',
      'port:connected', 'port:disconnected', 'power:update', 'project:load', 'history:undo', 'history:redo'
    ];
    updateEvents.forEach(evt => EventBus.on(evt as any, () => this.render()));
  }

  private render(): void {
    if (!this.element) return;
    const s = State.getState();
    const cables = s.cables ?? [];
    const devices = s.devices ?? [];
    const racks = s.racks ?? [];

    // ── Aggregate cable types & port types across all racks ───────────────
    const typeMap = new Map<string, { color: string; label: string; portType: string; cableType: string; isPower: boolean; count: number }>();
    for (const c of cables) {
      const srcPort = c.sourcePortId ? State.getPort(c.sourcePortId) : null;
      const destPort = c.destPortId ? State.getPort(c.destPortId) : null;
      const isPower = c.powerCableType === 'power'
        || c.type?.includes('power')
        || (c.sourcePortId?.startsWith('outlet-') || c.destPortId?.startsWith('outlet-'))
        || (srcPort?.type === 'power' || destPort?.type === 'power');

      const color = c.color || (CABLE_COLORS as any)[c.type] || (isPower ? '#212529' : '#78909c');
      const baseLabel = getCableTypeDisplayName(c.type, isPower);
      const portLabel = isPower
        ? 'Power'
        : (srcPort?.type ? srcPort.type.toUpperCase() : (destPort?.type ? destPort.type.toUpperCase() : 'Data'));

      const label = `${baseLabel} (${portLabel})`;
      const key = `${c.type}::${color}::${isPower}`;
      if (!typeMap.has(key)) {
        typeMap.set(key, {
          color,
          label,
          portType: portLabel,
          cableType: c.type,
          isPower,
          count: 0,
        });
      }
      typeMap.get(key)!.count++;
    }
    const cableRows = [...typeMap.values()].sort((a, b) => b.count - a.count);

    // ── Rack load summary (aggregate across all racks via computeRackSummary) ──
    let totalUnits = 0;
    let usedUnits = 0;
    let usedW = 0;
    let capacityW = 0;
    let totalDeviceCount = 0;
    const categoryTotals = new Map<string, number>();

    for (const rack of racks) {
      const summary = computeRackSummary(rack, devices, cables);
      totalUnits += summary.totalRUs;
      usedUnits += summary.usedRUs;
      usedW += summary.usedW;
      capacityW += summary.capacityW;
      totalDeviceCount += summary.deviceCount;
      for (const [label, count] of summary.categoryRows) {
        categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + count);
      }
    }

    const ruPct = totalUnits > 0 ? Math.round((usedUnits / totalUnits) * 100) : 0;
    const wPct = capacityW > 0 ? Math.round((usedW / capacityW) * 100) : 0;
    const ruColor = ruPct > 90 ? '#ef4444' : ruPct > 75 ? '#f59e0b' : '#10b981';
    const wColor = wPct > 90 ? '#ef4444' : wPct > 75 ? '#f59e0b' : '#38bdf8';

    const categoryRows = [...categoryTotals.entries()];

    // ── Render ─────────────────────────────────────────────────────────────
    this.element.innerHTML = `
      <div class="rf-handle" id="rf-handle">
        <span class="rf-title">Reports</span>
        <span class="rf-drag-dots">&#8942;&#8942;</span>
      </div>

      <div class="rf-section">
        <div class="rf-section-head">CABLE TYPES</div>
        ${cableRows.length === 0
          ? `<div class="rf-empty">No cables routed yet</div>`
          : cableRows.map(r => `
            <div class="rf-cable-row">
              <span class="rf-connector-icon">${getConnectorSvg(r.cableType, r.isPower)}</span>
              <span class="rf-cable-swatch ${r.isPower ? 'dashed' : ''}" style="border-top-color:${r.color};"></span>
              <span class="rf-cable-label" title="${r.label}">${r.label}</span>
              <span class="rf-cable-count">${r.count}</span>
            </div>`).join('')
        }
      </div>

      <div class="rf-divider"></div>

      <div class="rf-section">
        <div class="rf-section-head">RACK LOAD SUMMARY</div>
        <div class="rf-stat-row"><span>Racks</span><span>${racks.length}</span></div>
        <div class="rf-stat-row"><span>Devices</span><span>${totalDeviceCount}</span></div>
        <div class="rf-stat-row"><span>Cables</span><span>${cables.length}</span></div>
        ${categoryRows.map(([label, count]) => `
          <div class="rf-stat-row"><span>${label}</span><span>${count}</span></div>
        `).join('')}

        <div class="rf-gauge-label">
          <span>Rack Capacity</span>
          <span>${usedUnits} / ${totalUnits} U (${ruPct}%)</span>
        </div>
        <div class="rf-gauge-track">
          <div class="rf-gauge-fill" style="width:${ruPct}%;background:${ruColor}"></div>
        </div>

        ${capacityW > 0 ? `
        <div class="rf-gauge-label">
          <span>Power Draw</span>
          <span>${Math.round(usedW)}W / ${Math.round(capacityW)}W (${wPct}%)</span>
        </div>
        <div class="rf-gauge-track">
          <div class="rf-gauge-fill" style="width:${wPct}%;background:${wColor}"></div>
        </div>` : `
        <div class="rf-gauge-label">
          <span>Power Draw</span>
          <span>${Math.round(usedW)}W</span>
        </div>
        <div class="rf-gauge-track">
          <div class="rf-gauge-fill" style="width:0%;background:#78909c"></div>
        </div>`}
      </div>
    `;

    // Re-wire drag after re-render (innerHTML wipes old listeners)
    this.setupDrag();
  }

  private setupDrag(): void {
    if (!this.element) return;
    const handle = this.element.querySelector('#rf-handle') as HTMLElement | null;
    if (!handle) return;

    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxX = this.container.clientWidth - (this.element?.offsetWidth ?? 200) - 8;
      const maxY = this.container.clientHeight - (this.element?.offsetHeight ?? 300) - 8;
      this.panelX = Math.max(8, Math.min(maxX, startLeft + dx));
      this.panelY = Math.max(8, Math.min(maxY, startTop + dy));
      if (this.element) {
        this.element.style.left = `${this.panelX}px`;
        this.element.style.top = `${this.panelY}px`;
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = this.panelX;
      startTop = this.panelY;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}
