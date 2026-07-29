import { RackData, RACK_CONSTANTS, AppState } from '../core/types';
import { createGroup, createRect, createCircle, createText, createLinearGradient, createFilter, createSVGElement, setAttributes } from '../utils/svg-helpers';
import { stateManager } from '../core/state';
import { renderSidePdu } from './pdu-renderer';
import { getTemplate } from '../library/device-catalog';

export function renderRack(rack: RackData, parentGroup: SVGGElement, stateOverride?: Partial<AppState>): SVGGElement {
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

  const state = { ...stateManager.getState(), ...stateOverride };
  const isSkel = state.cabinetDrawMode === 'skeleton';
  const hasCover = state.cabinetCoverVisible;
  const isIso = state.isometricMode;
  const OUTER_W = RACK_CONSTANTS.RACK_OUTER_WIDTH;

  // PDU width computation from attached side-mount devices
  const allDevices = stateManager.getState().devices;
  const leftPduDevice = rack.leftPduId ? allDevices.find(d => d.id === rack.leftPduId) : null;
  const rightPduDevice = rack.rightPduId ? allDevices.find(d => d.id === rack.rightPduId) : null;
  const leftPduTemplate = leftPduDevice ? getTemplate(leftPduDevice.templateId) : null;
  const rightPduTemplate = rightPduDevice ? getTemplate(rightPduDevice.templateId) : null;
  const leftPduW = leftPduTemplate?.pduWidth ?? 0;
  const rightPduW = rightPduTemplate?.pduWidth ?? 0;
  const OUTER_W_TOTAL = RACK_CONSTANTS.RACK_OUTER_WIDTH + leftPduW + rightPduW;
  const pduOffset = leftPduW;

  // === 3D ISOMETRIC / PERSPECTIVE WALL DRAWINGS ===
  if (isIso) {
    const dx = 35;
    const dy = -18;
    
    // Draw Top 3D Face
    const topPoints = `0,0 ${dx},${dy} ${OUTER_W + dx},${dy} ${OUTER_W},0`;
    const topFace = createSVGElement('polygon', {
      points: topPoints,
      fill: isSkel ? 'rgba(56, 189, 248, 0.05)' : '#23252a',
      stroke: isSkel ? '#38bdf8' : '#111',
      'stroke-width': 1.2
    });
    rackGroup.appendChild(topFace);
    
    // Draw Right Side 3D Face
    const sidePoints = `${OUTER_W},0 ${OUTER_W + dx},${dy} ${OUTER_W + dx},${totalHeight + dy} ${OUTER_W},${totalHeight}`;
    let sideFill = '#1c1e22';
    if (isSkel) {
      sideFill = 'rgba(56, 189, 248, 0.03)';
    } else if (!hasCover) {
      sideFill = 'rgba(255, 255, 255, 0.02)';
    }
    
    const sideFace = createSVGElement('polygon', {
      points: sidePoints,
      fill: sideFill,
      stroke: isSkel ? '#38bdf8' : '#111',
      'stroke-width': 1.2
    });
    rackGroup.appendChild(sideFace);
    
    if (hasCover && !isSkel) {
      rackGroup.appendChild(createSVGElement('line', {
        x1: OUTER_W + dx/2, y1: dy + 40, x2: OUTER_W + dx/2, y2: totalHeight + dy - 40,
        stroke: '#2b2f36', 'stroke-width': 1.5
      }));
    } else {
      // Draw internal post
      rackGroup.appendChild(createSVGElement('line', {
        x1: OUTER_W + dx/2, y1: dy + innerY, x2: OUTER_W + dx/2, y2: totalHeight + dy - RACK_CONSTANTS.RACK_PADDING_BOTTOM,
        stroke: isSkel ? '#38bdf8' : '#333', 'stroke-width': 2, opacity: 0.8
      }));
      // Horizontal braces
      for (let y = innerY + 100; y < totalHeight - 100; y += 200) {
        const braceY = y + (dy * (y / totalHeight));
        rackGroup.appendChild(createSVGElement('line', {
          x1: OUTER_W, y1: y, x2: OUTER_W + dx, y2: y + dy,
          stroke: isSkel ? '#38bdf8' : '#333', 'stroke-width': 1.5, opacity: 0.8
        }));
      }
    }
  }

  // === 1. CABINET OUTER CABINET FRAME ===
  const outerFrame = createRect(-pduOffset, 0, OUTER_W_TOTAL, totalHeight, {
    fill: isSkel ? 'rgba(56, 189, 248, 0.05)' : `url(#rack-gradient-${rack.id})`,
    stroke: isSkel ? '#38bdf8' : 'none',
    'stroke-width': isSkel ? 1.5 : 0,
    rx: 6,
    ry: 6,
    filter: isSkel ? 'none' : `url(#shadow-${rack.id})`
  });
  rackGroup.appendChild(outerFrame);

  // === 2. INNER CAVITY (Dark bay behind servers) ===
  const innerCavity = createRect(innerX, innerY, innerWidth, innerHeight, {
    fill: isSkel ? 'rgba(0, 0, 0, 0.2)' : '#090a0c',
    stroke: isSkel ? '#38bdf8' : 'none',
    'stroke-width': isSkel ? 0.5 : 0
  });
  rackGroup.appendChild(innerCavity);

  // === 3. VERTICAL METALLIC POSTS / MOUNTING RAILS ===
  const leftRailX = innerX;
  const rightRailX = innerX + innerWidth - RACK_CONSTANTS.RAIL_WIDTH;
  
  const leftRail = createRect(leftRailX, innerY, RACK_CONSTANTS.RAIL_WIDTH, innerHeight, { 
    fill: isSkel ? 'rgba(56, 189, 248, 0.08)' : '#1a1a1f',
    stroke: isSkel ? '#38bdf8' : 'none',
    'stroke-width': isSkel ? 1 : 0
  });
  const rightRail = createRect(rightRailX, innerY, RACK_CONSTANTS.RAIL_WIDTH, innerHeight, { 
    fill: isSkel ? 'rgba(56, 189, 248, 0.08)' : '#1a1a1f',
    stroke: isSkel ? '#38bdf8' : 'none',
    'stroke-width': isSkel ? 1 : 0
  });
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
      rackGroup.appendChild(createCircle(holeXLeft, holeY, holeRadius, { fill: isSkel ? 'none' : '#0a0a0d', stroke: isSkel ? '#38bdf8' : '#202026', 'stroke-width': 0.5 }));
      rackGroup.appendChild(createCircle(holeXRight, holeY, holeRadius, { fill: isSkel ? 'none' : '#0a0a0d', stroke: isSkel ? '#38bdf8' : '#202026', 'stroke-width': 0.5 }));
    }

    // Interaction Hit Target for RU placement
    const hitTarget = createRect(innerX + RACK_CONSTANTS.RAIL_WIDTH, yOffset, innerWidth - 2 * RACK_CONSTANTS.RAIL_WIDTH, RACK_CONSTANTS.RU_HEIGHT, {
      fill: 'transparent',
      'class': 'ru-hit-target',
      'data-ru': u
    });
    rackGroup.appendChild(hitTarget);
  }

  // === 4. SIDE-MOUNT PDU ZONES OR "+" HANDLES ===
  const PDU_HANDLE_W = 20;

  // === LEFT PDU ZONE OR "+" HANDLE ===
  if (leftPduTemplate && leftPduDevice) {
    const leftPduGrp = renderSidePdu(leftPduTemplate, leftPduW, innerHeight, 'left');
    leftPduGrp.setAttribute('transform', `translate(${-leftPduW}, ${innerY})`);
    leftPduGrp.setAttribute('data-pdu-side', 'left');
    leftPduGrp.setAttribute('data-rack-id', rack.id);
    leftPduGrp.setAttribute('data-pdu-device-id', rack.leftPduId ?? '');
    leftPduGrp.setAttribute('style', 'cursor:pointer');
    rackGroup.appendChild(leftPduGrp);
  } else {
    // "+" add handle — dashed strip on left side
    const addHandle = createGroup('rack-' + rack.id + '-pdu-add-left', 'pdu-add-left');
    addHandle.setAttribute('data-pdu-add-side', 'left');
    addHandle.setAttribute('data-rack-id', rack.id);
    addHandle.setAttribute('style', 'cursor:pointer');

    const handleRect = createRect(-PDU_HANDLE_W, innerY, PDU_HANDLE_W, innerHeight, {
      fill: 'none',
      stroke: '#2a5a3a',
      'stroke-width': 1.2,
      'stroke-dasharray': '5,4',
      rx: 2
    });
    addHandle.appendChild(handleRect);

    const plusTxt = createText(-PDU_HANDLE_W / 2, innerY + innerHeight / 2 + 5, '+', {
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 'bold',
      fill: '#2aaa5a'
    });
    addHandle.appendChild(plusTxt);

    const tipTxt = createText(-PDU_HANDLE_W / 2, innerY + innerHeight / 2 + 14, 'Add PDU', {
      'text-anchor': 'middle',
      'font-size': 4.5,
      fill: '#1a6a3a'
    });
    addHandle.appendChild(tipTxt);

    rackGroup.appendChild(addHandle);
  }

  // === RIGHT PDU ZONE OR "+" HANDLE ===
  const rightPduX = RACK_CONSTANTS.RACK_OUTER_WIDTH;
  if (rightPduTemplate && rightPduDevice) {
    const rightPduGrp = renderSidePdu(rightPduTemplate, rightPduW, innerHeight, 'right');
    rightPduGrp.setAttribute('transform', `translate(${rightPduX}, ${innerY})`);
    rightPduGrp.setAttribute('data-pdu-side', 'right');
    rightPduGrp.setAttribute('data-rack-id', rack.id);
    rightPduGrp.setAttribute('data-pdu-device-id', rack.rightPduId ?? '');
    rightPduGrp.setAttribute('style', 'cursor:pointer');
    rackGroup.appendChild(rightPduGrp);
  } else {
    // "+" add handle — dashed strip on right side
    const addHandleR = createGroup('rack-' + rack.id + '-pdu-add-right', 'pdu-add-right');
    addHandleR.setAttribute('data-pdu-add-side', 'right');
    addHandleR.setAttribute('data-rack-id', rack.id);
    addHandleR.setAttribute('style', 'cursor:pointer');

    const handleRectR = createRect(rightPduX, innerY, PDU_HANDLE_W, innerHeight, {
      fill: 'none',
      stroke: '#2a5a3a',
      'stroke-width': 1.2,
      'stroke-dasharray': '5,4',
      rx: 2
    });
    addHandleR.appendChild(handleRectR);

    const plusTxtR = createText(rightPduX + PDU_HANDLE_W / 2, innerY + innerHeight / 2 + 5, '+', {
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 'bold',
      fill: '#2aaa5a'
    });
    addHandleR.appendChild(plusTxtR);

    rackGroup.appendChild(addHandleR);
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
