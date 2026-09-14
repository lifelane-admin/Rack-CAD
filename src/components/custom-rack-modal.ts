import EventBus from '../core/event-bus';
import State from '../core/state';
import {
  RackData,
  STANDARD_RACK_HEIGHTS,
  STANDARD_RACK_DEPTHS,
  RackType,
  RackDoorType,
  RackDoorOperation,
  RackDoorOpening,
  RackMounting,
  RackWidthOption,
  VcmWidth,
  VcmType,
  RACK_UNIT_SIZES,
} from '../core/types';
import { generateId } from '../utils/geometry';

export class CustomRackModal {
  private overlay: HTMLElement | null = null;
  private onSaveCallback?: (rack: RackData) => void;

  show(initial?: Partial<RackData>, onSave?: (rack: RackData) => void): void {
    this.onSaveCallback = onSave;
    this.close();

    const units = initial?.units ?? 42;
    const name = initial?.name ?? `${units}U Custom Cabinet`;
    const rackWidth: RackWidthOption = initial?.rackWidth ?? '19-inch';
    const depthMm = initial?.depthMm ?? 1000;
    const rackType: RackType = initial?.rackType ?? 'server';
    const frontDoor: RackDoorType = initial?.frontDoor ?? 'perforated';
    const doorOperation: RackDoorOperation = initial?.doorOperation ?? 'swing-left';
    const doorOpening: RackDoorOpening = initial?.doorOpening ?? 'front-only';
    const sidePanels = initial?.sidePanels ?? true;
    const rackColor = initial?.rackColor ?? '#0c0e12';
    const mounting: RackMounting = initial?.mounting ?? 'floor';
    const leftVcm: VcmWidth = initial?.leftCableManagerWidth ?? '4-inch';
    const rightVcm: VcmWidth = initial?.rightCableManagerWidth ?? '4-inch';
    const vcmType: VcmType = initial?.vcmType ?? 'single-sided';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay custom-rack-modal-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(5, 8, 15, 0.85); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center; z-index: 9999;
    `;

    overlay.innerHTML = `
      <div class="custom-rack-modal" style="
        background: #11141c; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
        width: 620px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,229,255,0.15); overflow: hidden;
      ">
        <div style="padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: #0c0e14;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(0,229,255,0.1); border: 1px solid rgba(0,229,255,0.3); display: flex; align-items: center; justify-content: center; color: #00e5ff; font-weight: bold;">⚙</div>
            <div>
              <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #fff;">${initial?.id ? 'Edit Rack Properties' : 'Deploy Custom Rack Enclosure'}</h2>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: #8b949e;">Configure ANSI/EIA-310-D standard physical dimensions and structural accessories</p>
            </div>
          </div>
          <button id="crm-close" style="background: transparent; border: none; color: #8b949e; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px;">✕</button>
        </div>

        <div style="padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; flex: 1;">
          <!-- Basic Identifiers -->
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #00e5ff; margin-bottom: 6px;">Rack Label / Name</label>
              <input id="crm-name" type="text" value="${name}" placeholder="e.g. CORE-RACK-01" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px; box-sizing: border-box;" />
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #00e5ff; margin-bottom: 6px;">Rack Height</label>
              <select id="crm-units" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                ${STANDARD_RACK_HEIGHTS.map(h => `<option value="${h}" ${h === units ? 'selected' : ''}>${h}U (${(h * 44.45 / 1000).toFixed(2)}m Internal)</option>`).join('')}
                ${!STANDARD_RACK_HEIGHTS.includes(units as any) ? `<option value="${units}" selected>${units}U (Custom Height)</option>` : ''}
              </select>
            </div>
          </div>

          <!-- Physical Dimensions -->
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #00e5ff; margin-bottom: 6px;">Internal Rail Width</label>
              <select id="crm-width" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                <option value="19-inch" ${rackWidth === '19-inch' ? 'selected' : ''}>19-Inch Standard (482.6 mm)</option>
                <option value="23-inch" ${rackWidth === '23-inch' ? 'selected' : ''}>23-Inch Telco Standard (584.2 mm)</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #00e5ff; margin-bottom: 6px;">Frame External Depth</label>
              <select id="crm-depth" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                ${STANDARD_RACK_DEPTHS.map(d => `<option value="${d}" ${d === depthMm ? 'selected' : ''}>${d} mm (${d >= 1000 ? 'Server Depth' : 'Network/Patch Depth'})</option>`).join('')}
                ${!STANDARD_RACK_DEPTHS.includes(depthMm as any) ? `<option value="${depthMm}" selected>${depthMm} mm (Custom Depth)</option>` : ''}
              </select>
            </div>
          </div>

          <!-- Enclosure Type & Door Styles -->
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #fb8c00; margin-bottom: 6px;">Rack Type</label>
              <select id="crm-type" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                <option value="server" ${rackType === 'server' ? 'selected' : ''}>Server Cabinet (High Heat / Deep Posts)</option>
                <option value="network" ${rackType === 'network' ? 'selected' : ''}>Network Cabinet (High Patch Density)</option>
                <option value="wall-mount" ${rackType === 'wall-mount' ? 'selected' : ''}>Wall Mount Box (Compact / Edge)</option>
                <option value="open-frame" ${rackType === 'open-frame' ? 'selected' : ''}>Open Frame (4-Post / 2-Post Lab Rack)</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #fb8c00; margin-bottom: 6px;">Front Door Style</label>
              <select id="crm-door" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                <optgroup label="Twin Doors - Dual Split 50/50">
                  <option value="split-perforated-large" ${frontDoor === 'split-perforated-large' ? 'selected' : ''}>Twin Door - Perforated (Large Round Holes)</option>
                  <option value="split-perforated" ${frontDoor === 'split-perforated' || frontDoor === 'split-perforated-medium' || frontDoor === 'split-round-hole' ? 'selected' : ''}>Twin Door - Perforated (Medium Round Holes)</option>
                  <option value="split-perforated-small" ${frontDoor === 'split-perforated-small' ? 'selected' : ''}>Twin Door - Perforated (Small Round Holes)</option>
                  <option value="split-perforated-tiny" ${frontDoor === 'split-perforated-tiny' ? 'selected' : ''}>Twin Door - Perforated (Tiny / Micro-Mesh)</option>
                  <option value="split-honeycomb-large" ${frontDoor === 'split-honeycomb-large' ? 'selected' : ''}>Twin Door - Honeycomb (Large Hex Mesh)</option>
                  <option value="split-honeycomb" ${frontDoor === 'split-honeycomb' || frontDoor === 'split-honeycomb-medium' || frontDoor === 'split-hexa' ? 'selected' : ''}>Twin Door - Honeycomb (Medium Hex Mesh)</option>
                  <option value="split-honeycomb-small" ${frontDoor === 'split-honeycomb-small' ? 'selected' : ''}>Twin Door - Honeycomb (Small Hex Mesh)</option>
                  <option value="split-honeycomb-tiny" ${frontDoor === 'split-honeycomb-tiny' ? 'selected' : ''}>Twin Door - Honeycomb (Tiny / Micro-Hex)</option>
                  <option value="split-wire-mesh" ${frontDoor === 'split-wire-mesh' || frontDoor === 'split-mesh' ? 'selected' : ''}>Twin Door - Heavy-Duty Wire Mesh Grid</option>
                  <option value="split-glass" ${frontDoor === 'split-glass' ? 'selected' : ''}>Twin Door - Observation Glass (Dual Split)</option>
                  <option value="split-acrylic" ${frontDoor === 'split-acrylic' ? 'selected' : ''}>Twin Door - Tinted Acrylic (Dual Split)</option>
                  <option value="split-solid" ${frontDoor === 'split-solid' ? 'selected' : ''}>Twin Door - Solid Steel Security (Dual Split)</option>
                </optgroup>
                <optgroup label="Asymmetric Dual Doors (60/40 Split)">
                  <option value="asym-split-perforated" ${frontDoor === 'asym-split-perforated' ? 'selected' : ''}>Asymmetric Dual - Perforated Round (60/40)</option>
                  <option value="asym-split-honeycomb" ${frontDoor === 'asym-split-honeycomb' || frontDoor === 'asym-split-hexa' ? 'selected' : ''}>Asymmetric Dual - Honeycomb Hex (60/40)</option>
                  <option value="asym-split-wire-mesh" ${frontDoor === 'asym-split-wire-mesh' ? 'selected' : ''}>Asymmetric Dual - Wire Mesh Grid (60/40)</option>
                  <option value="asym-split-glass" ${frontDoor === 'asym-split-glass' ? 'selected' : ''}>Asymmetric Dual - Glass Window (60/40)</option>
                  <option value="asym-split-acrylic" ${frontDoor === 'asym-split-acrylic' ? 'selected' : ''}>Asymmetric Dual - Tinted Acrylic (60/40)</option>
                  <option value="asym-split-solid" ${frontDoor === 'asym-split-solid' ? 'selected' : ''}>Asymmetric Dual - Solid Steel (60/40)</option>
                </optgroup>
                <optgroup label="Multi-Leaf / Bi-Fold Doors">
                  <option value="bifold-perforated" ${frontDoor === 'bifold-perforated' ? 'selected' : ''}>Bi-Fold Folding - Perforated Round Mesh</option>
                  <option value="bifold-honeycomb" ${frontDoor === 'bifold-honeycomb' || frontDoor === 'bifold-hexa' ? 'selected' : ''}>Bi-Fold Folding - Honeycomb Hex Mesh</option>
                  <option value="bifold-wire-mesh" ${frontDoor === 'bifold-wire-mesh' ? 'selected' : ''}>Bi-Fold Folding - Wire Mesh Grid</option>
                  <option value="bifold-glass" ${frontDoor === 'bifold-glass' ? 'selected' : ''}>Bi-Fold Folding - Tempered Glass</option>
                  <option value="bifold-acrylic" ${frontDoor === 'bifold-acrylic' ? 'selected' : ''}>Bi-Fold Folding - Tinted Acrylic</option>
                  <option value="bifold-solid" ${frontDoor === 'bifold-solid' ? 'selected' : ''}>Bi-Fold Folding - Solid Steel</option>
                </optgroup>
                <optgroup label="Single Doors - Perforated Round (4 Levels)">
                  <option value="perforated-large" ${frontDoor === 'perforated-large' || frontDoor === 'round-hole-large' ? 'selected' : ''}>Single Door - Perforated (Large Round Holes)</option>
                  <option value="perforated" ${frontDoor === 'perforated' || frontDoor === 'perforated-medium' || frontDoor === 'round-hole' || !frontDoor ? 'selected' : ''}>Single Door - Perforated (Medium Round Holes)</option>
                  <option value="perforated-small" ${frontDoor === 'perforated-small' || frontDoor === 'round-hole-small' ? 'selected' : ''}>Single Door - Perforated (Small Round Holes)</option>
                  <option value="perforated-tiny" ${frontDoor === 'perforated-tiny' ? 'selected' : ''}>Single Door - Perforated (Tiny / Micro-Mesh)</option>
                </optgroup>
                <optgroup label="Single Doors - Honeycomb Hex (4 Levels)">
                  <option value="honeycomb-large" ${frontDoor === 'honeycomb-large' || frontDoor === 'hexa-large' ? 'selected' : ''}>Single Door - Honeycomb (Large Hex Mesh)</option>
                  <option value="honeycomb-medium" ${frontDoor === 'honeycomb-medium' || frontDoor === 'hexa' ? 'selected' : ''}>Single Door - Honeycomb (Medium Hex Mesh)</option>
                  <option value="honeycomb-small" ${frontDoor === 'honeycomb-small' || frontDoor === 'hexa-small' ? 'selected' : ''}>Single Door - Honeycomb (Small Hex Mesh)</option>
                  <option value="honeycomb-tiny" ${frontDoor === 'honeycomb-tiny' ? 'selected' : ''}>Single Door - Honeycomb (Tiny / Micro-Hex)</option>
                </optgroup>
                <optgroup label="Single Doors - Mesh, Glass, Acrylic & Solid">
                  <option value="wire-mesh" ${frontDoor === 'wire-mesh' || frontDoor === 'mesh' ? 'selected' : ''}>Single Heavy-Duty Wire Mesh Grid</option>
                  <option value="glass" ${frontDoor === 'glass' ? 'selected' : ''}>Single Tempered Glass Door</option>
                  <option value="acrylic" ${frontDoor === 'acrylic' ? 'selected' : ''}>Single Tinted Acrylic Door</option>
                  <option value="solid" ${frontDoor === 'solid' ? 'selected' : ''}>Single Solid Steel Door</option>
                  <option value="louvered" ${frontDoor === 'louvered' ? 'selected' : ''}>Single Louvered / Vented Steel Door</option>
                </optgroup>
                <optgroup label="Colocation Compartment Doors">
                  <option value="multi-compartment-2" ${frontDoor === 'multi-compartment-2' ? 'selected' : ''}>2-Compartment Colo Doors (Dual-Tier)</option>
                  <option value="multi-compartment-4" ${frontDoor === 'multi-compartment-4' ? 'selected' : ''}>4-Compartment Colo Doors (Multi-Tenant)</option>
                </optgroup>
                <optgroup label="Open Enclosure">
                  <option value="none" ${frontDoor === 'none' ? 'selected' : ''}>None (Open Front / No Door)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #fb8c00; margin-bottom: 6px;">Door Operation</label>
              <select id="crm-door-op" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                <option value="swing-left" ${doorOperation === 'swing-left' || !doorOperation ? 'selected' : ''}>Swing - Left Hinged</option>
                <option value="swing-right" ${doorOperation === 'swing-right' ? 'selected' : ''}>Swing - Right Hinged</option>
                <option value="swing-dual" ${doorOperation === 'swing-dual' || doorOperation === 'split-swing' ? 'selected' : ''}>Swing - Dual Leaf (Wardrobe)</option>
                <option value="sliding" ${doorOperation === 'sliding' ? 'selected' : ''}>Sliding Track (Manual / Auto)</option>
                <option value="lift-off" ${doorOperation === 'lift-off' ? 'selected' : ''}>Lift-Off (Quick-Release Panel)</option>
                <option value="bifold" ${doorOperation === 'bifold' ? 'selected' : ''}>Bi-Fold (Folding Hinge)</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #fb8c00; margin-bottom: 6px;">Door Opening</label>
              <select id="crm-door-opening" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                <option value="front-only" ${doorOpening === 'front-only' || !doorOpening ? 'selected' : ''}>Front Only (Single Front Access)</option>
                <option value="front-rear" ${doorOpening === 'front-rear' ? 'selected' : ''}>Front + Rear (Dual Front & Rear Access)</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #fb8c00; margin-bottom: 6px;">Side Panels</label>
              <select id="crm-side-panels" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                <option value="true" ${sidePanels ? 'selected' : ''}>Enabled (Removable Locking Panels)</option>
                <option value="false" ${!sidePanels ? 'selected' : ''}>Disabled (Open Bay for Ganging / Baying)</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #fb8c00; margin-bottom: 6px;">Cabinet Finish Color</label>
              <div style="display: flex; gap: 6px; align-items: center;">
                <select id="crm-color" style="flex: 1; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12px;">
                  <option value="#0c0e12" ${rackColor === '#0c0e12' ? 'selected' : ''}>Jet Black (RAL 9005)</option>
                  <option value="#131416" ${rackColor === '#131416' ? 'selected' : ''}>Matte Obsidian</option>
                  <option value="#1f242c" ${rackColor === '#1f242c' ? 'selected' : ''}>Anthracite / Charcoal</option>
                  <option value="#334155" ${rackColor === '#334155' ? 'selected' : ''}>Industrial Slate Grey</option>
                  <option value="#8a8d90" ${rackColor === '#8a8d90' ? 'selected' : ''}>Telecom Grey (RAL 7035)</option>
                  <option value="#e8e8e4" ${rackColor === '#e8e8e4' ? 'selected' : ''}>Cleanroom White (RAL 9003)</option>
                  <option value="#efe7d0" ${rackColor === '#efe7d0' ? 'selected' : ''}>Ivory / Warm Beige</option>
                  <option value="#0f172a" ${rackColor === '#0f172a' ? 'selected' : ''}>Midnight Navy</option>
                  <option value="#1e3a8a" ${rackColor === '#1e3a8a' ? 'selected' : ''}>Telecom Enterprise Blue</option>
                </select>
                <input type="color" id="crm-color-picker" value="${rackColor.startsWith('#') ? rackColor : '#0c0e12'}" style="width: 32px; height: 32px; border: 1px solid #30363d; border-radius: 6px; padding: 0; background: transparent; cursor: pointer;" title="Custom Color Picker" />
              </div>
            </div>
          </div>

          <!-- Section 3: Vertical Cable Managers (VCM) -->
          <div style="background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
              <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #10b981;">Vertical Cable Managers (Active Routing Gutters)</label>
              <span style="font-size: 10px; color: #8b949e;">Feeds Patch Panels & Switches</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <div>
                <label style="display: block; font-size: 10px; color: #8b949e; margin-bottom: 4px;">Left VCM Width</label>
                <select id="crm-vcm-left" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 6px 8px; color: #fff; font-size: 11px;">
                  <option value="none" ${leftVcm === 'none' ? 'selected' : ''}>None (Standard Mounting)</option>
                  <option value="2-inch" ${leftVcm === '2-inch' ? 'selected' : ''}>2" Gutter (50mm)</option>
                  <option value="4-inch" ${leftVcm === '4-inch' ? 'selected' : ''}>4" Gutter (100mm)</option>
                  <option value="6-inch" ${leftVcm === '6-inch' ? 'selected' : ''}>6" Gutter (150mm)</option>
                  <option value="8-inch" ${leftVcm === '8-inch' ? 'selected' : ''}>8" Gutter (200mm)</option>
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 10px; color: #8b949e; margin-bottom: 4px;">Right VCM Width</label>
                <select id="crm-vcm-right" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 6px 8px; color: #fff; font-size: 11px;">
                  <option value="none" ${rightVcm === 'none' ? 'selected' : ''}>None (Standard Mounting)</option>
                  <option value="2-inch" ${rightVcm === '2-inch' ? 'selected' : ''}>2" Gutter (50mm)</option>
                  <option value="4-inch" ${rightVcm === '4-inch' ? 'selected' : ''}>4" Gutter (100mm)</option>
                  <option value="6-inch" ${rightVcm === '6-inch' ? 'selected' : ''}>6" Gutter (150mm)</option>
                  <option value="8-inch" ${rightVcm === '8-inch' ? 'selected' : ''}>8" Gutter (200mm)</option>
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 10px; color: #8b949e; margin-bottom: 4px;">VCM Duct Type</label>
                <select id="crm-vcm-type" style="width: 100%; background: #090b10; border: 1px solid #30363d; border-radius: 6px; padding: 6px 8px; color: #fff; font-size: 11px;">
                  <option value="single-sided" ${vcmType === 'single-sided' ? 'selected' : ''}>Single-Sided (Front)</option>
                  <option value="double-sided" ${vcmType === 'double-sided' ? 'selected' : ''}>Double-Sided (Front & Rear)</option>
                </select>
              </div>
            </div>
          </div>

        </div>

        <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 10px; background: rgba(0,0,0,0.2);">
          <button id="crm-cancel" style="background: transparent; border: 1px solid #30363d; color: #c9d1d9; border-radius: 6px; padding: 8px 16px; font-size: 12px; cursor: pointer;">Cancel</button>
          <button id="crm-submit" style="background: #00e5ff; border: none; color: #000; font-weight: 700; border-radius: 6px; padding: 8px 20px; font-size: 12px; cursor: pointer; box-shadow: 0 0 16px rgba(0,229,255,0.35);">Deploy Cabinet</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    overlay.querySelector('#crm-close')?.addEventListener('click', () => this.close());
    overlay.querySelector('#crm-cancel')?.addEventListener('click', () => this.close());

    const colorSelect = overlay.querySelector('#crm-color') as HTMLSelectElement;
    const colorPicker = overlay.querySelector('#crm-color-picker') as HTMLInputElement;

    colorSelect?.addEventListener('change', () => {
      if (colorPicker) colorPicker.value = colorSelect.value;
    });
    colorPicker?.addEventListener('input', () => {
      if (colorSelect) {
        // If option exists, select it, otherwise add or keep custom
        let opt = Array.from(colorSelect.options).find(o => o.value.toLowerCase() === colorPicker.value.toLowerCase());
        if (!opt) {
          opt = new Option(`Custom (${colorPicker.value.toUpperCase()})`, colorPicker.value);
          colorSelect.add(opt);
        }
        colorSelect.value = colorPicker.value;
      }
    });

    overlay.querySelector('#crm-submit')?.addEventListener('click', () => {
      const rackName = (overlay.querySelector('#crm-name') as HTMLInputElement)?.value || `${units}U Cabinet`;
      const rackUnits = parseInt((overlay.querySelector('#crm-units') as HTMLSelectElement)?.value, 10) || 42;
      const widthVal = (overlay.querySelector('#crm-width') as HTMLSelectElement)?.value as RackWidthOption;
      const depthVal = parseInt((overlay.querySelector('#crm-depth') as HTMLSelectElement)?.value, 10) || 1000;
      const typeVal = (overlay.querySelector('#crm-type') as HTMLSelectElement)?.value as RackType;
      const doorVal = (overlay.querySelector('#crm-door') as HTMLSelectElement)?.value as RackDoorType;
      const doorOpVal = (overlay.querySelector('#crm-door-op') as HTMLSelectElement)?.value as RackDoorOperation;
      const doorOpeningVal = ((overlay.querySelector('#crm-door-opening') as HTMLSelectElement)?.value || 'front-only') as RackDoorOpening;
      const sidePanelsVal = (overlay.querySelector('#crm-side-panels') as HTMLSelectElement)?.value === 'true';
      const colorVal = (overlay.querySelector('#crm-color') as HTMLSelectElement)?.value || '#0c0e12';
      const mountVal = (overlay.querySelector('#crm-mounting') as HTMLSelectElement)?.value as RackMounting;
      const leftVcmVal = (overlay.querySelector('#crm-vcm-left') as HTMLSelectElement)?.value as VcmWidth;
      const rightVcmVal = (overlay.querySelector('#crm-vcm-right') as HTMLSelectElement)?.value as VcmWidth;
      const vcmTypeVal = (overlay.querySelector('#crm-vcm-type') as HTMLSelectElement)?.value as VcmType;

      const newRack: RackData = {
        id: initial?.id || generateId(),
        name: rackName,
        units: rackUnits,
        x: initial?.x ?? (200 + State.getState().racks.length * 520),
        y: initial?.y ?? 100,
        rackWidth: widthVal,
        depthMm: depthVal,
        rackType: typeVal,
        frontDoor: doorVal,
        doorOperation: doorOpVal,
        doorOpening: doorOpeningVal,
        sidePanels: sidePanelsVal,
        rackColor: colorVal,
        mounting: mountVal,
        leftCableManagerWidth: leftVcmVal,
        rightCableManagerWidth: rightVcmVal,
        vcmType: vcmTypeVal,
        showPduLeft: true,
        showPduRight: true,
      };

      if (this.onSaveCallback) {
        this.onSaveCallback(newRack);
      } else {
        if (initial?.id) {
          EventBus.emit('rack:update', { id: initial.id, data: newRack });
        } else {
          State.addRack(newRack);
          EventBus.emit('notification', { message: `Deployed ${rackName} (${rackUnits}U)`, type: 'success' });
        }
      }

      this.close();
    });
  }

  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}

export const customRackModal = new CustomRackModal();
