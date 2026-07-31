import EventBus from '../core/event-bus';
import { eventBus } from '../core/event-bus';
import State from '../core/state';
import { stateManager } from '../core/state';
import { SelectableItem, CableType, CABLE_COLORS, DeviceData, DeviceTemplate, PduConfig, PduOutletGroup, SocketType, KvmConfig, SwitchConfig, FirewallConfig, SwitchVendor, FirewallVendor, LedTheme, SwitchLayer, SwitchPortGroup } from '../core/types';
import { KVM_LOCAL_PORT_OPTIONS, CONSOLE_LOCAL_PORT_OPTIONS } from '../renderers/networking-renderer';
import { computePduLoad } from '../renderers/pdu-renderer';
import { switchVendorSkin, firewallVendorSkin } from '../renderers/vendor-palette';
import { getTemplate } from '../library/device-catalog';
import { CustomAssetModal } from './custom-asset-modal';

const customAssetModal = new CustomAssetModal();
import { computeSmartRouting, get3DefaultAnchors } from '../utils/routing';
import { aiService } from '../ai/ai-service';
import { AIHint } from '../ai/types';

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

    if (template?.category === 'pdu') {
      this.renderPduProperties(device, template, container);
      return;
    }
    if (template?.category === 'console') {
      this.renderKvmProperties(device, template, container);
      return;
    }
    if (template?.category === 'switch') {
      this.renderSwitchProperties(device, template, container);
      return;
    }
    if (template?.category === 'firewall') {
      this.renderFirewallProperties(device, template, container);
      return;
    }
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

      <div style="margin-bottom:12px;">
        <label style="font-size:11px;display:block;margin-bottom:4px;color:var(--text-muted);">Power Consumption</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input id="power-watts-input" type="number" min="0" value="${device.powerWatts ?? template?.powerWatts ?? 0}"
            style="width:80px;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:5px 8px;font-size:12px;" />
          <span style="font-size:12px;color:var(--text-muted);">W</span>
          <span style="font-size:10px;color:var(--text-muted);margin-left:4px;">Volts × Amps = Watts</span>
        </div>
      </div>

      <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <label style="font-weight: bold; color: var(--text-secondary);">Front Panel Image</label>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <input type="file" id="prop-dev-panel-file" accept="image/*" style="display: none;" />
          <button class="btn-action" style="flex: 1; background: var(--border-color); border: 1px solid var(--border-color-focus); border-radius: 4px; padding: 6px; font-size: 11px;" onclick="document.getElementById('prop-dev-panel-file').click()">Upload Front Panel Image</button>
          <button class="btn-action" style="background: rgba(248, 81, 73, 0.15); border: 1px solid var(--danger-color); color: var(--danger-color); border-radius: 4px; padding: 6px; font-size: 11px;" id="prop-dev-panel-clear">Clear</button>
        </div>
        ${device.frontPanelImage ? `
          <div style="font-size: 10px; color: var(--border-color-focus); margin-top: 6px; display: flex; align-items: center; gap: 4px;">
            <span>✔ Custom background image active</span>
          </div>
        ` : ''}
        <button id="btn-save-custom-asset" class="prop-btn" title="Save this device configuration to My Library" style="width:100%;margin-top:8px;background:#1f6feb;color:#fff;font-weight:600;border:none;border-radius:4px;padding:7px 10px;font-size:12px;cursor:pointer;">Save as Custom Asset</button>
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

    const powerInput = container.querySelector<HTMLInputElement>('#power-watts-input');
    if (powerInput) {
      powerInput.addEventListener('change', () => {
        const watts = Math.max(0, parseInt(powerInput.value) || 0);
        EventBus.emit('device:update', { id, data: { powerWatts: watts } });
      });
    }

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

    // Save as Custom Asset
    container.querySelector('#btn-save-custom-asset')?.addEventListener('click', () => {
      const state = stateManager.getState();
      const device = state.devices.find(d => d.id === id);
      if (!device) return;
      const baseTemplate = getTemplate(device.templateId, state.customTemplates) ?? null;
      const existingCustom = baseTemplate?.isCustom ? baseTemplate : null;
      customAssetModal.show(device, baseTemplate, existingCustom, () => {});
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

  /** Local-peripheral-port configurator, shared by KVM and plain serial console-server devices
   *  — mirrors a real 1U unit's front panel (local console USB/video/audio for KVM; USB +
   *  management LAN for a console server), plus its management/diagnostics port(s). Toggling a
   *  chip here regenerates the device's actual `ports` (see injectNetworkLocalPorts in
   *  state.ts), not just the SVG — connections to removed ports are dropped, new ports appear
   *  unconnected, and everything else (the TARGETS/SERIAL group, cabling) is left untouched. */
  private renderKvmProperties(device: DeviceData, template: DeviceTemplate, container: HTMLElement): void {
    const isKvm = template.id.startsWith('kvm');
    const targetLabel = isKvm ? 'TARGETS' : 'SERIAL';
    const cfg: KvmConfig = (device.deviceConfig as KvmConfig | undefined) ?? {};
    const targetsCount = device.ports.filter(p => p.group === targetLabel).length
      || template.ports.filter(p => p.group === targetLabel).length;

    const sections = isKvm
      ? `
        <label class="pdu-lbl">USB (Keyboard / Mouse)</label>
        <div id="kvm-usb" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;"></div>

        <label class="pdu-lbl">Local Video</label>
        <div id="kvm-video" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;"></div>

        <label class="pdu-lbl">Local Audio</label>
        <div id="kvm-audio" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;"></div>

        <label class="pdu-lbl">Management &amp; Diagnostics</label>
        <div id="kvm-mgmt" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;"></div>
      `
      : `
        <label class="pdu-lbl">USB (Modem / Storage)</label>
        <div id="kvm-usb" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;"></div>

        <label class="pdu-lbl">Management LAN</label>
        <div id="kvm-mgmt" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;"></div>
      `;

    container.innerHTML = `
      <div style="padding:10px 12px;font-family:monospace;font-size:11px;color:#e6ecf2;overflow-y:auto;max-height:100%;">
        <div style="color:#39ff8a;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #23303b;padding-bottom:6px;">
          &#x1F4DF; ${template.name}<br>
          <span style="color:#5b636a;font-size:9px;">RACK-MOUNT — ${template.heightUnits}U &middot; ${targetsCount} ${isKvm ? 'SERVER TARGETS' : 'SERIAL PORTS'}</span>
        </div>
        ${sections}
      </div>
      <style>
        .pdu-lbl{display:block;font-size:9px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
        .pdu-chip{padding:3px 6px;border-radius:2px;font-size:9.5px;cursor:pointer;border:1px solid #23303b;font-family:monospace;user-select:none}
        .pdu-chip.on{background:#39ff8a;color:#000;border-color:#39ff8a}
        .pdu-chip.off{background:#171d24;color:#8b939a}
      </style>
    `;

    const defaultOptions = isKvm ? KVM_LOCAL_PORT_OPTIONS : CONSOLE_LOCAL_PORT_OPTIONS;
    const active = new Set<string>(Array.isArray(cfg.localPorts) ? cfg.localPorts : defaultOptions);
    const save = () => {
      eventBus.emit('device:update' as any, { id: device.id, data: { deviceConfig: { localPorts: Array.from(active) } as KvmConfig } });
    };

    const LABELS: Record<string, string> = {
      usb1: 'USB 1', usb2: 'USB 2', usb3: 'USB 3', usb4: 'USB 4',
      vga: 'VGA', hdmi: 'HDMI', dvi: 'DVI', displayport: 'DisplayPort',
      audio: 'Audio Out', mic: 'Mic In',
      ethernet: isKvm ? 'Ethernet (LAN/IP)' : 'LAN 1 (Primary)', ethernet2: 'LAN 2 (Failover)',
      serial: 'RS-232 (Serial)',
    };
    if (isKvm) {
      this.renderPduChips(container, '#kvm-usb', ['usb1', 'usb2', 'usb3', 'usb4'], active, LABELS, save);
      this.renderPduChips(container, '#kvm-video', ['vga', 'hdmi', 'dvi', 'displayport'], active, LABELS, save);
      this.renderPduChips(container, '#kvm-audio', ['audio', 'mic'], active, LABELS, save);
      this.renderPduChips(container, '#kvm-mgmt', ['ethernet', 'serial'], active, LABELS, save);
    } else {
      this.renderPduChips(container, '#kvm-usb', ['usb1', 'usb2'], active, LABELS, save);
      this.renderPduChips(container, '#kvm-mgmt', ['ethernet', 'ethernet2'], active, LABELS, save);
    }
  }

  /** Chip-toggle-group initial state: starts from `defaultOn`, then applies any explicit
   *  true/false the saved config already has for each key. Shared by the switch/firewall
   *  configurators — both model their boolean toggles (Mgmt Port, Console, LCD, ...) as a chip
   *  set the same way the PDU configurator models Smart Features/LEDs/Labels. */
  private initToggleSet(cfg: Record<string, unknown>, keys: string[], defaultOn: string[]): Set<string> {
    const s = new Set(defaultOn);
    keys.forEach(k => {
      if (cfg[k] === true) s.add(k);
      else if (cfg[k] === false) s.delete(k);
    });
    return s;
  }

  private readonly SWITCH_VENDORS: SwitchVendor[] = [
    'generic', 'cisco-catalyst', 'cisco-nexus', 'aruba-cx', 'juniper-ex', 'dell-powerswitch',
    'fortiswitch', 'huawei', 'extreme', 'mikrotik', 'ubiquiti', 'netgear', 'custom',
  ];
  private readonly SWITCH_LAYERS: SwitchLayer[] = ['L1', 'L2', 'L3'];
  private readonly SWITCH_TOGGLES = ['poe', 'mgmtPort', 'consolePort', 'usbPort', 'lcd', 'stackPorts', 'rackEars', 'assetLabel', 'dustCovers'];
  private readonly SWITCH_TOGGLE_LABELS: Record<string, string> = {
    poe: 'PoE', mgmtPort: 'Mgmt Port', consolePort: 'Console', usbPort: 'USB', lcd: 'LCD',
    stackPorts: 'Stack Ports', rackEars: 'Rack Ears', assetLabel: 'Asset Label', dustCovers: 'Dust Covers',
  };
  /** Cycled as a sensible default whenever a new port range group is added, so groups are
   *  visually distinct from the start — the colour picker on each row still lets the user
   *  override any of them. */
  private readonly PORT_GROUP_PALETTE = ['#37b6ff', '#39ff8a', '#ffb020', '#ff4d6a', '#a06cff', '#2dd4bf', '#f472b6', '#ff8a3d'];

  /** Enterprise Switch Physical SDK configurator. RJ45/SFP/SFP+/QSFP counts regenerate the
   *  device's actual ports live (see injectConfigurablePorts in state.ts) — everything else
   *  (vendor skin, toggled chrome, colors) is cosmetic only. */
  private renderSwitchProperties(device: DeviceData, template: DeviceTemplate, container: HTMLElement): void {
    const cfg: SwitchConfig = (device.deviceConfig as SwitchConfig | undefined) ?? {};
    const skin = switchVendorSkin(cfg.vendor);
    // Default each count field to the device's ACTUAL current ports, not a hardcoded guess —
    // otherwise opening properties on any switch whose real counts differ from the guess (every
    // catalog SKU except the ones that happen to already be 24 RJ45 + 4 SFP+) would silently
    // rewrite its port composition to the guess the moment anything on this panel is saved.
    // Exclude the auto-injected ear-hole ports (see injectEarPorts in state.ts) — they're mostly
    // typed 'rj45' too (for the plain-jack holes) but aren't real network ports, so counting them
    // here would silently inflate rj45Count on every save (e.g. a 1U switch gets 6 ear 'rj45'
    // holes on top of its real ports — this was the actual cause of ports "shifting slightly"
    // the moment the panel was first saved).
    const ports = (device.ports ?? []).filter(p => !p.id.includes('-ear-'));
    const defaultRj45 = ports.filter(p => p.type === 'rj45' && p.group !== 'STACK').length;
    const defaultSfp = ports.filter(p => p.type === 'sfp').length;
    const defaultSfpPlus = ports.filter(p => p.type === 'sfp-plus').length;
    const defaultQsfp = ports.filter(p => p.type === 'qsfp28').length;

    container.innerHTML = `
      <div style="padding:10px 12px;font-family:monospace;font-size:11px;color:#e6ecf2;overflow-y:auto;max-height:100%;">
        <div style="color:#37b6ff;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #23303b;padding-bottom:6px;">
          &#x1F500; ${template.name}<br>
          <span style="color:#5b636a;font-size:9px;">RACK-MOUNT — ${template.heightUnits}U</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div>
            <label class="pdu-lbl">Vendor Profile</label>
            <select id="sw-vendor" class="pdu-sel">
              ${this.SWITCH_VENDORS.map(v => `<option value="${v}" ${(cfg.vendor ?? 'generic') === v ? 'selected' : ''}>${switchVendorSkin(v).brandName}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="pdu-lbl">Switch Category</label>
            <select id="sw-layer" class="pdu-sel">
              ${this.SWITCH_LAYERS.map(v => `<option value="${v}" ${(cfg.layer ?? 'L2') === v ? 'selected' : ''}>${v} ${v === 'L1' ? '(Hub)' : v === 'L2' ? '(Switch)' : '(Routing)'}</option>`).join('')}
            </select>
          </div>
        </div>

        <label class="pdu-lbl" style="margin-top:10px;">Port Counts</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div><div class="pdu-sub">RJ45 Count</div><input type="number" id="sw-rj45" class="pdu-inp" value="${cfg.rj45Count ?? defaultRj45}" min="0" max="96"/></div>
          <div><div class="pdu-sub">SFP Count</div><input type="number" id="sw-sfp" class="pdu-inp" value="${cfg.sfpCount ?? defaultSfp}" min="0" max="16"/></div>
          <div><div class="pdu-sub">SFP+ Count</div><input type="number" id="sw-sfpplus" class="pdu-inp" value="${cfg.sfpPlusCount ?? defaultSfpPlus}" min="0" max="16"/></div>
          <div><div class="pdu-sub">QSFP Count</div><input type="number" id="sw-qsfp" class="pdu-inp" value="${cfg.qsfpCount ?? defaultQsfp}" min="0" max="8"/></div>
        </div>

        <label class="pdu-lbl" style="margin-top:10px;">Features</label>
        <div id="sw-toggles" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <label class="pdu-lbl" style="margin-top:10px;">PoE Port Range</label>
        <div style="margin-bottom:5px;"><div class="pdu-sub">Start Port</div><input type="number" id="sw-poe-start" class="pdu-inp" value="${cfg.poeStartPort ?? 1}" min="1" max="${defaultRj45 || 96}"/></div>
        <div><div class="pdu-sub">End Port</div><input type="number" id="sw-poe-end" class="pdu-inp" value="${cfg.poeEndPort ?? (cfg.rj45Count ?? defaultRj45)}" min="1" max="${defaultRj45 || 96}"/></div>
        <div style="font-size:9px;color:#5b636a;margin-top:3px;">Only applies while the PoE feature chip above is on — narrows PoE to this range instead of all ports. Individual port groups below can also mark themselves PoE regardless of this range.</div>

        <label class="pdu-lbl" style="margin-top:10px;">Port Range Groups (VLAN-style)</label>
        <div style="display:grid;grid-template-columns:1.3fr 0.6fr 0.6fr 26px 30px;gap:4px;margin-bottom:3px;">
          <div class="pdu-sub">Name</div><div class="pdu-sub">Start</div><div class="pdu-sub">End</div><div class="pdu-sub">Colour</div><div class="pdu-sub" title="PoE">PoE</div>
        </div>
        <div id="sw-portgroup-rows" style="display:flex;flex-direction:column;gap:6px;"></div>
        <button id="sw-add-portgroup" style="width:100%;margin-top:5px;padding:5px;background:#0f2a1e;color:#00e0a4;border:1px dashed #1e5040;font-size:10px;cursor:pointer;border-radius:2px;">+ Add Port Group</button>

        <label class="pdu-lbl" style="margin-top:10px;">Appearance</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;align-items:end;">
          <div><div class="pdu-sub">Panel Colour</div><input type="color" id="sw-panelcolor" value="${cfg.panelColor || (skin.tone === 'light' ? '#f6f7f9' : '#23282c')}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
          <div><div class="pdu-sub">Accent Colour</div><input type="color" id="sw-accentcolor" value="${cfg.accentColor || skin.accent}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
        </div>
        <div style="margin-top:5px;">
          <div class="pdu-sub">LED Theme</div>
          <select id="sw-ledtheme" class="pdu-sel">
            ${['green', 'blue', 'amber', 'white'].map(v => `<option value="${v}" ${(cfg.ledTheme ?? 'green') === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
          </select>
        </div>

        <label class="pdu-lbl" style="margin-top:10px;">Branding</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div><div class="pdu-sub">Brand Name</div><input type="text" id="sw-brandname" class="pdu-inp" value="${cfg.brandName ?? ''}" placeholder="${skin.brandName}"/></div>
          <div><div class="pdu-sub">Model Name</div><input type="text" id="sw-modelname" class="pdu-inp" value="${cfg.modelName ?? ''}" placeholder="${template.model}"/></div>
        </div>
      </div>
      <style>
        .pdu-lbl{display:block;font-size:9px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
        .pdu-sub{font-size:9px;color:#5b636a;margin-bottom:2px}
        .pdu-sel{width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;font-family:monospace}
        .pdu-inp{width:100%;min-width:0;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;font-family:monospace;box-sizing:border-box}
        .pdu-chip{padding:3px 6px;border-radius:2px;font-size:9.5px;cursor:pointer;border:1px solid #23303b;font-family:monospace;user-select:none}
        .pdu-chip.on{background:#37b6ff;color:#000;border-color:#37b6ff}
        .pdu-chip.off{background:#171d24;color:#8b939a}
      </style>
    `;

    const activeToggles = this.initToggleSet(cfg as Record<string, unknown>, this.SWITCH_TOGGLES, ['mgmtPort', 'consolePort', 'usbPort', 'rackEars']);
    const portGroupRows: SwitchPortGroup[] = Array.isArray(cfg.portGroups) ? cfg.portGroups.map(g => ({ ...g })) : [];
    let save: () => void = () => {};
    this.renderPduChips(container, '#sw-toggles', this.SWITCH_TOGGLES, activeToggles, this.SWITCH_TOGGLE_LABELS, () => save());
    this.renderSwitchPortGroupRows(container, portGroupRows, () => save());

    save = () => {
      const newConfig: SwitchConfig = {
        vendor: (container.querySelector('#sw-vendor') as HTMLSelectElement)?.value as SwitchVendor,
        layer: (container.querySelector('#sw-layer') as HTMLSelectElement)?.value as SwitchLayer,
        rj45Count: Math.max(0, Number((container.querySelector('#sw-rj45') as HTMLInputElement)?.value ?? 24)),
        sfpCount: Math.max(0, Number((container.querySelector('#sw-sfp') as HTMLInputElement)?.value ?? 0)),
        sfpPlusCount: Math.max(0, Number((container.querySelector('#sw-sfpplus') as HTMLInputElement)?.value ?? 0)),
        qsfpCount: Math.max(0, Number((container.querySelector('#sw-qsfp') as HTMLInputElement)?.value ?? 0)),
        panelColor: (container.querySelector('#sw-panelcolor') as HTMLInputElement)?.value,
        accentColor: (container.querySelector('#sw-accentcolor') as HTMLInputElement)?.value,
        ledTheme: (container.querySelector('#sw-ledtheme') as HTMLSelectElement)?.value as LedTheme,
        brandName: (container.querySelector('#sw-brandname') as HTMLInputElement)?.value || undefined,
        modelName: (container.querySelector('#sw-modelname') as HTMLInputElement)?.value || undefined,
        poe: activeToggles.has('poe'),
        poeStartPort: Math.max(1, Number((container.querySelector('#sw-poe-start') as HTMLInputElement)?.value ?? 1)),
        poeEndPort: Math.max(1, Number((container.querySelector('#sw-poe-end') as HTMLInputElement)?.value ?? 1)),
        mgmtPort: activeToggles.has('mgmtPort'),
        consolePort: activeToggles.has('consolePort'),
        usbPort: activeToggles.has('usbPort'),
        lcd: activeToggles.has('lcd'),
        stackPorts: activeToggles.has('stackPorts'),
        rackEars: activeToggles.has('rackEars'),
        assetLabel: activeToggles.has('assetLabel'),
        dustCovers: activeToggles.has('dustCovers'),
        portGroups: portGroupRows,
      };
      eventBus.emit('device:update' as any, { id: device.id, data: { deviceConfig: newConfig } });
    };

    container.querySelector('#sw-add-portgroup')?.addEventListener('click', () => {
      const color = this.PORT_GROUP_PALETTE[portGroupRows.length % this.PORT_GROUP_PALETTE.length];
      const lastEnd = portGroupRows.length ? portGroupRows[portGroupRows.length - 1].endPort : 0;
      portGroupRows.push({ name: `VLAN${portGroupRows.length + 1}`, startPort: lastEnd + 1, endPort: lastEnd + 4, color });
      this.renderSwitchPortGroupRows(container, portGroupRows, () => save());
      save();
    });

    container.querySelectorAll('select, input[type="number"], input[type="text"]').forEach(el => el.addEventListener('change', save));
    container.querySelector('#sw-panelcolor')?.addEventListener('change', save);
    container.querySelector('#sw-accentcolor')?.addEventListener('change', save);
  }

  private readonly FIREWALL_VENDORS: FirewallVendor[] = [
    'generic', 'fortinet', 'cisco', 'paloalto', 'juniper', 'sophos', 'checkpoint', 'sonicwall', 'aruba', 'dell', 'huawei',
  ];
  private readonly FIREWALL_TOGGLES = ['mgmtPort', 'haPorts', 'usbPort', 'consolePort', 'lcd', 'rackEars', 'qrCode', 'assetLabel', 'dustCovers'];
  private readonly FIREWALL_TOGGLE_LABELS: Record<string, string> = {
    mgmtPort: 'Mgmt Port', haPorts: 'HA Ports', usbPort: 'USB', consolePort: 'Console', lcd: 'LCD',
    rackEars: 'Rack Ears', qrCode: 'QR Code', assetLabel: 'Asset Label', dustCovers: 'Dust Covers',
  };

  /** Enterprise Firewall Physical SDK configurator — mirrors renderSwitchProperties' shape;
   *  RJ45/SFP+/SFP28/QSFP counts regenerate the device's actual ports live. */
  private renderFirewallProperties(device: DeviceData, template: DeviceTemplate, container: HTMLElement): void {
    const cfg: FirewallConfig = (device.deviceConfig as FirewallConfig | undefined) ?? {};
    const skin = firewallVendorSkin(cfg.vendor);
    // Same reasoning as renderSwitchProperties: default each count to the device's actual
    // current ports rather than a hardcoded guess, so opening properties on any firewall SKU
    // whose real counts differ (every one except a device already at 16 RJ45 + 8 SFP+) doesn't
    // silently rewrite its port composition on the first save. MGMT is its own port type
    // ('management'), already excluded by the type filter; HA is a plain RJ45 jack tagged
    // `group: 'HA'` (both the new firewallPorts() and the legacy networkingPorts() firewall
    // zones tag it this way), so it's excluded explicitly.
    const ports = (device.ports ?? []).filter(p => !p.id.includes('-ear-'));
    const defaultRj45 = ports.filter(p => p.type === 'rj45' && p.group !== 'HA' && p.group !== 'WAN').length;
    const defaultWan = ports.filter(p => p.group === 'WAN').length;
    const defaultSfpPlus = ports.filter(p => p.type === 'sfp-plus').length;
    const defaultSfp28 = ports.filter(p => p.type === 'sfp28').length;
    const defaultQsfp = ports.filter(p => p.type === 'qsfp28').length;

    container.innerHTML = `
      <div style="padding:10px 12px;font-family:monospace;font-size:11px;color:#e6ecf2;overflow-y:auto;max-height:100%;">
        <div style="color:#ee3124;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #23303b;padding-bottom:6px;">
          &#x1F6E1; ${template.name}<br>
          <span style="color:#5b636a;font-size:9px;">RACK-MOUNT — ${template.heightUnits}U</span>
        </div>

        <label class="pdu-lbl">Vendor Profile</label>
        <select id="fw-vendor" class="pdu-sel">
          ${this.FIREWALL_VENDORS.map(v => `<option value="${v}" ${(cfg.vendor ?? 'generic') === v ? 'selected' : ''}>${firewallVendorSkin(v).brandName}</option>`).join('')}
        </select>

        <label class="pdu-lbl" style="margin-top:10px;">Port Groups</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div><div class="pdu-sub">WAN Count</div><input type="number" id="fw-wan" class="pdu-inp" value="${cfg.wanCount ?? defaultWan}" min="0" max="8"/></div>
          <div><div class="pdu-sub">RJ45 (LAN) Count</div><input type="number" id="fw-rj45" class="pdu-inp" value="${cfg.rj45Count ?? defaultRj45}" min="0" max="64"/></div>
          <div><div class="pdu-sub">SFP+ Count</div><input type="number" id="fw-sfpplus" class="pdu-inp" value="${cfg.sfpPlusCount ?? defaultSfpPlus}" min="0" max="24"/></div>
          <div><div class="pdu-sub">SFP28 Count</div><input type="number" id="fw-sfp28" class="pdu-inp" value="${cfg.sfp28Count ?? defaultSfp28}" min="0" max="16"/></div>
          <div><div class="pdu-sub">QSFP Count</div><input type="number" id="fw-qsfp" class="pdu-inp" value="${cfg.qsfpCount ?? defaultQsfp}" min="0" max="8"/></div>
        </div>

        <label class="pdu-lbl" style="margin-top:10px;">Features</label>
        <div id="fw-toggles" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <label class="pdu-lbl" style="margin-top:10px;">Port Range Groups (WAN/LAN/PoE/10GbE/25GbE etc.)</label>
        <div style="display:grid;grid-template-columns:1.3fr 0.6fr 0.6fr 26px 30px;gap:4px;margin-bottom:3px;">
          <div class="pdu-sub">Name</div><div class="pdu-sub">Start</div><div class="pdu-sub">End</div><div class="pdu-sub">Colour</div><div class="pdu-sub" title="PoE">PoE</div>
        </div>
        <div id="fw-portgroup-rows" style="display:flex;flex-direction:column;gap:6px;"></div>
        <button id="fw-add-portgroup" style="width:100%;margin-top:5px;padding:5px;background:#2a0f0f;color:#ff8a70;border:1px dashed #502020;font-size:10px;cursor:pointer;border-radius:2px;">+ Add Port Group</button>
        <div style="font-size:9px;color:#5b636a;margin-top:3px;">Start/End are LAN (RJ45) port numbers — this labels/colours ranges of the LAN block, e.g. a range for PoE or a fast-Ethernet zone.</div>

        <label class="pdu-lbl" style="margin-top:10px;">Appearance</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;align-items:end;">
          <div><div class="pdu-sub">Panel Colour</div><input type="color" id="fw-panelcolor" value="${cfg.panelColor || (skin.tone === 'light' ? '#f6f7f9' : '#23282c')}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
          <div><div class="pdu-sub">Accent Colour</div><input type="color" id="fw-accentcolor" value="${cfg.accentColor || skin.accent}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">
          <div><div class="pdu-sub">Branding Strip</div><input type="color" id="fw-stripcolor" value="${cfg.brandStripColor || skin.accent}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
          <div>
            <div class="pdu-sub">LED Theme</div>
            <select id="fw-ledtheme" class="pdu-sel">
              ${['green', 'blue', 'amber', 'white'].map(v => `<option value="${v}" ${(cfg.ledTheme ?? 'green') === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">
          <div><div class="pdu-sub">Font Colour</div><input type="color" id="fw-fontcolor" value="${cfg.fontColor || (skin.tone === 'light' ? '#5a616a' : '#aeb6bd')}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
          <div><div class="pdu-sub">Font Mute Colour</div><input type="color" id="fw-fontmutecolor" value="${cfg.fontMuteColor || (skin.tone === 'light' ? '#8a9099' : '#8b939a')}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/></div>
        </div>
        <div style="font-size:9px;color:#5b636a;margin-top:3px;">Font Colour: port numbers/names (HA, WAN1, MGMT, RJ45 #s). Font Mute Colour: model name, zone captions (WAN/UPLINK), USB-C/RST, status line.</div>

        <label class="pdu-lbl" style="margin-top:10px;">Branding</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div><div class="pdu-sub">Brand Name</div><input type="text" id="fw-brandname" class="pdu-inp" value="${cfg.brandName ?? ''}" placeholder="${skin.brandName}"/></div>
          <div><div class="pdu-sub">Model Name</div><input type="text" id="fw-modelname" class="pdu-inp" value="${cfg.modelName ?? ''}" placeholder="${template.model}"/></div>
        </div>
      </div>
      <style>
        .pdu-lbl{display:block;font-size:9px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
        .pdu-sub{font-size:9px;color:#5b636a;margin-bottom:2px}
        .pdu-sel{width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;font-family:monospace}
        .pdu-inp{width:100%;min-width:0;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;font-family:monospace;box-sizing:border-box}
        .pdu-chip{padding:3px 6px;border-radius:2px;font-size:9.5px;cursor:pointer;border:1px solid #23303b;font-family:monospace;user-select:none}
        .pdu-chip.on{background:#ee3124;color:#fff;border-color:#ee3124}
        .pdu-chip.off{background:#171d24;color:#8b939a}
      </style>
    `;

    const activeToggles = this.initToggleSet(cfg as Record<string, unknown>, this.FIREWALL_TOGGLES, ['mgmtPort', 'haPorts', 'consolePort', 'usbPort', 'rackEars']);
    const portGroupRows: SwitchPortGroup[] = Array.isArray(cfg.portGroups) ? cfg.portGroups.map(g => ({ ...g })) : [];
    let save: () => void = () => {};
    this.renderPduChips(container, '#fw-toggles', this.FIREWALL_TOGGLES, activeToggles, this.FIREWALL_TOGGLE_LABELS, () => save());
    this.renderSwitchPortGroupRows(container, portGroupRows, () => save(), '#fw-portgroup-rows');

    save = () => {
      const newConfig: FirewallConfig = {
        vendor: (container.querySelector('#fw-vendor') as HTMLSelectElement)?.value as FirewallVendor,
        wanCount: Math.max(0, Number((container.querySelector('#fw-wan') as HTMLInputElement)?.value ?? 0)),
        rj45Count: Math.max(0, Number((container.querySelector('#fw-rj45') as HTMLInputElement)?.value ?? 16)),
        sfpPlusCount: Math.max(0, Number((container.querySelector('#fw-sfpplus') as HTMLInputElement)?.value ?? 0)),
        sfp28Count: Math.max(0, Number((container.querySelector('#fw-sfp28') as HTMLInputElement)?.value ?? 0)),
        qsfpCount: Math.max(0, Number((container.querySelector('#fw-qsfp') as HTMLInputElement)?.value ?? 0)),
        panelColor: (container.querySelector('#fw-panelcolor') as HTMLInputElement)?.value,
        accentColor: (container.querySelector('#fw-accentcolor') as HTMLInputElement)?.value,
        brandStripColor: (container.querySelector('#fw-stripcolor') as HTMLInputElement)?.value,
        fontColor: (container.querySelector('#fw-fontcolor') as HTMLInputElement)?.value,
        fontMuteColor: (container.querySelector('#fw-fontmutecolor') as HTMLInputElement)?.value,
        ledTheme: (container.querySelector('#fw-ledtheme') as HTMLSelectElement)?.value as LedTheme,
        brandName: (container.querySelector('#fw-brandname') as HTMLInputElement)?.value || undefined,
        modelName: (container.querySelector('#fw-modelname') as HTMLInputElement)?.value || undefined,
        mgmtPort: activeToggles.has('mgmtPort'),
        haPorts: activeToggles.has('haPorts'),
        usbPort: activeToggles.has('usbPort'),
        consolePort: activeToggles.has('consolePort'),
        lcd: activeToggles.has('lcd'),
        rackEars: activeToggles.has('rackEars'),
        qrCode: activeToggles.has('qrCode'),
        assetLabel: activeToggles.has('assetLabel'),
        dustCovers: activeToggles.has('dustCovers'),
        portGroups: portGroupRows,
      };
      eventBus.emit('device:update' as any, { id: device.id, data: { deviceConfig: newConfig } });
    };

    container.querySelector('#fw-add-portgroup')?.addEventListener('click', () => {
      const color = this.PORT_GROUP_PALETTE[portGroupRows.length % this.PORT_GROUP_PALETTE.length];
      const lastEnd = portGroupRows.length ? portGroupRows[portGroupRows.length - 1].endPort : 0;
      portGroupRows.push({ name: `LAN-GRP${portGroupRows.length + 1}`, startPort: lastEnd + 1, endPort: lastEnd + 4, color });
      this.renderSwitchPortGroupRows(container, portGroupRows, () => save(), '#fw-portgroup-rows');
      save();
    });

    container.querySelectorAll('select, input[type="number"], input[type="text"]').forEach(el => el.addEventListener('change', save));
    container.querySelector('#fw-panelcolor')?.addEventListener('change', save);
    container.querySelector('#fw-accentcolor')?.addEventListener('change', save);
    container.querySelector('#fw-stripcolor')?.addEventListener('change', save);
    container.querySelector('#fw-fontcolor')?.addEventListener('change', save);
    container.querySelector('#fw-fontmutecolor')?.addEventListener('change', save);
  }

  /** Unified PDU configurator — used for both horizontal (rack-mount) and vertical (0U side-mount) PDUs. */
  private renderPduProperties(device: DeviceData, template: DeviceTemplate, container: HTMLElement): void {
    const cfg: PduConfig = (device.deviceConfig as PduConfig | undefined) ?? {};
    const elec = cfg.electrical ?? {};
    const enc = cfg.enclosure ?? {};
    const isVertical = template.mountType === 'side';

    const headerBadge = isVertical
      ? `${device.sideMountPosition?.toUpperCase() ?? ''} WALL — 0U`
      : `RACK-MOUNT — ${template.heightUnits}U`;

    container.innerHTML = `
      <div style="padding:10px 12px;font-family:monospace;font-size:11px;color:#e6ecf2;overflow-y:auto;max-height:100%;">
        <!-- Header -->
        <div style="color:#37b6ff;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;border-bottom:1px solid #23303b;padding-bottom:6px;">
          &#x26A1; ${template.name}<br>
          <span style="color:#5b636a;font-size:9px;">${headerBadge}</span>
        </div>

        <!-- Category + Manufacturer -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div>
            <label class="pdu-lbl">Category</label>
            <select id="pdu-cat" class="pdu-sel">
              ${['basic','metered','meteredOutlet','switched','managed','smart','intelligent','monitored','highDensity'].map(v=>`<option value="${v}" ${(cfg.category??'switched')===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="pdu-lbl">Manufacturer</label>
            <select id="pdu-mfr" class="pdu-sel">
              ${[['apc','APC'],['vertiv','Vertiv'],['generic','Generic']].map(([v,l])=>`<option value="${v}" ${(cfg.manufacturer??'generic')===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Electrical -->
        <label class="pdu-lbl" style="margin-top:10px;">Electrical</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div>
            <div class="pdu-sub">Phase</div>
            <select id="pdu-phase" class="pdu-sel">
              <option value="single" ${(elec.phase??'single')==='single'?'selected':''}>Single Phase</option>
              <option value="three" ${elec.phase==='three'?'selected':''}>Three Phase</option>
              <option value="split" ${elec.phase==='split'?'selected':''}>Split Phase</option>
            </select>
          </div>
          <div>
            <div class="pdu-sub">Voltage (V)</div>
            <select id="pdu-voltage" class="pdu-sel">
              ${[110,120,208,220,230,240,380,400,415].map(v=>`<option value="${v}" ${(elec.voltage??230)===v?'selected':''}>${v}V</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top:5px;">
          <div class="pdu-sub">Max Current (A)</div>
          <input type="number" id="pdu-current" class="pdu-inp" value="${elec.currentA??32}" min="6" max="63"/>
        </div>

        <!-- Input Supply -->
        <label class="pdu-lbl" style="margin-top:10px;">Input Supply</label>
        <div>
          <div class="pdu-sub">Input Plug</div>
          <select id="pdu-inputplug" class="pdu-sel">
            <option value="iec60309-32a" ${(cfg.inputPlug??'iec60309-32a')==='iec60309-32a'?'selected':''}>IEC 60309 32A (Blue)</option>
            <option value="iec60309-16a" ${cfg.inputPlug==='iec60309-16a'?'selected':''}>IEC 60309 16A (Blue)</option>
            <option value="bs1363" ${cfg.inputPlug==='bs1363'?'selected':''}>UK BS 1363 13A</option>
            <option value="nema515" ${cfg.inputPlug==='nema515'?'selected':''}>NEMA 5-15P (US)</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">
          <div>
            <div class="pdu-sub">Cord Length (m)</div>
            <input type="number" id="pdu-cordlen" class="pdu-inp" value="${cfg.cordLen??3}" min="1" max="10"/>
          </div>
          <div>
            <div class="pdu-sub">Cord CSA (mm&#xB2;)</div>
            <select id="pdu-csa" class="pdu-sel">
              ${[1.5,2.5,4,6,10].map(v=>`<option value="${v}" ${(cfg.cordCsa??6)==v?'selected':''}>${v}mm&#xB2;</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top:5px;">
          <div class="pdu-sub">Cable Entry</div>
          <select id="pdu-cableentry" class="pdu-sel">
            ${['top','bottom','left','right'].map(v=>`<option value="${v}" ${(cfg.cableEntry??'top')===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div style="margin-top:5px;display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="pdu-frls" ${cfg.frls!==false?'checked':''}/>
          <label for="pdu-frls" style="font-size:10px;color:#8b939a;cursor:pointer;">FRLS Cable (Fire Resistant Low Smoke)</label>
        </div>

        <!-- Outlet Composition -->
        <label class="pdu-lbl" style="margin-top:10px;">Outlet Composition</label>
        <div id="pdu-outlet-rows" style="display:flex;flex-direction:column;gap:4px;"></div>
        <button id="pdu-add-row" style="width:100%;margin-top:5px;padding:5px;background:#0f2a1e;color:#00e0a4;border:1px dashed #1e5040;font-size:10px;cursor:pointer;border-radius:2px;">+ Add Outlet Group</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">
          <div>
            <div class="pdu-sub">Layout</div>
            <select id="pdu-layout" class="pdu-sel">
              ${['single','dual','triple'].map(v=>`<option value="${v}" ${(cfg.sockets?.layout??'single')===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="pdu-sub">Rotation</div>
            <select id="pdu-rotation" class="pdu-sel">
              <option value="0" ${!cfg.sockets?.rotationDeg || cfg.sockets?.rotationDeg===0?'selected':''}>0&#xB0;</option>
              <option value="90" ${cfg.sockets?.rotationDeg===90?'selected':''}>90&#xB0;</option>
              <option value="180" ${cfg.sockets?.rotationDeg===180?'selected':''}>180&#xB0;</option>
              <option value="alternate" ${cfg.sockets?.rotationDeg==='alternate'?'selected':''}>Alternate</option>
            </select>
          </div>
        </div>

        <!-- Protection -->
        <label class="pdu-lbl" style="margin-top:10px;">Protection / Breaker</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
          <div>
            <div class="pdu-sub">Breaker Type</div>
            <select id="pdu-breaker" class="pdu-sel">
              <option value="none" ${cfg.breaker==='none'?'selected':''}>None</option>
              <option value="mcb" ${cfg.breaker==='mcb'?'selected':''}>MCB</option>
              <option value="mcb-guarded" ${(cfg.breaker??'mcb-guarded')==='mcb-guarded'?'selected':''}>MCB + Guard</option>
              <option value="hydraulic" ${cfg.breaker==='hydraulic'?'selected':''}>Hydraulic</option>
              <option value="electronic" ${cfg.breaker==='electronic'?'selected':''}>Electronic</option>
              <option value="locking" ${cfg.breaker==='locking'?'selected':''}>Locking</option>
            </select>
          </div>
          <div>
            <div class="pdu-sub">MCB Curve</div>
            <select id="pdu-mcbcurve" class="pdu-sel">
              <option value="B" ${(cfg.mcbCurve??'D')==='B'?'selected':''}>B-Curve</option>
              <option value="C" ${cfg.mcbCurve==='C'?'selected':''}>C-Curve</option>
              <option value="D" ${(cfg.mcbCurve??'D')==='D'?'selected':''}>D-Curve</option>
            </select>
          </div>
        </div>

        <!-- Smart Features -->
        <label class="pdu-lbl" style="margin-top:10px;">Smart Features</label>
        <div id="pdu-features" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <!-- Environmental Sensors -->
        <label class="pdu-lbl" style="margin-top:8px;">Environmental Sensors</label>
        <div id="pdu-envsensors" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <!-- Network Ports -->
        <label class="pdu-lbl" style="margin-top:8px;">Network Ports</label>
        <div id="pdu-netports" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <!-- Wireless -->
        <label class="pdu-lbl" style="margin-top:8px;">Wireless</label>
        <div id="pdu-wireless" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <!-- LEDs -->
        <label class="pdu-lbl" style="margin-top:8px;">Status LEDs</label>
        <div id="pdu-leds" style="display:flex;flex-wrap:wrap;gap:3px;"></div>

        <!-- Enclosure -->
        <label class="pdu-lbl" style="margin-top:10px;">Enclosure</label>
        <div>
          <div class="pdu-sub">Finish</div>
          <select id="pdu-finish" class="pdu-sel">
            <option value="ral9005-texture" ${(enc.finish??'ral9005-texture')==='ral9005-texture'?'selected':''}>RAL 9005 Texture (Jet Black)</option>
            <option value="black" ${enc.finish==='black'?'selected':''}>Smooth Black</option>
            <option value="darkGrey" ${enc.finish==='darkGrey'?'selected':''}>Dark Grey</option>
            <option value="lightGrey" ${enc.finish==='lightGrey'?'selected':''}>Light Grey</option>
            <option value="white" ${enc.finish==='white'?'selected':''}>White</option>
            <option value="brushedAluminium" ${enc.finish==='brushedAluminium'?'selected':''}>Brushed Aluminium</option>
            <option value="customRal" ${enc.finish==='customRal'?'selected':''}>Custom RAL / Hex&#8230;</option>
          </select>
        </div>
        <div id="pdu-custom-color-row" style="margin-top:5px;align-items:center;gap:8px;display:${enc.finish==='customRal'?'flex':'none'};">
          <input type="color" id="pdu-custom-color" value="${enc.customHex ?? '#1a1a1a'}" style="width:36px;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/>
          <span style="font-size:9px;color:#5b636a;">Custom body colour</span>
        </div>
        <div style="margin-top:5px;">
          <div class="pdu-sub">Outlet Face Colour</div>
          <select id="pdu-outletface" class="pdu-sel">
            ${['white','black'].map(v=>`<option value="${v}" ${(enc.outletFace??'white')===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}
          </select>
        </div>

        <!-- Branding / Labels -->
        <label class="pdu-lbl" style="margin-top:10px;">Branding &amp; Labels</label>
        <div>
          <div class="pdu-sub">Branding</div>
          <select id="pdu-branding" class="pdu-sel">
            <option value="manufacturer" ${(cfg.branding??'manufacturer')==='manufacturer'?'selected':''}>Manufacturer Logo</option>
            <option value="rackSlicer" ${cfg.branding==='rackSlicer'?'selected':''}>Rack Slicer</option>
            <option value="none" ${cfg.branding==='none'?'selected':''}>None</option>
          </select>
        </div>
        <div id="pdu-labels" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;"></div>

        <!-- Metadata / BOM / JSON -->
        <div style="margin-top:12px;border-top:1px solid #23303b;padding-top:8px;">
          <div class="pdu-lbl" id="pdu-inspector-toggle" style="cursor:pointer;">&#x25B8; Metadata / BOM / JSON</div>
          <pre id="pdu-inspector-body" style="display:none;font-size:9px;color:#8b939a;white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font-family:monospace;line-height:1.5;"></pre>
        </div>
      </div>

      <style>
        .pdu-lbl{display:block;font-size:9px;color:#8b939a;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
        .pdu-sub{font-size:9px;color:#5b636a;margin-bottom:2px}
        .pdu-sel{width:100%;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;font-family:monospace}
        .pdu-inp{width:100%;min-width:0;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:4px;font-size:10px;border-radius:2px;font-family:monospace;box-sizing:border-box}
        .pdu-chip{padding:3px 6px;border-radius:2px;font-size:9.5px;cursor:pointer;border:1px solid #23303b;font-family:monospace;user-select:none}
        .pdu-chip.on{background:#37b6ff;color:#000;border-color:#37b6ff}
        .pdu-chip.off{background:#171d24;color:#8b939a}
      </style>
    `;

    // Outlet composition rows — new `composition` field, falling back to the legacy `rows` shape
    // (still used by several catalog defaults) and finally to the template's own outletConfig.
    const legacyRows = (device.deviceConfig as { rows?: Array<{ type?: string; socketType?: string; count: number }> } | undefined)?.rows;
    const outletRows: PduOutletGroup[] =
      Array.isArray(cfg.composition) ? cfg.composition.map(r => ({ ...r })) :
      Array.isArray(legacyRows) ? legacyRows.map(r => ({ type: (r.type ?? r.socketType ?? 'C13') as SocketType, count: r.count })) :
      (template.outletConfig?.map(r => ({ type: r.socketType, count: r.count })) ?? [{ type: 'C13' as SocketType, count: 8 }]);

    // Declare save before it's used in renderPduOutletRows
    let save: () => void;

    this.renderPduOutletRows(container, outletRows, () => save());

    // Smart feature chips. Energy Meter, Voltage Monitor, Current Monitor, and Power Factor
    // were previously all offered as separate chips, but every one of them triggers the exact
    // same single generic meter readout — they were indistinguishable duplicates of "Power
    // Meter" with no distinct visible effect, so consolidated down to one.
    const SMART_FEATURES = ['powerMeter','lcd','oled','touch','snmp','redfish','restApi','modbus','bacnet'];
    const SMART_LABELS: Record<string,string> = {
      powerMeter:'Power Meter',lcd:'LCD',oled:'OLED',touch:'Touchscreen',
      snmp:'SNMP',redfish:'Redfish',restApi:'REST API',modbus:'Modbus',bacnet:'BACnet',
    };
    // Nothing is pre-selected here — a chip showing "on" before the user has touched anything
    // is misleading (clicking an already-active chip turns it OFF), and previously caused
    // every fresh PDU to silently inherit a "smart" feature set the instant any field was
    // saved. Start blank; whatever the user actually picks is exactly what renders.
    const activeFeatures = new Set<string>(Array.isArray(cfg.smartFeatures) ? cfg.smartFeatures : []);
    this.renderPduChips(container, '#pdu-features', SMART_FEATURES, activeFeatures, SMART_LABELS, () => save());

    // Environmental sensor chips
    const ENV_SENSORS = ['temp','humidity','smoke','door','leak'];
    const activeEnvSensors = new Set<string>(Array.isArray(cfg.envSensors) ? cfg.envSensors : []);
    this.renderPduChips(container, '#pdu-envsensors', ENV_SENSORS, activeEnvSensors, {}, () => save());

    // Network port chips
    const NET_PORTS = ['rj45','sfp','usb','usbC','serial','console','microUsb'];
    const activeNetPorts = new Set<string>(Array.isArray(cfg.networkPorts) ? cfg.networkPorts : []);
    this.renderPduChips(container, '#pdu-netports', NET_PORTS, activeNetPorts, {}, () => save());

    // Wireless chips
    const WIRELESS = ['wifi','bluetooth'];
    const activeWireless = new Set<string>(Array.isArray(cfg.wireless) ? cfg.wireless : []);
    this.renderPduChips(container, '#pdu-wireless', WIRELESS, activeWireless, {}, () => save());

    // LED chips
    const LED_OPTS = ['power','network','alarm','outlet','rgb'];
    const activeLeds = new Set<string>(Array.isArray(cfg.leds) ? cfg.leds : ['power']);
    this.renderPduChips(container, '#pdu-leds', LED_OPTS, activeLeds, {}, () => save());

    // Label chips
    const LABEL_OPTS = ['model','voltage','current','serial','qr','asset','warning','safety','barcode'];
    const activeLabels = new Set<string>(Array.isArray(cfg.labels) ? cfg.labels : ['model','voltage','current']);
    this.renderPduChips(container, '#pdu-labels', LABEL_OPTS, activeLabels, {}, () => save());

    // Custom RAL swatch visibility
    container.querySelector('#pdu-finish')?.addEventListener('change', (e: any) => {
      const row = container.querySelector<HTMLElement>('#pdu-custom-color-row');
      if (row) row.style.display = e.target.value === 'customRal' ? 'flex' : 'none';
    });

    // Metadata / BOM / JSON collapsible inspector
    const inspectorBody = container.querySelector<HTMLElement>('#pdu-inspector-body');
    container.querySelector('#pdu-inspector-toggle')?.addEventListener('click', () => {
      if (!inspectorBody) return;
      const showing = inspectorBody.style.display !== 'none';
      inspectorBody.style.display = showing ? 'none' : 'block';
      if (!showing) inspectorBody.textContent = this.buildPduInspectorText(device, template);
    });

    // Save function — reads all controls and emits device:update
    save = () => {
      const newConfig: PduConfig = {
        category: (container.querySelector('#pdu-cat') as HTMLSelectElement)?.value as PduConfig['category'],
        manufacturer: (container.querySelector('#pdu-mfr') as HTMLSelectElement)?.value as PduConfig['manufacturer'],
        electrical: {
          phase: (container.querySelector('#pdu-phase') as HTMLSelectElement)?.value as any,
          voltage: Number((container.querySelector('#pdu-voltage') as HTMLSelectElement)?.value ?? 230),
          currentA: Number((container.querySelector('#pdu-current') as HTMLInputElement)?.value ?? 32),
        },
        inputPlug: (container.querySelector('#pdu-inputplug') as HTMLSelectElement)?.value ?? 'iec60309-32a',
        cordLen: Number((container.querySelector('#pdu-cordlen') as HTMLInputElement)?.value ?? 3),
        cordCsa: Number((container.querySelector('#pdu-csa') as HTMLSelectElement)?.value ?? 6),
        cableEntry: (container.querySelector('#pdu-cableentry') as HTMLSelectElement)?.value as PduConfig['cableEntry'],
        frls: (container.querySelector('#pdu-frls') as HTMLInputElement)?.checked ?? true,
        composition: outletRows,
        sockets: {
          layout: (container.querySelector('#pdu-layout') as HTMLSelectElement)?.value as any,
          rotationDeg: (() => {
            const v = (container.querySelector('#pdu-rotation') as HTMLSelectElement)?.value;
            return v === 'alternate' ? 'alternate' : Number(v ?? 0);
          })(),
        },
        breaker: (container.querySelector('#pdu-breaker') as HTMLSelectElement)?.value as PduConfig['breaker'],
        mcbCurve: (container.querySelector('#pdu-mcbcurve') as HTMLSelectElement)?.value as PduConfig['mcbCurve'],
        smartFeatures: Array.from(activeFeatures),
        envSensors: Array.from(activeEnvSensors),
        networkPorts: Array.from(activeNetPorts),
        wireless: Array.from(activeWireless),
        leds: Array.from(activeLeds),
        enclosure: {
          finish: (container.querySelector('#pdu-finish') as HTMLSelectElement)?.value ?? 'ral9005-texture',
          customHex: (container.querySelector('#pdu-custom-color') as HTMLInputElement)?.value,
          outletFace: (container.querySelector('#pdu-outletface') as HTMLSelectElement)?.value as any,
        },
        branding: (container.querySelector('#pdu-branding') as HTMLSelectElement)?.value as PduConfig['branding'],
        labels: Array.from(activeLabels),
      };
      eventBus.emit('device:update' as any, { id: device.id, data: { deviceConfig: newConfig } });
      const inspBody = container.querySelector<HTMLElement>('#pdu-inspector-body');
      if (inspBody && inspBody.style.display !== 'none') inspBody.textContent = this.buildPduInspectorText(device, template);
    };

    // Wire up select/input change handlers
    container.querySelectorAll('select, input[type="number"]').forEach(el =>
      el.addEventListener('change', save)
    );
    container.querySelector('#pdu-frls')?.addEventListener('change', save);
    container.querySelector('#pdu-custom-color')?.addEventListener('change', save);

    // Add outlet row button
    container.querySelector('#pdu-add-row')?.addEventListener('click', () => {
      outletRows.push({ type: 'C13', count: 8 });
      this.renderPduOutletRows(container, outletRows, () => save());
      save();
    });
  }

  /** Shared chip-toggle-group renderer used by every PDU smart-feature/sensor/port/LED/label section. */
  private renderPduChips(container: HTMLElement, selector: string, options: string[], active: Set<string>, labels: Record<string,string>, onChange: () => void): void {
    const el = container.querySelector(selector);
    if (!el) return;
    options.forEach(opt => {
      const chip = document.createElement('span');
      chip.className = `pdu-chip ${active.has(opt)?'on':'off'}`;
      chip.textContent = labels[opt] ?? (opt.charAt(0).toUpperCase() + opt.slice(1));
      chip.onclick = () => {
        active.has(opt) ? active.delete(opt) : active.add(opt);
        chip.className = `pdu-chip ${active.has(opt)?'on':'off'}`;
        onChange();
      };
      el.appendChild(chip);
    });
  }

  private renderPduOutletRows(container: HTMLElement, rows: PduOutletGroup[], onSave: () => void): void {
    const rowsEl = container.querySelector('#pdu-outlet-rows');
    if (!rowsEl) return;
    rowsEl.innerHTML = '';

    const SOCKET_TYPES: [SocketType, string][] = [
      ['C13','IEC C13'],['C19','IEC C19'],['C15','IEC C15 (Hi-Temp)'],
      ['IS6538-5A','IS 6538 5A (India D)'],['IS6538-15A','IS 6538 15A (India M)'],
      ['IS1293-6A','IS 1293 6A (India 2+E)'],['IS1293-16A','IS 1293 16A (India 2+E)'],
      ['NEMA-5-15','NEMA 5-15 (US 15A)'],['NEMA-5-20','NEMA 5-20 (US 20A)'],
      ['NEMA-L5-30','NEMA L5-30 (Locking)'],['NEMA-L6-20','NEMA L6-20 (Locking)'],
      ['BS1363','BS 1363 (UK 13A)'],['Schuko','Schuko (EU)'],
    ];

    rows.forEach((row, idx) => {
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:grid;grid-template-columns:2fr 0.8fr 22px;gap:4px;align-items:center;';
      rowEl.innerHTML = `
        <select style="background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:3px;font-size:10px;border-radius:2px;font-family:monospace;">
          ${SOCKET_TYPES.map(([v,l])=>`<option value="${v}" ${row.type===v?'selected':''}>${l}</option>`).join('')}
        </select>
        <input type="number" value="${row.count}" min="1" max="96" style="background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:3px;font-size:10px;border-radius:2px;font-family:monospace;"/>
        <button title="Remove" style="background:#2a1416;color:#ff8080;border:1px solid #4a2020;cursor:pointer;border-radius:2px;height:24px;font-size:13px;padding:0;">&#xD7;</button>
      `;

      const [selEl, numEl, delBtn] = rowEl.querySelectorAll('select, input, button');
      selEl.addEventListener('change', () => { rows[idx].type = (selEl as HTMLSelectElement).value as SocketType; onSave(); });
      numEl.addEventListener('change', () => { rows[idx].count = Number((numEl as HTMLInputElement).value); onSave(); });
      delBtn.addEventListener('click', () => {
        if (rows.length <= 1) return;
        rows.splice(idx, 1);
        this.renderPduOutletRows(container, rows, onSave);
        onSave();
      });

      rowsEl.appendChild(rowEl);
    });
  }

  /** Named, coloured port-range groups (WAN/LAN/PoE/10GbE/25GbE/VLAN-style visual grouping only,
   *  no switching logic) — same add/edit/remove row pattern as renderPduOutletRows. Shared by
   *  both the Switch and Firewall configurators via `rowsContainerSelector`. */
  private renderSwitchPortGroupRows(container: HTMLElement, rows: SwitchPortGroup[], onSave: () => void, rowsContainerSelector = '#sw-portgroup-rows'): void {
    const rowsEl = container.querySelector(rowsContainerSelector);
    if (!rowsEl) return;
    rowsEl.innerHTML = '';

    rows.forEach((row, idx) => {
      // Each group is its own bordered card — the delete action is a full-width labeled button
      // below the fields, not a cramped icon squeezed into the grid, so it's unmistakable.
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #23303b;border-radius:4px;padding:5px;background:rgba(255,255,255,0.02);';

      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:grid;grid-template-columns:1.3fr 0.6fr 0.6fr 26px 30px;gap:4px;align-items:center;';
      rowEl.innerHTML = `
        <input type="text" value="${row.name}" placeholder="Name" style="width:100%;min-width:0;box-sizing:border-box;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:3px;font-size:10px;border-radius:2px;font-family:monospace;"/>
        <input type="number" value="${row.startPort}" min="1" title="Start port" style="width:100%;min-width:0;box-sizing:border-box;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:3px;font-size:10px;border-radius:2px;font-family:monospace;"/>
        <input type="number" value="${row.endPort}" min="1" title="End port" style="width:100%;min-width:0;box-sizing:border-box;background:#171d24;border:1px solid #23303b;color:#e6ecf2;padding:3px;font-size:10px;border-radius:2px;font-family:monospace;"/>
        <input type="color" value="${row.color}" style="width:100%;height:24px;padding:0;border:1px solid #23303b;border-radius:2px;background:#171d24;"/>
        <input type="checkbox" title="PoE on these ports" ${row.poe ? 'checked' : ''} style="width:16px;height:16px;margin:0 auto;display:block;cursor:pointer;"/>
      `;

      const [nameEl, startEl, endEl, colorEl, poeEl] = rowEl.querySelectorAll('input');
      nameEl.addEventListener('change', () => { rows[idx].name = (nameEl as HTMLInputElement).value; onSave(); });
      startEl.addEventListener('change', () => { rows[idx].startPort = Number((startEl as HTMLInputElement).value) || 1; onSave(); });
      endEl.addEventListener('change', () => { rows[idx].endPort = Number((endEl as HTMLInputElement).value) || 1; onSave(); });
      colorEl.addEventListener('change', () => { rows[idx].color = (colorEl as HTMLInputElement).value; onSave(); });
      poeEl.addEventListener('change', () => { rows[idx].poe = (poeEl as HTMLInputElement).checked; onSave(); });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '🗑 Delete Group';
      delBtn.style.cssText = 'width:100%;margin-top:5px;padding:4px;background:#2a1416;color:#ff8080;border:1px solid #4a2020;border-radius:2px;font-size:10px;font-weight:600;cursor:pointer;';
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        rows.splice(idx, 1);
        this.renderSwitchPortGroupRows(container, rows, onSave, rowsContainerSelector);
        onSave();
      });

      card.appendChild(rowEl);
      card.appendChild(delBtn);
      rowsEl.appendChild(card);
    });
  }

  /** Builds the compact Metadata / BOM / JSON text block shown in the PDU inspector section. */
  private buildPduInspectorText(device: DeviceData, template: DeviceTemplate): string {
    const cfg: PduConfig = (device.deviceConfig as PduConfig | undefined) ?? {};
    const elec = cfg.electrical ?? {};
    const composition = Array.isArray(cfg.composition) ? cfg.composition : (template.outletConfig?.map(r => ({ type: r.socketType, count: r.count })) ?? []);
    const totalOutlets = composition.reduce((n, r) => n + (r.count || 0), 0);
    const { watts } = computePduLoad(device.id);
    const ratedW = (elec.voltage ?? 230) * (elec.currentA ?? 32);

    const metadata = [
      `id: pdu-${cfg.category ?? 'basic'}-${totalOutlets}outlets`,
      `vendor: ${cfg.branding === 'none' ? '—' : (cfg.manufacturer ?? 'generic')}`,
      `model: ${template.model}`,
      `outlets: ${totalOutlets} (${composition.map(r => `${r.count}×${r.type}`).join(', ') || '—'})`,
      `rated: ${elec.voltage ?? 230}V / ${elec.currentA ?? 32}A / ${elec.phase ?? 'single'}-phase (${ratedW}W)`,
      `breaker: ${cfg.breaker && cfg.breaker !== 'none' ? `${cfg.mcbCurve ?? 'D'}${elec.currentA ?? 32} MCB` : 'none'}`,
      `finish: ${cfg.enclosure?.finish ?? 'ral9005-texture'}`,
      `live load: ${Math.round(watts)}W (${ratedW > 0 ? Math.round((watts / ratedW) * 100) : 0}% of rated)`,
    ].join('\n');

    const bomLines = [`1× ${cfg.enclosure?.finish ?? 'ral9005-texture'} enclosure`];
    composition.forEach(r => bomLines.push(`${r.count}× ${r.type} outlet`));
    if (cfg.inputPlug) bomLines.push(`1× ${cfg.inputPlug} input plug`);
    bomLines.push(`1× ${cfg.cordCsa ?? 6}mm² × ${cfg.cordLen ?? 3}m ${cfg.frls !== false ? 'FRLS' : 'std'} cord`);
    if (cfg.breaker && cfg.breaker !== 'none') bomLines.push(`1× ${cfg.mcbCurve ?? 'D'}-curve MCB${cfg.breaker === 'mcb-guarded' ? ' with safety guard' : ''}`);
    (cfg.networkPorts ?? []).forEach(p => bomLines.push(`1× ${p} network port`));
    (cfg.envSensors ?? []).forEach(s => bomLines.push(`1× ${s} sensor`));

    const json = JSON.stringify(cfg, null, 2);

    return `METADATA\n${metadata}\n\nBOM\n${bomLines.join('\n')}\n\nJSON\n${json}`;
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

    const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
    const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
    const activeAnchors = (cable.anchorPoints && cable.anchorPoints.length > 0)
      ? cable.anchorPoints
      : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos));

    const anchorStatus = cable.anchorsLocked
      ? `<span style="color:#43a047;">● Custom (${activeAnchors.length} points)</span>`
      : `<span style="color:#78909c;">◌ Auto-computed (${activeAnchors.length} points)</span>`;

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
            <label style="font-size: 10px; font-weight: bold; color: var(--accent-primary);">📍 Anchor Point Controls (${activeAnchors.length} Anchors)</label>
            <button id="prop-cab-add-anchor" style="padding: 2px 6px; font-size: 10px; background: rgba(0,229,255,0.12); border: 1px solid var(--accent-primary); border-radius: 3px; color: var(--accent-primary); cursor: pointer;" title="Add new anchor point">➕ Add Anchor</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px; max-height: 180px; overflow-y: auto;">
            ${activeAnchors.map((pt: any, idx: number) => {
              const borderStyle = cable.anchorsLocked 
                ? 'border: 1px solid var(--border-color); color: #fff;' 
                : 'border: 1px dashed rgba(255,152,0,0.4); color: #aaa; opacity: 0.8;';
              const labelPrefix = cable.anchorsLocked 
                ? '' 
                : '<span style="font-size: 8px; color: #fb8c00; font-family: monospace; margin-left: 2px;" title="Auto-computed bend point. Editing will lock this path.">(auto)</span>';
              return `
              <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
                <span style="width: 22px; font-weight: bold; color: var(--accent-primary);">A${idx + 1}:</span>
                <span style="font-size: 9px; color: #888;">X</span>
                <input type="number" class="anchor-coord-x" data-anchor-idx="${idx}" value="${Math.round(pt.x)}" style="width: 48px; padding: 2px 4px; font-size: 10px; background: #000; border-radius: 3px; ${borderStyle}" />
                <span style="font-size: 9px; color: #888;">Y</span>
                <input type="number" class="anchor-coord-y" data-anchor-idx="${idx}" value="${Math.round(pt.y)}" style="width: 48px; padding: 2px 4px; font-size: 10px; background: #000; border-radius: 3px; ${borderStyle}" />
                <button class="anchor-remove-btn" data-anchor-idx="${idx}" style="padding: 2px 5px; font-size: 10px; background: rgba(244,67,54,0.15); border: 1px solid #e53935; color: #ef5350; border-radius: 3px; cursor: pointer;" title="Remove Anchor A${idx + 1}">✕</button>
                ${labelPrefix}
              </div>
              `;
            }).join('')}
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
            <option value="left" ${cable.sourceOrientation === 'left' ? 'selected' : ''}>⬅️ Plug Left (Exit Leftwards)</option>
            <option value="right" ${cable.sourceOrientation === 'right' ? 'selected' : ''}>➡️ Plug Right (Exit Rightwards)</option>
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
            <option value="left" ${cable.destOrientation === 'left' ? 'selected' : ''}>⬅️ Plug Left (Exit Leftwards)</option>
            <option value="right" ${cable.destOrientation === 'right' ? 'selected' : ''}>➡️ Plug Right (Exit Rightwards)</option>
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
      EventBus.emit('cable:update', { id, data: { sidePreference: e.target.value } });
    });
    // 6-Anchor Coordinate Listeners
    container.querySelectorAll('.anchor-coord-x').forEach(input => {
      input.addEventListener('change', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-anchor-idx'));
        const val = parseInt(e.target.value) || 0;
        const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
        const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
        const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];
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
        const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
        const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
        const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];
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
      const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];
      
      const lastPt = currentPts[currentPts.length - 1] || sourcePos;
      currentPts.push({ x: Math.round(lastPt.x + 25), y: Math.round(lastPt.y + 25) });
      EventBus.emit('cable:update', { id, data: { anchorPoints: currentPts, anchorsLocked: true } });
    });

    container.querySelectorAll('.anchor-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const idx = parseInt(e.target.getAttribute('data-anchor-idx'));
        const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
        const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
        const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];

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
      EventBus.emit('cable:update', { id, data: { exitStraightOffset: parseInt(e.target.value) || 18 } });
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
        EventBus.emit('cable:update', { id, data: { sourceOrientation: dir } });
      });
    });

    container.querySelectorAll('.tilt-btn-dest').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const dir = e.currentTarget.getAttribute('data-dir');
        EventBus.emit('cable:update', { id, data: { destOrientation: dir } });
      });
    });

    container.querySelector('#prop-cab-src-orient')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { sourceOrientation: e.target.value } });
    });
    container.querySelector('#prop-cab-dest-term')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { destTermination: e.target.value } });
    });
    container.querySelector('#prop-cab-dest-orient')?.addEventListener('change', (e: any) => {
      EventBus.emit('cable:update', { id, data: { destOrientation: e.target.value } });
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

export function initAIHints(): void {
  let hintsContainer: HTMLElement | null = null;

  function getOrCreateContainer(): HTMLElement {
    if (hintsContainer) return hintsContainer;
    hintsContainer = document.createElement('div');
    hintsContainer.className = 'ai-hints-section';
    hintsContainer.id = 'ai-hints-section';
    const panel = document.getElementById('properties-panel') ?? document.querySelector('.properties-panel');
    if (panel) panel.appendChild(hintsContainer);
    return hintsContainer;
  }

  function renderHints(hints: AIHint[]): void {
    const container = getOrCreateContainer();
    if (hints.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML =
      `<div style="font-size:11px;color:#666;margin-bottom:4px;font-weight:600">AI Insights</div>` +
      hints.map(h =>
        `<div class="ai-hint ${h.severity}">` +
        `<span>${h.severity === 'error' ? '&#x26A0;' : h.severity === 'warning' ? '&#x26A1;' : h.severity === 'tip' ? '&#x1F4A1;' : '&#x2139;'}</span>` +
        `<span></span>` +
        `</div>`
      ).join('');
    // Set message text safely (textContent prevents XSS from AI strings)
    const spans = container.querySelectorAll('.ai-hint span:last-child');
    hints.forEach((h, i) => {
      if (spans[i]) (spans[i] as HTMLElement).textContent = h.message;
    });
  }

  eventBus.on('ai:hints-updated', renderHints);

  eventBus.on('selection:changed', (selection) => {
    const state = stateManager.getState();
    if (!state.aiMode || selection.length === 0) {
      renderHints([]);
      return;
    }
    aiService.refreshHints(selection[0].id);
  });

  eventBus.on('ai:mode-changed', (enabled) => {
    if (!enabled) renderHints([]);
  });
}
