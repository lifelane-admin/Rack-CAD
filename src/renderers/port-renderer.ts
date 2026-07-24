import { PortData } from '../core/types';
import { createGroup, createRect, createText, setAttributes } from '../utils/svg-helpers';

export function renderPorts(ports: PortData[], deviceGroup: SVGGElement): void {
  ports.forEach(port => {
    deviceGroup.appendChild(renderPort(port, deviceGroup));
  });
}

export function renderPort(port: PortData, deviceGroup: SVGGElement): SVGGElement {
  const portGroup = createGroup('port-' + port.id, 'port-element');
  setAttributes(portGroup, {
    transform: `translate(${port.relativeX}, ${port.relativeY})`,
    'data-port-id': port.id,
    'data-port-type': port.type
  });

  const isConnected = port.connected;
  let color = isConnected ? '#2e7d32' : '#3a3a3e';

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
    // ── Ear ports use a smaller radius to match network-switch port scale ──
    // Previous: radius = 2.5 (too large). Now: 1.8 for network, 2.2 for power.
    const radius = isPower ? 2.2 : 1.8;
    const bezelRadius = radius + 1.0;

    let fill       = isConnected ? (isPower ? '#e53935' : '#00e676') : '#0d0d10';
    let strokeColor = isConnected ? (isPower ? '#ff5252' : '#00e676') : '#3a3a42';

    // Neon glow hit target (invisible, larger — receives hover/click events)
    const hitTarget = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hitTarget.setAttribute('cx', '0');
    hitTarget.setAttribute('cy', '0');
    hitTarget.setAttribute('r', '6');
    hitTarget.setAttribute('fill', 'transparent');
    hitTarget.setAttribute('class', 'port-hover-target');
    portGroup.appendChild(hitTarget);

    // Outer metallic bezel ring
    const bezel = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bezel.setAttribute('cx', '0');
    bezel.setAttribute('cy', '0');
    bezel.setAttribute('r', bezelRadius.toString());
    bezel.setAttribute('fill', '#1a1a1e');
    bezel.setAttribute('stroke', '#555560');
    bezel.setAttribute('stroke-width', '0.5');
    portGroup.appendChild(bezel);

    // Inner compact socket hole
    const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hole.setAttribute('cx', '0');
    hole.setAttribute('cy', '0');
    hole.setAttribute('r', radius.toString());
    hole.setAttribute('fill', fill);
    hole.setAttribute('stroke', strokeColor);
    hole.setAttribute('stroke-width', '0.6');
    hole.setAttribute('class', isPower ? 'ear-port-hole power-port' : 'ear-port-hole network-port');
    portGroup.appendChild(hole);

    // Center socket pin dot
    const pin = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pin.setAttribute('cx', '0');
    pin.setAttribute('cy', '0');
    pin.setAttribute('r', '0.6');
    pin.setAttribute('fill', isConnected ? '#ffffff' : '#ffb74d');
    portGroup.appendChild(pin);

    // Neon glow overlay ring (shown via CSS when port is hovered during cable drag)
    const glowRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    glowRing.setAttribute('cx', '0');
    glowRing.setAttribute('cy', '0');
    glowRing.setAttribute('r', (bezelRadius + 1.5).toString());
    glowRing.setAttribute('fill', 'none');
    glowRing.setAttribute('stroke', isPower ? '#ff1744' : '#00e5ff');
    glowRing.setAttribute('stroke-width', '1.5');
    glowRing.setAttribute('opacity', '0');
    glowRing.setAttribute('class', 'port-neon-ring');
    portGroup.appendChild(glowRing);

  } else {
    // Front-panel rectangular ports (switches, patch panels, firewalls)
    const hitTarget = createRect(-w/2 - 3, -h/2 - 3, w + 6, h + 6, {
      fill: 'transparent',
      'class': 'port-hover-target'
    });
    portGroup.appendChild(hitTarget);

    const rect = createRect(-w/2, -h/2, w, h, {
      fill: color,
      stroke: isConnected ? '#4caf50' : '#111',
      'stroke-width': isConnected ? 1.5 : 1,
      rx: 1,
      ry: 1
    });
    portGroup.appendChild(rect);

    if (port.type === 'rj45' || port.type === 'management' || port.type === 'console') {
      const inner = createRect(-w/2 + 2, -h/2 + 2, w - 4, h - 4, { fill: '#111' });
      portGroup.appendChild(inner);
    }

    // Neon glow overlay for front-panel ports (shown via CSS on hover/snap)
    const isPower = port.type === 'power';
    const glowRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    glowRect.setAttribute('x', String(-w/2 - 2));
    glowRect.setAttribute('y', String(-h/2 - 2));
    glowRect.setAttribute('width', String(w + 4));
    glowRect.setAttribute('height', String(h + 4));
    glowRect.setAttribute('fill', 'none');
    glowRect.setAttribute('stroke', isPower ? '#ff1744' : '#00e5ff');
    glowRect.setAttribute('stroke-width', '1.8');
    glowRect.setAttribute('rx', '2');
    glowRect.setAttribute('opacity', '0');
    glowRect.setAttribute('class', 'port-neon-ring');
    portGroup.appendChild(glowRect);
  }

  if (label) {
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
