import EventBus from '../core/event-bus';
import State from '../core/state';
import { SelectableItem, CableType, CABLE_COLORS } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import { computeSmartRouting } from '../utils/routing';

export class PropertiesPanel {
  private container: HTMLElement;
  private currentSelection: SelectableItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    EventBus.on('selection:changed', (selection: SelectableItem[]) => {
      this.update(selection);
    });
    EventBus.on('tool:changed', () => {
      const state = (State as any).getState?.() || (State as any);
      this.update(state.selection);
    });
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'properties-panel';

    const header = document.createElement('div');
    header.className = 'properties-header';
    header.innerHTML = `
      <h3>Properties</h3>
      <button class="collapse-btn" title="Collapse">»</button>
    `;
    
    header.querySelector('.collapse-btn')?.addEventListener('click', () => {
      this.container.classList.toggle('collapsed');
    });

    const content = document.createElement('div');
    content.className = 'properties-content';
    content.id = 'properties-content';

    this.container.appendChild(header);
    this.container.appendChild(content);

    this.renderEmpty();
  }

  update(selection: SelectableItem[]) {
    this.currentSelection = selection;
    const content = this.container.querySelector('#properties-content');
    if (!content) return;
    
    content.innerHTML = '';

    if (selection.length === 0) {
      const state = (State as any).getState?.() || (State as any);
      if (state.tool === 'cable') {
        this.renderCableToolPanel(content as HTMLElement);
      } else {
        this.renderEmpty();
      }
      return;
    }

    if (selection.length > 1) {
      content.innerHTML = `<div class="properties-empty">Multiple items selected</div>`;
      return;
    }

    const item = selection[0];
    
    if (item.type === 'rack') {
      this.renderRackProperties(item.id, content as HTMLElement);
    } else if ((item as any).type === 'vertical-mgr') {
      this.renderVerticalMgrProperties(item.id, (item as any).side, content as HTMLElement);
    } else if (item.type === 'device') {
      this.renderDeviceProperties(item.id, content as HTMLElement);
    } else if (item.type === 'cable') {
      this.renderCableProperties(item.id, content as HTMLElement);
    }
  }

  private renderEmpty() {
    const content = this.container.querySelector('#properties-content');
    if (content) {
      content.innerHTML = `<div class="properties-empty">Select an element to view properties</div>`;
    }
  }

  private renderRackProperties(id: string, container: HTMLElement) {
    const state = (State as any).getState?.() || (State as any);
    const rack = state.racks?.find((r: any) => r.id === id) || (State as any).getRack?.(id);
    if (!rack) return;

    container.innerHTML = `
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="prop-rack-name" value="${rack.name || ''}" />
      </div>
      <div class="form-group">
        <label>Units</label>
        <select id="prop-rack-units">
          <option value="42" ${rack.units === 42 ? 'selected' : ''}>42U</option>
          <option value="48" ${rack.units === 48 ? 'selected' : ''}>48U</option>
        </select>
      </div>
      <div class="form-group">
        <label>Position X</label>
        <input type="number" id="prop-rack-x" value="${rack.x || 0}" />
      </div>
      <div class="form-group">
        <label>Position Y</label>
        <input type="number" id="prop-rack-y" value="${rack.y || 0}" />
      </div>
      
      <div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 10px;">
        <label style="font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Vertical Cabinet Accessories</label>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="prop-rack-pdu-left" ${rack.showPduLeft !== false ? 'checked' : ''} />
            Show Left Intelligent PDU A
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="prop-rack-pdu-right" ${rack.showPduRight !== false ? 'checked' : ''} />
            Show Right Intelligent PDU B
          </label>
          
          <div style="border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 10px; margin-top: 5px; display: flex; flex-direction: column; gap: 8px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 10px;">Left Vertical Cable Manager</label>
              <select id="prop-rack-mgr-left" style="background: #000; border: 1px solid var(--border-color); color: #fff; font-size: 11px; padding: 4px; border-radius: 4px; width: 100%;">
                <option value="none" ${rack.leftCableManagerWidth === 'none' || !rack.leftCableManagerWidth ? 'selected' : ''}>None</option>
                <option value="4-inch" ${rack.leftCableManagerWidth === '4-inch' ? 'selected' : ''}>4-Inch Organizer</option>
                <option value="6-inch" ${rack.leftCableManagerWidth === '6-inch' ? 'selected' : ''}>6-Inch Organizer</option>
              </select>
            </div>
            
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 10px;">Right Vertical Cable Manager</label>
              <select id="prop-rack-mgr-right" style="background: #000; border: 1px solid var(--border-color); color: #fff; font-size: 11px; padding: 4px; border-radius: 4px; width: 100%;">
                <option value="none" ${rack.rightCableManagerWidth === 'none' || !rack.rightCableManagerWidth ? 'selected' : ''}>None</option>
                <option value="4-inch" ${rack.rightCableManagerWidth === '4-inch' ? 'selected' : ''}>4-Inch Organizer</option>
                <option value="6-inch" ${rack.rightCableManagerWidth === '6-inch' ? 'selected' : ''}>6-Inch Organizer</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#prop-rack-name')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { name: e.target.value } });
    });
    container.querySelector('#prop-rack-units')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { units: parseInt(e.target.value) as 42 | 48 } });
    });
    container.querySelector('#prop-rack-x')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { x: parseInt(e.target.value) } });
    });
    container.querySelector('#prop-rack-y')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { y: parseInt(e.target.value) } });
    });
    container.querySelector('#prop-rack-pdu-left')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { showPduLeft: e.target.checked } });
    });
    container.querySelector('#prop-rack-pdu-right')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { showPduRight: e.target.checked } });
    });
    container.querySelector('#prop-rack-mgr-left')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { leftCableManagerWidth: e.target.value } });
    });
    container.querySelector('#prop-rack-mgr-right')?.addEventListener('change', (e: any) => {
      EventBus.emit('rack:update', { id, data: { rightCableManagerWidth: e.target.value } });
    });
  }

  private renderDeviceProperties(id: string, container: HTMLElement) {
    const state = (State as any).getState?.() || (State as any);
    const device = state.devices?.find((d: any) => d.id === id) || (State as any).getDevice?.(id);
    if (!device) return;

    const template = getTemplate(device.templateId);
    const racks = state.racks || [];
    const rackOptions = racks.map((r: any) => `<option value="${r.id}" ${r.id === device.rackId ? 'selected' : ''}>${r.name}</option>`).join('');

    container.innerHTML = `
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="prop-dev-name" value="${device.name || ''}" />
      </div>
      <div class="form-group">
        <label>Target Rack</label>
        <select id="prop-dev-rack">${rackOptions}</select>
      </div>
      <div class="form-group">
        <label>Start Unit (RU)</label>
        <input type="number" id="prop-dev-unit" value="${device.startUnit || 1}" min="1" />
      </div>
      <div class="form-group">
        <label>Hostname</label>
        <input type="text" id="prop-dev-hostname" value="${device.hostname || ''}" />
      </div>
      <div class="form-group">
        <label>Management IP</label>
        <input type="text" id="prop-dev-ip" value="${device.managementIp || ''}" />
      </div>
      <div class="form-group">
        <label>Serial Number</label>
        <input type="text" id="prop-dev-serial" value="${device.serialNumber || ''}" />
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="prop-dev-desc">${device.description || ''}</textarea>
      </div>

      <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <label style="font-weight: bold; color: var(--text-secondary);">OEM Front Panel Design</label>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <input type="file" id="prop-dev-panel-file" accept="image/*" style="display: none;" />
          <button class="btn-action" style="flex: 1; background: var(--border-color); border: 1px solid var(--border-color-focus); border-radius: 4px; padding: 6px; font-size: 11px;" onclick="document.getElementById('prop-dev-panel-file').click()">Upload Image</button>
          <button class="btn-action" style="background: rgba(248, 81, 73, 0.15); border: 1px solid var(--danger-color); color: var(--danger-color); border-radius: 4px; padding: 6px; font-size: 11px;" id="prop-dev-panel-clear">Clear</button>
        </div>
        ${device.frontPanelImage ? `
          <div style="font-size: 10px; color: var(--border-color-focus); margin-top: 6px; display: flex; align-items: center; gap: 4px;">
            <span>✔ Custom background image active</span>
          </div>
        ` : ''}
      </div>

      <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <label style="font-weight: bold; color: var(--text-secondary);">Port Visual Calibration</label>
        <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.25); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); margin-top: 8px;">
          ${(device.ports || []).map((port: any, idx: number) => `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.05);">
              <span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${port.name}</span>
              <div style="display: flex; gap: 6px; align-items: center;">
                X: <input type="number" class="port-coord-x" data-port-idx="${idx}" value="${port.relativeX}" style="width: 48px; font-size: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; padding: 2px; border-radius: 2px;" />
                Y: <input type="number" class="port-coord-y" data-port-idx="${idx}" value="${port.relativeY}" style="width: 48px; font-size: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; padding: 2px; border-radius: 2px;" />
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${template?.category === 'server' ? `
        <div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px;">
          <label style="font-weight: bold; color: var(--accent-primary); display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 14px;">
            <span>🔌</span> Cable Laying Helper
          </label>
          
          <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 12px;">Cable Side Placement</label>
            <select id="prop-helper-side" style="font-size: 13.5px; padding: 6px 10px; border-radius: 4px; background: #000; border: 1px solid var(--border-color); color: #fff;">
              <option value="left">Left Side Gutter</option>
              <option value="right">Right Side Gutter</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 12px;">Cable Type</label>
            <select id="prop-helper-type" style="font-size: 13.5px; padding: 6px 10px; border-radius: 4px; background: #000; border: 1px solid var(--border-color); color: #fff;">
              <option value="vm-network">Copper (RJ45 Ethernet)</option>
              <option value="ceph-primary">Fiber (LC Patch Cable)</option>
              <option value="power">Power Cord (C13/C14)</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 12px;">Cable Color</label>
            <select id="prop-helper-color" style="font-size: 13.5px; padding: 6px 10px; border-radius: 4px; background: #000; border: 1px solid var(--border-color); color: #fff;">
              <option value="#fb8c00">Orange</option>
              <option value="#e53935">Red</option>
              <option value="#43a047">Green</option>
              <option value="#8e24aa">Purple</option>
              <option value="#1e88e5">Blue</option>
              <option value="#212529">Black</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom: 14px;">
            <label style="font-size: 12px;">Number of Cables (Max 8)</label>
            <input type="number" id="prop-helper-count" min="1" max="8" value="1" style="font-size: 13.5px; padding: 6px 10px; border-radius: 4px; background: #000; border: 1px solid var(--border-color); color: #fff;" />
          </div>

          <button class="btn-action" id="prop-helper-generate" style="width: 100%; text-align: center; justify-content: center; background: rgba(88, 166, 255, 0.15); border: 1px solid var(--accent-primary); color: var(--accent-primary); border-radius: 4px; padding: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            ⚡ Generate &amp; Attach Cables
          </button>
        </div>
      ` : ''}
    `;

    container.querySelector('#prop-dev-rack')?.addEventListener('change', (e: any) => {
      EventBus.emit('device:update', { id, data: { rackId: e.target.value } });
    });
    container.querySelector('#prop-dev-unit')?.addEventListener('change', (e: any) => {
      EventBus.emit('device:update', { id, data: { startUnit: parseInt(e.target.value) } });
    });

    // Device panel image upload listener
    container.querySelector('#prop-dev-panel-file')?.addEventListener('change', (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          EventBus.emit('device:update', { id, data: { frontPanelImage: reader.result as string } });
        };
        reader.readAsDataURL(file);
      }
    });

    // Clear background image listener
    container.querySelector('#prop-dev-panel-clear')?.addEventListener('click', () => {
      EventBus.emit('device:update', { id, data: { frontPanelImage: undefined } });
    });

    // Cable laying helper listener
    container.querySelector('#prop-helper-generate')?.addEventListener('click', () => {
      const side = (container.querySelector('#prop-helper-side') as HTMLSelectElement).value as 'left' | 'right';
      const type = (container.querySelector('#prop-helper-type') as HTMLSelectElement).value as CableType;
      const color = (container.querySelector('#prop-helper-color') as HTMLSelectElement).value;
      const count = parseInt((container.querySelector('#prop-helper-count') as HTMLInputElement).value) || 1;
      const limitedCount = Math.max(1, Math.min(6, count));
      EventBus.emit('cable:batch-generate', { deviceId: id, side, type, color, count: limitedCount });
    });

    // Handle port coordinate inputs
    container.querySelectorAll('.port-coord-x').forEach(input => {
      input.addEventListener('change', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-port-idx'));
        const val = parseInt(e.target.value) || 0;
        const updatedPorts = [...device.ports];
        updatedPorts[idx] = { ...updatedPorts[idx], relativeX: val };
        EventBus.emit('device:update', { id, data: { ports: updatedPorts } });
      });
    });

    container.querySelectorAll('.port-coord-y').forEach(input => {
      input.addEventListener('change', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-port-idx'));
        const val = parseInt(e.target.value) || 0;
        const updatedPorts = [...device.ports];
        updatedPorts[idx] = { ...updatedPorts[idx], relativeY: val };
        EventBus.emit('device:update', { id, data: { ports: updatedPorts } });
      });
    });

    ['name', 'hostname', 'managementIp', 'serialNumber', 'description'].forEach(field => {
      const selector = `#prop-dev-${field === 'managementIp' ? 'ip' : field === 'serialNumber' ? 'serial' : field === 'description' ? 'desc' : field}`;
      const input = container.querySelector(selector);
      input?.addEventListener('change', (e: any) => {
        EventBus.emit('device:update', { id, data: { [field]: e.target.value } });
      });
    });
  }

  private renderCableProperties(id: string, container: HTMLElement) {
    const state = (State as any).getState?.() || (State as any);
    const cable = state.cables?.find((c: any) => c.id === id) || (State as any).getCable?.(id);
    if (!cable) return;

    const cableTypes: CableType[] = ['idrac', 'vm-network', 'ceph-primary', 'ceph-secondary', 'live-migration', 'backup', 'general', 'general-a', 'general-b', 'power', 'custom'];
    const terminations = ['RJ45 Ethernet', 'SFP+ Fiber Cage', 'QSFP28 Fiber Cage', 'LC-Fiber Connector', 'SC-Fiber Connector', 'C13/C14 Power', 'Console DB9/RJ45', 'Custom Term'];
    const statuses = ['planned', 'ordered', 'pulled', 'terminated', 'tested', 'active', 'inactive'];
    const categories = ['copper-ethernet', 'fiber-optic', 'dac', 'power', 'management', 'storage', 'custom'];
    
    const bendRadii = [
      { label: 'Sharp (0px)', val: 0 },
      { label: 'Tight Bend (5px)', val: 5 },
      { label: 'Standard Bend (10px)', val: 10 },
      { label: 'Medium Bend (15px)', val: 15 },
      { label: 'Generous Bend (30px)', val: 30 },
      { label: 'Sweeping Bend (50px)', val: 50 }
    ];

    const anchorStatus = cable.anchorsLocked
      ? `<span style="color:#43a047;">● Custom (${cable.anchorPoints?.length || 0} points)</span>`
      : `<span style="color:#78909c;">◌ Auto-computed</span>`;

    const alerts = state.validationAlerts?.filter((a: any) => a.targetId === id) || [];
    const validationHTML = alerts.length > 0
      ? `<div style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px;">
          <label style="font-weight: bold; color: var(--danger-color); display: flex; align-items: center; gap: 6px;">⚠️ Validation Alerts (${alerts.length})</label>
          <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 6px;">
            ${alerts.map((a: any) => `
              <div style="font-size: 11px; padding: 6px; border-radius: 4px; background: rgba(244,67,54,0.08); border: 1px solid ${a.type === 'error' ? '#ef5350' : '#ffa726'}; color: #c9d1d9;">
                <strong>${a.type.toUpperCase()}:</strong> ${a.message}
              </div>
            `).join('')}
          </div>
         </div>`
      : '';

    const bundles = state.bundles || [];
    const bundleOptions = `
      <option value="">(No Bundle)</option>
      ${bundles.map((b: any) => `<option value="${b.id}" ${cable.bundleId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
      <option value="__new__">+ Create New Bundle...</option>
    `;

    container.innerHTML = `
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="prop-cab-name" value="${cable.name || ''}" />
      </div>
      <div class="form-group">
        <label>Display Label</label>
        <input type="text" id="prop-cab-display" value="${cable.displayName || ''}" placeholder="C-1, Backplane A, etc." />
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="prop-cab-category">
          ${categories.map(c => `<option value="${c}" ${cable.category === c ? 'selected' : ''}>${c.replace('-', ' ')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Physical Medium</label>
        <input type="text" id="prop-cab-medium" value="${cable.medium || ''}" placeholder="Cat6, Cat6A, OM4, OS2" />
      </div>
      <div class="form-group">
        <label>Network Role Type</label>
        <select id="prop-cab-type">
          ${cableTypes.map(t => `<option value="${t}" ${cable.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Lifecycle Status</label>
        <select id="prop-cab-status">
          ${statuses.map(s => `<option value="${s}" ${cable.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cable Color</label>
        <input type="color" id="prop-cab-color" value="${cable.color || '#000000'}" />
      </div>
      <div class="form-group">
        <label>Thickness (px)</label>
        <input type="number" id="prop-cab-thick" value="${cable.thickness || 3}" />
      </div>
      <div class="form-group">
        <label>Cable Bend Roundness</label>
        <select id="prop-cab-bend-select">
          ${bendRadii.map(r => `<option value="${r.val}" ${cable.bendRadius === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Cable Bundle Group</label>
        <select id="prop-cab-bundle">${bundleOptions}</select>
      </div>

      <div style="margin-top: 12px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
        <label style="font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">🔀 Routing &amp; Anchors</label>

        <div class="form-group" style="margin-top: 8px;">
          <label style="font-size: 10px;">Exit Side (Gutter)</label>
          <select id="prop-cab-side" style="font-size: 11px; padding: 4px 8px;">
            <option value="left" ${cable.sidePreference === 'left' ? 'selected' : ''}>⬅ Left Vertical Manager</option>
            <option value="right" ${cable.sidePreference === 'right' ? 'selected' : ''}>➡ Right Vertical Manager</option>
          </select>
        </div>

        <div style="margin: 6px 0; font-size: 10px; color: var(--text-secondary); line-height: 1.5;">
          <strong>Anchor Status:</strong> ${anchorStatus}<br/>
          <span style="opacity:0.7;">Select cable → drag diamond handles to reshape path</span>
        </div>

        <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label style="font-size: 10px; font-weight: bold; color: var(--accent-primary);">📍 Anchor Point Controls (${(cable.anchorPoints || []).length} Anchors)</label>
            <button id="prop-cab-add-anchor" style="padding: 2px 6px; font-size: 10px; background: rgba(0,229,255,0.12); border: 1px solid var(--accent-primary); border-radius: 3px; color: var(--accent-primary); cursor: pointer;" title="Add new anchor point">➕ Add Anchor</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px; max-height: 180px; overflow-y: auto;">
            ${(cable.anchorPoints || []).map((pt: any, idx: number) => `
              <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
                <span style="width: 22px; font-weight: bold; color: var(--accent-primary);">A${idx + 1}:</span>
                <span style="font-size: 9px; color: #888;">X</span>
                <input type="number" class="anchor-coord-x" data-anchor-idx="${idx}" value="${Math.round(pt.x)}" style="width: 48px; padding: 2px 4px; font-size: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px;" />
                <span style="font-size: 9px; color: #888;">Y</span>
                <input type="number" class="anchor-coord-y" data-anchor-idx="${idx}" value="${Math.round(pt.y)}" style="width: 48px; padding: 2px 4px; font-size: 10px; background: #000; border: 1px solid var(--border-color); color: #fff; border-radius: 3px;" />
                <button class="anchor-remove-btn" data-anchor-idx="${idx}" style="padding: 2px 5px; font-size: 10px; background: rgba(244,67,54,0.15); border: 1px solid #e53935; color: #ef5350; border-radius: 3px; cursor: pointer;" title="Remove Anchor A${idx + 1}">✕</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
          <button id="prop-cab-reset-anchors" style="padding: 5px 8px; font-size: 10px; background: rgba(255,152,0,0.15); border: 1px solid #fb8c00; border-radius: 4px; color: #fb8c00; cursor: pointer;">↺ Reset Anchors</button>
          <button id="prop-cab-delete" style="padding: 5px 8px; font-size: 10px; background: rgba(244,67,54,0.12); border: 1px solid #e53935; border-radius: 4px; color: #e53935; cursor: pointer;">🗑 Delete Cable</button>
        </div>
      </div>

      <div style="margin-top: 12px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
        <label style="font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Physical Specifications</label>
        <div class="form-group" style="margin-top: 8px;">
          <label style="font-size: 10px;">Length Override (meters)</label>
          <input type="number" step="0.1" id="prop-cab-len-override" value="${cable.length || ''}" placeholder="Auto" />
        </div>
        <div class="form-group">
          <label style="font-size: 10px;">Weight Override (kg)</label>
          <input type="number" step="0.01" id="prop-cab-weight" value="${cable.weight || ''}" placeholder="0.1" />
        </div>
        <div class="form-group">
          <label style="font-size: 12px;">Perpendicular Exit Distance (px)</label>
          <input type="number" id="prop-cab-exit-offset" value="${cable.exitStraightOffset || 18}" min="10" max="60" />
        </div>
        <div class="form-group" style="margin-top: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; color: var(--accent-primary);">
            <input type="checkbox" id="prop-cab-animated-flow" ${cable.animatedFlow ? 'checked' : ''} />
            ⚡ Enable Live Packet Flow Animation
          </label>
        </div>
      </div>

      <div style="margin-top: 12px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
        <label style="font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-secondary);">Termination Specs</label>

        <div class="form-group" style="margin-top: 8px;">
          <label style="font-size: 12px;">Source Termination</label>
          <select id="prop-cab-src-term" style="font-size: 13px; padding: 6px 10px;">
            ${terminations.map(t => `<option value="${t}" ${cable.sourceTermination === t || (!cable.sourceTermination && t === 'RJ45 Ethernet') ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="margin-top: 8px;">
          <label style="font-size: 12px; font-weight: bold; color: var(--accent-primary);">Source Plug Tilt / Direction (4-Way)</label>
          <div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">
            <button class="tilt-btn-src" data-dir="up" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.sourceOrientation === 'up' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.sourceOrientation === 'up' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">⬆️ Up</button>
            <button class="tilt-btn-src" data-dir="down" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.sourceOrientation === 'down' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.sourceOrientation === 'down' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">⬇️ Down</button>
            <button class="tilt-btn-src" data-dir="left" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.sourceOrientation === 'left' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.sourceOrientation === 'left' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">⬅️ Left</button>
            <button class="tilt-btn-src" data-dir="right" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.sourceOrientation === 'right' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.sourceOrientation === 'right' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">➡️ Right</button>
            <button class="tilt-btn-src" data-dir="auto" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${(!cable.sourceOrientation || cable.sourceOrientation === 'auto') ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${(!cable.sourceOrientation || cable.sourceOrientation === 'auto') ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">🔄 Auto</button>
          </div>
          <select id="prop-cab-src-orient" style="font-size: 13px; padding: 6px 10px; margin-top: 4px;">
            <option value="auto" ${(!cable.sourceOrientation || cable.sourceOrientation === 'auto') ? 'selected' : ''}>Auto (Smart Row Alignment)</option>
            <option value="up" ${cable.sourceOrientation === 'up' ? 'selected' : ''}>⬆️ Plug Up (Exit Downwards)</option>
            <option value="down" ${cable.sourceOrientation === 'down' ? 'selected' : ''}>⬇️ Plug Down (Exit Upwards)</option>
            <option value="left" ${cable.sourceOrientation === 'left' ? 'selected' : ''}>⬅️ Plug Left (Exit Rightwards)</option>
            <option value="right" ${cable.sourceOrientation === 'right' ? 'selected' : ''}>➡️ Plug Right (Exit Leftwards)</option>
          </select>
        </div>

        <div class="form-group" style="margin-top: 10px;">
          <label style="font-size: 12px;">Destination Termination</label>
          <select id="prop-cab-dest-term" style="font-size: 13px; padding: 6px 10px;">
            ${terminations.map(t => `<option value="${t}" ${cable.destTermination === t || (!cable.destTermination && t === 'RJ45 Ethernet') ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="margin-top: 8px;">
          <label style="font-size: 12px; font-weight: bold; color: var(--accent-primary);">Destination Plug Tilt Direction (4-Way)</label>
          <div style="display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap;">
            <button class="tilt-btn-dest" data-dir="up" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.destOrientation === 'up' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.destOrientation === 'up' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">⬆️ Up</button>
            <button class="tilt-btn-dest" data-dir="down" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.destOrientation === 'down' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.destOrientation === 'down' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">⬇️ Down</button>
            <button class="tilt-btn-dest" data-dir="left" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.destOrientation === 'left' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.destOrientation === 'left' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">⬅️ Left</button>
            <button class="tilt-btn-dest" data-dir="right" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${cable.destOrientation === 'right' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${cable.destOrientation === 'right' ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">➡️ Right</button>
            <button class="tilt-btn-dest" data-dir="auto" style="flex: 1; min-width: 48px; padding: 6px 5px; font-size: 11.5px; background: ${(!cable.destOrientation || cable.destOrientation === 'auto') ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}; color: #fff; border: 1px solid ${(!cable.destOrientation || cable.destOrientation === 'auto') ? 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">🔄 Auto</button>
          </div>
          <select id="prop-cab-dest-orient" style="font-size: 13px; padding: 6px 10px; margin-top: 4px;">
            <option value="auto" ${(!cable.destOrientation || cable.destOrientation === 'auto') ? 'selected' : ''}>Auto (Smart Row Alignment)</option>
            <option value="up" ${cable.destOrientation === 'up' ? 'selected' : ''}>⬆️ Plug Up (Exit Downwards)</option>
            <option value="down" ${cable.destOrientation === 'down' ? 'selected' : ''}>⬇️ Plug Down (Exit Upwards)</option>
            <option value="left" ${cable.destOrientation === 'left' ? 'selected' : ''}>⬅️ Plug Left (Exit Rightwards)</option>
            <option value="right" ${cable.destOrientation === 'right' ? 'selected' : ''}>➡️ Plug Right (Exit Leftwards)</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label>Tags (Comma separated)</label>
        <input type="text" id="prop-cab-tags" value="${(cable.tags || []).join(', ')}" />
      </div>

      <div class="form-group" style="margin-top: 12px;">
        <label>Notes</label>
        <textarea id="prop-cab-notes">${cable.notes || ''}</textarea>
      </div>

      ${validationHTML}

      <div class="properties-info">
        <div><strong>Source Port:</strong> ${cable.sourcePortId.split('-port-').pop() || cable.sourcePortId}</div>
        <div><strong>Dest Port:</strong> ${cable.destPortId ? cable.destPortId.split('-port-').pop() || cable.destPortId : 'Unconnected (floating)'}</div>
      </div>
    `;

    container.querySelector('#prop-cab-name')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { name: e.target.value } });
    });
    container.querySelector('#prop-cab-display')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { displayName: e.target.value } });
    });
    container.querySelector('#prop-cab-category')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { category: e.target.value } });
    });
    container.querySelector('#prop-cab-medium')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { medium: e.target.value } });
    });
    container.querySelector('#prop-cab-status')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { status: e.target.value } });
    });
    container.querySelector('#prop-cab-type')?.addEventListener('change', (e: any) => {
      const type = e.target.value as CableType;
      // @ts-ignore
      const color = CABLE_COLORS ? CABLE_COLORS[type] : '#78909c';
      EventBus.emit('cable:update', { id, data: { type, color } });
      const colorInput = container.querySelector('#prop-cab-color') as HTMLInputElement;
      if (colorInput) colorInput.value = color;
    });
    container.querySelector('#prop-cab-color')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { color: e.target.value } });
    });
    container.querySelector('#prop-cab-thick')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { thickness: parseInt(e.target.value) } });
    });
    container.querySelector('#prop-cab-bend-select')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { bendRadius: parseInt(e.target.value) } });
    });
    container.querySelector('#prop-cab-side')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { sidePreference: e.target.value, anchorPoints: [], anchorsLocked: false } });
    });
    // 6-Anchor Coordinate Listeners
    container.querySelectorAll('.anchor-coord-x').forEach(input => {
      input.addEventListener('change', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-anchor-idx'));
        const val = parseInt(e.target.value) || 0;
        const currentPts = [...(cable.anchorPoints || [])];
        if (currentPts[idx]) {
          currentPts[idx] = { ...currentPts[idx], x: val };
          EventBus.emit('cable:update', { id, data: { anchorPoints: currentPts, anchorsLocked: true } });
        }
      });
    });

    container.querySelectorAll('.anchor-coord-y').forEach(input => {
      input.addEventListener('change', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-anchor-idx'));
        const val = parseInt(e.target.value) || 0;
        const currentPts = [...(cable.anchorPoints || [])];
        if (currentPts[idx]) {
          currentPts[idx] = { ...currentPts[idx], y: val };
          EventBus.emit('cable:update', { id, data: { anchorPoints: currentPts, anchorsLocked: true } });
        }
      });
    });

    // Anchor Point Controls (Add, Remove, Coordinate Update)
    container.querySelector('#prop-cab-add-anchor')?.addEventListener('click', () => {
      const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
      const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
      const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : computeSmartRouting(cable, sourcePos, destPos))];
      
      const lastPt = currentPts[currentPts.length - 1] || sourcePos;
      currentPts.push({ x: Math.round(lastPt.x + 25), y: Math.round(lastPt.y + 25) });
      EventBus.emit('cable:update', { id, data: { anchorPoints: currentPts, anchorsLocked: true } });
    });

    container.querySelectorAll('.anchor-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-anchor-idx'));
        const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
        const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
        const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : computeSmartRouting(cable, sourcePos, destPos))];

        if (currentPts.length > 1) {
          currentPts.splice(idx, 1);
          EventBus.emit('cable:update', { id, data: { anchorPoints: currentPts, anchorsLocked: true } });
        } else {
          alert('Cable must have at least 1 anchor point.');
        }
      });
    });

    container.querySelector('#prop-cab-reset-anchors')?.addEventListener('click', () => {
      EventBus.emit('cable:update', { id, data: { anchorPoints: [], anchorsLocked: false } });
    });
    container.querySelector('#prop-cab-delete')?.addEventListener('click', () => {
      EventBus.emit('edit:delete', undefined as any);
    });
    container.querySelector('#prop-cab-len-override')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { length: parseFloat(e.target.value) || undefined } });
    });
    container.querySelector('#prop-cab-weight')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { weight: parseFloat(e.target.value) || undefined } });
    });
    container.querySelector('#prop-cab-exit-offset')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { exitStraightOffset: parseInt(e.target.value) || 18, anchorPoints: [], anchorsLocked: false } });
    });
    container.querySelector('#prop-cab-animated-flow')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { animatedFlow: e.target.checked } });
    });
    container.querySelector('#prop-cab-src-term')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { sourceTermination: e.target.value } });
    });
    container.querySelectorAll('.tilt-btn-src').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const dir = e.currentTarget.getAttribute('data-dir');
        EventBus.emit('cable:update', { id, data: { sourceOrientation: dir, anchorPoints: [], anchorsLocked: false } });
      });
    });

    container.querySelectorAll('.tilt-btn-dest').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const dir = e.currentTarget.getAttribute('data-dir');
        EventBus.emit('cable:update', { id, data: { destOrientation: dir, anchorPoints: [], anchorsLocked: false } });
      });
    });

    container.querySelector('#prop-cab-src-orient')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { sourceOrientation: e.target.value, anchorPoints: [], anchorsLocked: false } });
    });
    container.querySelector('#prop-cab-dest-term')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { destTermination: e.target.value } });
    });
    container.querySelector('#prop-cab-dest-orient')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { destOrientation: e.target.value, anchorPoints: [], anchorsLocked: false } });
    });
    container.querySelector('#prop-cab-tags')?.addEventListener('change', (e: any) => {
      const tags = e.target.value.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
      EventBus.emit('cable:update', { id, data: { tags } });
    });
    container.querySelector('#prop-cab-notes')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { notes: e.target.value } });
    });
    container.querySelector('#prop-cab-bundle')?.addEventListener('change', (e: any) => {
      const val = e.target.value;
      if (val === '__new__') {
        const name = prompt('Enter new bundle name:');
        if (name) {
          const bundleId = 'bundle-' + Date.now();
          const newBundle = {
            id: bundleId,
            name,
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            diameter: 12,
            capacity: 24,
            cableIds: [id]
          };
          (State as any).addBundle(newBundle);
          EventBus.emit('cable:update', { id, data: { bundleId } });
        }
      } else {
        EventBus.emit('cable:update', { id, data: { bundleId: val || null } });
      }
    });
  }

  private renderCableToolPanel(container: HTMLElement) {
    const state = (State as any).getState?.() || (State as any);
    const selectedCableType = state.selectedCableType || 'general';
    const selectedCableColor = state.selectedCableColor || '#78909c';
    const selectedCableBend = state.selectedCableBend !== undefined ? state.selectedCableBend : 15;
    const selectedCableTermination = state.selectedCableTermination || 'RJ45 Ethernet';

    const cableTypes: CableType[] = ['idrac', 'vm-network', 'ceph-primary', 'ceph-secondary', 'live-migration', 'backup', 'general', 'general-a', 'general-b', 'power', 'custom'];
    const terminations = ['RJ45 Ethernet', 'SFP+ Fiber Cage', 'QSFP28 Fiber Cage', 'LC-Fiber Connector', 'SC-Fiber Connector', 'C13/C14 Power', 'Console DB9/RJ45', 'Custom Term'];
    
    const bendRadii = [
      { label: 'Sharp (0px)', val: 0 },
      { label: 'Tight Bend (5px)', val: 5 },
      { label: 'Medium Bend (15px)', val: 15 },
      { label: 'Generous Bend (30px)', val: 30 },
      { label: 'Sweeping Bend (50px)', val: 50 }
    ];

    const typeLabels: Record<CableType, string> = {
      'idrac': 'iDRAC (OOB Management) - Red',
      'vm-network': 'VM Network Traffic - Orange',
      'ceph-primary': 'Ceph Primary (Storage) - Green',
      'ceph-secondary': 'Ceph Secondary (Storage) - Purple',
      'live-migration': 'Live Migration - Yellow',
      'backup': 'Backup (PBS) - Blue',
      'general': 'General - Slate Grey',
      'general-a': 'General Traffic-A - Cyan',
      'general-b': 'General Traffic-B - Pink',
      'power': 'Power Cord (AC) - Black',
      'cat6': 'Category 6 U/UTP - Blue',
      'cat6a': 'Category 6A S/FTP - Orange',
      'cat8': 'Category 8.1 40GbE - Purple',
      'om4': 'Multi-Mode OM4 Aqua Fiber',
      'om5': 'Multi-Mode OM5 Lime Fiber',
      'dac-twinax': '10G/25G Direct Attach DAC',
      'qsfp28': '100G QSFP28 Direct Attach',
      'c13-power': 'IEC C13/C14 AC Power',
      'c19-power': 'IEC C19/C20 Heavy Power',
      'console': 'Console Serial DB9/RJ45',
      'custom': 'Custom - Pick Color Below'
    };

    container.innerHTML = `
      <div style="background: rgba(88, 166, 255, 0.05); border: 1px solid var(--border-color-focus); border-radius: 6px; padding: 12px; margin-bottom: 15px;">
        <h4 style="color: var(--accent-primary); font-size: 13px; font-weight: bold; margin-bottom: 5px; display: flex; align-items: center; gap: 6px;">
          <span>🔗</span> Cable Routing Mode Active
        </h4>
        <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">
          Select specs below, then click ports to run connections.
        </p>
      </div>

      <div class="form-group">
        <label>Network / Speed Type</label>
        <select id="prop-tool-cable-type" style="background: #000; border: 1px solid var(--border-color); color: #fff;">
          ${cableTypes.map(t => `<option value="${t}" ${selectedCableType === t ? 'selected' : ''}>${typeLabels[t] || t}</option>`).join('')}
        </select>
      </div>

      <div class="form-group" id="prop-tool-cable-color-container" style="${selectedCableType === 'custom' ? '' : 'display: none;'}">
        <label>Custom Cable Color</label>
        <input type="color" id="prop-tool-cable-color" value="${selectedCableColor}" style="padding: 2px 4px; height: 28px;" />
      </div>

      <div class="form-group">
        <label>Cable Bend Options (Roundness)</label>
        <select id="prop-tool-cable-bend" style="background: #000; border: 1px solid var(--border-color); color: #fff;">
          ${bendRadii.map(r => `<option value="${r.val}" ${selectedCableBend === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Termination Type (Both Ends)</label>
        <select id="prop-tool-cable-termination" style="background: #000; border: 1px solid var(--border-color); color: #fff;">
          ${terminations.map(t => `<option value="${t}" ${selectedCableTermination === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>

      <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
        <h4 style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">How to Route Cables</h4>
        <ul style="font-size: 11px; color: var(--text-primary); padding-left: 15px; display: flex; flex-direction: column; gap: 8px; line-height: 1.4;">
          <li>Click any available port socket on a device to start.</li>
          <li>Click a port on the destination device to terminate.</li>
          <li style="color: #fb8c00;"><strong>Safety rule</strong>: Ethernet cables must terminate in RJ45 ports at both ends. Fiber cables must terminate in SFP/QSFP ports.</li>
        </ul>
      </div>
    `;

    container.querySelector('#prop-tool-cable-type')?.addEventListener('change', (e: any) => {
      const type = e.target.value as CableType;
      // @ts-ignore
      const defaultColor = CABLE_COLORS[type] || '#78909c';
      
      const customColorContainer = container.querySelector('#prop-tool-cable-color-container') as HTMLElement;
      if (customColorContainer) {
        customColorContainer.style.display = type === 'custom' ? '' : 'none';
      }

      State.setState({ 
        selectedCableType: type,
        selectedCableColor: type === 'custom' ? state.selectedCableColor : defaultColor
      });
    });

    container.querySelector('#prop-tool-cable-color')?.addEventListener('change', (e: any) => {
      State.setState({ selectedCableColor: e.target.value });
    });

    container.querySelector('#prop-tool-cable-bend')?.addEventListener('change', (e: any) => {
      State.setState({ selectedCableBend: parseInt(e.target.value) });
    });

    container.querySelector('#prop-tool-cable-termination')?.addEventListener('change', (e: any) => {
      State.setState({ selectedCableTermination: e.target.value });
    });
  }

  private renderVerticalMgrProperties(id: string, side: 'left' | 'right', container: HTMLElement) {
    const state = (State as any).getState?.() || (State as any);
    const rack = state.racks?.find((r: any) => r.id === id) || (State as any).getRack?.(id);
    if (!rack) return;

    const width = side === 'left' ? rack.leftCableManagerWidth : rack.rightCableManagerWidth;

    container.innerHTML = `
      <div style="background: rgba(88, 166, 255, 0.05); border: 1px solid var(--border-color-focus); border-radius: 6px; padding: 12px; margin-bottom: 15px;">
        <h4 style="color: var(--accent-primary); font-size: 13px; font-weight: bold; margin-bottom: 5px; text-transform: capitalize; display: flex; align-items: center; gap: 6px;">
          📁 ${side} Vertical Cable Manager
        </h4>
        <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; margin: 0;">
          Attached next to ${rack.name}
        </p>
      </div>

      <div class="form-group">
        <label>Manager Size (Width)</label>
        <select id="prop-vert-mgr-width" style="background: #000; border: 1px solid var(--border-color); color: #fff; font-size: 11px; padding: 6px; border-radius: 4px; width: 100%;">
          <option value="4-inch" ${width === '4-inch' ? 'selected' : ''}>4-Inch Wide</option>
          <option value="6-inch" ${width === '6-inch' ? 'selected' : ''}>6-Inch Wide</option>
        </select>
      </div>

      <div style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
        <button class="btn-action btn-danger" id="prop-vert-mgr-delete" style="width: 100%; text-align: center; justify-content: center; background: rgba(248, 81, 73, 0.15); border: 1px solid var(--danger-color); color: var(--danger-color); border-radius: 4px; padding: 8px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          🗑️ Delete Cable Manager
        </button>
      </div>
    `;

    container.querySelector('#prop-vert-mgr-width')?.addEventListener('change', (e: any) => {
      const prop = side === 'left' ? 'leftCableManagerWidth' : 'rightCableManagerWidth';
      EventBus.emit('rack:update', { id, data: { [prop]: e.target.value } });
    });

    container.querySelector('#prop-vert-mgr-delete')?.addEventListener('click', () => {
      const prop = side === 'left' ? 'leftCableManagerWidth' : 'rightCableManagerWidth';
      EventBus.emit('rack:update', { id, data: { [prop]: 'none' } });
      EventBus.emit('selection:changed', []);
    });
  }
}
