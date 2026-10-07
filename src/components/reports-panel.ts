import EventBus from '../core/event-bus';
import State, { stateManager } from '../core/state';
import { CableData, PortData, DeviceData } from '../core/types';

export class ReportsPanel {
  private element: HTMLElement | null = null;
  private activeTab: 'schedule' | 'bom' | 'validation' | 'matrix' = 'schedule';

  constructor() {
    EventBus.on('reports:toggle', () => {
      this.toggle();
    });
    // Re-render if state changes while open
    EventBus.on('state:changed', () => {
      if (this.element && !this.element.classList.contains('hidden')) {
        this.renderContent();
      }
    });
  }

  toggle() {
    if (!this.element) {
      this.init();
    }
    if (this.element) {
      this.element.classList.toggle('hidden');
      if (!this.element.classList.contains('hidden')) {
        this.renderContent();
      }
    }
  }

  private init() {
    this.element = document.createElement('div');
    this.element.id = 'reports-overlay';
    this.element.className = 'reports-overlay hidden';

    document.body.appendChild(this.element);
  }

  private renderContent() {
    if (!this.element) return;

    const s = stateManager.getState();
    const cables = s.cables;
    const devices = s.devices;
    const alerts = s.validationAlerts;

    this.element.innerHTML = `
      <div class="reports-dialog">
        <div class="reports-header">
          <h2>📊 Cable Engine Reports & Documentation</h2>
          <button class="reports-close-btn">&times;</button>
        </div>
        
        <div class="reports-tabs">
          <button class="tab-btn ${this.activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">📋 Cable Schedule</button>
          <button class="tab-btn ${this.activeTab === 'bom' ? 'active' : ''}" data-tab="bom">📦 Bill of Materials</button>
          <button class="tab-btn ${this.activeTab === 'validation' ? 'active' : ''}" data-tab="validation">⚠️ Validation Log (${alerts.length})</button>
          <button class="tab-btn ${this.activeTab === 'matrix' ? 'active' : ''}" data-tab="matrix">🕸️ Port Connectivity Matrix</button>
        </div>

        <div class="reports-body">
          ${this.renderActiveTabContent(cables, devices)}
        </div>

        <div class="reports-footer">
          <div class="reports-actions">
            <button class="btn-action btn-primary" id="btn-export-excel" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 8px rgba(16,185,129,0.3);">📊 Export Blueprint Excel (.xlsx)</button>
            <button class="btn-action btn-secondary" id="btn-export-csv">📥 Export CSV</button>
            <button class="btn-action btn-secondary" id="btn-export-json">📥 Export JSON</button>
          </div>
          <span style="font-size: 11px; color: var(--text-secondary);">Total Cables: ${cables.length} | Bundles: ${s.bundles.length}</span>
        </div>
      </div>
    `;

    // Bind event listeners
    this.element.querySelector('.reports-close-btn')?.addEventListener('click', () => this.toggle());
    
    this.element.querySelector('#btn-export-excel')?.addEventListener('click', () => {
      EventBus.emit('export:excel' as any, undefined);
    });

    this.element.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        this.activeTab = e.target.getAttribute('data-tab') as any;
        this.renderContent();
      });
    });

    this.element.querySelector('#btn-export-csv')?.addEventListener('click', () => this.exportCSV(cables));
    this.element.querySelector('#btn-export-json')?.addEventListener('click', () => this.exportJSON(cables));

    // Bind locate / zoom handlers
    this.element.querySelectorAll('.locate-cable-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const cableId = e.target.getAttribute('data-cable-id');
        this.locateCable(cableId);
      });
    });
  }

  private renderActiveTabContent(cables: CableData[], devices: DeviceData[]): string {
    const s = stateManager.getState();
    const alerts = s.validationAlerts;

    const findPort = (portId: string): PortData | null => {
      for (const d of devices) {
        const p = d.ports.find(x => x.id === portId);
        if (p) return p;
      }
      return null;
    };

    const findDeviceOfPort = (portId: string): DeviceData | null => {
      for (const d of devices) {
        if (d.ports.some(x => x.id === portId)) return d;
      }
      return null;
    };

    if (this.activeTab === 'schedule') {
      if (cables.length === 0) {
        return `<div class="reports-empty">No cable connections documented yet. Use the Cable Tool to route cables!</div>`;
      }
      return `
        <table class="reports-table">
          <thead>
            <tr>
              <th>ID / Name</th>
              <th>Type</th>
              <th>Medium</th>
              <th>Source Port</th>
              <th>Destination Port</th>
              <th>Length</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${cables.map(c => {
              const srcPort = c.sourcePortId ? findPort(c.sourcePortId) : null;
              const srcDev = srcPort ? findDeviceOfPort(srcPort.id) : null;
              const destPort = c.destPortId ? findPort(c.destPortId) : null;
              const destDev = destPort ? findDeviceOfPort(destPort.id) : null;

              const srcStr = srcDev ? `${srcDev.name} - ${srcPort?.name}` : 'Unknown';
              const destStr = destDev ? `${destDev.name} - ${destPort?.name}` : (c.floatingDest ? 'Floating Gutter' : 'Unconnected');

              return `
                <tr>
                  <td><strong>${c.displayName || c.name}</strong></td>
                  <td class="text-capitalize">${c.type}</td>
                  <td>${c.medium || 'General Copper'}</td>
                  <td><span class="badge badge-port">${srcStr}</span></td>
                  <td><span class="badge badge-port">${destStr}</span></td>
                  <td>${c.length ? c.length + 'm' : 'Auto'}</td>
                  <td><span class="badge status-${c.status || 'active'}">${c.status || 'active'}</span></td>
                  <td><button class="btn-action locate-cable-btn" data-cable-id="${c.id}">🔍 Locate</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    if (this.activeTab === 'bom') {
      // Aggregate quantities by type/category
      const bomData: Record<string, { count: number; totalLength: number; totalWeight: number; color: string }> = {};

      cables.forEach(c => {
        const typeKey = c.type.toUpperCase();
        if (!bomData[typeKey]) {
          bomData[typeKey] = { count: 0, totalLength: 0, totalWeight: 0, color: c.color };
        }
        bomData[typeKey].count++;
        bomData[typeKey].totalLength += c.length || 2.0; // default estimated 2 meters if auto
        bomData[typeKey].totalWeight += c.weight || 0.1;  // default 0.1 kg
      });

      const categories = Object.keys(bomData);
      if (categories.length === 0) {
        return `<div class="reports-empty">No materials registered. Add cables to view the inventory report.</div>`;
      }

      return `
        <div class="bom-grid">
          <table class="reports-table">
            <thead>
              <tr>
                <th>Cable Type</th>
                <th>Quantity</th>
                <th>Est. Total Length (meters)</th>
                <th>Est. Total Weight (kg)</th>
              </tr>
            </thead>
            <tbody>
              ${categories.map(cat => `
                <tr>
                  <td>
                    <span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:${bomData[cat].color}; margin-right:8px; vertical-align:middle;"></span>
                    <strong>${cat}</strong>
                  </td>
                  <td>${bomData[cat].count}</td>
                  <td>${bomData[cat].totalLength.toFixed(1)}m</td>
                  <td>${bomData[cat].totalWeight.toFixed(2)} kg</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (this.activeTab === 'validation') {
      if (alerts.length === 0) {
        return `
          <div class="validation-success-box">
            <span style="font-size:32px;">✔</span>
            <h3>No Validation Warnings!</h3>
            <p>Your patch connectivity is perfectly aligned. All connections conform to speed, medium, and separation specifications.</p>
          </div>
        `;
      }

      return `
        <table class="reports-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Category</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            ${alerts.map(a => `
              <tr>
                <td><span class="badge severity-${a.type}">${a.type.toUpperCase()}</span></td>
                <td class="text-capitalize"><strong>${a.category}</strong></td>
                <td>${a.message}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    if (this.activeTab === 'matrix') {
      // Connective Port Mapping table
      return `
        <table class="reports-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Port Name</th>
              <th>Connected Port</th>
              <th>Speed</th>
            </tr>
          </thead>
          <tbody>
            ${devices.flatMap(d => d.ports.map(p => {
              const cable = p.cableId ? cables.find(c => c.id === p.cableId) : null;
              let connectionStr = 'Unconnected';
              let speedStr = p.speed || '1 Gbps';
              if (cable) {
                const otherPortId = cable.sourcePortId === p.id ? cable.destPortId : cable.sourcePortId;
                if (otherPortId) {
                  const otherPort = findPort(otherPortId);
                  const otherDev = otherPort ? findDeviceOfPort(otherPortId) : null;
                  connectionStr = otherDev ? `${otherDev.name} → ${otherPort?.name}` : 'Floating';
                } else {
                  connectionStr = 'Floating';
                }
              }
              return `
                <tr>
                  <td><strong>${d.name}</strong></td>
                  <td><span class="badge badge-port">${p.name}</span></td>
                  <td><span class="badge ${cable ? 'badge-connected' : 'badge-unconnected'}">${connectionStr}</span></td>
                  <td>${speedStr}</td>
                </tr>
              `;
            })).join('')}
          </tbody>
        </table>
      `;
    }

    return '';
  }

  private locateCable(cableId: string) {
    this.toggle(); // Close modal
    stateManager.setState({
      selection: [{ type: 'cable', id: cableId }]
    });
    EventBus.emit('selection:changed', [{ type: 'cable', id: cableId }]);
  }

  private exportCSV(cables: CableData[]) {
    if (cables.length === 0) return;
    let csvContent = 'data:text/csv;charset=utf-8,ID,Name,Type,Color,SourcePort,DestPort,Length,Status,Notes\n';
    
    cables.forEach(c => {
      const row = [
        c.id,
        c.displayName || c.name,
        c.type,
        c.color,
        c.sourcePortId,
        c.destPortId || 'floating',
        c.length || 'auto',
        c.status || 'active',
        (c.notes || '').replace(/,/g, ';')
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `RackSlicer_CableSchedule_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private exportJSON(cables: CableData[]) {
    const s = stateManager.getState();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
      cables: s.cables,
      bundles: s.bundles,
      validationAlerts: s.validationAlerts
    }, null, 2));

    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `RackSlicer_CableInventory_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
