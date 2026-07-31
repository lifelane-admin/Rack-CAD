import { PortData, DeviceData } from '../core/types';
import { createGroup, createRect, createText, setAttributes } from '../utils/svg-helpers';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';

export function renderPorts(ports: PortData[], deviceGroup: SVGGElement): void {
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

  const isEarPort = port.id.includes('-ear-');
  if (isEarPort) {
    const isPower = port.type === 'power';
    const isHybrid = port.type === 'hybrid';
    // ── Ear ports use a smaller radius to match network-switch port scale ──
    // Previous: radius = 2.5 (too large). Now: 1.8 for network/hybrid, 2.2 for power.
    // Hybrid keeps the exact same footprint as a regular network hole — only its shape
    // (rounded square instead of circle) and color (purple) differ, so it reads as a
    // distinct port type without disrupting the row's spacing or size.
    const radius = isPower ? 2.2 : 1.8;
    const bezelRadius = radius + 1.0;

    let fill        = isConnected ? (isPower ? '#e53935' : isHybrid ? '#c837ff' : '#00e676') : '#0d0d10';
    let strokeColor = isConnected ? (isPower ? '#ff5252' : isHybrid ? '#e0a3ff' : '#00e676') : (isHybrid ? '#7b4a94' : '#3a3a42');

    // Neon glow hit target (invisible, larger — receives hover/click events)
    const hitTarget = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hitTarget.setAttribute('cx', '0');
    hitTarget.setAttribute('cy', '0');
    hitTarget.setAttribute('r', '6');
    hitTarget.setAttribute('fill', 'transparent');
    hitTarget.setAttribute('class', 'port-hover-target');
    portGroup.appendChild(hitTarget);

    // Outer metallic bezel — rounded square for hybrid, circular ring for everything else
    if (isHybrid) {
      const bezel = createRect(-bezelRadius, -bezelRadius, bezelRadius * 2, bezelRadius * 2, {
        fill: '#1a1a1e', stroke: '#555560', 'stroke-width': 0.5, rx: bezelRadius * 0.4,
      });
      portGroup.appendChild(bezel);
    } else {
      const bezel = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bezel.setAttribute('cx', '0');
      bezel.setAttribute('cy', '0');
      bezel.setAttribute('r', bezelRadius.toString());
      bezel.setAttribute('fill', '#1a1a1e');
      bezel.setAttribute('stroke', '#555560');
      bezel.setAttribute('stroke-width', '0.5');
      portGroup.appendChild(bezel);
    }

    // Inner compact socket hole — same rounded-square-vs-circle split
    if (isHybrid) {
      const hole = createRect(-radius, -radius, radius * 2, radius * 2, {
        fill, stroke: strokeColor, 'stroke-width': 0.6, rx: radius * 0.4,
      });
      hole.setAttribute('class', 'ear-port-hole hybrid-port');
      portGroup.appendChild(hole);
    } else {
      const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hole.setAttribute('cx', '0');
      hole.setAttribute('cy', '0');
      hole.setAttribute('r', radius.toString());
      hole.setAttribute('fill', fill);
      hole.setAttribute('stroke', strokeColor);
      hole.setAttribute('stroke-width', '0.6');
      hole.setAttribute('class', isPower ? 'ear-port-hole power-port' : 'ear-port-hole network-port');
      portGroup.appendChild(hole);
    }

    // Center socket pin dot
    const pin = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pin.setAttribute('cx', '0');
    pin.setAttribute('cy', '0');
    pin.setAttribute('r', '0.6');
    pin.setAttribute('fill', isConnected ? '#ffffff' : isHybrid ? '#d8a3ff' : '#ffb74d');
    portGroup.appendChild(pin);

    // Neon glow overlay ring (shown via CSS when port is hovered during cable drag). Hugs the
    // bezel closely (radius == bezelRadius, thin stroke) rather than extending well past it —
    // ear holes can sit as little as ~7.5px apart (e.g. a PSU port between two NIC holes), and
    // a wider halo would visually bleed into the neighboring hole when highlighted.
    const glowRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    glowRing.setAttribute('cx', '0');
    glowRing.setAttribute('cy', '0');
    glowRing.setAttribute('r', bezelRadius.toString());
    glowRing.setAttribute('fill', 'none');
    glowRing.setAttribute('stroke', isPower ? '#ff1744' : isHybrid ? '#c837ff' : '#00e5ff');
    glowRing.setAttribute('stroke-width', '1');
    glowRing.setAttribute('opacity', '0');
    glowRing.setAttribute('class', 'port-neon-ring');
    portGroup.appendChild(glowRing);

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
      portGroup.appendChild(glowRect);

      portGroup.addEventListener('mouseenter', () => blueHl.setAttribute('opacity', '0.14'));
      portGroup.addEventListener('mouseleave', () => blueHl.setAttribute('opacity', '0'));

    } else {
      // Remaining categories without a dedicated panel renderer (server, storage, ups, pdu, etc.)
      const hitTarget = createRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, {
        fill: 'transparent',
        'class': 'port-hover-target',
      });
      portGroup.appendChild(hitTarget);

      // Check for per-port type override: render C14 inlet if set to 'power'
      const portTypeOverride = (portIndex !== undefined && device?.portTypes) ? device.portTypes[portIndex] : undefined;
      const isPowerPortOverride = portTypeOverride === 'power';

      if (isPowerPortOverride) {
        // C14 power inlet: dark face plate with purple border + 3 oval IEC contact holes
        // Port center is at (0, 0); face plate size matches w×h
        const faceRect = createRect(-w / 2, -h / 2, w, h, {
          fill: '#1a0a20',
          stroke: '#cc44ff',
          'stroke-width': '1.5',
          rx: 1,
          ry: 1,
        });
        portGroup.appendChild(faceRect);

        // Hole 1: bottom-left
        const hole1 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        hole1.setAttribute('cx', String(-3.5));
        hole1.setAttribute('cy', String(2));
        hole1.setAttribute('rx', '1.5');
        hole1.setAttribute('ry', '2.5');
        hole1.setAttribute('fill', '#050506');
        portGroup.appendChild(hole1);

        // Hole 2: top-center
        const hole2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        hole2.setAttribute('cx', '0');
        hole2.setAttribute('cy', String(-2));
        hole2.setAttribute('rx', '1.5');
        hole2.setAttribute('ry', '2.5');
        hole2.setAttribute('fill', '#050506');
        portGroup.appendChild(hole2);

        // Hole 3: bottom-right
        const hole3 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        hole3.setAttribute('cx', String(3.5));
        hole3.setAttribute('cy', String(2));
        hole3.setAttribute('rx', '1.5');
        hole3.setAttribute('ry', '2.5');
        hole3.setAttribute('fill', '#050506');
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
        portGroup.appendChild(glowRect);
      } else {
        const rect = createRect(-w / 2, -h / 2, w, h, {
          fill: color,
          stroke: isConnected ? '#4caf50' : '#111',
          'stroke-width': isConnected ? 1.5 : 1,
          rx: 1,
          ry: 1,
        });
        portGroup.appendChild(rect);

        if (port.type === 'rj45' || port.type === 'management' || port.type === 'console') {
          const inner = createRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, { fill: '#111' });
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
