import { RackData, RACK_CONSTANTS } from '../core/types';
import { createGroup, createRect, createCircle, createText, createLinearGradient, createFilter, createSVGElement, setAttributes } from '../utils/svg-helpers';

export function renderRack(rack: RackData, parentGroup: SVGGElement): SVGGElement {
  const rackGroup = createGroup('rack-' + rack.id, 'rack');
  setAttributes(rackGroup, {
    transform: `translate(${rack.x}, ${rack.y})`,
    'data-rack-id': rack.id
  });

  const totalHeight = RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units * RACK_CONSTANTS.RU_HEIGHT) + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
  const innerWidth = RACK_CONSTANTS.RACK_INNER_WIDTH;
  const innerX = (RACK_CONSTANTS.RACK_OUTER_WIDTH - innerWidth) / 2; // 25
  const innerY = RACK_CONSTANTS.RACK_PADDING_TOP;
  const innerHeight = rack.units * RACK_CONSTANTS.RU_HEIGHT;

  const defs = createSVGElement('defs');
  
  // Outer frame dropshadow
  const filter = createFilter('shadow-' + rack.id, [
    createSVGElement('feDropShadow', { dx: 0, dy: 6, stdDeviation: 8, 'flood-opacity': 0.6, 'flood-color': '#000' })
  ]);
  
  // Metallic post / frame gradient
  const gradient = createLinearGradient('rack-gradient-' + rack.id, [
    { offset: '0%', color: '#16161a' },
    { offset: '15%', color: '#2b2b32' },
    { offset: '50%', color: '#3a3a42' },
    { offset: '85%', color: '#2b2b32' },
    { offset: '100%', color: '#16161a' }
  ]);
  gradient.setAttribute('x1', '0%');
  gradient.setAttribute('y1', '0%');
  gradient.setAttribute('x2', '100%');
  gradient.setAttribute('y2', '0%');

  // PDU chassis gradient
  const pduGradient = createLinearGradient('pdu-grad-' + rack.id, [
    { offset: '0%', color: '#1c1e22' },
    { offset: '50%', color: '#2b2f36' },
    { offset: '100%', color: '#1c1e22' }
  ]);
  pduGradient.setAttribute('x1', '0%');
  pduGradient.setAttribute('y1', '0%');
  pduGradient.setAttribute('x2', '100%');
  pduGradient.setAttribute('y2', '0%');
  
  defs.appendChild(filter);
  defs.appendChild(gradient);
  defs.appendChild(pduGradient);
  rackGroup.appendChild(defs);

  // === 1. CABINET OUTER CABINET FRAME ===
  const outerFrame = createRect(0, 0, RACK_CONSTANTS.RACK_OUTER_WIDTH, totalHeight, {
    fill: `url(#rack-gradient-${rack.id})`,
    rx: 6,
    ry: 6,
    filter: `url(#shadow-${rack.id})`
  });
  rackGroup.appendChild(outerFrame);

  // === 2. INNER CAVITY (Dark bay behind servers) ===
  const innerCavity = createRect(innerX, innerY, innerWidth, innerHeight, {
    fill: '#090a0c'
  });
  rackGroup.appendChild(innerCavity);

  // === 3. VERTICAL METALLIC POSTS / MOUNTING RAILS ===
  const leftRailX = innerX;
  const rightRailX = innerX + innerWidth - RACK_CONSTANTS.RAIL_WIDTH;
  
  const leftRail = createRect(leftRailX, innerY, RACK_CONSTANTS.RAIL_WIDTH, innerHeight, { fill: '#1a1a1f' });
  const rightRail = createRect(rightRailX, innerY, RACK_CONSTANTS.RAIL_WIDTH, innerHeight, { fill: '#1a1a1f' });
  rackGroup.appendChild(leftRail);
  rackGroup.appendChild(rightRail);

  // Unit tick markings and hole patterns
  for (let u = 1; u <= rack.units; u++) {
    const yOffset = innerY + innerHeight - (u * RACK_CONSTANTS.RU_HEIGHT);
    
    // Horizontal divider line
    if (u < rack.units) {
      const line = createSVGElement('line', {
        x1: innerX,
        y1: yOffset,
        x2: innerX + innerWidth,
        y2: yOffset,
        stroke: '#111115',
        'stroke-width': 1
      });
      rackGroup.appendChild(line);
    }
    
    // Slot index labels (RU numbers) on both left and right posts
    // Left Label
    const leftText = createText(leftRailX + 5, yOffset + RACK_CONSTANTS.RU_HEIGHT / 2 + 3.5, String(u), {
      fill: '#6a737d',
      'font-size': 8.5,
      'font-weight': 'bold',
      'font-family': 'Inter, sans-serif'
    });
    rackGroup.appendChild(leftText);

    // Right Label
    const rightText = createText(rightRailX + 13, yOffset + RACK_CONSTANTS.RU_HEIGHT / 2 + 3.5, String(u), {
      fill: '#6a737d',
      'font-size': 8.5,
      'font-weight': 'bold',
      'font-family': 'Inter, sans-serif'
    });
    rackGroup.appendChild(rightText);
    
    // Mounting Holes (Standard 3 holes per U spacing)
    const holeRadius = RACK_CONSTANTS.MOUNTING_HOLE_SIZE / 2;
    const holeOffset = RACK_CONSTANTS.RU_HEIGHT / 6;
    const holeXLeft = leftRailX + RACK_CONSTANTS.RAIL_WIDTH - 6;
    const holeXRight = rightRailX + 6;

    for (let h = 0; h < 3; h++) {
      const holeY = yOffset + holeOffset + h * holeOffset * 2;
      rackGroup.appendChild(createCircle(holeXLeft, holeY, holeRadius, { fill: '#0a0a0d', stroke: '#202026', 'stroke-width': 0.5 }));
      rackGroup.appendChild(createCircle(holeXRight, holeY, holeRadius, { fill: '#0a0a0d', stroke: '#202026', 'stroke-width': 0.5 }));
    }

    // Interaction Hit Target for RU placement
    const hitTarget = createRect(innerX + RACK_CONSTANTS.RAIL_WIDTH, yOffset, innerWidth - 2 * RACK_CONSTANTS.RAIL_WIDTH, RACK_CONSTANTS.RU_HEIGHT, {
      fill: 'transparent',
      'class': 'ru-hit-target',
      'data-ru': u
    });
    rackGroup.appendChild(hitTarget);
  }

  // === 4. VERTICAL INTELLIGENT PDUS ===
  const pduWidth = 18;
  const pduHeight = innerHeight - 20;
  const pduY = innerY + 10;
  
  // Left PDU
  if (rack.showPduLeft !== false) {
    const leftPduGroup = createGroup('rack-' + rack.id + '-pdu-left', 'pdu-element');
    
    // Chassis
    const pduChassis = createRect(3, pduY, pduWidth, pduHeight, {
      fill: `url(#pdu-grad-${rack.id})`,
      stroke: '#0e1012',
      'stroke-width': 1,
      rx: 2,
      ry: 2
    });
    leftPduGroup.appendChild(pduChassis);

    // Blue LCD display at the top
    const lcd = createRect(5, pduY + 10, pduWidth - 4, 14, { fill: '#005f73', rx: 1 });
    const lcdTxt = createText(6, pduY + 20, '12.4A', {
      fill: '#a2d2ff',
      'font-size': 4.5,
      'font-weight': 'bold',
      'font-family': 'monospace'
    });
    leftPduGroup.appendChild(lcd);
    leftPduGroup.appendChild(lcdTxt);

    // Dynamic Outlets
    const outletCount = 20;
    const outletSpacing = (pduHeight - 60) / outletCount;
    for (let i = 0; i < outletCount; i++) {
      const outletY = pduY + 40 + i * outletSpacing;
      // Socket circle
      const socket = createCircle(12, outletY, 3, {
        fill: '#151719',
        stroke: i % 2 === 0 ? '#1b4332' : '#0f3057', // Alternating dark green and dark blue ring
        'stroke-width': 0.8
      });
      // Center socket pin hole
      const pin = createCircle(12, outletY, 1, { fill: '#000' });
      
      leftPduGroup.appendChild(socket);
      leftPduGroup.appendChild(pin);
    }

    // PDU Vertical Text label
    const label = createText(9, pduY + pduHeight - 20, 'VERTICAL INTELLIGENT PDU - A', {
      fill: '#8b949e',
      'font-size': 4.5,
      'font-family': 'Inter, sans-serif',
      'font-weight': 'bold',
      transform: `rotate(-90, 9, ${pduY + pduHeight - 20})`
    });
    leftPduGroup.appendChild(label);

    rackGroup.appendChild(leftPduGroup);
  }

  // Right PDU
  if (rack.showPduRight !== false) {
    const rightPduGroup = createGroup('rack-' + rack.id + '-pdu-right', 'pdu-element');
    const pduX = RACK_CONSTANTS.RACK_OUTER_WIDTH - pduWidth - 3;
    
    // Chassis
    const pduChassis = createRect(pduX, pduY, pduWidth, pduHeight, {
      fill: `url(#pdu-grad-${rack.id})`,
      stroke: '#0e1012',
      'stroke-width': 1,
      rx: 2,
      ry: 2
    });
    rightPduGroup.appendChild(pduChassis);

    // Blue LCD display at the top
    const lcd = createRect(pduX + 2, pduY + 10, pduWidth - 4, 14, { fill: '#005f73', rx: 1 });
    const lcdTxt = createText(pduX + 3, pduY + 20, '11.8A', {
      fill: '#a2d2ff',
      'font-size': 4.5,
      'font-weight': 'bold',
      'font-family': 'monospace'
    });
    rightPduGroup.appendChild(lcd);
    rightPduGroup.appendChild(lcdTxt);

    // Dynamic Outlets
    const outletCount = 20;
    const outletSpacing = (pduHeight - 60) / outletCount;
    for (let i = 0; i < outletCount; i++) {
      const outletY = pduY + 40 + i * outletSpacing;
      // Socket circle
      const socket = createCircle(pduX + 6, outletY, 3, {
        fill: '#151719',
        stroke: i % 2 === 0 ? '#1b4332' : '#0f3057', // Alternating dark green and dark blue ring
        'stroke-width': 0.8
      });
      // Center socket pin hole
      const pin = createCircle(pduX + 6, outletY, 1, { fill: '#000' });
      
      rightPduGroup.appendChild(socket);
      rightPduGroup.appendChild(pin);
    }

    // PDU Vertical Text label
    const label = createText(pduX + 12, pduY + pduHeight - 20, 'VERTICAL INTELLIGENT PDU - B', {
      fill: '#8b949e',
      'font-size': 4.5,
      'font-family': 'Inter, sans-serif',
      'font-weight': 'bold',
      transform: `rotate(-90, ${pduX + 12}, ${pduY + pduHeight - 20})`
    });
    rightPduGroup.appendChild(label);

    rackGroup.appendChild(rightPduGroup);
  }

  // === 5. CABINET NAME HEADER ===
  const headerFrame = createRect(0, 0, RACK_CONSTANTS.RACK_OUTER_WIDTH, RACK_CONSTANTS.RACK_PADDING_TOP - 2, {
    fill: '#090a0d',
    'stroke-bottom': '#222'
  });
  rackGroup.appendChild(headerFrame);

  const nameLabel = createText(RACK_CONSTANTS.RACK_OUTER_WIDTH / 2, 18, rack.name, {
    fill: '#ffffff',
    'text-anchor': 'middle',
    'font-weight': 'bold',
    'font-size': 11,
    'font-family': 'Inter, sans-serif',
    'letter-spacing': '1px'
  });
  rackGroup.appendChild(nameLabel);

  // === 6. VERTICAL CABLE MANAGERS ===
  
  // Left Vertical Cable Manager
  const showLeft = rack.leftCableManagerWidth !== undefined && rack.leftCableManagerWidth !== 'none';
  if (showLeft) {
    const leftWidth = rack.leftCableManagerWidth === '6-inch' ? 40 : 26;
    const ductX = -leftWidth - 6;
    const leftMgrGroup = createGroup('rack-' + rack.id + '-mgr-left', 'cable-manager-vertical');
    leftMgrGroup.setAttribute('data-vertical-mgr-id', rack.id);
    leftMgrGroup.setAttribute('data-side', 'left');
    
    // Duct background channel
    const channel = createRect(ductX, 0, leftWidth, totalHeight, {
      fill: '#151518',
      stroke: '#30363d',
      'stroke-width': 1.2,
      rx: 3
    });
    leftMgrGroup.appendChild(channel);
    
    // Slits / fingers for each RU
    for (let u = 1; u <= rack.units; u++) {
      const yOffset = innerY + innerHeight - (u * RACK_CONSTANTS.RU_HEIGHT);
      const slit = createRect(ductX + 4, yOffset + 6, leftWidth - 8, 12, {
        fill: '#08080a',
        stroke: '#21262d',
        'stroke-width': 0.6,
        rx: 1
      });
      leftMgrGroup.appendChild(slit);

      // Silver loop
      const loop = createSVGElement('path', {
        d: `M ${ductX + 4} ${yOffset + 12} Q ${ductX - 2} ${yOffset + 12} ${ductX + 4} ${yOffset + 20}`,
        fill: 'none',
        stroke: '#8b949e',
        'stroke-width': 1.2
      });
      leftMgrGroup.appendChild(loop);
    }

    // Cover line detail
    leftMgrGroup.appendChild(createSVGElement('line', {
      x1: ductX + leftWidth / 2,
      y1: 10,
      x2: ductX + leftWidth / 2,
      y2: totalHeight - 10,
      stroke: '#30363d',
      'stroke-width': 1,
      'stroke-dasharray': '8,8'
    }));

    // Text label
    const label = createText(ductX + leftWidth / 2 - 2, totalHeight - 40, `LEFT VERTICAL MANAGER (${rack.leftCableManagerWidth === '6-inch' ? '6"' : '4"'})`, {
      fill: '#58a6ff',
      'font-size': 4,
      'font-family': 'Inter, sans-serif',
      'font-weight': 'bold',
      transform: `rotate(-90, ${ductX + leftWidth / 2 - 2}, ${totalHeight - 40})`,
      opacity: 0.8
    });
    leftMgrGroup.appendChild(label);
    
    rackGroup.appendChild(leftMgrGroup);
  }

  // Right Vertical Cable Manager
  const showRight = rack.rightCableManagerWidth !== undefined && rack.rightCableManagerWidth !== 'none';
  if (showRight) {
    const rightWidth = rack.rightCableManagerWidth === '6-inch' ? 40 : 26;
    const ductX = RACK_CONSTANTS.RACK_OUTER_WIDTH + 6;
    const rightMgrGroup = createGroup('rack-' + rack.id + '-mgr-right', 'cable-manager-vertical');
    rightMgrGroup.setAttribute('data-vertical-mgr-id', rack.id);
    rightMgrGroup.setAttribute('data-side', 'right');
    
    // Duct background channel
    const channel = createRect(ductX, 0, rightWidth, totalHeight, {
      fill: '#151518',
      stroke: '#30363d',
      'stroke-width': 1.2,
      rx: 3
    });
    rightMgrGroup.appendChild(channel);
    
    // Slits / fingers for each RU
    for (let u = 1; u <= rack.units; u++) {
      const yOffset = innerY + innerHeight - (u * RACK_CONSTANTS.RU_HEIGHT);
      const slit = createRect(ductX + 4, yOffset + 6, rightWidth - 8, 12, {
        fill: '#08080a',
        stroke: '#21262d',
        'stroke-width': 0.6,
        rx: 1
      });
      rightMgrGroup.appendChild(slit);

      // Silver loop
      const loop = createSVGElement('path', {
        d: `M ${ductX + rightWidth - 4} ${yOffset + 12} Q ${ductX + rightWidth + 2} ${yOffset + 12} ${ductX + rightWidth - 4} ${yOffset + 20}`,
        fill: 'none',
        stroke: '#8b949e',
        'stroke-width': 1.2
      });
      rightMgrGroup.appendChild(loop);
    }

    // Cover line detail
    rightMgrGroup.appendChild(createSVGElement('line', {
      x1: ductX + rightWidth / 2,
      y1: 10,
      x2: ductX + rightWidth / 2,
      y2: totalHeight - 10,
      stroke: '#30363d',
      'stroke-width': 1,
      'stroke-dasharray': '8,8'
    }));

    // Text label
    const label = createText(ductX + rightWidth / 2 + 2, totalHeight - 40, `RIGHT VERTICAL MANAGER (${rack.rightCableManagerWidth === '6-inch' ? '6"' : '4"'})`, {
      fill: '#58a6ff',
      'font-size': 4,
      'font-family': 'Inter, sans-serif',
      'font-weight': 'bold',
      transform: `rotate(-90, ${ductX + rightWidth / 2 + 2}, ${totalHeight - 40})`,
      opacity: 0.8
    });
    rightMgrGroup.appendChild(label);
    
    rackGroup.appendChild(rightMgrGroup);
  }

  // === 7. VELCRO BUNDLE CLAMPS / COMB TIES ALONG RAILS ===
  for (const u of [5, 10, 15, 20, 25, 30, 35, 40]) {
    if (u <= rack.units) {
      const tieY = innerY + innerHeight - (u * RACK_CONSTANTS.RU_HEIGHT);
      
      // Left rail velcro strap
      const leftTie = createRect(leftRailX - 14, tieY, 20, 6, {
        fill: '#111317',
        stroke: '#30363d',
        'stroke-width': 0.8,
        rx: 1.5
      });
      // Stitch line on strap
      const leftStitch = createSVGElement('line', {
        x1: leftRailX - 14, y1: tieY + 3, x2: leftRailX + 6, y2: tieY + 3,
        stroke: '#fdd835', 'stroke-width': 0.6, 'stroke-dasharray': '2,1.5'
      });

      // Right rail velcro strap
      const rightTie = createRect(rightRailX + RACK_CONSTANTS.RAIL_WIDTH - 6, tieY, 20, 6, {
        fill: '#111317',
        stroke: '#30363d',
        'stroke-width': 0.8,
        rx: 1.5
      });
      const rightStitch = createSVGElement('line', {
        x1: rightRailX + RACK_CONSTANTS.RAIL_WIDTH - 6, y1: tieY + 3, x2: rightRailX + RACK_CONSTANTS.RAIL_WIDTH + 14, y2: tieY + 3,
        stroke: '#fdd835', 'stroke-width': 0.6, 'stroke-dasharray': '2,1.5'
      });

      rackGroup.appendChild(leftTie);
      rackGroup.appendChild(leftStitch);
      rackGroup.appendChild(rightTie);
      rackGroup.appendChild(rightStitch);
    }
  }

  parentGroup.appendChild(rackGroup);
  return rackGroup;
}
