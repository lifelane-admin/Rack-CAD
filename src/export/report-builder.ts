import {
  AppState, RACK_CONSTANTS, CABLE_COLORS, CableType, RackData, DeviceData,
} from '../core/types';
import { renderRack } from '../renderers/rack-renderer';
import { renderDevice } from '../renderers/device-renderer';
import { getTemplate } from '../library/device-catalog';

export interface ReportMetadata {
  title: string;
  author: string;
  revision: string;
  notes: string;
  generatedAt: string;
}

const PDU_WATTS = 7200;

function parseWatts(description: string): number {
  const m = description.match(/(\d+)\s*[wW]/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseKg(description: string): number {
  const m = description.match(/(\d+)\s*kg/i);
  return m ? parseInt(m[1], 10) : 0;
}

function captureRackSvg(
  rack: RackData,
  devices: DeviceData[],
  state: AppState,
  viewMode: 'front' | 'rear',
): string {
  const stateOverride = {
    cabinetViewMode: viewMode,
    cabinetDrawMode: 'default' as const,
    isometricMode: false,
    cabinetCoverVisible: false,
  };
  const svgEl = document.createElementNS(
    'http://www.w3.org/2000/svg', 'svg',
  ) as unknown as SVGSVGElement;
  const parentGroup = document.createElementNS(
    'http://www.w3.org/2000/svg', 'g',
  ) as SVGGElement;
  svgEl.appendChild(parentGroup);

  renderRack(rack, parentGroup, stateOverride);
  devices
    .filter(d => d.rackId === rack.id)
    .forEach(d => {
      parentGroup.appendChild(renderDevice(d, rack.x, rack.y, rack.units, stateOverride));
    });

  const W = RACK_CONSTANTS.RACK_OUTER_WIDTH;
  const H =
    RACK_CONSTANTS.RACK_PADDING_TOP +
    rack.units * RACK_CONSTANTS.RU_HEIGHT +
    RACK_CONSTANTS.RACK_PADDING_BOTTOM;
  svgEl.setAttribute('viewBox', `${rack.x} ${rack.y} ${W} ${H}`);
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(svgEl);
}

function buildDeviceInventoryTable(rack: RackData, devices: DeviceData[]): string {
  const rackDevices = devices
    .filter(d => d.rackId === rack.id)
    .sort((a, b) => b.startUnit - a.startUnit);

  if (rackDevices.length === 0) {
    return '<p class="rpt-empty">No devices in this rack.</p>';
  }

  const rows = rackDevices.map(d => {
    const tpl = getTemplate(d.templateId);
    const heightU = tpl ? tpl.heightUnits : 1;
    const ruLabel = heightU > 1
      ? `U${d.startUnit}–U${d.startUnit + heightU - 1}`
      : `U${d.startUnit}`;
    return `<tr>
      <td>${ruLabel}</td>
      <td>${d.name}</td>
      <td>${d.hostname || '—'}</td>
      <td>${d.managementIp || '—'}</td>
      <td>${d.serialNumber || '—'}</td>
      <td>${d.description || '—'}</td>
    </tr>`;
  }).join('');

  return `<table class="device-inventory">
    <thead>
      <tr><th>RU</th><th>Device</th><th>Hostname</th><th>IP</th><th>Serial</th><th>Description</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildPortMappingTable(
  rack: RackData,
  devices: DeviceData[],
  state: AppState,
): string {
  const rackDeviceIds = new Set(
    devices.filter(d => d.rackId === rack.id).map(d => d.id),
  );

  const portToDevice: Record<string, DeviceData> = {};
  devices.forEach(d => d.ports.forEach(p => { portToDevice[p.id] = d; }));

  const portNameById: Record<string, string> = {};
  devices.forEach(d => d.ports.forEach(p => { portNameById[p.id] = p.name; }));

  const cables = state.cables.filter(c =>
    c.destPortId !== null &&
    rackDeviceIds.has(portToDevice[c.sourcePortId]?.id),
  );

  if (cables.length === 0) {
    return '<p class="rpt-empty">No cables connected to devices in this rack.</p>';
  }

  const sorted = [...cables].sort((a, b) => {
    const aU = portToDevice[a.sourcePortId]?.startUnit ?? 0;
    const bU = portToDevice[b.sourcePortId]?.startUnit ?? 0;
    return bU - aU;
  });

  const rows = sorted.map(c => {
    const fromDev = portToDevice[c.sourcePortId];
    const toDev   = portToDevice[c.destPortId!];
    const color = CABLE_COLORS[c.type as CableType] ?? '#888888';
    return `<tr>
      <td>${fromDev?.name ?? '?'}</td>
      <td>${portNameById[c.sourcePortId] ?? '?'}</td>
      <td>${toDev?.name ?? '?'}</td>
      <td>${portNameById[c.destPortId!] ?? '?'}</td>
      <td>${c.type}</td>
      <td><span class="rpt-swatch" style="background:${color}"></span>${c.type}</td>
    </tr>`;
  }).join('');

  return `<table class="port-mapping">
    <thead>
      <tr><th>From Device</th><th>From Port</th><th>To Device</th><th>To Port</th><th>Type</th><th>Color</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildCableLegend(state: AppState): string {
  const counts: Record<string, number> = {};
  state.cables.forEach(c => {
    counts[c.type] = (counts[c.type] ?? 0) + 1;
  });

  if (Object.keys(counts).length === 0) {
    return '<p class="rpt-empty">No cables in design.</p>';
  }

  const items = Object.entries(counts).map(([type, count]) => {
    const color = CABLE_COLORS[type as CableType] ?? '#888888';
    return `<div class="rpt-legend-item">
      <span class="rpt-swatch" style="background:${color}"></span>
      <span class="rpt-legend-label">${type}</span>
      <span class="rpt-legend-count">${count} cable${count !== 1 ? 's' : ''}</span>
    </div>`;
  }).join('');

  return `<div class="rpt-legend-grid">${items}</div>`;
}

function buildPowerSummaryTable(state: AppState): string {
  if (state.racks.length === 0) {
    return '<p class="rpt-empty">No racks in design.</p>';
  }

  const rows = state.racks.map(rack => {
    const pduCount = (rack.showPduLeft ? 1 : 0) + (rack.showPduRight ? 1 : 0);
    const capacityW = pduCount * PDU_WATTS;
    const rackDevices = state.devices.filter(d => d.rackId === rack.id);
    const usedRUs = rackDevices.reduce((sum, d) => {
      const tpl = getTemplate(d.templateId);
      return sum + (tpl?.heightUnits ?? 1);
    }, 0);
    const usedW  = rackDevices.reduce((sum, d) => sum + parseWatts(d.description), 0);
    const totalKg = rackDevices.reduce((sum, d) => sum + parseKg(d.description), 0);
    const pct = capacityW > 0 ? Math.round((usedW / capacityW) * 100) : 0;
    const statusColor = pct >= 95 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
    const statusLabel = pct >= 95 ? 'Critical' : pct >= 80 ? 'Warning' : 'OK';

    return `<tr>
      <td>${rack.name}</td>
      <td>${pduCount}</td>
      <td>${capacityW > 0 ? `${capacityW} W` : '—'}</td>
      <td>${usedW > 0 ? `${usedW} W` : '—'}</td>
      <td>${capacityW > 0 ? `${pct}%` : '—'}</td>
      <td>${capacityW > 0 ? `<span class="rpt-badge" style="background:${statusColor}">${statusLabel}</span>` : '—'}</td>
      <td>${usedRUs} / ${rack.units} RU</td>
      <td>${totalKg > 0 ? `${totalKg} kg` : '—'}</td>
    </tr>`;
  }).join('');

  return `<table class="power-summary">
    <thead>
      <tr><th>Rack</th><th>PDUs</th><th>Capacity</th><th>Used</th><th>%</th><th>Status</th><th>RU Usage</th><th>Est. Weight</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildRackSection(rack: RackData, state: AppState): string {
  const frontSvg = captureRackSvg(rack, state.devices, state, 'front');
  const rearSvg  = captureRackSvg(rack, state.devices, state, 'rear');

  return `<section class="rack-section">
    <h2>Rack: ${rack.name}</h2>
    <p class="rpt-rack-meta">${rack.units}U cabinet — ${state.devices.filter(d => d.rackId === rack.id).length} devices</p>
    <div class="rack-views">
      <div class="rack-view"><h3>Front View</h3>${frontSvg}</div>
      <div class="rack-view"><h3>Rear View</h3>${rearSvg}</div>
    </div>
    <h3>Device Inventory</h3>
    ${buildDeviceInventoryTable(rack, state.devices)}
    <h3>Port Mapping</h3>
    ${buildPortMappingTable(rack, state.devices, state)}
  </section>`;
}

const REPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
  header { border-bottom: 1px solid #30363d; margin-bottom: 32px; padding-bottom: 16px; }
  header h1 { margin: 0; font-size: 22px; color: #58a6ff; }
  .rpt-meta { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 8px; font-size: 12px; color: #8b949e; }
  h2 { font-size: 17px; color: #e6edf3; border-bottom: 1px solid #21262d; padding-bottom: 6px; margin-top: 32px; }
  h3 { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  thead { background: #161b22; }
  th { padding: 8px 10px; text-align: left; color: #8b949e; font-weight: 600; border-bottom: 1px solid #30363d; }
  tbody tr:nth-child(even) { background: #161618; }
  tbody tr:nth-child(odd)  { background: #1b1b22; }
  td { padding: 7px 10px; border-bottom: 1px solid #21262d; vertical-align: top; }
  .rack-section { margin-bottom: 48px; }
  .rpt-rack-meta { font-size: 12px; color: #8b949e; margin: 4px 0 12px; }
  .rack-views { display: flex; gap: 16px; margin: 16px 0; }
  .rack-view { flex: 1; min-width: 0; }
  .rack-view svg { max-width: 100%; height: auto; }
  .rpt-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  .rpt-legend-grid { display: flex; flex-wrap: wrap; gap: 16px; margin: 8px 0; }
  .rpt-legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .rpt-legend-count { color: #8b949e; }
  .rpt-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: #fff; }
  .design-notes pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; color: #c9d1d9; margin: 8px 0; }
  .rpt-empty { color: #8b949e; font-style: italic; font-size: 12px; }
  footer { margin-top: 48px; border-top: 1px solid #30363d; padding-top: 16px; font-size: 11px; color: #8b949e; display: flex; justify-content: space-between; }
  @media print {
    body { background: #fff; color: #000; padding: 0; }
    header h1 { color: #1a56db; }
    table { color: #000; }
    thead { background: #f3f4f6; }
    th { color: #374151; border-bottom-color: #d1d5db; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr:nth-child(odd)  { background: #fff; }
    td { border-bottom-color: #e5e7eb; }
    .rack-section { page-break-before: always; }
    .rack-section:first-child { page-break-before: avoid; }
    .port-mapping, .device-inventory { page-break-inside: avoid; }
    footer { color: #6b7280; }
    @page { size: A4 landscape; margin: 15mm; }
  }
`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildReport(state: AppState, meta: ReportMetadata): string {
  const rackSections = state.racks.map(r => buildRackSection(r, state)).join('\n');
  const safeTitle = esc(meta.title || 'Rack Slicer Design Report');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${safeTitle}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<header>
  <h1>${safeTitle}</h1>
  <div class="rpt-meta">
    <span><strong>Author:</strong> ${esc(meta.author) || '—'}</span>
    <span><strong>Revision:</strong> ${esc(meta.revision) || '—'}</span>
    <span><strong>Generated:</strong> ${meta.generatedAt}</span>
    <span><strong>Racks:</strong> ${state.racks.length}</span>
    <span><strong>Devices:</strong> ${state.devices.length}</span>
    <span><strong>Cables:</strong> ${state.cables.length}</span>
  </div>
</header>

${rackSections}

<section class="cable-legend">
  <h2>Cable Legend</h2>
  ${buildCableLegend(state)}
</section>

<section class="power-summary">
  <h2>Power Summary</h2>
  ${buildPowerSummaryTable(state)}
</section>

<section class="design-notes">
  <h2>Design Notes</h2>
  ${meta.notes
    ? `<pre>${esc(meta.notes)}</pre>`
    : '<p class="rpt-empty">— No design notes provided —</p>'
  }
</section>

<footer>
  <span>Generated by Rack Slicer</span>
  <span>${meta.generatedAt}</span>
</footer>
</body>
</html>`;
}
