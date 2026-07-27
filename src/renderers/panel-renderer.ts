import { DeviceCategory, DeviceTemplate } from '../core/types';

// ─── Port geometry constants ─────────────────────────────────────────────────
const PORT_W = 18;
const PORT_H = 15;
const PORT_PITCH = 21;
const SFP_W = 36;
const SFP_PITCH = 40;
const LED_H = 2.5;
const LED_GAP = 2;
const STATUS_END = 48;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function g(cls = ''): SVGGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (cls) group.setAttribute('class', cls);
  return group;
}

function makeChassisGradient(id: string, parent: SVGDefsElement): void {
  const grad = el('linearGradient', { id, x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
  [
    { offset: '0%',   color: '#3a3a3f' },
    { offset: '30%',  color: '#2a2a2f' },
    { offset: '70%',  color: '#22222a' },
    { offset: '100%', color: '#1a1a1e' },
  ].forEach(({ offset, color }) => {
    const stop = el('stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  });
  parent.appendChild(grad);
}

function drawRJ45(parent: SVGGElement, ax: number, portTopY: number, label: string, ledOn: boolean): void {
  const ledY = portTopY - LED_GAP - LED_H;
  parent.appendChild(el('rect', { x: ax + 1, y: ledY, width: PORT_W - 2, height: LED_H, rx: 1, fill: ledOn ? '#00e676' : '#1a2a1a' }));
  parent.appendChild(el('rect', { x: ax, y: portTopY, width: PORT_W, height: PORT_H, rx: 1.5, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: portTopY + 2, width: PORT_W - 4, height: PORT_H - 4, rx: 1, fill: '#050508' }));
  for (let c = 0; c < 3; c++) {
    parent.appendChild(el('rect', { x: ax + 4 + c * 3.5, y: portTopY + PORT_H - 5, width: 2.5, height: 3, fill: '#c0c0a0', rx: 0.5 }));
  }
  const txt = el('text', { x: ax + PORT_W / 2, y: portTopY + PORT_H + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawSFPCage(parent: SVGGElement, ax: number, chY: number, chH: number, label: string, hasModule: boolean): void {
  const cageH = chH - 8;
  const cageY = chY + 4;
  parent.appendChild(el('rect', { x: ax, y: cageY, width: SFP_W, height: cageH, rx: 2, fill: '#0d0d12', stroke: '#444', 'stroke-width': 0.8 }));
  if (hasModule) {
    parent.appendChild(el('rect', { x: ax + 2, y: cageY + 2, width: SFP_W - 4, height: cageH - 4, rx: 1, fill: '#1a2030' }));
    parent.appendChild(el('rect', { x: ax + 4, y: cageY + cageH - 6, width: SFP_W - 8, height: 4, rx: 1, fill: '#00e5ff', opacity: 0.6 }));
  }
  const txt = el('text', { x: ax + SFP_W / 2, y: chY + chH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawQSFPCage(parent: SVGGElement, ax: number, chY: number, chH: number, label: string): void {
  const w = 44;
  const cageH = chH - 8;
  const cageY = chY + 4;
  parent.appendChild(el('rect', { x: ax, y: cageY, width: w, height: cageH, rx: 2, fill: '#0d0d12', stroke: '#555', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: cageY + 2, width: w - 4, height: cageH - 4, rx: 1, fill: '#1a2030' }));
  parent.appendChild(el('rect', { x: ax + 4, y: cageY + cageH - 6, width: w - 8, height: 4, rx: 1, fill: '#00e5ff', opacity: 0.8 }));
  const txt = el('text', { x: ax + w / 2, y: chY + chH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawStatusBlock(parent: SVGGElement, chY: number, chH: number): void {
  const midY = chY + chH / 2;
  parent.appendChild(el('circle', { cx: 12, cy: midY - 10, r: 3, fill: '#00e676', filter: 'drop-shadow(0 0 2px #00e676)' }));
  parent.appendChild(el('circle', { cx: 12, cy: midY, r: 3, fill: '#fb8c00', opacity: 0.9 }));
  parent.appendChild(el('rect', { x: 7, y: midY + 6, width: 10, height: 6, rx: 1, fill: '#222', stroke: '#555', 'stroke-width': 0.5 }));
  parent.appendChild(el('rect', { x: 26, y: midY - 5, width: 12, height: 10, rx: 1, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.7 }));
  parent.appendChild(el('line', { x1: STATUS_END, y1: chY + 2, x2: STATUS_END, y2: chY + chH - 2, stroke: '#333', 'stroke-width': 0.8 }));
}

function drawDriveBay(parent: SVGGElement, ax: number, ay: number, w: number, h: number, active: boolean, label: string): void {
  parent.appendChild(el('rect', { x: ax, y: ay, width: w, height: h, rx: 1.5, fill: '#0d0d12', stroke: '#333', 'stroke-width': 0.7 }));
  parent.appendChild(el('rect', { x: ax + 2, y: ay + 2, width: w - 4, height: h - 4, rx: 1, fill: '#151518' }));
  parent.appendChild(el('circle', { cx: ax + w - 4, cy: ay + 4, r: 1.5, fill: active ? '#00e676' : '#1a1a1a' }));
  const txt = el('text', { x: ax + w / 2, y: ay + h - 2, 'text-anchor': 'middle', 'font-size': '5', fill: '#555', 'font-family': 'monospace' });
  txt.textContent = label;
  parent.appendChild(txt);
}

function drawLcdPanel(parent: SVGGElement, ax: number, ay: number, w: number, h: number, text: string): void {
  parent.appendChild(el('rect', { x: ax, y: ay, width: w, height: h, rx: 2, fill: '#050910', stroke: '#30363d', 'stroke-width': 0.8 }));
  parent.appendChild(el('rect', { x: ax + 2, y: ay + 2, width: w - 4, height: h - 4, rx: 1, fill: '#0a1520', opacity: 0.9 }));
  const txt = el('text', { x: ax + w / 2, y: ay + h / 2 + 3, 'text-anchor': 'middle', 'font-size': '7', fill: '#00e5ff', 'font-family': 'monospace', opacity: 0.8 });
  txt.textContent = text;
  parent.appendChild(txt);
}

function drawVentSlots(parent: SVGGElement, startX: number, chY: number, chH: number): void {
  const count = Math.floor((350 - startX - 10) / 4);
  for (let i = 0; i < count; i++) {
    parent.appendChild(el('rect', { x: startX + i * 4, y: chY + 4, width: 2, height: chH - 8, rx: 0.5, fill: '#111114' }));
  }
}

// Restored from the original "amazing" design (commit 71b41e5).
// Draws one RJ45 socket: LED strip above, outer socket rect (with stroke), inner darker rect, gold pins, number above LED.
// All elements placed within [sockTopY - ledH - numH, sockTopY + sockH].
function renderSwitchRJ45(
  parent: SVGGElement,
  cx: number, sockTopY: number, pW: number, sockH: number,
  ledH: number, label: string, ledOn: boolean,
): void {
  const ax = cx - pW / 2;
  // LED strip sits immediately above socket
  parent.appendChild(el('rect', { x: ax + 1, y: sockTopY - ledH, width: pW - 2, height: ledH, rx: 0.5, fill: ledOn ? '#00e676' : '#152015' }));
  // Outer socket rect — dark, no border
  parent.appendChild(el('rect', { x: ax, y: sockTopY, width: pW, height: sockH, rx: 1.5, fill: '#0a0a0f' }));
  // Inner darker recess
  parent.appendChild(el('rect', { x: ax + 1, y: sockTopY + 1, width: pW - 2, height: sockH - 2, rx: 1, fill: '#050508' }));
  // Gold contact pins at bottom of socket
  const pinCount = pW > 7 ? 4 : 3;
  const pinStep  = (pW - 3) / (pinCount + 1);
  for (let c = 0; c < pinCount; c++) {
    parent.appendChild(el('rect', { x: ax + 1.5 + c * pinStep, y: sockTopY + sockH - 3.5, width: 1.5, height: 2.5, fill: '#c0b870', rx: 0.3 }));
  }
  // Port number above LED
  const numTxt = el('text', { x: cx, y: sockTopY - ledH - 0.5, 'text-anchor': 'middle', 'font-size': pW > 7 ? '4.5' : '3.5', fill: '#888', 'font-family': 'monospace' });
  numTxt.textContent = label;
  parent.appendChild(numTxt);
}

function renderSwitchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('switch-panel');
  const defs = el('defs');
  const gradId = `sw-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;   // 26px for 1U

  // Chassis body
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  group.appendChild(el('rect', { x: 1, y: chY + 1, width: W - 2, height: 1.5, rx: 0.5, fill: 'rgba(255,255,255,0.07)', 'pointer-events': 'none' }));

  drawStatusBlock(group, chY, chH);

  const ports     = template?.ports ?? [];
  const rj45Ports = ports.filter(p => p.type === 'rj45');
  const sfpPorts  = ports.filter(p => p.type === 'sfp-plus' || p.type === 'sfp' || p.type === 'sfp28');
  const qsfpPorts = ports.filter(p => p.type === 'qsfp28' || p.type === 'qsfp');

  const ySet   = new Set(rj45Ports.map(p => Math.round(p.relativeY)));
  const isDual = ySet.size > 1;

  const pitch = rj45Ports.length > 1
    ? Math.abs(rj45Ports[1]?.relativeX - rj45Ports[0]?.relativeX) || 10
    : 10;

  const pW    = Math.max(6, pitch - 2);
  const ledH  = 2;
  const numH  = 5;   // height consumed by number text + gap above LED
  // Total overhead per socket row = numH + ledH
  const overhead = numH + ledH;

  if (isDual) {
    const yVals    = [...ySet].sort((a, b) => a - b);
    const topPorts = rj45Ports.filter(p => Math.round(p.relativeY) === yVals[0]);
    const botPorts = rj45Ports.filter(p => Math.round(p.relativeY) === yVals[1]);

    // Each row gets half the chassis height minus overhead; sockets stacked top and bottom
    const rowSockH = Math.floor((chH - overhead - 2) / 2);  // ~9px per row for 1U
    const topSockY = chY + overhead;
    const botSockY = topSockY + rowSockH + 2;

    topPorts.forEach((p, i) => {
      const num = parseInt(p.name.replace(/\D/g, ''), 10) || (i * 2 + 1);
      renderSwitchRJ45(group, p.relativeX, topSockY, pW, rowSockH, ledH, String(num), (i % 4) < 2);
    });
    botPorts.forEach((p, i) => {
      const num = parseInt(p.name.replace(/\D/g, ''), 10) || (i * 2 + 2);
      // Bottom row: LED + socket only (number would overlap top row labels)
      const ax = p.relativeX - pW / 2;
      group.appendChild(el('rect', { x: ax + 1, y: botSockY - ledH, width: pW - 2, height: ledH, rx: 0.5, fill: (i % 4) < 2 ? '#00e676' : '#152015' }));
      group.appendChild(el('rect', { x: ax, y: botSockY, width: pW, height: rowSockH, rx: 1.5, fill: '#0a0a0f' }));
      group.appendChild(el('rect', { x: ax + 1, y: botSockY + 1, width: pW - 2, height: rowSockH - 2, rx: 1, fill: '#050508' }));
      const pinCount = pW > 7 ? 4 : 3;
      const pinStep  = (pW - 3) / (pinCount + 1);
      for (let c = 0; c < pinCount; c++) {
        group.appendChild(el('rect', { x: ax + 1.5 + c * pinStep, y: botSockY + rowSockH - 3.5, width: 1.5, height: 2.5, fill: '#c0b870', rx: 0.3 }));
      }
      group.appendChild(el('text', { x: p.relativeX, y: botSockY - ledH - 0.5, 'text-anchor': 'middle', 'font-size': '3.5', fill: '#666', 'font-family': 'monospace' })).textContent = String(num);
    });

    // Group dividers every 8 columns
    const allX = topPorts.map(p => p.relativeX);
    [8, 16, 24].forEach(idx => {
      if (idx < allX.length) {
        const sepX = (allX[idx - 1] + allX[idx]) / 2;
        group.appendChild(el('line', { x1: sepX, y1: chY + 2, x2: sepX, y2: chY + chH - 2, stroke: '#333', 'stroke-width': 0.6, 'stroke-dasharray': '2,2' }));
      }
    });

  } else {
    // Single row: number → LED → socket, all within chassis
    const sockH  = chH - overhead - 2;  // ~19px for 1U
    const sockY  = chY + overhead;

    rj45Ports.forEach((p, i) => {
      renderSwitchRJ45(group, p.relativeX, sockY, pW, sockH, ledH, String(i + 1), (i % 4) < 2);
    });

    for (let sep = 8; sep < rj45Ports.length; sep += 8) {
      if (rj45Ports[sep - 1] && rj45Ports[sep]) {
        const sepX = (rj45Ports[sep - 1].relativeX + rj45Ports[sep].relativeX) / 2;
        group.appendChild(el('line', { x1: sepX, y1: chY + 2, x2: sepX, y2: chY + chH - 2, stroke: '#333', 'stroke-width': 0.6, 'stroke-dasharray': '2,2' }));
      }
    }
  }

  // SFP+ uplink cages
  sfpPorts.forEach((p, i) => {
    const sfpW = 9;
    const sfpH = chH - overhead - 2;
    const cX   = p.relativeX - sfpW / 2;
    const cY   = chY + overhead;
    group.appendChild(el('text', { x: p.relativeX, y: chY + overhead - ledH - 0.5, 'text-anchor': 'middle', 'font-size': '4', fill: '#558', 'font-family': 'monospace' })).textContent = `SFP${i + 1}`;
    group.appendChild(el('rect', { x: cX, y: cY - ledH, width: sfpW, height: ledH, rx: 0.5, fill: '#00e5ff', opacity: 0.3 }));
    group.appendChild(el('rect', { x: cX, y: cY, width: sfpW, height: sfpH, rx: 1.5, fill: '#08080c' }));
    group.appendChild(el('rect', { x: cX + 1.5, y: cY + sfpH - 4, width: sfpW - 3, height: 3, rx: 0.5, fill: '#00e5ff', opacity: 0.55 }));
  });

  // QSFP28 cages
  qsfpPorts.forEach((p, i) => {
    const qW  = 14;
    const qH  = chH - overhead - 2;
    const cX  = p.relativeX - qW / 2;
    const cY  = chY + overhead;
    group.appendChild(el('text', { x: p.relativeX, y: chY + overhead - ledH - 0.5, 'text-anchor': 'middle', 'font-size': '4', fill: '#558', 'font-family': 'monospace' })).textContent = `Q${i + 1}`;
    group.appendChild(el('rect', { x: cX, y: cY, width: qW, height: qH, rx: 2, fill: '#08080c' }));
    group.appendChild(el('rect', { x: cX + 2, y: cY + qH - 4, width: qW - 4, height: 3, rx: 0.5, fill: '#00e5ff', opacity: 0.7 }));
  });

  // Vent slots right of all ports
  const lastPortX = ports.reduce((mx, p) => Math.max(mx, p.relativeX), STATUS_END + 8);
  const ventStart = lastPortX + 7;
  if (ventStart < W - 20) drawVentSlots(group, ventStart, chY, chH);

  return group;
}

function renderServerPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('server-panel');
  const defs = el('defs');
  const gradId = `sv-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  const honeycombId = `hc-${Math.random().toString(36).slice(2)}`;
  const pat = el('pattern', { id: honeycombId, width: 6, height: 10, patternUnits: 'userSpaceOnUse' });
  const path = el('path', { d: 'M 3 0 L 6 2 L 6 8 L 3 10 L 0 8 L 0 2 Z', fill: 'none', stroke: '#111115', 'stroke-width': 1 });
  pat.appendChild(path);
  defs.appendChild(pat);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1.5, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));

  const bayW = 32, bayH = Math.min(22, chH - 8);
  const bayCount = template?.id.includes('4u') ? 8 : template?.id.includes('hd') ? 6 : 4;
  const bayStartX = 12;
  for (let b = 0; b < bayCount; b++) {
    drawDriveBay(group, bayStartX + b * (bayW + 3), chY + 4, bayW, bayH, b < 2, String(b + 1));
  }

  const grillX = bayStartX + bayCount * (bayW + 3) + 6;
  const grillW = W - grillX - 90;
  if (grillW > 20) {
    group.appendChild(el('rect', { x: grillX, y: chY + 4, width: grillW, height: chH - 8, fill: `url(#${honeycombId})`, opacity: 0.5 }));
  }

  const lcdX = grillX + grillW + 4;
  drawLcdPanel(group, lcdX, chY + 4, 40, Math.min(chH - 8, 16), 'READY');

  group.appendChild(el('circle', { cx: lcdX + 50, cy: chY + chH / 2 - 6, r: 3, fill: '#00e676', filter: 'drop-shadow(0 0 2px #00e676)' }));
  group.appendChild(el('circle', { cx: lcdX + 50, cy: chY + chH / 2 + 4, r: 2, fill: '#fb8c00', opacity: 0.8 }));

  return group;
}

function renderFirewallPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('firewall-panel');
  const defs = el('defs');
  const gradId = `fw-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  drawStatusBlock(group, chY, chH);

  const ports = template?.ports ?? [];
  const sfpPorts = ports.filter(p => p.type === 'sfp-plus');
  const rj45Ports = ports.filter(p => p.type === 'rj45');
  const allDataPorts = [...rj45Ports, ...sfpPorts];

  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  const ZONE_COLORS = ['#e53935', '#fb8c00', '#43a047'] as const;
  allDataPorts.forEach((p, i) => {
    const ax = STATUS_END + 6 + i * PORT_PITCH;
    if (p.type === 'sfp-plus') {
      drawSFPCage(group, ax, chY, chH, `${i + 1}`, true);
    } else {
      drawRJ45(group, ax, portTopY, `${i + 1}`, false);
    }
    const zoneIdx = i === 0 ? 0 : i <= 2 ? 1 : 2;
    const zoneTxt = el('text', { x: ax + PORT_W / 2, y: chY + 5, 'text-anchor': 'middle', 'font-size': '5', fill: ZONE_COLORS[zoneIdx], 'font-family': 'monospace' });
    zoneTxt.textContent = i === 0 ? 'WAN' : i <= 2 ? 'DMZ' : 'LAN';
    group.appendChild(zoneTxt);
  });

  drawVentSlots(group, STATUS_END + 6 + allDataPorts.length * PORT_PITCH + 8, chY, chH);

  return group;
}

function renderRouterPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('router-panel');
  const defs = el('defs');
  const gradId = `rtr-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);

  const chY = 2;
  const chH = H - 4;

  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 50, chH - 8, 'READY');

  const ports = template?.ports ?? [];
  const qsfp = ports.filter(p => p.type === 'qsfp28');
  const sfp = ports.filter(p => p.type === 'sfp-plus');
  let portX = STATUS_END + 64;
  qsfp.forEach((_, i) => { drawQSFPCage(group, portX + i * 52, chY, chH, `Q${i + 1}`); });
  portX += qsfp.length * 52 + (qsfp.length ? 8 : 0);
  sfp.forEach((_, i) => { drawSFPCage(group, portX + i * SFP_PITCH, chY, chH, `SFP${i + 1}`, true); });

  return group;
}

function renderPatchPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('patch-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: '#1a1224', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const isFiber = ports.some(p => p.type === 'sfp' || p.type === 'sfp-plus');
  const portCount = ports.length || 24;
  const pitch = Math.min(14, (W - 20) / portCount);
  const portTopY = chY + Math.round((chH - (isFiber ? 8 : PORT_H)) / 2);

  for (let i = 0; i < portCount; i++) {
    const ax = 10 + i * pitch;
    if (isFiber) {
      group.appendChild(el('circle', { cx: ax + 3, cy: portTopY + 4, r: 3, fill: '#0a0a10', stroke: '#444', 'stroke-width': 0.8 }));
      group.appendChild(el('circle', { cx: ax + 9, cy: portTopY + 4, r: 3, fill: '#0a0a10', stroke: '#444', 'stroke-width': 0.8 }));
    } else {
      drawRJ45(group, ax, portTopY, String(i + 1), false);
    }
  }

  group.appendChild(el('rect', { x: 5, y: chY + chH - 6, width: W - 10, height: 4, rx: 1, fill: '#111', stroke: '#333', 'stroke-width': 0.5 }));

  return group;
}

function renderPduPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('pdu-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1a1e', stroke: '#111', 'stroke-width': 1 }));

  drawLcdPanel(group, 8, chY + 4, 50, chH - 8, '0.0 A');
  group.appendChild(el('circle', { cx: 67, cy: chY + chH / 2, r: 6, fill: '#c62828', stroke: '#111', 'stroke-width': 1 }));

  const ports = template?.ports ?? [];
  const c13Ports = ports.filter(p => p.type === 'power');
  const outletW = 20;
  const outletH = chH - 10;
  const outletY = chY + 5;
  const startX = 85;

  c13Ports.forEach((_, i) => {
    const ax = startX + i * (outletW + 4);
    group.appendChild(el('rect', { x: ax, y: outletY, width: outletW, height: outletH, rx: 2, fill: '#0a0a0f', stroke: '#333', 'stroke-width': 0.7 }));
    const contactY = outletY + outletH - 8;
    [ax + 4, ax + 8.5, ax + 13].forEach(cx => {
      group.appendChild(el('rect', { x: cx, y: contactY, width: 3, height: 4, rx: 0.8, fill: '#050508' }));
    });
    const numTxt = el('text', { x: ax + outletW / 2, y: outletY + outletH + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#666', 'font-family': 'monospace' });
    numTxt.textContent = String(i + 1);
    group.appendChild(numTxt);
  });

  group.appendChild(el('rect', { x: W - 30, y: chY + 4, width: 22, height: chH - 8, rx: 2, fill: '#0a0a0f', stroke: '#555', 'stroke-width': 0.8 }));

  return group;
}

function renderUpsPanel(_template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('ups-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1a1c29', stroke: '#111', 'stroke-width': 1 }));

  drawLcdPanel(group, 10, chY + 4, 120, chH - 8, 'ON BATTERY');

  for (let s = 0; s < 5; s++) {
    const segColor = s < 3 ? '#43a047' : s === 3 ? '#fb8c00' : '#e53935';
    group.appendChild(el('rect', { x: 140 + s * 20, y: chY + chH / 2 - 5, width: 16, height: 10, rx: 1, fill: s < 4 ? segColor : '#111', stroke: '#333', 'stroke-width': 0.5 }));
  }

  ['IN', 'OUT', 'BAT'].forEach((lbl, i) => {
    group.appendChild(el('circle', { cx: 250 + i * 20, cy: chY + chH / 2 - 4, r: 3, fill: i === 0 ? '#00e676' : '#fb8c00' }));
    const t = el('text', { x: 250 + i * 20, y: chY + chH / 2 + 8, 'text-anchor': 'middle', 'font-size': '5', fill: '#666', 'font-family': 'monospace' });
    t.textContent = lbl;
    group.appendChild(t);
  });

  drawVentSlots(group, 320, chY, chH);

  return group;
}

function renderStoragePanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('storage-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#141922', stroke: '#111', 'stroke-width': 1 }));

  const bayCount = template?.id.includes('24bay') || template?.id.includes('aff') ? 24 : template?.id.includes('12bay') ? 12 : 8;
  const cols = bayCount > 12 ? 6 : bayCount > 6 ? 6 : 4;
  const rows = Math.ceil(bayCount / cols);
  const bayW = 38, bayH = Math.min((chH - 8) / rows - 2, 20);
  const bayStartX = 10;

  for (let b = 0; b < bayCount; b++) {
    const bx = bayStartX + (b % cols) * (bayW + 3);
    const by = chY + 4 + Math.floor(b / cols) * (bayH + 3);
    drawDriveBay(group, bx, by, bayW, bayH, b < 4, String(b + 1));
  }

  const portX = bayStartX + cols * (bayW + 3) + 8;
  drawLcdPanel(group, portX, chY + 4, 50, chH - 8, 'ONLINE');

  return group;
}

function renderKvmPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('kvm-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#1e1a1a', stroke: '#111', 'stroke-width': 1 }));

  drawStatusBlock(group, chY, chH);
  drawLcdPanel(group, STATUS_END + 6, chY + 4, 40, chH - 8, 'KVM');

  const ports = template?.ports ?? [];
  const consolePorts = ports.filter(p => p.type === 'console');
  const portTopY = chY + Math.round((chH - (PORT_H + LED_H + LED_GAP)) / 2);

  consolePorts.forEach((_, i) => {
    const ax = STATUS_END + 54 + i * PORT_PITCH;
    group.appendChild(el('rect', { x: ax, y: portTopY, width: 20, height: PORT_H, rx: 1.5, fill: '#0a0a0f', stroke: '#3a3a3f', 'stroke-width': 0.8 }));
    for (let p = 0; p < 9; p++) {
      const row = p < 5 ? 0 : 1;
      const col = p < 5 ? p : p - 5;
      const offset = p >= 5 ? 1.5 : 0;
      group.appendChild(el('circle', { cx: ax + 2 + col * 3.5 + offset, cy: portTopY + 4 + row * 5, r: 0.8, fill: '#c0c0a0' }));
    }
    const numTxt = el('text', { x: ax + 10, y: portTopY + PORT_H + 8, 'text-anchor': 'middle', 'font-size': '6', fill: '#888', 'font-family': 'monospace' });
    numTxt.textContent = String(i + 1);
    group.appendChild(numTxt);
  });

  return group;
}

function renderBlankPanel(W: number, H: number): SVGGElement {
  const group = g('blank-panel');
  const defs = el('defs');
  const gradId = `bp-grad-${Math.random().toString(36).slice(2)}`;
  makeChassisGradient(gradId, defs);
  group.appendChild(defs);
  group.appendChild(el('rect', { x: 0, y: 2, width: W, height: H - 4, rx: 1, fill: `url(#${gradId})`, stroke: '#111', 'stroke-width': 1 }));
  [[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]].forEach(([cx, cy]) => {
    group.appendChild(el('circle', { cx, cy, r: 3, fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
  });
  return group;
}

function renderCoolingPanel(_template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('cooling-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 2, fill: '#141618', stroke: '#111', 'stroke-width': 1 }));

  if (chH <= 32) {
    const slotCount = Math.floor((W - 20) / 8);
    for (let i = 0; i < slotCount; i++) {
      group.appendChild(el('rect', { x: 10 + i * 8, y: chY + 3, width: 6, height: chH - 6, rx: 0.5, fill: '#0a0a0c', stroke: '#222', 'stroke-width': 0.4 }));
    }
  } else {
    const fanCount = 4;
    const fanR = Math.min(chH / 2 - 8, 18);
    for (let f = 0; f < fanCount; f++) {
      const cx = 40 + f * (W - 80) / (fanCount - 1);
      const cy = chY + chH / 2;
      group.appendChild(el('circle', { cx, cy, r: fanR, fill: '#0a0a0c', stroke: '#333', 'stroke-width': 1 }));
      group.appendChild(el('circle', { cx, cy, r: fanR * 0.3, fill: '#1a1a1e' }));
      for (let a = 0; a < 6; a++) {
        const rad = (a * 60 * Math.PI) / 180;
        const line = el('line', {
          x1: cx + Math.cos(rad) * fanR * 0.35, y1: cy + Math.sin(rad) * fanR * 0.35,
          x2: cx + Math.cos(rad) * fanR * 0.95, y2: cy + Math.sin(rad) * fanR * 0.95,
          stroke: '#2a2a2f', 'stroke-width': 2.5, 'stroke-linecap': 'round',
        });
        group.appendChild(line);
      }
    }
  }

  return group;
}

function renderCableManagerPanel(template: DeviceTemplate | null, W: number, H: number): SVGGElement {
  const group = g('cable-mgr-panel');
  const chY = 2;
  const chH = H - 4;
  group.appendChild(el('rect', { x: 0, y: chY, width: W, height: chH, rx: 1, fill: '#151518', stroke: '#111', 'stroke-width': 1 }));

  if (template?.id === 'brush-panel-1u') {
    group.appendChild(el('rect', { x: 20, y: chY + 4, width: W - 40, height: chH - 8, rx: 2, fill: '#050508', stroke: '#30363d', 'stroke-width': 1 }));
    const fiberCount = 50;
    const fiberSpacing = (W - 40) / fiberCount;
    for (let i = 1; i < fiberCount; i++) {
      const fx = 20 + i * fiberSpacing;
      group.appendChild(el('line', { x1: fx, y1: chY + 4, x2: fx, y2: chY + chH - 4, stroke: '#1a1a20', 'stroke-width': 1, opacity: 0.6 }));
    }
  } else if (template?.id === 'd-ring-1u') {
    group.appendChild(el('line', { x1: 15, y1: chY + chH / 2, x2: W - 15, y2: chY + chH / 2, stroke: '#30363d', 'stroke-width': 1.5 }));
    const ringCount = 5;
    const spacing = (W - 80) / (ringCount - 1);
    for (let i = 0; i < ringCount; i++) {
      const rx = 40 + i * spacing;
      const ry = chY + chH / 2;
      const p = el('path', { d: `M ${rx - 10} ${ry - 4} L ${rx + 10} ${ry - 4} C ${rx + 12} ${ry - 4}, ${rx + 12} ${ry + 12}, ${rx + 10} ${ry + 12} L ${rx - 10} ${ry + 12} C ${rx - 12} ${ry + 12}, ${rx - 12} ${ry - 4}, ${rx - 10} ${ry - 4} Z`, fill: 'none', stroke: '#8b949e', 'stroke-width': 2 });
      group.appendChild(p);
    }
  } else {
    const slitCount = 10;
    const slitSpacing = (W - 40) / slitCount;
    for (let i = 0; i < slitCount; i++) {
      const sx = 20 + i * slitSpacing;
      group.appendChild(el('rect', { x: sx + 3, y: chY + 6, width: slitSpacing - 6, height: chH - 12, rx: 2, fill: '#050508', stroke: '#21262d', 'stroke-width': 0.8 }));
    }
  }

  return group;
}

export function renderFrontPanel(
  category: DeviceCategory,
  template: DeviceTemplate | null,
  deviceWidth: number,
  deviceHeight: number,
): SVGGElement {
  switch (category) {
    case 'switch':        return renderSwitchPanel(template, deviceWidth, deviceHeight);
    case 'server':        return renderServerPanel(template, deviceWidth, deviceHeight);
    case 'firewall':      return renderFirewallPanel(template, deviceWidth, deviceHeight);
    case 'router':        return renderRouterPanel(template, deviceWidth, deviceHeight);
    case 'patch-panel':   return renderPatchPanel(template, deviceWidth, deviceHeight);
    case 'pdu':           return renderPduPanel(template, deviceWidth, deviceHeight);
    case 'ups':           return renderUpsPanel(template, deviceWidth, deviceHeight);
    case 'storage':       return renderStoragePanel(template, deviceWidth, deviceHeight);
    case 'console':       return renderKvmPanel(template, deviceWidth, deviceHeight);
    case 'blank-panel':   return renderBlankPanel(deviceWidth, deviceHeight);
    case 'cooling':       return renderCoolingPanel(template, deviceWidth, deviceHeight);
    case 'cable-manager': return renderCableManagerPanel(template, deviceWidth, deviceHeight);
    default: {
      const fallback = g('fallback-panel');
      fallback.appendChild(el('rect', { x: 0, y: 2, width: deviceWidth, height: deviceHeight - 4, rx: 1, fill: '#1b1b22', stroke: '#111', 'stroke-width': 1 }));
      return fallback;
    }
  }
}
