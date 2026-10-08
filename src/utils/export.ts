import { eventBus } from '../core/event-bus';
import { stateManager, injectEarPorts } from '../core/state';
import { buildReport, ReportMetadata } from '../export/report-builder';
import { DeviceTemplate, RACK_CONSTANTS, RackData, DeviceData, CableData, PortData } from '../core/types';
import canvasCss from '../styles/canvas.css?raw';
import reportsCss from '../styles/reports.css?raw';
import { appendExportSummaryOverlay, Rect } from '../renderers/export-summary-overlay';
import { ExcelExportEngine } from '../model/excel-export-engine';
import { physicalInfrastructureModel } from '../model/physical-model';
import { getTemplate } from '../library/device-catalog';

function unionRect(a: Rect, b: Rect): Rect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export interface ExportOptions {
  area: 'full' | 'viewport' | 'rack' | 'custom';
  rackId?: string;
  customRect?: { x: number; y: number; width: number; height: number };
  includeGrid?: boolean;
  /** Background fill baked into the export (SVG background rect + PNG/JPEG canvas fill) —
   *  independent of the live app theme, since a design meant to be pasted into a light-mode doc
   *  shouldn't be forced to match whatever theme the editor happened to be in. Defaults to
   *  'light' (unset = existing white-background behavior, unchanged for old callers). */
  background?: 'light' | 'dark';
  scale?: number;
  pageSize?: 'letter' | 'a4' | 'a3' | 'tabloid';
  orientation?: 'landscape' | 'portrait';
}

/** Export background fill colors — shared by exportSVG (background rect), exportPNG/exportJPEG
 *  (canvas fill), and their Cloud-canvas equivalents, so every export format agrees on exactly
 *  the same two colors. Dark matches the app's own dark-theme canvas/modal chrome (#0d1117),
 *  not the slightly different --bg-canvas dark value, so exports look like a deliberate "dark
 *  mode" choice rather than an approximation of the live editor background. */
const EXPORT_BG: Record<'light' | 'dark', string> = { light: '#ffffff', dark: '#0d1117' };
function resolveExportBg(background?: 'light' | 'dark'): string {
  return EXPORT_BG[background ?? 'light'];
}

/** Pending format-specific export awaiting a canvas area selection. */
let pendingAreaExport: { onConfirm: (options: ExportOptions) => void; baseOptions: ExportOptions } | null = null;

export interface CloudExportOptions {
  area: 'full' | 'viewport' | 'custom';
  customRect?: { x: number; y: number; width: number; height: number };
  includeGrid?: boolean;
  /** See ExportOptions.background's doc comment — same two colors, but defaults to 'dark' here
   *  since that was this export's only behavior before this option existed (cloud diagrams read
   *  as provider-style architecture art, which has always rendered dark by default). */
  background?: 'light' | 'dark';
  scale?: number;
}

/** Pending cloud-diagram export awaiting a canvas area selection — separate from
 *  pendingAreaExport above so a rack-canvas custom-area export in flight can never be confused
 *  with a cloud-canvas one (they use their own dedicated 'export:cloud-*' events, see below). */
let pendingCloudAreaExport: { onConfirm: (options: CloudExportOptions) => void; baseOptions: CloudExportOptions } | null = null;

/**
 * Show a trimmed export settings dialog for the Cloud Architecture canvas — same Export Area
 * concept as showExportOptionsModal() above (Full Canvas / Visible Viewport / Draw Custom Area)
 * minus the rack-specific "Focus on Specific Cabinet" option and the PDF/page-layout/grid
 * settings, none of which apply to the cloud diagram.
 */
export function showCloudExportOptionsModal(
  format: 'svg' | 'png',
  onConfirm: (options: CloudExportOptions) => void
) {
  const existing = document.getElementById('cloud-export-settings-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'cloud-export-settings-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(10, 12, 16, 0.7); backdrop-filter: blur(12px);
    z-index: 10000; display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', system-ui, sans-serif; color: #fff;
  `;

  const isRaster = format === 'png';

  modal.innerHTML = `
    <div style="background: rgba(22, 27, 34, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; width: 420px; max-width: 90vw; padding: 24px; box-shadow: 0 20px 45px rgba(0,0,0,0.65);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 14px;">
        <h3 style="margin: 0; font-size: 15px; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
          📤 Export Cloud Diagram (${format.toUpperCase()})
        </h3>
        <button id="cloud-export-modal-close" style="background: none; border: none; color: #8b949e; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Export Area</label>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-area" value="full" checked /> Full Diagram (Fit all content)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-area" value="viewport" /> Visible Viewport (Active zoom/pan)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-area" value="custom" /> 🖱️ Draw Custom Area on Canvas
            </label>
          </div>
        </div>

        ${isRaster ? `
        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Resolution / Quality</label>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-scale" value="1" /> 1x (Normal)
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-scale" value="2" checked /> 2x (High-Res)
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-scale" value="3" /> 3x (Ultra-HD)
            </label>
          </div>
        </div>
        ` : ''}

        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Grid Settings</label>
          <div style="margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="checkbox" id="cloud-export-include-grid" /> Include background grid lines
            </label>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Background</label>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-background" value="light" /> ☀️ Light
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="cloud-export-background" value="dark" checked /> 🌙 Dark
            </label>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px;">
        <button id="cloud-export-modal-cancel" style="padding: 6px 14px; font-size: 12px; background: transparent; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer;">Cancel</button>
        <button id="cloud-export-modal-confirm" style="padding: 6px 18px; font-size: 12px; background: #fb8c00; border: none; color: #fff; font-weight: bold; border-radius: 4px; cursor: pointer;">Export Diagram</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#cloud-export-modal-close')?.addEventListener('click', closeModal);
  modal.querySelector('#cloud-export-modal-cancel')?.addEventListener('click', closeModal);

  modal.querySelector('#cloud-export-modal-confirm')?.addEventListener('click', () => {
    const selectedArea = (modal.querySelector('input[name="cloud-export-area"]:checked') as HTMLInputElement).value as CloudExportOptions['area'];
    const includeGrid = (modal.querySelector('#cloud-export-include-grid') as HTMLInputElement).checked;
    const background = (modal.querySelector('input[name="cloud-export-background"]:checked') as HTMLInputElement).value as 'light' | 'dark';

    const options: CloudExportOptions = { area: selectedArea, includeGrid, background };

    if (isRaster) {
      options.scale = parseInt((modal.querySelector('input[name="cloud-export-scale"]:checked') as HTMLInputElement).value);
    }

    closeModal();

    if (selectedArea === 'custom') {
      pendingCloudAreaExport = { onConfirm, baseOptions: options };
      eventBus.emit('export:cloud-request-area-selection', undefined);
      eventBus.emit('notification', { message: 'Drag a rectangle on the cloud canvas to select the export area — Esc to cancel', type: 'info' });
      return;
    }

    onConfirm(options);
  });
}

/**
 * Show modern export settings dialog modal.
 */
export function showExportOptionsModal(
  format: 'svg' | 'png' | 'jpeg' | 'pdf' | 'html',
  onConfirm: (options: ExportOptions) => void
) {
  const existing = document.getElementById('export-settings-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'export-settings-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(10, 12, 16, 0.7); backdrop-filter: blur(12px);
    z-index: 10000; display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', system-ui, sans-serif; color: #fff;
  `;

  const s = stateManager.getState();
  const racksList = s.racks.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

  const isRaster = format === 'png' || format === 'jpeg';
  const isPdf = format === 'pdf';

  modal.innerHTML = `
    <div style="background: rgba(22, 27, 34, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; width: 420px; max-width: 90vw; padding: 24px; box-shadow: 0 20px 45px rgba(0,0,0,0.65);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 14px;">
        <h3 style="margin: 0; font-size: 15px; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
          📤 Export settings (${format.toUpperCase()})
        </h3>
        <button id="export-modal-close" style="background: none; border: none; color: #8b949e; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 16px;">
        <!-- Export Area Selection -->
        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Export Area</label>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-area" value="full" checked /> Full Canvas (Fit all content)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-area" value="viewport" /> Visible Viewport (Active zoom/pan)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-area" value="rack" /> Focus on Specific Cabinet
            </label>
            <select id="export-rack-select" style="margin-left: 20px; padding: 5px 8px; background: #0d1117; border: 1px solid #30363d; color: #fff; border-radius: 4px; font-size: 12px; display: none;">
              ${racksList || '<option value="">No racks in design</option>'}
            </select>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-area" value="custom" /> 🖱️ Draw Custom Area on Canvas
            </label>
          </div>
        </div>

        <!-- Resolution Scale (Raster Images Only) -->
        ${isRaster ? `
        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Resolution / Quality</label>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-scale" value="1" /> 1x (Normal)
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-scale" value="2" checked /> 2x (High-Res)
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-scale" value="3" /> 3x (Ultra-HD)
            </label>
          </div>
        </div>
        ` : ''}

        <!-- Page Layout Settings (PDF Only) -->
        ${isPdf ? `
        <div style="display: flex; gap: 16px;">
          <div style="flex: 1;">
            <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Page Size</label>
            <select id="export-page-size" style="width: 100%; margin-top: 6px; padding: 6px; background: #0d1117; border: 1px solid #30363d; color: #fff; border-radius: 4px; font-size: 12px;">
              <option value="a4" selected>A4 Standard</option>
              <option value="letter">Letter</option>
              <option value="a3">A3 (Large Layout)</option>
              <option value="tabloid">Tabloid</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Orientation</label>
            <select id="export-orientation" style="width: 100%; margin-top: 6px; padding: 6px; background: #0d1117; border: 1px solid #30363d; color: #fff; border-radius: 4px; font-size: 12px;">
              <option value="landscape" selected>Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </div>
        </div>
        ` : ''}

        <!-- Grid Options -->
        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Grid Settings</label>
          <div style="margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
              <input type="checkbox" id="export-include-grid" /> Include background grid lines
            </label>
          </div>
        </div>

        <!-- Background / Dark Mode -->
        <div>
          <label style="font-size: 11px; font-weight: 700; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px;">Background</label>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-background" value="light" ${stateManager.getState().theme === 'light' ? 'checked' : ''} /> ☀️ Light
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="radio" name="export-background" value="dark" ${stateManager.getState().theme === 'dark' ? 'checked' : ''} /> 🌙 Dark
            </label>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px;">
        <button id="export-modal-cancel" style="padding: 6px 14px; font-size: 12px; background: transparent; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer;">Cancel</button>
        <button id="export-modal-confirm" style="padding: 6px 18px; font-size: 12px; background: #fb8c00; border: none; color: #fff; font-weight: bold; border-radius: 4px; cursor: pointer;">Export Design</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const radios = modal.querySelectorAll('input[name="export-area"]');
  const rackSelect = modal.querySelector('#export-rack-select') as HTMLSelectElement;

  radios.forEach(radio => {
    radio.addEventListener('change', (e: any) => {
      if (e.target.value === 'rack') {
        rackSelect.style.display = 'block';
      } else {
        rackSelect.style.display = 'none';
      }
    });
  });

  const closeModal = () => modal.remove();
  modal.querySelector('#export-modal-close')?.addEventListener('click', closeModal);
  modal.querySelector('#export-modal-cancel')?.addEventListener('click', closeModal);
  
  modal.querySelector('#export-modal-confirm')?.addEventListener('click', () => {
    const selectedArea = (modal.querySelector('input[name="export-area"]:checked') as HTMLInputElement).value as any;
    const includeGrid = (modal.querySelector('#export-include-grid') as HTMLInputElement).checked;
    const background = (modal.querySelector('input[name="export-background"]:checked') as HTMLInputElement).value as 'light' | 'dark';

    const options: ExportOptions = {
      area: selectedArea,
      includeGrid,
      background,
      rackId: selectedArea === 'rack' ? rackSelect.value : undefined
    };

    if (isRaster) {
      const scaleVal = parseInt((modal.querySelector('input[name="export-scale"]:checked') as HTMLInputElement).value);
      options.scale = scaleVal;
    }

    if (isPdf) {
      options.pageSize = (modal.querySelector('#export-page-size') as HTMLSelectElement).value as any;
      options.orientation = (modal.querySelector('#export-orientation') as HTMLSelectElement).value as any;
    }

    closeModal();

    if (selectedArea === 'custom') {
      pendingAreaExport = { onConfirm, baseOptions: options };
      eventBus.emit('export:request-area-selection', undefined);
      eventBus.emit('notification', { message: 'Drag a rectangle on the canvas to select the export area — Esc to cancel', type: 'info' });
      return;
    }

    onConfirm(options);
  });
}

/**
 * Serialize current SVG canvas to an SVG string.
 */
export function exportSVG(options?: ExportOptions): string {
  const svgEl = document.getElementById('canvas') as unknown as SVGSVGElement;
  if (!svgEl) throw new Error('Canvas SVG element not found');

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const vpGroup = clone.querySelector('#viewport-group') as SVGGElement;

  // Bake the Rack Load Summary / Cable Types cards into the export clone — same renderer
  // (renderers/export-summary-overlay.ts) and same rack.summaryCardOffset the live canvas
  // rendering in app.ts's renderAll() uses, so wherever the user dragged a card to on the
  // canvas is exactly where it lands in every export format (they all funnel through here).
  // Respects the same "Toggle Legends" visibility flag the live cards use.
  const s0 = stateManager.getState();
  const overlayRects = (s0.showLegends && vpGroup)
    ? appendExportSummaryOverlay(vpGroup, s0.racks, s0.devices, s0.cables, s0.customLegendItems)
    : [];

  // Set Viewbox based on selection area
  let bbox = { x: 0, y: 0, width: 1920, height: 1080 };
  let appliedBox = false;

  if (options && options.area === 'viewport') {
    const transform = stateManager.getState().transform;
    const clientWidth = svgEl.clientWidth || 1920;
    const clientHeight = svgEl.clientHeight || 1080;

    bbox.x = -transform.x / transform.scale;
    bbox.y = -transform.y / transform.scale;
    bbox.width = clientWidth / transform.scale;
    bbox.height = clientHeight / transform.scale;
    appliedBox = true;
  } else if (options && options.area === 'rack' && options.rackId) {
    const rack = stateManager.getRack(options.rackId);
    if (rack) {
      const rackHeight = rack.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_TOP + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
      bbox.x = rack.x - 40;
      bbox.y = rack.y - 40;
      bbox.width = RACK_CONSTANTS.RACK_OUTER_WIDTH + 80;
      bbox.height = rackHeight + 80;
      appliedBox = true;
      // Extend to include this rack's own summary cards — appendExportSummaryOverlay() pushes
      // exactly one rect per rack, in the same order as s0.racks, so index lookup is exact
      // (no geometric guessing needed to match a card back to "its" rack).
      const rackIdx = s0.racks.findIndex(r => r.id === rack.id);
      const ownRect = rackIdx >= 0 ? overlayRects[rackIdx] : undefined;
      if (ownRect) bbox = unionRect(bbox, { x: ownRect.x - 20, y: ownRect.y - 20, width: ownRect.width + 40, height: ownRect.height + 40 });
    }
  } else if (options && options.area === 'custom' && options.customRect) {
    bbox = { ...options.customRect };
    appliedBox = true;
  }

  if (!appliedBox && vpGroup) {
    try {
      // getBBox() only reflects elements attached to a rendered document, so it's measured on
      // the ORIGINAL live viewport-group, not the (detached) clone — the summary cards just
      // appended above exist only in the clone, hence the explicit unionRect() below using
      // their analytically-known extents rather than relying on getBBox to see them.
      const origViewport = svgEl.querySelector('#viewport-group') as SVGGElement;
      const b = origViewport.getBBox();
      const padding = 40;
      bbox.x = b.x - padding;
      bbox.y = b.y - padding;
      bbox.width = b.width + padding * 2;
      bbox.height = b.height + padding * 2;
      overlayRects.forEach(r => { bbox = unionRect(bbox, r); });
      bbox.width += padding;
      bbox.height += padding;
    } catch {
      bbox = { x: 100, y: 50, width: 1200, height: 1500 };
    }
  }

  clone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  clone.setAttribute('width', String(bbox.width));
  clone.setAttribute('height', String(bbox.height));

  // Background fill — baked into the SVG itself (not just the raster canvas fill in
  // exportPNG/exportJPEG below) so a standalone .svg file opened in a viewer, or the vector
  // content embedded in a PDF/HTML export, also carries the chosen Light/Dark background instead
  // of showing through as transparent/white. Painted first so everything else layers on top.
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', String(bbox.x));
  bgRect.setAttribute('y', String(bbox.y));
  bgRect.setAttribute('width', String(bbox.width));
  bgRect.setAttribute('height', String(bbox.height));
  bgRect.setAttribute('fill', resolveExportBg(options?.background));
  clone.insertBefore(bgRect, vpGroup ?? clone.firstChild);

  // Remove or keep the grid layer from export
  const gridLayer = clone.querySelector('#grid-layer');
  if (gridLayer && (!options || !options.includeGrid)) {
    gridLayer.remove();
  }

  // Remove interaction layer from export
  const interactionLayer = clone.querySelector('#interaction-layer');
  if (interactionLayer) interactionLayer.remove();

  // Reset the viewport transform for export
  if (vpGroup) {
    vpGroup.removeAttribute('transform');
  }

  // Inline critical styles
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .port-element:hover { filter: brightness(1.3); }
  `;
  const defs = clone.querySelector('defs');
  if (defs) {
    defs.appendChild(styleEl);
  } else {
    clone.insertBefore(styleEl, clone.firstChild);
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
}

/**
 * Export the canvas as a high-resolution PNG.
 */
export async function exportPNG(options?: ExportOptions): Promise<Blob> {
  const scale = options?.scale || 2;
  const svgString = exportSVG(options);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.fillStyle = resolveExportBg(options?.background);
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create PNG blob'));
        }
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG for PNG export'));
    };
    img.src = url;
  });
}

/**
 * Export the canvas as a high-resolution JPEG.
 */
export async function exportJPEG(options?: ExportOptions): Promise<Blob> {
  const scale = options?.scale || 2;
  const svgString = exportSVG(options);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.fillStyle = resolveExportBg(options?.background);
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create JPEG blob'));
        }
      }, 'image/jpeg', 0.95);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG for JPEG export'));
    };
    img.src = url;
  });
}

/**
 * Export the canvas as a high-fidelity vector PDF.
 */
export function exportPDF(options?: ExportOptions): void {
  const svgContent = exportSVG(options);
  const pageSize = options?.pageSize || 'a4';
  const orientation = options?.orientation || 'landscape';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Export Rack Slicer PDF</title>
      <style>
        @page {
          size: ${pageSize} ${orientation};
          margin: 10mm;
        }
        body {
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background-color: white;
        }
        svg {
          max-width: 100%;
          max-height: 100vh;
          height: auto;
        }
        @media print {
          body { margin: 0; }
          svg { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      ${svgContent.replace(/<\?xml.*?\?>/, '')}
      <script>
        window.onload = () => {
          setTimeout(() => {
            window.print();
            window.close();
          }, 500);
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // Popup blocked (common under strict corporate/managed-browser policies) — fall back to a
    // downloadable HTML file the user can open and print (Ctrl+P → Save as PDF) themselves,
    // instead of just failing with no usable result.
    downloadFile(html, 'rack-slicer-print.html', 'text/html');
    eventBus.emit('notification', {
      message: 'Popup blocked — downloaded a printable HTML file instead. Open it and use Ctrl+P → Save as PDF.',
      type: 'warning',
    });
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Export the canvas as a standalone, self-contained animated HTML document.
 * Reuses exportSVG's DOM-clone capture (not a re-render from state) so that
 * live animation classes/inline styles (cable packet-flow, port glow pulses,
 * switch LED blink) already present on the cloned nodes travel with it.
 */
export function exportHTML(options?: ExportOptions): string {
  const svgContent = exportSVG(options);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Rack Slicer — Animated Export</title>
<style>
${canvasCss}
${reportsCss}
body { margin: 0; background: #0d1117; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
${svgContent.replace(/<\?xml.*?\?>/, '')}
</body>
</html>`;
}

const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Fetches a same-origin URL and returns it as a base64 data: URI. */
async function urlToDataURI(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Inlines every <image> element's href/xlink:href as a base64 data: URI, in place, on a detached
 * SVG clone — cloud node/container icons (cloud-node-renderer.ts, cloud-container-renderer.ts)
 * reference the official AWS/Azure/GCP/onprem icon packs by server-relative path
 * (`/cloud-icons/<provider>/...svg`), which only resolves while the exported file is viewed from
 * this exact dev/prod origin. A downloaded .svg opened standalone (double-clicked, emailed,
 * opened on another machine) has no such origin to resolve against, so those icons rendered as
 * broken-image placeholders — this makes every export fully self-contained regardless of where
 * it's later opened. Fetches each distinct path once even if referenced by many nodes.
 */
async function inlineImageHrefs(root: SVGElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('image')) as SVGImageElement[];
  const cache = new Map<string, string>();

  await Promise.all(images.map(async (img) => {
    const href = img.getAttribute('href') || img.getAttributeNS(XLINK_NS, 'href');
    if (!href || href.startsWith('data:')) return;
    try {
      if (!cache.has(href)) cache.set(href, await urlToDataURI(href));
      const dataUri = cache.get(href)!;
      img.setAttribute('href', dataUri);
      img.setAttributeNS(XLINK_NS, 'xlink:href', dataUri);
    } catch (err) {
      // Leave the original (server-relative) href in place rather than failing the whole
      // export — a broken-image icon for one unreachable asset beats no export at all.
      console.warn(`[export] Failed to inline icon ${href}:`, err);
    }
  }));
}

/**
 * Export the Cloud Architecture canvas (#cloud-canvas) as a standalone SVG string. A deliberately
 * simpler sibling of exportSVG() above — no rack-area-selection options, no summary-card overlay
 * baking, since none of those rack-specific concepts apply to the cloud canvas. Same core
 * technique though: clone, bbox-fit from the live (attached) viewport group, strip the pan/zoom
 * transform and the transient interaction layer.
 */
export async function exportCloudSVG(options?: CloudExportOptions): Promise<string> {
  const svgEl = document.getElementById('cloud-canvas') as unknown as SVGSVGElement;
  if (!svgEl) throw new Error('Cloud canvas SVG element not found');

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const vpGroup = clone.querySelector('#cloud-viewport-group') as SVGGElement;

  let bbox = { x: 0, y: 0, width: 1200, height: 800 };
  let appliedBox = false;

  if (options && options.area === 'custom' && options.customRect) {
    bbox = { ...options.customRect };
    appliedBox = true;
  } else if (options && options.area === 'viewport') {
    // The live (attached) viewport group's own SVG transform matrix — the cloud canvas keeps its
    // pan/zoom transform only as a DOM attribute (see CloudCanvasManager), not in shared app
    // state like the rack canvas's stateManager.getState().transform, so it's read straight off
    // the transform that's actually on screen right now.
    const origViewport = svgEl.querySelector('#cloud-viewport-group') as SVGGElement;
    const matrix = origViewport.transform.baseVal.consolidate()?.matrix;
    const scale = matrix ? matrix.a : 1;
    const tx = matrix ? matrix.e : 0;
    const ty = matrix ? matrix.f : 0;
    const clientWidth = svgEl.clientWidth || 1200;
    const clientHeight = svgEl.clientHeight || 800;
    bbox = { x: -tx / scale, y: -ty / scale, width: clientWidth / scale, height: clientHeight / scale };
    appliedBox = true;
  }

  if (!appliedBox) {
    try {
      const origViewport = svgEl.querySelector('#cloud-viewport-group') as SVGGElement;
      const b = origViewport.getBBox();
      const padding = 40;
      bbox = { x: b.x - padding, y: b.y - padding, width: b.width + padding * 2, height: b.height + padding * 2 };
    } catch {
      // getBBox() throws if there's nothing rendered (empty diagram) — fall back to a blank canvas.
    }
  }

  clone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  clone.setAttribute('width', String(bbox.width));
  clone.setAttribute('height', String(bbox.height));

  // Same background-rect treatment as exportSVG() above — see resolveExportBg's doc comment.
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', String(bbox.x));
  bgRect.setAttribute('y', String(bbox.y));
  bgRect.setAttribute('width', String(bbox.width));
  bgRect.setAttribute('height', String(bbox.height));
  bgRect.setAttribute('fill', resolveExportBg(options?.background ?? 'dark'));
  clone.insertBefore(bgRect, vpGroup ?? clone.firstChild);

  if (!options?.includeGrid) clone.querySelector('#cloud-grid-layer')?.remove();
  clone.querySelector('#cloud-interaction-layer')?.remove();
  if (vpGroup) vpGroup.removeAttribute('transform');

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`;
  const defs = clone.querySelector('defs');
  if (defs) defs.appendChild(styleEl); else clone.insertBefore(styleEl, clone.firstChild);

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  await inlineImageHrefs(clone);

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
}

/**
 * Export the Cloud Architecture canvas as a high-resolution PNG — same blob-URL/canvas
 * rasterization technique as exportPNG() above, built on exportCloudSVG() instead of exportSVG().
 */
export async function exportCloudPNG(options?: CloudExportOptions): Promise<Blob> {
  const scale = options?.scale || 2;
  const svgString = await exportCloudSVG(options);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.fillStyle = resolveExportBg(options?.background ?? 'dark');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob); else reject(new Error('Failed to create PNG blob'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG for PNG export'));
    };
    img.src = url;
  });
}

/**
 * Export the project as a JSON object.
 */
export function exportJSON(): string {
  const s = stateManager.getState();
  const project = {
    version: '1.0.0',
    name: 'Rack Slicer Project',
    created: new Date().toISOString(),
    racks: s.racks,
    devices: s.devices,
    cables: s.cables,
    bundles: s.bundles ?? [],
    textLabels: s.textLabels ?? [],
    imageAssets: s.imageAssets ?? [],
    customTemplates: s.customTemplates ?? [],
    cloudNodes: s.cloudNodes ?? [],
    cloudContainers: s.cloudContainers ?? [],
    cloudConnectors: s.cloudConnectors ?? [],
    cloudHierarchies: s.cloudHierarchies ?? [],
  };
  return JSON.stringify(project, null, 2);
}

/**
 * Import a project from JSON string.
 */
export function importJSON(jsonString: string): void {
  try {
    const project = JSON.parse(jsonString);

    let racks: RackData[] = [];
    let devices: DeviceData[] = [];
    let cables: CableData[] = [];

    if (project.type === 'rack-config' && project.rack) {
      // Standalone single-rack config format
      const r = project.rack;
      const rackData: RackData = {
        id: r.id || 'default-rack',
        name: r.name || 'Rack 1',
        units: r.units || r.heightU || 42,
        depthMm: r.depthMm || 1070,
        rackType: (r.type === 'open-frame' ? 'open-frame' : r.type === 'network' ? 'network' : r.type === 'wall-mount' ? 'wall-mount' : 'server') as any,
        mounting: r.mounting ?? 'floor',
        rackColor: r.color ?? r.rackColor ?? '#1e3a5f',
        x: r.x ?? 200,
        y: r.y ?? 40,
        leftCableManagerWidth: r.leftCableManagerWidth,
        rightCableManagerWidth: r.rightCableManagerWidth,
        leftPduId: r.leftPduId,
        rightPduId: r.rightPduId,
      };
      racks = [rackData];
      devices = (project.devices || []).map((d: any) => ({
        ...d,
        rackId: rackData.id,
      }));
      cables = project.cables || [];
    } else if (Array.isArray(project.racks)) {
      racks = project.racks;
      devices = project.devices || [];
      cables = project.cables || [];
    } else if (Array.isArray(project.devices)) {
      // Devices-only format
      const defaultRack: RackData = {
        id: 'default-rack',
        name: 'Rack 1',
        units: 42,
        depthMm: 1070,
        rackType: 'server',
        mounting: 'floor',
        rackColor: '#1e3a5f',
        x: 200,
        y: 40,
      };
      racks = [defaultRack];
      devices = project.devices.map((d: any) => ({ ...d, rackId: defaultRack.id }));
      cables = project.cables || [];
    } else {
      throw new Error('Unrecognized project JSON format');
    }

    // Auto-repair missing switch faceplate ports and heal floating cable endpoints
    const repaired = sanitizeAndRepairDevicesAndCables(devices, cables);
    devices = repaired.devices;
    cables = repaired.cables;

    // Merge custom templates: project file wins on ID conflict
    const projectTemplates: DeviceTemplate[] = project.customTemplates ?? [];
    const existingTemplates = stateManager.getState().customTemplates ?? [];
    const projectIds = new Set(projectTemplates.map((t: any) => t.id));
    const merged = [
      ...projectTemplates,
      ...existingTemplates.filter(t => !projectIds.has(t.id)),
    ];

    stateManager.setState({
      racks,
      devices,
      cables,
      bundles: project.bundles ?? [],
      textLabels: project.textLabels ?? [],
      imageAssets: project.imageAssets ?? [],
      customTemplates: merged,
      cloudNodes: project.cloudNodes ?? [],
      cloudContainers: project.cloudContainers ?? [],
      cloudConnectors: project.cloudConnectors ?? [],
      cloudHierarchies: project.cloudHierarchies ?? [],
      selection: [],
      activeElevationRackId: null, // Clear any isolated datacenter rack filter so all loaded racks render
    });
    stateManager.markSaved();
    eventBus.emit('state:changed' as any, undefined);
    eventBus.emit('notification', { message: `Project loaded successfully (${racks.length} rack(s), ${devices.length} device(s), ${cables.length} cable(s))`, type: 'success' });
  } catch (err) {
    eventBus.emit('notification', { message: `Failed to load project: ${err}`, type: 'error' });
  }
}

/**
 * Self-healing routine for imported devices and cables:
 * 1. Ensures switch devices have faceplate ports (RJ45 / SFP) rather than just ear ports.
 * 2. Re-connects unattached / floating cable endpoints to matching switch ports.
 * 3. Unlocks rigid hardcoded canvas anchor points so clean orthogonal paths calculate automatically.
 */
export function sanitizeAndRepairDevicesAndCables(devices: DeviceData[], cables: CableData[]): { devices: DeviceData[], cables: CableData[] } {
  // Map legacy server body port IDs to their parent device before ports get sanitized
  const oldServerPortToDevMap = new Map<string, DeviceData>();
  devices.forEach(d => {
    const isServer = (d as any).category === 'server' || d.templateId?.includes('server') || d.templateId?.startsWith('srv-') || d.name?.toLowerCase().includes('server') || d.name?.toLowerCase().includes('node') || d.name?.toLowerCase().includes('host');
    if (isServer && d.ports) {
      d.ports.forEach(p => {
        if (!p.id.includes('-ear-')) {
          oldServerPortToDevMap.set(p.id, d);
        }
      });
    }
  });

  // 1. Ensure switches, patch panels, and servers have correct ports
  const repairedDevices: DeviceData[] = devices.map(d => {
    const isSwitch = d.templateId?.includes('switch') || (d as any).category === 'switch' || d.name?.toLowerCase().includes('switch');
    const isPatch = d.templateId?.includes('patch') || (d as any).category === 'patch-panel' || d.name?.toLowerCase().includes('patch');
    const isServer = (d as any).category === 'server' || d.templateId?.includes('server') || d.templateId?.startsWith('srv-') || d.name?.toLowerCase().includes('server') || d.name?.toLowerCase().includes('node') || d.name?.toLowerCase().includes('host');
    
    // Ensure every existing port has deviceId attached
    let currentPorts: PortData[] = (d.ports || []).map(p => ({
      ...p,
      deviceId: p.deviceId || d.id
    }));

    if (isServer) {
      // Ensure servers have full Side Ear Holes (S1-P1..P4, MGMT, Power Feed A/B)
      const template = getTemplate(d.templateId);
      const heightUnits = template?.heightUnits ?? (d as any).heightUnits ?? 2;
      const earPorts = injectEarPorts(d.id, 'server', heightUnits, currentPorts, d.deviceConfig);
      // Remove legacy floating body ports on servers so only clean ear holes exist
      const cleanEarPorts = earPorts.filter(p => p.id.includes('-ear-')).map(p => ({
        ...p,
        deviceId: p.deviceId || d.id
      }));
      return {
        ...d,
        ports: cleanEarPorts
      };
    }

    if (isSwitch || isPatch) {
      const template = getTemplate(d.templateId);
      if (template && template.ports && template.ports.length > 0) {
        const templateNonEar = template.ports.filter(p => !p.id.includes('-ear-'));
        const currentNonEar = currentPorts.filter(p => !p.id.includes('-ear-'));
        if (currentNonEar.length < templateNonEar.length) {
          const existingIds = new Set(currentPorts.map(p => p.id));
          const earPorts = currentPorts.filter(p => p.id.includes('-ear-'));
          const nonEarPorts = [...currentNonEar];

          for (const tp of templateNonEar) {
            const scopedId = tp.id.startsWith(d.id) ? tp.id : `${d.id}-${tp.id}`;
            if (!existingIds.has(tp.id) && !existingIds.has(scopedId)) {
              nonEarPorts.push({
                ...tp,
                id: scopedId,
                deviceId: d.id,
                connected: false,
                cableId: null
              });
              existingIds.add(scopedId);
            }
          }
          return {
            ...d,
            ports: [...nonEarPorts, ...earPorts]
          };
        }
      }
    }

    const existingNonEarPorts = currentPorts.filter(p => !p.id.includes('-ear-'));
    if (isSwitch && existingNonEarPorts.length === 0) {
      const earPorts = currentPorts.filter(p => p.id.includes('-ear-'));
      const numRj45 = (d.deviceConfig as any)?.rj45Count ?? 24;
      const numSfp = (d.deviceConfig as any)?.sfpPlusCount ?? 4;
      const facePorts: PortData[] = [];
      const cols = Math.ceil(numRj45 / 2);
      for (let i = 0; i < numRj45; i++) {
        const col = Math.floor(i / 2);
        const row = i % 2;
        facePorts.push({
          id: `${d.id}-port-${i}`,
          deviceId: d.id,
          name: `Port ${i + 1}`,
          type: 'rj45',
          relativeX: 50 + col * 18,
          relativeY: row === 0 ? 6 : 14,
          speed: '1 Gbps',
          connected: false,
          cableId: null,
        });
      }
      for (let i = 0; i < numSfp; i++) {
        facePorts.push({
          id: `${d.id}-sfp-${i}`,
          deviceId: d.id,
          name: `SFP+ ${i + 1}`,
          type: 'sfp',
          relativeX: 50 + cols * 18 + 15 + i * 16,
          relativeY: 8,
          speed: '10 Gbps',
          connected: false,
          cableId: null,
        });
      }
      return {
        ...d,
        ports: [...facePorts, ...earPorts]
      };
    }

    // For switches with predefined templates (e.g. sw-1u-tor-25g-100g), heal stale/wrong port mappings
    if (d.templateId === 'sw-1u-tor-25g-100g' || d.id === 'dev-hv-sw-01') {
      const template = getTemplate(d.templateId);
      if (template && template.ports) {
        // Terminate on top row first: hv-sw-p1 -> tor-sfp1, hv-sw-p2 -> tor-sfp3, hv-sw-p3 -> tor-sfp5
        const alignPort = (customPortId: string, templatePortId: string) => {
          const tp = template.ports.find(p => p.id === templatePortId);
          const cp = currentPorts.find(p => p.id === customPortId);
          if (cp && tp) {
            cp.relativeX = tp.relativeX;
            cp.relativeY = tp.relativeY;
            cp.portW = tp.portW;
            cp.portH = tp.portH;
            cp.type = tp.type;
            cp.speed = tp.speed;
          }
        };
        alignPort('hv-sw-p1', 'tor-sfp1');
        alignPort('hv-sw-p2', 'tor-sfp3');
        alignPort('hv-sw-p3', 'tor-sfp5');
      }
    }

    return {
      ...d,
      ports: currentPorts
    };
  });

  // 2. Heal floating cables, convert legacy PDU outlets, enforce Feed A/B rule book, and route server cables to Side Ear Holes
  const allPortsMap = new Map<string, PortData>();
  repairedDevices.forEach(d => {
    (d.ports || []).forEach(p => allPortsMap.set(p.id, p));
  });

  // Track already used ear ports on each device to avoid overlap when assigning
  const usedEarPortsByDev = new Map<string, Set<string>>();
  cables.forEach(c => {
    if (c.sourcePortId?.includes('-ear-')) {
      const match = /^(.+)-ear-(?:left|right)-(?:nic\d+|power|pwr|mgmt)$/.exec(c.sourcePortId);
      if (match) {
        if (!usedEarPortsByDev.has(match[1])) usedEarPortsByDev.set(match[1], new Set());
        usedEarPortsByDev.get(match[1])!.add(c.sourcePortId);
      }
    }
    if (c.destPortId?.includes('-ear-')) {
      const match = /^(.+)-ear-(?:left|right)-(?:nic\d+|power|pwr|mgmt)$/.exec(c.destPortId);
      if (match) {
        if (!usedEarPortsByDev.has(match[1])) usedEarPortsByDev.set(match[1], new Set());
        usedEarPortsByDev.get(match[1])!.add(c.destPortId);
      }
    }
  });

  const repairedCables: CableData[] = cables.map((c, idx) => {
    let sourcePortId = c.sourcePortId;
    let destPortId = c.destPortId;
    let floatingDest = c.floatingDest;
    let anchorsLocked = c.anchorsLocked;
    let anchorPoints = c.anchorPoints;
    let color = c.color;
    let powerCableType = c.powerCableType;

    const isPower = c.type === 'power' || c.type?.startsWith('power-') || powerCableType === 'power' ||
      c.name?.toLowerCase().includes('pwr') || c.name?.toLowerCase().includes('psu') || c.name?.toLowerCase().includes('power') ||
      c.sourcePortId?.toLowerCase().includes('psu') || destPortId?.toLowerCase().includes('psu') || destPortId?.toLowerCase().includes('pdu');

    if (isPower) {
      powerCableType = 'power';
      const cName = (c.name || '').toLowerCase();
      const sPort = (c.sourcePortId || '').toLowerCase();
      const dPort = (destPortId || '').toLowerCase();

      const isFeedB = cName.includes('feed b') || cName.includes('feed-b') || cName.includes('psu 2') || cName.includes('psu-2') || cName.includes('psu-b') ||
                      sPort.includes('psu-b') || sPort.includes('psu-2') || sPort.includes('feed-b') ||
                      dPort.includes('feed-b') || dPort.includes('pdu-b') || dPort.includes('pdu-hyperv-b') || dPort.includes('pdu-px-b') || dPort.includes('pdu-h100-b') || dPort.includes('pdu-ceph-feed-b');

      color = isFeedB ? '#2563eb' : '#dc2626';

      // Auto-migrate legacy PDU destPortId (e.g. pdu-hv-a1 -> outlet-pdu-hyperv-a-0, pdu-a-out1 -> outlet-pdu-ceph-feed-a-0)
      if (destPortId && !destPortId.startsWith('outlet-')) {
        const dp = destPortId;
        const pduDev = repairedDevices.find(d => 
          ((d as any).category === 'pdu' || d.sideMountPosition || d.templateId?.includes('pdu')) && (
            (d.ports && d.ports.some(p => p.id === dp)) ||
            dp.includes(d.id) ||
            (d.id.includes('pdu') && (
              (d.sideMountPosition === 'left' && (dp.includes('-a') || dp.includes('pdu-a') || dp.includes('feed-a') || dp.includes('out1') || dp.includes('out2') || dp.includes('out3'))) ||
              (d.sideMountPosition === 'right' && (dp.includes('-b') || dp.includes('pdu-b') || dp.includes('feed-b') || dp.includes('out1') || dp.includes('out2') || dp.includes('out3')))
            ))
          )
        );
        if (pduDev) {
          const digitMatch = /(\d+)$/.exec(dp);
          const outletIdx = digitMatch ? Math.max(0, parseInt(digitMatch[1], 10) - 1) : 0;
          destPortId = `outlet-${pduDev.id}-${outletIdx}`;
        }
      }
    }

    // Check if non-mgmt high-speed data cable is wrongly connected to an OOB MGMT or CONSOLE port
    const isMgmtCable = c.type === 'idrac' || (c.type as string) === 'management' || (c.type as string) === 'console' || c.name?.toLowerCase().includes('oob') || c.name?.toLowerCase().includes('idrac') || c.name?.toLowerCase().includes('console');
    if (!isPower && !isMgmtCable && destPortId) {
      const destPort = allPortsMap.get(destPortId);
      const destDev = destPort ? repairedDevices.find(d => d.id === destPort.deviceId) : null;
      const isSw = destDev && (destDev.templateId?.includes('switch') || (destDev as any).category === 'switch' || destDev.name?.toLowerCase().includes('switch'));
      
      if (isSw && destPort && (destPort.id.includes('mgmt') || destPort.id.includes('console') || destPort.name.toLowerCase().includes('mgmt') || destPort.name.toLowerCase().includes('console') || destPort.type === 'management' || destPort.type === 'console')) {
        // Re-map to the first available high-speed data port (SFP28, SFP, or RJ45 data port) on this switch
        // Terminate on TOP ROW FIRST before 2nd row (smaller relativeY first, then left-to-right)
        const availDataPort = (destDev.ports || [])
          .filter(p =>
            !p.id.includes('-ear-') &&
            !p.id.includes('mgmt') &&
            !p.id.includes('console') &&
            !p.name.toLowerCase().includes('mgmt') &&
            !p.name.toLowerCase().includes('console') &&
            p.type !== 'management' &&
            p.type !== 'console' &&
            p.type !== 'power' &&
            !p.connected &&
            p.id !== destPortId
          )
          .sort((a, b) => {
            const yDiff = a.relativeY - b.relativeY;
            if (Math.abs(yDiff) > 2) return yDiff;
            return a.relativeX - b.relativeX;
          })[0];
        if (availDataPort) {
          destPortId = availDataPort.id;
          availDataPort.connected = true;
          availDataPort.cableId = c.id;
          destPort.connected = false;
          destPort.cableId = null;
        }
      }
    }

    // Heal server endpoints so cables terminate at Side Ear Holes instead of floating in the center of servers
    const healServerPort = (portId: string | null | undefined): string | null | undefined => {
      if (!portId) return portId;
      // Already valid ear power port
      if (/^(.+)-ear-(left|right)-(?:power|pwr)$/.test(portId)) {
        return portId;
      }
      // Migrate legacy ear nic power naming to ear power
      const nicPowerMatch = /^(.+)-ear-(left|right)-nic(\d+)$/.exec(portId);
      if (isPower && nicPowerMatch) {
        return `${nicPowerMatch[1]}-ear-${nicPowerMatch[2]}-power`;
      }
      if (portId.includes('-ear-')) {
        return portId;
      }

      // Find if this port belongs to a server
      const targetDev = oldServerPortToDevMap.get(portId) || repairedDevices.find(d => {
        const isSrv = (d as any).category === 'server' || d.templateId?.includes('server') || d.templateId?.startsWith('srv-') || d.name?.toLowerCase().includes('server') || d.name?.toLowerCase().includes('node') || d.name?.toLowerCase().includes('host');
        if (!isSrv) return false;
        if (portId.startsWith(d.id)) return true;
        const dId = d.id.toLowerCase();
        const pId = portId.toLowerCase();
        if (pId.startsWith('hv1') && dId.includes('hyperv-node-01')) return true;
        if (pId.startsWith('hv2') && dId.includes('hyperv-node-02')) return true;
        if (pId.startsWith('arc') && dId.includes('arc')) return true;
        if (pId.startsWith('n1') && dId.includes('node-01')) return true;
        if (pId.startsWith('n2') && dId.includes('node-02')) return true;
        if (pId.startsWith('n3') && dId.includes('node-03')) return true;
        if (pId.startsWith('h1') && dId.includes('h1')) return true;
        if (pId.startsWith('h2') && dId.includes('h2')) return true;
        if (pId.startsWith('h3') && dId.includes('h3')) return true;
        if (pId.startsWith('pbs') && dId.includes('pbs')) return true;
        if (pId.startsWith('gpu') && dId.includes('gpu')) return true;
        return false;
      });

      if (!targetDev) return portId;

      if (!usedEarPortsByDev.has(targetDev.id)) {
        usedEarPortsByDev.set(targetDev.id, new Set<string>());
      }
      const usedPorts = usedEarPortsByDev.get(targetDev.id)!;

      // 1. Power cable -> Side Ear Power Hole (Left for Feed A, Right for Feed B)
      if (isPower) {
        const cName = (c.name || '').toLowerCase();
        const pLower = portId.toLowerCase();
        const isFeedB = cName.includes('feed b') || cName.includes('feed-b') || cName.includes('psu 2') || cName.includes('psu-2') || cName.includes('psu-b') ||
                        pLower.includes('psu-b') || pLower.includes('psu-2') || pLower.includes('feed-b') || pLower.includes('psu2') || pLower.includes('pwr-b') || pLower.includes('power-b') || pLower.includes('out2');
        const targetEarPower = isFeedB ? `${targetDev.id}-ear-right-power` : `${targetDev.id}-ear-left-power`;
        usedPorts.add(targetEarPower);
        anchorsLocked = false;
        anchorPoints = [];
        return targetEarPower;
      }

      // 2. Management cable -> Right Ear iDRAC/BMC Hole
      if (isMgmtCable) {
        const targetEarMgmt = `${targetDev.id}-ear-right-mgmt`;
        usedPorts.add(targetEarMgmt);
        anchorsLocked = false;
        anchorPoints = [];
        return targetEarMgmt;
      }

      // 3. Network / Data cable -> Side Ear NIC Holes (S1-P1..P4)
      const pLower = portId.toLowerCase();
      const cName = (c.name || '').toLowerCase();
      let preferredEar: string | null = null;

      if (pLower.includes('nic1') || pLower.includes('p1') || pLower.includes('eth1') || pLower.includes('mesh-1') || pLower.includes('cx7-1') || pLower.includes('uplink') || pLower.includes('tor-uplink') || cName.includes('tor') || cName.includes('uplink')) {
        preferredEar = `${targetDev.id}-ear-left-nic1`;
      } else if (pLower.includes('nic2') || pLower.includes('p2') || pLower.includes('eth2') || pLower.includes('mesh-2') || pLower.includes('cx7-2') || pLower.includes('s2d') || cName.includes('s2d')) {
        preferredEar = `${targetDev.id}-ear-left-nic2`;
      } else if (pLower.includes('nic3') || pLower.includes('p3') || pLower.includes('eth3') || pLower.includes('mesh-3') || pLower.includes('cx7-3')) {
        preferredEar = `${targetDev.id}-ear-right-nic1`;
      } else if (pLower.includes('nic4') || pLower.includes('p4') || pLower.includes('eth4') || pLower.includes('mesh-4') || pLower.includes('cx7-4')) {
        preferredEar = `${targetDev.id}-ear-right-nic2`;
      }

      const availableCandidates = [
        `${targetDev.id}-ear-left-nic1`,
        `${targetDev.id}-ear-left-nic2`,
        `${targetDev.id}-ear-right-nic1`,
        `${targetDev.id}-ear-right-nic2`
      ];

      let selectedEar = preferredEar && !usedPorts.has(preferredEar) ? preferredEar : null;
      if (!selectedEar) {
        selectedEar = availableCandidates.find(p => !usedPorts.has(p)) || availableCandidates[0];
      }

      usedPorts.add(selectedEar);
      anchorsLocked = false;
      anchorPoints = [];
      return selectedEar;
    };

    sourcePortId = healServerPort(sourcePortId) || sourcePortId;
    destPortId = healServerPort(destPortId) || destPortId;

    const isDestBroken = !destPortId || (!allPortsMap.has(destPortId) && !destPortId.startsWith('outlet-'));
    if (isDestBroken && (floatingDest || !destPortId)) {
      const srcPort = sourcePortId ? allPortsMap.get(sourcePortId) : null;
      const srcDev = srcPort ? repairedDevices.find(d => d.id === srcPort.deviceId) : null;
      const targetRackId = srcDev?.rackId;
      const switchesInRack = repairedDevices.filter(d => 
        (!targetRackId || d.rackId === targetRackId) && 
        (d.templateId?.includes('switch') || (d as any).category === 'switch' || d.name?.toLowerCase().includes('switch'))
      );

      if (switchesInRack.length > 0) {
        const isTorB = c.type === 'ceph-secondary' || c.name?.includes('TOR B') || c.name?.includes('Secondary') || (idx % 2 === 1 && c.type !== 'idrac');
        const targetSwitch = (isTorB && switchesInRack.length > 1) ? switchesInRack[1] : switchesInRack[0];
        
        const candidatePorts = (targetSwitch.ports || [])
          .filter(p =>
            !p.id.includes('-ear-') &&
            !p.id.includes('mgmt') &&
            !p.id.includes('console') &&
            p.type !== 'management' &&
            p.type !== 'console' &&
            p.type !== 'power' &&
            !p.connected &&
            p.id !== destPortId
          )
          .sort((a, b) => {
            // 1st terminate on top row only, then on 2nd row (smaller relativeY first, then left-to-right)
            const yDiff = a.relativeY - b.relativeY;
            if (Math.abs(yDiff) > 2) return yDiff;
            return a.relativeX - b.relativeX;
          });

        let targetPort: PortData | null = null;
        if (c.type === 'ceph-primary' || c.type === 'ceph-secondary' || c.type === 'live-migration') {
          targetPort = candidatePorts.find(p => p.type === 'sfp' || p.type === 'sfp28') || null;
        }
        if (!targetPort) {
          targetPort = candidatePorts.find(p => p.type === 'rj45') || candidatePorts[0] || null;
        }
        if (targetPort) {
          destPortId = targetPort.id;
          floatingDest = null;
          targetPort.connected = true;
          targetPort.cableId = c.id;
          anchorsLocked = false;
          anchorPoints = [];
        }
      }
    }

    return {
      ...c,
      sourcePortId,
      destPortId,
      color,
      powerCableType,
      floatingDest,
      anchorsLocked,
      anchorPoints,
    };
  });

  return { devices: repairedDevices, cables: repairedCables };
}


/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string | Blob, filename: string, mimeType?: string): void {
  const a = document.createElement('a');
  a.download = filename;

  if (typeof content === 'string') {
    // Text payloads (JSON/SVG/HTML) go out as a data: URI rather than a Blob + object URL.
    // A data: URI embeds the payload directly in the href, so there is no separate object
    // whose lifetime can be cut short — this sidesteps the empty/truncated-download class of
    // bug entirely (a Blob object URL revoked even a few seconds early, which can happen under
    // corporate download-scanning/"keep or discard" policies, yanks the data out from under a
    // deferred read). Fine for project-file-sized JSON/SVG/HTML; not used for binary images.
    const type = mimeType || 'text/plain';
    a.href = `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const url = URL.createObjectURL(content);
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Binary (PNG/JPEG) blobs still need an object URL — revoke is deferred for the same reason
  // as above, since it can't be avoided entirely for binary data this way.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Wire up export events
export function initExportHandlers(): void {
  eventBus.on('export:cloud-svg', () => {
    showCloudExportOptionsModal('svg', async (options) => {
      try {
        const svgContent = await exportCloudSVG(options);
        downloadFile(svgContent, 'cloud-architecture.svg', 'image/svg+xml');
        eventBus.emit('notification', { message: 'Cloud diagram SVG exported successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `Cloud diagram SVG export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:cloud-png', () => {
    showCloudExportOptionsModal('png', async (options) => {
      try {
        const pngBlob = await exportCloudPNG(options);
        downloadFile(pngBlob, 'cloud-architecture.png');
        eventBus.emit('notification', { message: 'Cloud diagram PNG exported successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `Cloud diagram PNG export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:cloud-area-selected', (rect) => {
    if (pendingCloudAreaExport) {
      pendingCloudAreaExport.onConfirm({ ...pendingCloudAreaExport.baseOptions, area: 'custom', customRect: rect });
      pendingCloudAreaExport = null;
    }
  });

  eventBus.on('export:cloud-area-selection-cancelled', () => {
    pendingCloudAreaExport = null;
  });

  eventBus.on('export:svg', () => {
    showExportOptionsModal('svg', (options) => {
      try {
        const svgContent = exportSVG(options);
        downloadFile(svgContent, 'rack-slicer.svg', 'image/svg+xml');
        eventBus.emit('notification', { message: 'SVG exported successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `SVG export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:png', () => {
    showExportOptionsModal('png', async (options) => {
      try {
        const pngBlob = await exportPNG(options);
        downloadFile(pngBlob, 'rack-slicer.png');
        eventBus.emit('notification', { message: 'PNG exported successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `PNG export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:jpeg', () => {
    showExportOptionsModal('jpeg', async (options) => {
      try {
        const jpgBlob = await exportJPEG(options);
        downloadFile(jpgBlob, 'rack-slicer.jpg');
        eventBus.emit('notification', { message: 'JPEG exported successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `JPEG export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:pdf', () => {
    showExportOptionsModal('pdf', (options) => {
      try {
        exportPDF(options);
        eventBus.emit('notification', { message: 'PDF export triggered successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `PDF export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:html', () => {
    showExportOptionsModal('html', (options) => {
      try {
        const html = exportHTML(options);
        downloadFile(html, 'rack-slicer-animated.html', 'text/html');
        eventBus.emit('notification', { message: 'Animated HTML exported successfully', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `HTML export failed: ${err}`, type: 'error' });
      }
    });
  });

  eventBus.on('export:area-selected', (rect) => {
    if (pendingAreaExport) {
      pendingAreaExport.onConfirm({ ...pendingAreaExport.baseOptions, area: 'custom', customRect: rect });
      pendingAreaExport = null;
    }
  });

  eventBus.on('export:area-selection-cancelled', () => {
    pendingAreaExport = null;
  });

  eventBus.on('export:json', () => {
    try {
      const jsonContent = exportJSON();
      downloadFile(jsonContent, 'rack-slicer.json', 'application/json');
      stateManager.markSaved();
      eventBus.emit('notification', { message: 'Project saved successfully — rack-slicer.json downloaded', type: 'success' });
    } catch (err) {
      eventBus.emit('notification', { message: `JSON export failed: ${err}`, type: 'error' });
    }
  });

  eventBus.on('project:save', () => {
    eventBus.emit('export:json', undefined as any);
  });

  eventBus.on('project:load', (jsonString: string) => {
    importJSON(jsonString);
  });

  eventBus.on('export:excel' as any, () => {
    try {
      ExcelExportEngine.downloadEngineeringExcel(physicalInfrastructureModel);
      eventBus.emit('notification', { message: 'Engineering Excel Workbook (.xlsx) exported successfully!', type: 'success' });
    } catch (err: any) {
      eventBus.emit('notification', { message: `Excel export failed: ${err.message}`, type: 'error' });
    }
  });

  eventBus.on('export:report' as any, () => {
    const modal = document.getElementById('export-report-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');

    document.getElementById('rpt-cancel')?.addEventListener('click', closeModal, { once: true });

    document.getElementById('rpt-generate')?.addEventListener('click', () => {
      const title    = (document.getElementById('rpt-title')  as HTMLInputElement).value;
      const author   = (document.getElementById('rpt-author') as HTMLInputElement).value;
      const revision = (document.getElementById('rpt-rev')    as HTMLInputElement).value;
      const notes    = (document.getElementById('rpt-notes')  as HTMLTextAreaElement).value;
      const meta: ReportMetadata = {
        title,
        author,
        revision,
        notes,
        generatedAt: new Date().toISOString(),
      };
      closeModal();
      try {
        const html = buildReport(stateManager.getState(), meta);
        const win = window.open('', '_blank');
        if (!win) {
          // Same popup-blocked fallback as PDF export — always leave the user with something.
          downloadFile(html, 'rack-slicer-report.html', 'text/html');
          eventBus.emit('notification', { message: 'Popup blocked — downloaded the report as an HTML file instead', type: 'warning' });
          return;
        }
        win.document.write(html);
        win.document.close();
        eventBus.emit('notification', { message: 'Design report generated', type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `Report generation failed: ${err}`, type: 'error' });
      }
    }, { once: true });
  });
}
