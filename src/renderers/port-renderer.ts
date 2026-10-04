import { PortData, DeviceData } from '../core/types';
import { createGroup, createRect, createText, setAttributes } from '../utils/svg-helpers';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';

export function renderPorts(ports: PortData[], deviceGroup: SVGGElement): void {
  if (!ports || !Array.isArray(ports)) return;
  const state = stateManager.getState();
  const isRearView = state.cabinetViewMode === 'rear';

  ports.forEach((port, portIndex) => {
    const device = stateManager.getDevice(port.deviceId);
    const template = device ? getTemplate(device.templateId) : null;
    const category = template?.category || 'server';

    let shouldRender = true;
    const isEarPort = port.id.includes('-ear-');

    if (isEarPort) {
      shouldRender = !isRearView;
    } else if (category === 'server' || category === 'storage' || category === 'ups' || category === 'pdu' || category === 'ats') {
      shouldRender = isRearView;
    } else if (category === 'switch' || category === 'patch-panel' || category === 'router' || category === 'firewall' || category === 'console' || category === 'nac') {
      if (port.type === 'power') {
        shouldRender = isRearView;
      } else {
        shouldRender = !isRearView;
      }
    }

    if (shouldRender) {
      deviceGroup.appendChild(renderPort(port, deviceGroup, portIndex, device ?? undefined));
    }
  });
}

export function renderPort(port: PortData, deviceGroup: SVGGElement, portIndex?: number, device?: DeviceData): SVGGElement {
  const portGroup = createGroup('port-' + port.id, 'port-element');
  setAttributes(portGroup, {
    transform: `translate(${port.relativeX}, ${port.relativeY})`,
    'data-port-id': port.id,
    'data-port-type': port.type,
    ...(device ? { 'data-device-id': device.id } : {}),
  });

  const isConnected = port.connected;
  let color = isConnected ? '#2e7d32' : '#3a3a3e';

  // Switch/router/firewall/console/patch-panel ports: the panel renderer already draws
  // full port graphics for these categories; overlays must be transparent hit-targets only.
  // That's only true when the coded panel renderer actually ran — a device showing a custom
  // uploaded front-panel image instead (device-renderer.ts's hasCustomImage branch) skips the
  // panel renderer entirely, so any port on it (e.g. one placed with the Airdrop Port tool)
  // needs a REAL visible jack drawn here, not just an invisible hit-target over nothing.
  const _dev = stateManager.getDevice(port.deviceId);
  const _tpl = _dev ? getTemplate(_dev.templateId) : null;
  const _cat = _tpl?.category;
  const _hasCustomImage = !!(_dev?.frontPanelImage || _tpl?.frontPanelImage);
  const hasCustomPanel = !_hasCustomImage && (_cat === 'switch' || _cat === 'router' || _cat === 'firewall' || _cat === 'console' || _cat === 'patch-panel' || _cat === 'nac' || _cat === 'ats');

  let w = 12;
  let h = 10;
  let label = '';

  if (port.type === 'sfp' || port.type === 'sfp-plus' || port.type === 'sfp28') {
    w = 10; h = 8;
  } else if (port.type === 'qsfp' || port.type === 'qsfp28') {
    w = 16; h = 10;
  } else if (port.type === 'management') {
    color = isConnected ? '#1565c0' : '#1e3a5f';
  } else if (port.type === 'console') {
    color = isConnected ? '#00838f' : '#004d40';
    label = 'CON';
  }

  // Explicit per-port size override — lets a port calibrated to match a real hardware photo
  // (e.g. a manually-added "Custom Layout" port) be sized tighter than the type-based default
  // above, the same way the hasCustomPanel branch below already respects port.portW/portH.
  if (port.portW !== undefined) w = port.portW;
  if (port.portH !== undefined) h = port.portH;

  const isEarPort = port.id.includes('-ear-');
  if (isEarPort) {
    const isPower  = port.type === 'power';
    const isMgmt   = port.type === 'management';
    const isHybrid = port.type === 'hybrid';

    // Power/mgmt holes are slightly larger so their distinct shapes read clearly at small scale
    const radius      = (isPower || isMgmt) ? 2.2 : 1.8;
    const bezelRadius = radius + 1.0;

    const fill = isConnected
      ? (isPower ? '#e53935' : isMgmt ? '#f59e0b' : isHybrid ? '#c837ff' : '#00e676')
      : '#0d0d10';
    const strokeColor = isConnected
      ? (isPower ? '#ff5252' : isMgmt ? '#fbbf24' : isHybrid ? '#e0a3ff' : '#00e676')
      : (isMgmt ? '#6b4c00' : isHybrid ? '#7b4a94' : '#3a3a42');

    // Invisible hit target — the only interactive element; others are pointer-events:none
    const hitTarget = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hitTarget.setAttribute('cx', '0');
    hitTarget.setAttribute('cy', '0');
    hitTarget.setAttribute('r', '3.5');
    hitTarget.setAttribute('fill', 'transparent');
    hitTarget.setAttribute('class', 'port-hover-target');
    portGroup.appendChild(hitTarget);

    // Points string for an equilateral triangle (▲) centered at origin, tip up
    const triPts = (r: number): string => {
      const h = r * 0.866; // sin(60°)
      return `0,${-r} ${-h},${r * 0.5} ${h},${r * 0.5}`;
    };

    // ── Outer metallic bezel ──────────────────────────────────────────────
    // Power → sharp square | Management → triangle | Hybrid → rounded square | Data → circle
    if (isPower) {
      const bezel = createRect(-bezelRadius, -bezelRadius, bezelRadius * 2, bezelRadius * 2, {
        fill: '#1a1a1e', stroke: '#555560', 'stroke-width': 0.5,
      });
      bezel.setAttribute('pointer-events', 'none');
      portGroup.appendChild(bezel);
    } else if (isMgmt) {
      const bezel = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      bezel.setAttribute('points', triPts(bezelRadius));
      bezel.setAttribute('fill', '#1a1a1e');
      bezel.setAttribute('stroke', '#555560');
      bezel.setAttribute('stroke-width', '0.5');
      bezel.setAttribute('pointer-events', 'none');
      portGroup.appendChild(bezel);
    } else if (isHybrid) {
      const bezel = createRect(-bezelRadius, -bezelRadius, bezelRadius * 2, bezelRadius * 2, {
        fill: '#1a1a1e', stroke: '#555560', 'stroke-width': 0.5, rx: bezelRadius * 0.4,
      });
      bezel.setAttribute('pointer-events', 'none');
      portGroup.appendChild(bezel);
    } else {
      const bezel = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bezel.setAttribute('cx', '0');
      bezel.setAttribute('cy', '0');
      bezel.setAttribute('r', bezelRadius.toString());
      bezel.setAttribute('fill', '#1a1a1e');
      bezel.setAttribute('stroke', '#555560');
      bezel.setAttribute('stroke-width', '0.5');
      bezel.setAttribute('pointer-events', 'none');
      portGroup.appendChild(bezel);
    }

    // ── Inner socket hole ─────────────────────────────────────────────────
    if (isPower) {
      const hole = createRect(-radius, -radius, radius * 2, radius * 2, {
        fill, stroke: strokeColor, 'stroke-width': 0.6,
      });
      hole.setAttribute('class', 'ear-port-hole power-port');
      hole.setAttribute('pointer-events', 'none');
      portGroup.appendChild(hole);
    } else if (isMgmt) {
      const hole = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hole.setAttribute('points', triPts(radius));
      hole.setAttribute('fill', fill);
      hole.setAttribute('stroke', strokeColor);
      hole.setAttribute('stroke-width', '0.6');
      hole.setAttribute('class', 'ear-port-hole mgmt-port');
      hole.setAttribute('pointer-events', 'none');
      portGroup.appendChild(hole);
    } else if (isHybrid) {
      const hole = createRect(-radius, -radius, radius * 2, radius * 2, {
        fill, stroke: strokeColor, 'stroke-width': 0.6, rx: radius * 0.4,
      });
      hole.setAttribute('class', 'ear-port-hole hybrid-port');
      hole.setAttribute('pointer-events', 'none');
      portGroup.appendChild(hole);
    } else {
      const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hole.setAttribute('cx', '0');
      hole.setAttribute('cy', '0');
      hole.setAttribute('r', radius.toString());
      hole.setAttribute('fill', fill);
      hole.setAttribute('stroke', strokeColor);
      hole.setAttribute('stroke-width', '0.6');
      hole.setAttribute('class', 'ear-port-hole network-port');
      hole.setAttribute('pointer-events', 'none');
      portGroup.appendChild(hole);
    }

    // Center pin dot
    const pin = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pin.setAttribute('cx', '0');
    pin.setAttribute('cy', '0');
    pin.setAttribute('r', '0.6');
    pin.setAttribute('fill', isConnected ? '#ffffff' : isMgmt ? '#fbbf24' : isHybrid ? '#d8a3ff' : '#ffb74d');
    pin.setAttribute('pointer-events', 'none');
    portGroup.appendChild(pin);

    // ── Neon glow overlay (shown when port is hovered during cable drag) ─
    // Shape matches the hole: rect for power, polygon for mgmt, circle for others
    if (isPower) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      g.setAttribute('x', String(-bezelRadius)); g.setAttribute('y', String(-bezelRadius));
      g.setAttribute('width', String(bezelRadius * 2)); g.setAttribute('height', String(bezelRadius * 2));
      g.setAttribute('fill', 'none'); g.setAttribute('stroke', '#ff1744');
      g.setAttribute('stroke-width', '1'); g.setAttribute('opacity', '0');
      g.setAttribute('class', 'port-neon-ring'); g.setAttribute('pointer-events', 'none');
      portGroup.appendChild(g);
    } else if (isMgmt) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      g.setAttribute('points', triPts(bezelRadius));
      g.setAttribute('fill', 'none'); g.setAttribute('stroke', '#f59e0b');
      g.setAttribute('stroke-width', '1'); g.setAttribute('opacity', '0');
      g.setAttribute('class', 'port-neon-ring'); g.setAttribute('pointer-events', 'none');
      portGroup.appendChild(g);
    } else {
      const glowRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glowRing.setAttribute('cx', '0'); glowRing.setAttribute('cy', '0');
      glowRing.setAttribute('r', bezelRadius.toString());
      glowRing.setAttribute('fill', 'none');
      glowRing.setAttribute('stroke', isHybrid ? '#c837ff' : '#00e5ff');
      glowRing.setAttribute('stroke-width', '1'); glowRing.setAttribute('opacity', '0');
      glowRing.setAttribute('class', 'port-neon-ring'); glowRing.setAttribute('pointer-events', 'none');
      portGroup.appendChild(glowRing);
    }

    // ── Labels (slot/port or type abbreviation) ───────────────────────────
    // e.g. "Left Ear S2-P3" → 'S2' / 'P3'  |  "Right Ear Power" → 'PW' / ''
    //      "Right Ear iDRAC" → 'MG' / 'iDR'  |  "Right Ear iLO" → 'MG' / 'iLO'
    let leftVal = 'PW';
    let rightVal = '';
    if (isMgmt) {
      const typeName = port.name.replace(/^(Left|Right)\s+Ear\s+/i, ''); // 'iDRAC', 'iLO', 'BMC'…
      leftVal  = 'MG';
      rightVal = typeName.slice(0, 3); // 'iDR', 'iLO', 'BMC', 'IMM', 'XCC'
    } else if (!isPower) {
      const nameMatch = port.name.match(/S(\d+)-P(\d+)/);
      if (nameMatch) {
        leftVal  = `S${nameMatch[1]}`;
        rightVal = `P${nameMatch[2]}`;
      }
    }

    const leftText = createText(-bezelRadius - 1.2, 0, leftVal, {
      fill: 'rgba(255, 255, 255, 0.4)',
      'font-size': '3.8',
      'font-family': 'sans-serif',
      'font-weight': 'bold',
      'text-anchor': 'end',
      'dominant-baseline': 'central',
      'pointer-events': 'none'
    });
    portGroup.appendChild(leftText);

    const rightText = createText(bezelRadius + 1.2, 0, rightVal, {
      fill: 'rgba(255, 255, 255, 0.4)',
      'font-size': '3.8',
      'font-family': 'sans-serif',
      'font-weight': 'bold',
      'text-anchor': 'start',
      'dominant-baseline': 'central',
      'pointer-events': 'none'
    });
    portGroup.appendChild(rightText);

  } else {
    if (hasCustomPanel) {
      // These categories' panel renderer already draws all port visuals.
      // We add only: transparent hit-target + JSX-style blue hover highlight + neon ring for cable drag.
      const pw = port.portW ?? 9;
      const ph = port.portH ?? 9;

      // Transparent hit-target — exact port size, no padding (adjacent ports ~9.6px apart; padding causes overlap)
      const hitTarget = createRect(-pw / 2, -ph / 2, pw, ph, {
        fill: 'transparent',
        'class': 'port-hover-target',
      });
      portGroup.appendChild(hitTarget);

      // Blue fill highlight matching JSX .hov behavior (#37b6ff at 14% opacity on hover)
      const blueHl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      blueHl.setAttribute('x', String(-pw / 2));
      blueHl.setAttribute('y', String(-ph / 2));
      blueHl.setAttribute('width', String(pw));
      blueHl.setAttribute('height', String(ph));
      blueHl.setAttribute('rx', '1');
      blueHl.setAttribute('fill', '#37b6ff');
      blueHl.setAttribute('opacity', '0');
      blueHl.setAttribute('pointer-events', 'none');
      blueHl.style.transition = 'opacity 0.12s ease';
      portGroup.appendChild(blueHl);

      // Neon ring for cable-drag snap visual feedback — hugs the port's exact footprint (no
      // outward padding, so it doesn't drift off the jack) with a tight corner radius rather
      // than a soft "pill" rounding that reads oversized on a port this small.
      const glowRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      glowRect.setAttribute('x', String(-pw / 2));
      glowRect.setAttribute('y', String(-ph / 2));
      glowRect.setAttribute('width', String(pw));
      glowRect.setAttribute('height', String(ph));
      glowRect.setAttribute('fill', 'none');
      glowRect.setAttribute('stroke', '#00e5ff');
      glowRect.setAttribute('stroke-width', '1');
      glowRect.setAttribute('rx', '1');
      glowRect.setAttribute('opacity', '0');
      glowRect.setAttribute('class', 'port-neon-ring');
      glowRect.setAttribute('pointer-events', 'none'); // opacity:0 alone doesn't disable hit-testing
      portGroup.appendChild(glowRect);

      portGroup.addEventListener('mouseenter', () => blueHl.setAttribute('opacity', '0.14'));
      portGroup.addEventListener('mouseleave', () => blueHl.setAttribute('opacity', '0'));

    } else {
      // Remaining categories without a dedicated panel renderer (server, storage, ups, pdu, etc.)
      // — also what a switch/firewall/etc. falls back to once it has a custom front-panel image
      // (hasCustomPanel above is forced false then), which is exactly the "Custom Layout" devices'
      // manually-added/calibrated ports. Padding trimmed from 3px/side to 1px/side: real hardware
      // ports calibrated to match a photo can sit as close as ~9-14px apart (see the Custom
      // Switch/Firewall screenshots), and the old padding alone (6px added to width/height) was
      // enough to make neighboring ports' hit-targets overlap and "attract" a cable meant for the
      // next port over.
      const hitTarget = createRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, {
        fill: 'transparent',
        'class': 'port-hover-target',
      });
      portGroup.appendChild(hitTarget);

      // Check for per-port type override: render C14 inlet if set to 'power'
      const portTypeOverride = (portIndex !== undefined && device?.portTypes) ? device.portTypes[portIndex] : undefined;
      const isPowerPortOverride = portTypeOverride === 'power';

      // Every shape below is purely decorative — pointer-events:none so the hitTarget above is
      // the ONLY thing that can register a click. Without this, each of these real painted
      // (filled) shapes is independently hit-testable at its own size regardless of how tight the
      // hitTarget itself is (the same bug already fixed for ear-hole ports).
      if (isPowerPortOverride) {
        // C14 power inlet: dark face plate with purple border + 3 oval IEC contact holes
        // Port center is at (0, 0); face plate size matches w×h
        const faceRect = createRect(-w / 2, -h / 2, w, h, {
          fill: '#1a0a20',
          stroke: '#cc44ff',
          'stroke-width': '1.5',
          rx: 1,
          ry: 1,
          'pointer-events': 'none',
        });
        portGroup.appendChild(faceRect);

        // Hole 1: bottom-left
        const hole1 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        hole1.setAttribute('cx', String(-3.5));
        hole1.setAttribute('cy', String(2));
        hole1.setAttribute('rx', '1.5');
        hole1.setAttribute('ry', '2.5');
        hole1.setAttribute('fill', '#050506');
        hole1.setAttribute('pointer-events', 'none');
        portGroup.appendChild(hole1);

        // Hole 2: top-center
        const hole2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        hole2.setAttribute('cx', '0');
        hole2.setAttribute('cy', String(-2));
        hole2.setAttribute('rx', '1.5');
        hole2.setAttribute('ry', '2.5');
        hole2.setAttribute('fill', '#050506');
        hole2.setAttribute('pointer-events', 'none');
        portGroup.appendChild(hole2);

        // Hole 3: bottom-right
        const hole3 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        hole3.setAttribute('cx', String(3.5));
        hole3.setAttribute('cy', String(2));
        hole3.setAttribute('rx', '1.5');
        hole3.setAttribute('ry', '2.5');
        hole3.setAttribute('fill', '#050506');
        hole3.setAttribute('pointer-events', 'none');
        portGroup.appendChild(hole3);

        // Neon glow ring for cable-drag snap feedback
        const glowRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        glowRect.setAttribute('x', String(-w / 2 - 2));
        glowRect.setAttribute('y', String(-h / 2 - 2));
        glowRect.setAttribute('width', String(w + 4));
        glowRect.setAttribute('height', String(h + 4));
        glowRect.setAttribute('fill', 'none');
        glowRect.setAttribute('stroke', '#cc44ff');
        glowRect.setAttribute('stroke-width', '1.2');
        glowRect.setAttribute('rx', '2');
        glowRect.setAttribute('opacity', '0');
        glowRect.setAttribute('class', 'port-neon-ring');
        glowRect.setAttribute('pointer-events', 'none');
        portGroup.appendChild(glowRect);
      } else {
        const rect = createRect(-w / 2, -h / 2, w, h, {
          fill: color,
          stroke: isConnected ? '#4caf50' : '#111',
          'stroke-width': isConnected ? 1.5 : 1,
          rx: 1,
          ry: 1,
          'pointer-events': 'none',
        });
        portGroup.appendChild(rect);

        if (port.type === 'rj45' || port.type === 'management' || port.type === 'console') {
          const inner = createRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, { fill: '#111', 'pointer-events': 'none' });
          portGroup.appendChild(inner);
        }

        const isPower = port.type === 'power';
        const glowRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        glowRect.setAttribute('x', String(-w / 2 - 2));
        glowRect.setAttribute('y', String(-h / 2 - 2));
        glowRect.setAttribute('width', String(w + 4));
        glowRect.setAttribute('height', String(h + 4));
        glowRect.setAttribute('fill', 'none');
        glowRect.setAttribute('stroke', isPower ? '#ff1744' : '#00e5ff');
        glowRect.setAttribute('stroke-width', '1.2');
        glowRect.setAttribute('rx', '2');
        glowRect.setAttribute('opacity', '0');
        glowRect.setAttribute('class', 'port-neon-ring');
        glowRect.setAttribute('pointer-events', 'none');
        portGroup.appendChild(glowRect);
      }
    }
  }

  // hasCustomPanel categories (switch/router/firewall/console/patch-panel) already draw their
  // own port numbering/graphics in the SVG panel itself — this overlay must stay a transparent
  // hit-target only. Drawing this label unconditionally smeared a "CON" caption over every
  // console-type port (all 8/16 KVM target jacks), overlapping into unreadable garbled text.
  if (label && !hasCustomPanel) {
    const text = createText(0, -h/2 - 2, label, {
      fill: '#aaa',
      'font-size': 6,
      'font-family': 'sans-serif',
      'text-anchor': 'middle'
    });
    portGroup.appendChild(text);
  }

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = port.name;
  portGroup.appendChild(title);

  return portGroup;
}
