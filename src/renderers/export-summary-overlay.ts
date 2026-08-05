// Draws the "Rack Load Summary" + "Cable Types" cards as real SVG elements — used for both the
// live, always-on, draggable canvas rendering (app.ts's renderAll -> summary-preview-layer,
// inside the pannable/zoomable viewport group so it scales and pans correctly with the rack)
// and the export SVG clone (utils/export.ts's exportSVG, since a clone-and-serialize pipeline
// can't capture anything outside the SVG). One rendering path for both — the position the user
// drags a card to live is exactly what shows up in the export, with no separate "preview mode"
// or synced-in-parallel HTML overlay to keep in sync.
import { RackData, DeviceData, CableData, LegendItem, RACK_CONSTANTS } from '../core/types';
import { createGroup, createRect, createText, createSVGElement, setAttributes } from '../utils/svg-helpers';
import { computeRackSummary } from '../utils/rack-summary';
import { sidePduOffsetX, cableManagerSpan } from './pdu-layout';
import { getTemplate } from '../library/device-catalog';
import { createConnector, classifyCableConnector } from './cable-renderer';

/** The rightmost X (rack-local coordinates) actually occupied by the rack itself plus whatever's
 *  mounted on its right wall — vertical cable manager duct and/or a side-mount PDU, in that
 *  outside-growing order (matches rack-renderer.ts's own layout). The summary cards must start
 *  past this point, not at a fixed offset from the rack body alone, or they land on top of a
 *  right-side PDU/cable manager whenever one is present. */
function rackRightEdge(rack: RackData, devices: DeviceData[]): number {
  const rightPduDevice = rack.rightPduId ? devices.find(d => d.id === rack.rightPduId) : null;
  const rightPduTemplate = rightPduDevice ? getTemplate(rightPduDevice.templateId) : null;
  const rightPduW = rightPduTemplate?.pduWidth ?? 0;
  if (rightPduW > 0) return sidePduOffsetX(rack, 'right', rightPduW) + rightPduW;
  return RACK_CONSTANTS.RACK_OUTER_WIDTH + cableManagerSpan(rack.rightCableManagerWidth);
}

/** The automatic (no manual `summaryCardOffset` yet) card position for a rack — exported so the
 *  Summary Card Preview drag interaction (app.ts) can compute "where the card visually is right
 *  now" as its drag-start reference point without duplicating this formula. */
export function getAutoSummaryCardOffset(rack: RackData, devices: DeviceData[]): { x: number; y: number } {
  return { x: rackRightEdge(rack, devices) + 20, y: 30 };
}

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
export interface SummaryOverlayOptions {
  /** When true, cards get a visible drag handle + `data-rack-id`/`data-draggable` markers so a
   *  live canvas overlay (components/summary-card-preview wiring in app.ts) can let the user drag
   *  them to an exact spot; that position is then read back from `rack.summaryCardOffset` here on
   *  every subsequent render/export, instead of the automatic clear-of-the-PDU placement. */
  draggable?: boolean;
}

export function appendExportSummaryOverlay(
  vpGroup: SVGGElement,
  racks: RackData[],
  devices: DeviceData[],
  cables: CableData[],
  customLegend?: LegendItem[],
  options?: SummaryOverlayOptions,
): Rect[] {
  const rects: Rect[] = [];
  const draggable = !!options?.draggable;

  for (const rack of racks) {
    const summary = computeRackSummary(rack, devices, cables, customLegend);
    const dashGroup = createGroup('export-summary-' + rack.id, 'export-summary-overlay');
    setAttributes(dashGroup, { transform: `translate(${rack.x}, ${rack.y})` });
    if (draggable) {
      setAttributes(dashGroup, { 'data-rack-id': rack.id, 'data-draggable': 'true', style: 'cursor: grab;' });
    }

    const auto = getAutoSummaryCardOffset(rack, devices);
    const cardX = rack.summaryCardOffset?.x ?? auto.x;
    const cardW = 275;
    const startY = rack.summaryCardOffset?.y ?? auto.y;
    let cardY = startY;

    if (draggable) {
      dashGroup.appendChild(createRect(cardX, startY - 16, cardW, 14, {
        fill: '#1f6feb', opacity: 0.85, rx: 3, ry: 3,
      }));
      dashGroup.appendChild(createText(cardX + cardW / 2, startY - 6, '⠿ DRAG TO POSITION', {
        fill: '#fff', 'font-size': 8.5, 'font-weight': 'bold', 'font-family': 'Inter, sans-serif',
        'text-anchor': 'middle', 'letter-spacing': '0.5px',
      }));
    }

    // Cable Types card — every row's connector icon reuses cable-renderer.ts's own
    // createConnector() (the exact same function real cable ends draw with on the canvas: IEC
    // power plug, RJ45 jack, fiber LC/SC, SFP+/QSFP28 cage) — no separately-drawn legend-only
    // icon set that could visually drift from the canvas. Power rows keep the dashed line
    // (matching cable-renderer.ts's own stroke-dasharray for power cables); every row's swatch
    // spans the same fixed total width regardless of type, so lengths stay uniform.
    const rows = summary.cableTypeRows;
    const ROW_H = 26;
    const legendBodyH = rows.length > 0 ? rows.length * ROW_H + 20 : 46;
    const legendH = 42 + legendBodyH;
    drawCard(dashGroup, cardX, cardY, cardW, legendH, 'CABLE TYPES');
    if (rows.length === 0) {
      dashGroup.appendChild(createText(cardX + cardW / 2, cardY + 60, '(No cables routed yet)', {
        fill: '#8b949e', 'font-size': 9.5, 'font-family': 'Inter, sans-serif', 'text-anchor': 'middle',
      }));
    } else {
      rows.forEach(({ label, color, count, type }, i) => {
        const rowY = cardY + 52 + i * ROW_H;
        const { isFiber, isPower, isSFP } = type ? classifyCableConnector(type) : { isFiber: false, isPower: false, isSFP: false };

        // Connector icon sits at the row's left corner, with the cable line running FROM it —
        // createConnector's own orientation='right' geometry places the connector's cable-exit
        // point (the boot/tail end) exactly at the given pos, so starting the line's x1 at that
        // same pos (not some arbitrary offset past it) is what makes them touch instead of
        // leaving a visible gap between icon and line.
        const iconX = cardX + 14;
        if (type) {
          dashGroup.appendChild(createConnector({ x: iconX, y: rowY }, color, 'right', isFiber, isPower, isSFP));
        }

        // Power specifically needs a pull-back on its start point on top of the normal touch
        // point: with stroke-linecap 'round', the line's own start cap is a filled semicircle
        // sitting exactly at the plug icon's anchor point — it was drawn right on top of the
        // IEC connector's 3 copper pins (Live/Neutral/Earth), covering one of them. Pulling the
        // line's x1 clear of the whole pin spread leaves all 3 pins visible while it still reads
        // as touching, not disconnected.
        const POWER_PULLBACK = 9;
        const LINE_LENGTH = 40; // same nominal cable length for every row regardless of type
        const lineX1 = type ? iconX + (isPower ? POWER_PULLBACK : 0) : cardX + 16;
        // Power's line therefore ends further right than a data row's (its later start is offset
        // by extending, not shrinking, its own length) — both are still exactly LINE_LENGTH long,
        // so the cables themselves read as the same length; only the text column (below) has to
        // clear the longer of the two, uniformly, so every row's label still lines up.
        const lineX2 = lineX1 + LINE_LENGTH;
        dashGroup.appendChild(createSVGElement('line', {
          x1: lineX1, y1: rowY, x2: lineX2, y2: rowY, stroke: color, 'stroke-width': isPower ? 3 : 3.5,
          'stroke-linecap': 'round', ...(isPower ? { 'stroke-dasharray': '6 3' } : {}),
        }));

        const textX = cardX + 16 + POWER_PULLBACK + LINE_LENGTH + 6; // clears the longest (power) line
        dashGroup.appendChild(createText(textX, rowY + 3.5, label, { fill: '#c9d1d9', 'font-size': 9, 'font-family': 'Inter, sans-serif' }));
        if (count !== null) {
          dashGroup.appendChild(createText(cardX + cardW - 16, rowY + 3.5, `× ${count}`, {
            fill: '#8b949e', 'font-size': 9, 'font-family': 'Inter, sans-serif', 'text-anchor': 'end',
          }));
        }
      });
    }
    cardY += legendH + 20;

    // Rack Load Summary card
    const bodyRows = 2 + summary.categoryRows.length + (summary.redundantPowerDeviceCount > 0 ? 1 : 0);
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
    if (summary.redundantPowerDeviceCount > 0) {
      bullet(`• ⚡ Redundant Power: ${summary.redundantPowerDeviceCount} device${summary.redundantPowerDeviceCount === 1 ? '' : 's'}`);
    }

    rowY += 4;
    drawGauge(dashGroup, cardX + 20, rowY, cardW - 40, 'Rack Capacity', summary.usedRUs, summary.totalRUs, 'U', summary.capacitySeverityColor);
    rowY += 30;
    drawGauge(dashGroup, cardX + 20, rowY, cardW - 40, 'Power Draw', summary.usedW, summary.capacityW, 'W', summary.powerSeverityColor);

    vpGroup.appendChild(dashGroup);

    const totalHeight = cardY + summaryH - startY;
    rects.push({ x: rack.x + cardX, y: rack.y + startY, width: cardW, height: totalHeight });
  }

  return rects;
}
