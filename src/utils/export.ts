import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { buildReport, ReportMetadata } from '../export/report-builder';

export interface ExportOptions {
  area: 'full' | 'viewport' | 'rack';
  rackId?: string;
  includeGrid?: boolean;
  scale?: number;
  pageSize?: 'letter' | 'a4' | 'a3' | 'tabloid';
  orientation?: 'landscape' | 'portrait';
}

/**
 * Show modern export settings dialog modal.
 */
export function showExportOptionsModal(
  format: 'svg' | 'png' | 'jpeg' | 'pdf',
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
    
    const options: ExportOptions = {
      area: selectedArea,
      includeGrid,
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
      const rackHeight = rack.units * 30 + 100;
      bbox.x = rack.x - 40;
      bbox.y = rack.y - 40;
      bbox.width = 500 + 80;
      bbox.height = rackHeight + 80;
      appliedBox = true;
    }
  }

  if (!appliedBox && vpGroup) {
    try {
      const origViewport = svgEl.querySelector('#viewport-group') as SVGGElement;
      const b = origViewport.getBBox();
      const padding = 40;
      bbox.x = b.x - padding;
      bbox.y = b.y - padding;
      bbox.width = b.width + padding * 2;
      bbox.height = b.height + padding * 2;
    } catch {
      bbox = { x: 100, y: 50, width: 1200, height: 1500 };
    }
  }

  clone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  clone.setAttribute('width', String(bbox.width));
  clone.setAttribute('height', String(bbox.height));

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

      ctx.fillStyle = '#ffffff';
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

      ctx.fillStyle = '#ffffff';
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
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked! Please allow popups to export PDF.');
  }
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Export Rack Design PDF</title>
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
  `);
  printWindow.document.close();
}

/**
 * Export the project as a JSON object.
 */
export function exportJSON(): string {
  const s = stateManager.getState();
  const project = {
    version: '1.0.0',
    name: 'RackCAD Project',
    created: new Date().toISOString(),
    racks: s.racks,
    devices: s.devices,
    cables: s.cables,
  };
  return JSON.stringify(project, null, 2);
}

/**
 * Import a project from JSON string.
 */
export function importJSON(jsonString: string): void {
  try {
    const project = JSON.parse(jsonString);
    if (!project.racks || !project.devices || !project.cables) {
      throw new Error('Invalid project format');
    }
    stateManager.setState({
      racks: project.racks,
      devices: project.devices,
      cables: project.cables,
      selection: [],
    });
    eventBus.emit('notification', { message: 'Project loaded successfully', type: 'success' });
  } catch (err) {
    eventBus.emit('notification', { message: `Failed to load project: ${err}`, type: 'error' });
  }
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string | Blob, filename: string, mimeType?: string): void {
  let blob: Blob;
  if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType || 'text/plain' });
  } else {
    blob = content;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Wire up export events
export function initExportHandlers(): void {
  eventBus.on('export:svg', () => {
    showExportOptionsModal('svg', (options) => {
      try {
        const svgContent = exportSVG(options);
        downloadFile(svgContent, 'rack-design.svg', 'image/svg+xml');
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
        downloadFile(pngBlob, 'rack-design.png');
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
        downloadFile(jpgBlob, 'rack-design.jpg');
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

  eventBus.on('export:json', () => {
    try {
      const jsonContent = exportJSON();
      downloadFile(jsonContent, 'rack-design.json', 'application/json');
      eventBus.emit('notification', { message: 'Project saved successfully', type: 'success' });
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
          eventBus.emit('notification', { message: 'Popup blocked — please allow popups to generate report', type: 'error' });
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
