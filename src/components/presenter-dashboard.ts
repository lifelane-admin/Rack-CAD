import State from '../core/state';
import EventBus from '../core/event-bus';
import { getTemplate } from '../library/device-catalog';
import { CableData, PortData, DeviceData, RackData, RACK_CONSTANTS } from '../core/types';
import { renderRack } from '../renderers/rack-renderer';
import { renderDevice } from '../renderers/device-renderer';

export class PresenterDashboard {
  private element: HTMLElement;
  private isVisible: boolean = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'presenter-dashboard';
    this.element.className = 'hidden';
    document.getElementById('app')?.appendChild(this.element);

    // Listen to state changes to update the dashboard views dynamically
    EventBus.on('state:changed', () => {
      if (this.isVisible) {
        this.render();
      }
    });
  }

  toggle(visible: boolean) {
    this.isVisible = visible;
    if (visible) {
      this.element.classList.remove('hidden');
      this.render();
      
      // Reparent the canvas viewport into the presenter center panel
      const viewport = document.getElementById('canvas-viewport');
      const holder = this.element.querySelector('.pres-canvas-wrapper');
      if (viewport && holder) {
        holder.appendChild(viewport);
      }
    } else {
      this.element.classList.add('hidden');
      
      // Restore canvas viewport back to its normal layout container
      const viewport = document.getElementById('canvas-viewport');
      const normalContainer = document.getElementById('canvas-container');
      if (viewport && normalContainer) {
        // Insert right after vertical ruler
        const rVertical = document.getElementById('ruler-vertical');
        if (rVertical) {
          normalContainer.insertBefore(viewport, rVertical.nextSibling);
        } else {
          normalContainer.appendChild(viewport);
        }
      }
    }
  }

  private render() {
    const s = State.getState();
    const activeRack = s.racks[0];

    if (!activeRack) {
      this.element.innerHTML = `
        <div style="grid-column: 1/-1; display: flex; justify-content: center; align-items: center; height: 100%;">
          <p style="color: #94a3b8; font-size: 13px;">Please add at least one cabinet to view the Presentation Dashboard.</p>
        </div>
      `;
      return;
    }

    const devicesInRack = s.devices.filter(d => d.rackId === activeRack.id);
    const serverCount = devicesInRack.filter(d => {
      const temp = getTemplate(d.templateId);
      return temp?.category === 'server';
    }).length;
    
    const switchCount = devicesInRack.filter(d => {
      const temp = getTemplate(d.templateId);
      return temp?.category === 'switch';
    }).length;

    const firewallCount = devicesInRack.filter(d => {
      const temp = getTemplate(d.templateId);
      return temp?.category === 'firewall';
    }).length;

    const uUsed = devicesInRack.reduce((acc, d) => {
      const temp = getTemplate(d.templateId);
      return acc + (temp?.heightUnits || 1);
    }, 0);

    const isRear = s.cabinetViewMode === 'rear';

    // RENDER MARKUP
    this.element.innerHTML = `
      <!-- LEFT COLUMN -->
      <div class="pres-panel pres-left-col">
        <div class="pres-header">
          <h1>3-NODE PROXMOX CLUSTER</h1>
          <p>RACK DESIGN INFOGRAPHIC (${isRear ? 'REAR VIEW' : 'FRONT VIEW'})</p>
        </div>

        <div class="pres-panel-title">Network Legend</div>
        <div class="pres-legend-list">
          ${s.customLegendItems ? s.customLegendItems.map(item => `
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: ${item.color};"></div>
              <div class="pres-legend-label">${item.label}</div>
            </div>
          `).join('') : `
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: #e53935;"></div>
              <div class="pres-legend-label">VM Network Traffic - 10GbE</div>
            </div>
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: #43a047;"></div>
              <div class="pres-legend-label">Ceph PRIMARY (Storage) - 10GbE</div>
            </div>
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: #8e24aa;"></div>
              <div class="pres-legend-label">Ceph SECONDARY (Storage) - 10GbE</div>
            </div>
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: #fdd835;"></div>
              <div class="pres-legend-label">Live Migration - 10GbE</div>
            </div>
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: #1e88e5;"></div>
              <div class="pres-legend-label">Backup (PBS) - 1GbE</div>
            </div>
            <div class="pres-legend-item">
              <div class="pres-legend-color" style="background-color: #78909c;"></div>
              <div class="pres-legend-label">Management - 1GbE</div>
            </div>
          `}
        </div>

        <div class="pres-panel-title">Rack Summary</div>
        <ul class="pres-list">
          <li>${switchCount} x ToR / Management Switches</li>
          <li>${serverCount} x Dell PowerEdge Servers (Proxmox VE)</li>
          ${firewallCount > 0 ? `<li>${firewallCount} x Firewall Appliance</li>` : ''}
          <li>2 x Vertical Intelligent PDUs (A & B)</li>
          <li>Total Cabinet Space Used: ${uUsed}U / ${activeRack.units}U</li>
        </ul>

        <div class="pres-panel-title">Design Notes</div>
        <ul class="pres-list">
          <li>Dual switches configured for high availability (HA) uplink</li>
          <li>Separate out-of-band management traffic subnet</li>
          <li>Optically isolated Ceph replication backplane</li>
          <li>Automated routing obstacle avoidance in side gutters</li>
          <li>Proxmox Backup Server on 100E storage network</li>
        </ul>
      </div>

      <!-- CENTER COLUMN: EMBEDS MAIN INTERACTIVE CANVAS -->
      <div class="pres-center-col">
        <div class="pres-canvas-wrapper"></div>
        <div class="pres-center-overlay-label">
          <div class="pres-center-dot" style="background-color: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></div>
          <span>Interactive CAD Workspace (Drag & Select Enabled)</span>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div class="pres-panel pres-right-col">
        <div class="pres-panel-title">Cabinet 3D isometric</div>
        <div class="pres-iso-cabinet">
          <svg class="pres-iso-canvas" viewBox="0 0 240 320"></svg>
        </div>

        <div class="pres-panel-title">Cabinet skeleton index</div>
        <div class="pres-skeleton-outline">
          <div class="pres-skeleton-grid">
            ${Array.from({ length: activeRack.units }, (_, i) => {
              const u = activeRack.units - i;
              const occupiedDevice = devicesInRack.find(d => {
                const temp = getTemplate(d.templateId);
                const h = temp?.heightUnits || 1;
                return u >= d.startUnit && u < d.startUnit + h;
              });
              return `
                <div class="pres-skeleton-ru ${occupiedDevice ? 'occupied' : ''}">
                  <span class="pres-skeleton-ru-num">${u}</span>
                  <span class="pres-skeleton-ru-label">${occupiedDevice ? occupiedDevice.name : '--- Available ---'}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- BOTTOM ROW: PORT MAPPING TABLES -->
      <div class="pres-bottom-row">
        <!-- 10GbE Port Mapping Table -->
        <div class="pres-panel pres-table-panel">
          <div class="pres-panel-title">10GbE Port Mapping (Per Server)</div>
          <div class="pres-table-wrapper">
            <table class="pres-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Color</th>
                  <th>Network Function</th>
                  <th>Target Uplink</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>NIC 1</td>
                  <td><span class="pres-table-color-dot" style="background-color: #fb8c00;"></span></td>
                  <td>VM Network Traffic</td>
                  <td>ToR Switch A (Port 1-3)</td>
                </tr>
                <tr>
                  <td>NIC 2</td>
                  <td><span class="pres-table-color-dot" style="background-color: #43a047;"></span></td>
                  <td>Ceph PRIMARY (Storage)</td>
                  <td>ToR Switch A (Port 5-7)</td>
                </tr>
                <tr>
                  <td>NIC 3</td>
                  <td><span class="pres-table-color-dot" style="background-color: #8e24aa;"></span></td>
                  <td>Ceph SECONDARY (Storage)</td>
                  <td>ToR Switch B (Port 5-7)</td>
                </tr>
                <tr>
                  <td>NIC 4</td>
                  <td><span class="pres-table-color-dot" style="background-color: #fdd835;"></span></td>
                  <td>Live Migration Backplane</td>
                  <td>ToR Switch B (Port 1-3)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 1GbE Port Mapping Table -->
        <div class="pres-panel pres-table-panel">
          <div class="pres-panel-title">1GbE Port Mapping (Per Server)</div>
          <div class="pres-table-wrapper">
            <table class="pres-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Color</th>
                  <th>Network Function</th>
                  <th>Target Uplink</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>NIC 5</td>
                  <td><span class="pres-table-color-dot" style="background-color: #e53935;"></span></td>
                  <td>iDRAC Out-of-Band Management</td>
                  <td>Management Switch (Port 1-3)</td>
                </tr>
                <tr>
                  <td>NIC 6</td>
                  <td><span class="pres-table-color-dot" style="background-color: #78909c;"></span></td>
                  <td>Server Console / Serial Link</td>
                  <td>Management Switch (Port 12-14)</td>
                </tr>
                <tr>
                  <td>-</td>
                  <td><span class="pres-table-color-dot" style="background-color: #1e88e5;"></span></td>
                  <td>PBS Backup Storage Link</td>
                  <td>Backup Switch (Port 1-4)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Highlights Specifications -->
        <div class="pres-highlight-card">
          <div class="pres-highlight-item">
            <div class="pres-highlight-icon">📦</div>
            <div class="pres-highlight-texts">
              <span class="pres-highlight-title">Hyperconverged Cluster</span>
              <span class="pres-highlight-value">3-Node Proxmox VE + Ceph</span>
            </div>
          </div>
          <div class="pres-highlight-item">
            <div class="pres-highlight-icon">🛡️</div>
            <div class="pres-highlight-texts">
              <span class="pres-highlight-title">High Availability</span>
              <span class="pres-highlight-value">Redundant Power & Network Links</span>
            </div>
          </div>
          <div class="pres-highlight-item">
            <div class="pres-highlight-icon">⚡</div>
            <div class="pres-highlight-texts">
              <span class="pres-highlight-title">10GbE Performance</span>
              <span class="pres-highlight-value">Optically Isolated Storage Traffic</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render the 3D cabinet visualization preview in the right column
    this.render3DCabinetPreview(activeRack, devicesInRack);
  }

  private render3DCabinetPreview(rack: RackData, devices: DeviceData[]) {
    const svg = this.element.querySelector('.pres-iso-canvas') as SVGSVGElement;
    if (!svg) return;

    svg.innerHTML = '';
    
    // Create defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    // Create a 3D isometric cabinet rendering inside a scale group
    const scaleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // Scale and center it beautifully
    scaleGroup.setAttribute('transform', 'scale(0.38) translate(30, 40)');
    svg.appendChild(scaleGroup);

    // Render rack frame using custom 3D logic
    const totalHeight = RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units * RACK_CONSTANTS.RU_HEIGHT) + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
    const OUTER_W = RACK_CONSTANTS.RACK_OUTER_WIDTH;

    // Draw cabinet front frame
    const frontFrame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    frontFrame.setAttribute('x', '0');
    frontFrame.setAttribute('y', '0');
    frontFrame.setAttribute('width', String(OUTER_W));
    frontFrame.setAttribute('height', String(totalHeight));
    frontFrame.setAttribute('fill', '#111317');
    frontFrame.setAttribute('stroke', '#38bdf8');
    frontFrame.setAttribute('stroke-width', '2');
    frontFrame.setAttribute('rx', '6');
    scaleGroup.appendChild(frontFrame);

    // Draw internal rail channels
    const leftRail = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    leftRail.setAttribute('x', '25');
    leftRail.setAttribute('y', String(RACK_CONSTANTS.RACK_PADDING_TOP));
    leftRail.setAttribute('width', '25');
    leftRail.setAttribute('height', String(rack.units * RACK_CONSTANTS.RU_HEIGHT));
    leftRail.setAttribute('fill', '#1a1a1f');
    leftRail.setAttribute('stroke', '#222');
    scaleGroup.appendChild(leftRail);

    const rightRail = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rightRail.setAttribute('x', String(OUTER_W - 50));
    rightRail.setAttribute('y', String(RACK_CONSTANTS.RACK_PADDING_TOP));
    rightRail.setAttribute('width', '25');
    rightRail.setAttribute('height', String(rack.units * RACK_CONSTANTS.RU_HEIGHT));
    rightRail.setAttribute('fill', '#1a1a1f');
    rightRail.setAttribute('stroke', '#222');
    scaleGroup.appendChild(rightRail);

    // Render devices as small 3D blocks
    for (const device of devices) {
      const temp = getTemplate(device.templateId);
      const h = temp?.heightUnits || 1;
      const devH = h * RACK_CONSTANTS.RU_HEIGHT;
      const devY = RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units - device.startUnit - h + 1) * RACK_CONSTANTS.RU_HEIGHT;

      // Draw device chassis
      const dRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      dRect.setAttribute('x', '50');
      dRect.setAttribute('y', String(devY));
      dRect.setAttribute('width', String(OUTER_W - 100));
      dRect.setAttribute('height', String(devH));
      dRect.setAttribute('fill', '#1b1b22');
      dRect.setAttribute('stroke', '#000');
      scaleGroup.appendChild(dRect);

      // Draw small front details
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(OUTER_W / 2));
      label.setAttribute('y', String(devY + devH / 2 + 3));
      label.setAttribute('fill', '#38bdf8');
      label.setAttribute('font-size', '8');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', 'Inter, sans-serif');
      label.setAttribute('font-weight', 'bold');
      label.textContent = temp?.model || device.name;
      scaleGroup.appendChild(label);
    }

    // Draw angled 3D top face
    const dx = 30;
    const dy = -16;
    const topPoints = `0,0 ${dx},${dy} ${OUTER_W + dx},${dy} ${OUTER_W},0`;
    const topFace = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    topFace.setAttribute('points', topPoints);
    topFace.setAttribute('fill', '#1b1d22');
    topFace.setAttribute('stroke', '#38bdf8');
    topFace.setAttribute('stroke-width', '1.5');
    scaleGroup.appendChild(topFace);

    // Draw angled 3D side face (skeleton look to see inside)
    const sidePoints = `${OUTER_W},0 ${OUTER_W + dx},${dy} ${OUTER_W + dx},${totalHeight + dy} ${OUTER_W},${totalHeight}`;
    const sideFace = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    sideFace.setAttribute('points', sidePoints);
    sideFace.setAttribute('fill', 'rgba(56, 189, 248, 0.03)');
    sideFace.setAttribute('stroke', '#38bdf8');
    sideFace.setAttribute('stroke-width', '1.5');
    scaleGroup.appendChild(sideFace);

    // Side mesh lines inside side face to make it look premium
    for (let y = 50; y < totalHeight - 50; y += 40) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(OUTER_W));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(OUTER_W + dx));
      line.setAttribute('y2', String(y + dy));
      line.setAttribute('stroke', 'rgba(56, 189, 248, 0.2)');
      line.setAttribute('stroke-width', '1');
      scaleGroup.appendChild(line);
    }
  }
}
