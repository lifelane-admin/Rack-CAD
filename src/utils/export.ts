/**
 * Export utilities for saving designs as SVG, PNG, and JSON.
 */
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
const state = stateManager;

/**
 * Serialize current SVG canvas to an SVG string.
 */
export function exportSVG(): string {
  const svgEl = document.getElementById('canvas') as unknown as SVGSVGElement;
  if (!svgEl) throw new Error('Canvas SVG element not found');

  // Clone the SVG to avoid modifying the original
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Get the viewport group's bounding box
  const viewportGroup = svgEl.querySelector('#viewport-group') as SVGGElement;
  if (viewportGroup) {
    try {
      const bbox = viewportGroup.getBBox();
      const padding = 40;
      clone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
      clone.setAttribute('width', String(bbox.width + padding * 2));
      clone.setAttribute('height', String(bbox.height + padding * 2));
    } catch {
      // BBox may fail if nothing rendered
      clone.setAttribute('viewBox', '0 0 1920 1080');
      clone.setAttribute('width', '1920');
      clone.setAttribute('height', '1080');
    }
  }

  // Remove the grid layer from export
  const gridLayer = clone.querySelector('#grid-layer');
  if (gridLayer) gridLayer.remove();

  // Remove interaction layer from export
  const interactionLayer = clone.querySelector('#interaction-layer');
  if (interactionLayer) interactionLayer.remove();

  // Reset the viewport transform for export
  const vpGroup = clone.querySelector('#viewport-group');
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
export async function exportPNG(scale: number = 2): Promise<Blob> {
  const svgString = exportSVG();
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

      // White background
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
export async function exportJPEG(scale: number = 2): Promise<Blob> {
  const svgString = exportSVG();
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

      // Draw a solid white background (JPEGs do not support transparency)
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
export function exportPDF(): void {
  const svgContent = exportSVG();
  
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
  const s = state.getState();
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
    state.setState({
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
    try {
      const svgContent = exportSVG();
      downloadFile(svgContent, 'rack-design.svg', 'image/svg+xml');
      eventBus.emit('notification', { message: 'SVG exported successfully', type: 'success' });
    } catch (err) {
      eventBus.emit('notification', { message: `SVG export failed: ${err}`, type: 'error' });
    }
  });

  eventBus.on('export:png', async () => {
    try {
      const pngBlob = await exportPNG(2);
      downloadFile(pngBlob, 'rack-design.png');
      eventBus.emit('notification', { message: 'PNG exported successfully', type: 'success' });
    } catch (err) {
      eventBus.emit('notification', { message: `PNG export failed: ${err}`, type: 'error' });
    }
  });

  eventBus.on('export:jpeg', async () => {
    try {
      const jpgBlob = await exportJPEG(2);
      downloadFile(jpgBlob, 'rack-design.jpg');
      eventBus.emit('notification', { message: 'JPEG exported successfully', type: 'success' });
    } catch (err) {
      eventBus.emit('notification', { message: `JPEG export failed: ${err}`, type: 'error' });
    }
  });

  eventBus.on('export:pdf', () => {
    try {
      exportPDF();
      eventBus.emit('notification', { message: 'PDF export triggered successfully', type: 'success' });
    } catch (err) {
      eventBus.emit('notification', { message: `PDF export failed: ${err}`, type: 'error' });
    }
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
}
