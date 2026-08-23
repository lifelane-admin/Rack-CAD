import EventBus from '../core/event-bus';
import State from '../core/state';
import { computeRackSummary } from '../utils/rack-summary';

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

    EventBus.on('state:changed', () => this.render());
  }

  private render(): void {
    if (!this.element) return;
    const s = State.getState();
    const cables = s.cables ?? [];
    const devices = s.devices ?? [];
    const racks = s.racks ?? [];

    // ── Aggregate cable types across all racks ────────────────────────────
    const typeMap = new Map<string, { color: string; label: string; count: number }>();
    for (const c of cables) {
      const key = `${c.type}::${c.color ?? ''}`;
      if (!typeMap.has(key)) {
        typeMap.set(key, {
          color: c.color || '#78909c',
          label: c.displayName || c.name || c.type,
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
              <span class="rf-cable-swatch" style="background:${r.color}"></span>
              <span class="rf-cable-label">${r.label}</span>
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
        </div>` : `<div class="rf-empty">No power capacity configured</div>`}
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
