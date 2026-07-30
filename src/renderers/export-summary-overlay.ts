// Draws the "Rack Load Summary" + "Cable Types" cards into an export SVG clone only — the
// live, interactive versions of these are the floating draggable HTML panels
// (components/floating-summary-panels.ts), which live outside the canvas SVG entirely and so
// are invisible to exportSVG()'s clone-and-serialize pipeline. This restores that content
// specifically for exports (SVG/PNG/JPEG/PDF/HTML all funnel through exportSVG), reusing the
// exact same computeRackSummary() data the floating panels display.
import { RackData, DeviceData, CableData, LegendItem, RACK_CONSTANTS } from '../core/types';
import { createGroup, createRect, createText, createSVGElement, setAttributes } from '../utils/svg-helpers';
import { computeRackSummary } from '../utils/rack-summary';

export interface Rect { x: number; y: number; width: number; height: number; }

function drawCard(parent: SVGGElement, x: number, y: number, w: number, h: number, title: string): void {
  parent.appendChild(createRect(x, y, w, h, {
    fill: '#161b22', stroke: '#30363d', 'stroke-width': 1.5, rx: 6, ry: 6, opacity: 0.95,
  }));
  parent.appendChild(createText(x + w / 2, y + 22, title, {
    fill: '#fb8c00', 'font-size': 11, 'font-weight': 'bold', 'font-family': 'Inter, sans-serif',
    'text-anchor': 'middle', 'letter-spacing': '1px',
  }));
  parent.appendChild(createSVGElement('line', {
    x1: x + 15, y1: y + 32, x2: x + w - 15, y2: y + 32, stroke: '#30363d', 'stroke-width': 1,
  }));
}

function drawGauge(
  parent: SVGGElement, x: number, y: number, w: number,
  label: string, used: number, capacity: number, unit: string, color: string,
): void {
  const labelText = capacity > 0
    ? `${label}: ${Math.round(used).toLocaleString()} / ${Math.round(capacity).toLocaleString()} ${unit} (${Math.round((used / capacity) * 100)}%)`
    : `${label}: ${Math.round(used).toLocaleString()} ${unit} (no capacity configured)`;
  parent.appendChild(createText(x, y, labelText, { fill: '#c9d1d9', 'font-size': 9.5, 'font-family': 'Inter, sans-serif' }));

  const barY = y + 7, barH = 8;
  parent.appendChild(createRect(x, barY, w, barH, { fill: '#0d1117', stroke: '#30363d', 'stroke-width': 0.8, rx: 3, ry: 3 }));
  const ratio = capacity > 0 ? Math.min(1, used / capacity) : (used > 0 ? 1 : 0);
  if (ratio > 0) {
    parent.appendChild(createRect(x, barY, Math.max(3, w * ratio), barH, { fill: color, rx: 3, ry: 3 }));
  }
}

/**
 * Appends one Cable-Types + Rack-Load-Summary card pair per rack into `vpGroup` (must already
 * be part of the export clone, positioned in the same world-coordinate space as the rack
 * itself). Returns each rack's card bounding rect (world coordinates) so the caller can extend
 * its export viewBox to actually include them — these are computed analytically from the same
 * layout constants used to draw the cards, since getBBox() only works on elements attached to
 * a rendered document and the export clone is detached.
 */
export function appendExportSummaryOverlay(
  vpGroup: SVGGElement,
  racks: RackData[],
  devices: DeviceData[],
  cables: CableData[],
  customLegend?: LegendItem[],
): Rect[] {
  const rects: Rect[] = [];

  for (const rack of racks) {
    const summary = computeRackSummary(rack, devices, cables, customLegend);
    const dashGroup = createGroup('export-summary-' + rack.id, 'export-summary-overlay');
    setAttributes(dashGroup, { transform: `translate(${rack.x}, ${rack.y})` });

    const cardX = RACK_CONSTANTS.RACK_OUTER_WIDTH + 45;
    const cardW = 275;
    let cardY = 30;

    // Cable Types card
    const rows = summary.cableTypeRows;
    const legendBodyH = rows.length > 0 ? rows.length * 24 + 20 : 46;
    const legendH = 42 + legendBodyH;
    drawCard(dashGroup, cardX, cardY, cardW, legendH, 'CABLE TYPES');
    if (rows.length === 0) {
      dashGroup.appendChild(createText(cardX + cardW / 2, cardY + 60, '(No cables routed yet)', {
        fill: '#8b949e', 'font-size': 9.5, 'font-family': 'Inter, sans-serif', 'text-anchor': 'middle',
      }));
    } else {
      rows.forEach(({ label, color, count }, i) => {
        const rowY = cardY + 50 + i * 24;
        dashGroup.appendChild(createSVGElement('line', {
          x1: cardX + 16, y1: rowY, x2: cardX + 40, y2: rowY, stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'round',
        }));
        dashGroup.appendChild(createText(cardX + 50, rowY + 3.5, label, { fill: '#c9d1d9', 'font-size': 9, 'font-family': 'Inter, sans-serif' }));
        if (count !== null) {
          dashGroup.appendChild(createText(cardX + cardW - 16, rowY + 3.5, `× ${count}`, {
            fill: '#8b949e', 'font-size': 9, 'font-family': 'Inter, sans-serif', 'text-anchor': 'end',
          }));
        }
      });
    }
    cardY += legendH + 20;

    // Rack Load Summary card
    const bodyRows = 2 + summary.categoryRows.length + 1;
    const summaryH = 42 + bodyRows * 21 + 20 + 30 + 16;
    drawCard(dashGroup, cardX, cardY, cardW, summaryH, 'RACK LOAD SUMMARY');

    let rowY = cardY + 52;
    const bullet = (text: string) => {
      dashGroup.appendChild(createText(cardX + 20, rowY + 3, text, { fill: '#c9d1d9', 'font-size': 9.5, 'font-family': 'Inter, sans-serif' }));
      rowY += 21;
    };
    bullet(`• Objects: ${summary.deviceCount} device${summary.deviceCount === 1 ? '' : 's'}`);
    bullet(`• Cables: ${summary.cableCount}`);
    summary.categoryRows.forEach(([label, count]) => bullet(`• ${label}: ${count}`));
    bullet(`• PDUs: ${summary.pduCount}`);

    rowY += 4;
    drawGauge(dashGroup, cardX + 20, rowY, cardW - 40, 'Rack Capacity', summary.usedRUs, summary.totalRUs, 'U', summary.capacitySeverityColor);
    rowY += 30;
    drawGauge(dashGroup, cardX + 20, rowY, cardW - 40, 'Power Draw', summary.usedW, summary.capacityW, 'W', summary.powerSeverityColor);

    vpGroup.appendChild(dashGroup);

    const totalHeight = cardY + summaryH - 30; // relative to rack.y (cards start at y=30)
    rects.push({ x: rack.x + cardX, y: rack.y + 30, width: cardW, height: totalHeight });
  }

  return rects;
}
