import { CableData, Point, CableType, RACK_CONSTANTS, CABLE_COLORS } from '../core/types';
import { createGroup, createPath, createRect, createLine, createSVGElement as createSVGEl, setAttributes } from '../utils/svg-helpers';
import { generateOrthogonalPath } from '../utils/geometry';
import { stateManager } from '../core/state';
import { computeSmartRouting, get3DefaultAnchors, getPortOrientation } from '../utils/routing';
import { getExitDirection } from '../utils/routing';
import { getMaterialProfile } from '../core/cable-materials';
import { getTemplate } from '../library/device-catalog';
import { iecShroudPath, IEC_CONTACTS } from './rack-kit';

let _previewDirection: 'up' | 'down' | 'left' | 'right' = 'right';
let _previewDirLockPos: Point | null = null;
const HYSTERESIS_PX = 8;

export function resetPreviewDirection(): void {
  _previewDirection = 'right';
  _previewDirLockPos = null;
}

/**
 * Compute default anchor points for a cable given its source and dest world positions.
 */
export function computeDefaultAnchors(
  cable: CableData,
  sourcePos: Point,
  destPos: Point
): Point[] {
  return computeSmartRouting(cable, sourcePos, destPos);
}

export function renderCable(cable: CableData, sourcePos: Point, destPos: Point, cableLayer: SVGGElement): SVGGElement {
  const group = createGroup('cable-' + cable.id, 'cable-element');
  setAttributes(group, { 'data-cable-id': cable.id });

  const s = stateManager.getState();
  const isSelected = s.selection.some(item => item.type === 'cable' && item.id === cable.id);
  if (isSelected) {
    group.classList.add('selected');
  }

  // Get material specification profile
  const mat = getMaterialProfile(cable.type);

  const srcPortObj  = cable.sourcePortId ? stateManager.getPort(cable.sourcePortId) : null;
  const srcDevObj   = srcPortObj ? stateManager.getDevice(srcPortObj.deviceId) : null;
  const srcTpl      = srcDevObj ? getTemplate(srcDevObj.templateId, s.customTemplates || []) : null;

  const dstPortObj  = cable.destPortId ? stateManager.getPort(cable.destPortId) : null;
  const dstDevObj   = dstPortObj ? stateManager.getDevice(dstPortObj.deviceId) : null;
  const dstTpl      = dstDevObj ? getTemplate(dstDevObj.templateId, s.customTemplates || []) : null;

  const isCompactCategory = (category: string | undefined): boolean => {
    if (!category) return true; // Custom switches and airdrop endpoints default to compact
    const cat = category.toLowerCase();
    return cat !== 'server' && cat !== 'storage' && cat !== 'pdu' && cat !== 'ups';
  };
  const srcCompact  = isCompactCategory(srcTpl?.category);
  const dstCompact  = isCompactCategory(dstTpl?.category);

  const cableType = cable.type || 'general';
  const typeClass = classifyCableConnector(cableType);
  const isSFP = typeClass.isSFP;
  const isFiber = typeClass.isFiber;
  const isPower = cable.powerCableType === 'power'
    || !!cable.sourcePortId?.startsWith('outlet-')
    || !!cable.destPortId?.startsWith('outlet-')
    || typeClass.isPower;
  const isEthernet = !isFiber && !isPower && !isSFP;

  const srcHasOverride = cable.sourceOrientation && cable.sourceOrientation !== 'auto';
  const srcOrient = (!cable.sourcePortId && !srcHasOverride)
    ? (isPower ? 'down' : (Math.abs(destPos.x - sourcePos.x) > Math.abs(destPos.y - sourcePos.y)
        ? (destPos.x >= sourcePos.x ? 'left' : 'right')
        : (destPos.y >= sourcePos.y ? 'up' : 'down')))
    : getPortOrientation(cable, 'source');

  const destHasOverride = cable.destOrientation && cable.destOrientation !== 'auto';
  const destOrient = (!cable.destPortId && !destHasOverride)
    ? (isPower ? 'down' : (Math.abs(destPos.x - sourcePos.x) > Math.abs(destPos.y - sourcePos.y)
        ? (destPos.x >= sourcePos.x ? 'right' : 'left')
        : (destPos.y >= sourcePos.y ? 'down' : 'up')))
    : getPortOrientation(cable, 'dest');

  // Dynamic scale calculation based on device type and port pitch to avoid oversized connectors
  const getPortConnectorScale = (portId: string | null): number => {
    if (!portId) return 1.0;
    if (portId.includes('-ear-')) {
      // Ear port: compact vertical column, scale to 0.58 so it fits perfectly without obscuring port labels
      return 0.58;
    }
    const portObj = stateManager.getPort(portId);
    if (!portObj) return 1.0;
    const devObj = stateManager.getDevice(portObj.deviceId);
    if (!devObj) return 1.0;
    const tpl = getTemplate(devObj.templateId, s.customTemplates || []);
    const isServer = devObj.templateId.includes('server') || tpl?.category === 'server' || tpl?.category === 'storage';
    if (isServer) {
      const totalPorts = (devObj.ports?.length || tpl?.ports?.length || 1);
      if (totalPorts >= 8) return 0.65;
      if (totalPorts >= 4) return 0.75;
      return 0.85;
    }
    const isCompact = isCompactCategory(tpl?.category);
    return isCompact ? 1.0 : 1.1;
  };

  const srcScale = getPortConnectorScale(cable.sourcePortId);
  const dstScale = getPortConnectorScale(cable.destPortId);

  let effectiveSrcPos = { ...sourcePos };
  let srcExitDir: 'up' | 'down' | 'left' | 'right' = 'down';

  if (srcOrient === 'left') {
    srcExitDir = 'left';
    const L = 11.0 * srcScale;
    effectiveSrcPos.x -= L;
  } else if (srcOrient === 'right') {
    srcExitDir = 'right';
    const L = 11.0 * srcScale;
    effectiveSrcPos.x += L;
  } else if (srcOrient === 'up') {
    srcExitDir = 'up';
    const L = 11.0 * srcScale;
    effectiveSrcPos.y -= L;
  } else if (srcOrient === 'down') {
    srcExitDir = 'down';
    const L = 11.0 * srcScale;
    effectiveSrcPos.y += L;
  } else {
    srcExitDir = 'up';
    const L = 11.0 * srcScale;
    effectiveSrcPos.y -= L;
  }

  let effectiveDestPos = { ...destPos };
  let destExitDir: 'up' | 'down' | 'left' | 'right' = 'down';

  if (destOrient === 'left') {
    destExitDir = 'left';
    const L = 11.0 * dstScale;
    effectiveDestPos.x -= L;
  } else if (destOrient === 'right') {
    destExitDir = 'right';
    const L = 11.0 * dstScale;
    effectiveDestPos.x += L;
  } else if (destOrient === 'up') {
    destExitDir = 'up';
    const L = 11.0 * dstScale;
    effectiveDestPos.y -= L;
  } else if (destOrient === 'down') {
    destExitDir = 'down';
    const L = 11.0 * dstScale;
    effectiveDestPos.y += L;
  } else {
    destExitDir = 'up';
    const L = 11.0 * dstScale;
    effectiveDestPos.y -= L;
  }

  // Always recompute fresh routing anchors unless user explicitly locked them via dragging
  // This ensures routing algorithm changes always apply to existing cables
  const anchors: Point[] = (cable.anchorsLocked && cable.anchorPoints && cable.anchorPoints.length > 0)
    ? cable.anchorPoints
    : computeSmartRouting(cable, effectiveSrcPos, effectiveDestPos);

  // Full ordered points: source → anchors → dest
  const allPoints: Point[] = [effectiveSrcPos, ...anchors, effectiveDestPos];

  const bendR = cable.bendRadius ?? RACK_CONSTANTS.CABLE_BEND_RADIUS;
  const pathData = generateOrthogonalPath(
    allPoints[0],
    allPoints[allPoints.length - 1],
    allPoints.slice(1, -1),
    bendR
  );

  // Get validation alerts for this cable
  const alerts = s.validationAlerts.filter(a => a.targetId === cable.id);
  const hasError = alerts.some(a => a.type === 'error');
  const hasWarning = alerts.some(a => a.type === 'warning');

  // Render neon error glow underlay if there is validation issue
  if (hasError || hasWarning) {
    const errorPulseColor = hasError ? '#ef5350' : '#ffa726';
    const underlayGlow = createPath(pathData, {
      fill: 'none',
      stroke: errorPulseColor,
      'stroke-width': ((cable.thickness && cable.thickness > 0) ? cable.thickness : 2) + 6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: 0.3,
      style: 'animation: pulse-glow 1.5s infinite alternate;',
      'pointer-events': 'none'
    });
    group.appendChild(underlayGlow);
  }

  // Detect power cable override
  const isPowerCable = cable.powerCableType === 'power'
    || cable.type === 'power'
    || cable.type?.startsWith('power-')
    || isPower;

  // Power Cabling Standard (Application Rule Book):
  // - Primary Feed A: Red (#dc2626) with distinct Primary Power pattern (long dash)
  // - Secondary Feed B: Blue (#2563eb) with distinct Secondary Power stitch pattern (short stitch)
  const cName = (cable.name || '').toLowerCase();
  const sPort = (cable.sourcePortId || '').toLowerCase();
  const dPort = (cable.destPortId || '').toLowerCase();

  const isFeedB = cName.includes('feed b') || cName.includes('feed-b') || cName.includes('psu 2') || cName.includes('psu-2') || cName.includes('psu-b') ||
                  sPort.includes('psu-b') || sPort.includes('psu-2') || sPort.includes('feed-b') ||
                  dPort.includes('feed-b') || dPort.includes('pdu-b') || dPort.includes('pdu-hyperv-b') || dPort.includes('pdu-px-b') || dPort.includes('pdu-h100-b') || dPort.includes('pdu-ceph-feed-b');

  const isFeedA = !isFeedB && (
                  cName.includes('feed a') || cName.includes('feed-a') || cName.includes('psu 1') || cName.includes('psu-1') || cName.includes('psu-a') ||
                  sPort.includes('psu-a') || sPort.includes('psu-1') || sPort.includes('feed-a') ||
                  dPort.includes('feed-a') || dPort.includes('pdu-a') || dPort.includes('pdu-hyperv-a') || dPort.includes('pdu-px-a') || dPort.includes('pdu-h100-a') || dPort.includes('pdu-ceph-feed-a')
  );

  let powerColor = cable.color || '#dc2626';
  let powerDash: string | undefined = undefined;

  if (isPowerCable) {
    if (isFeedB) {
      powerColor = (!cable.color || cable.color === '#1e293b' || cable.color === '#212529') ? '#2563eb' : cable.color;
      powerDash = '4 4'; // Distinct Secondary Feed B stitch pattern
    } else {
      powerColor = (!cable.color || cable.color === '#1e293b' || cable.color === '#212529') ? '#dc2626' : cable.color;
      powerDash = '12 4'; // Distinct Primary Feed A pattern
    }
  }

  const effectiveThickness = (cable.thickness && cable.thickness > 0) ? cable.thickness : 2.0;
  const baseColor = isPowerCable ? powerColor : (cable.color || mat.defaultColor);

  // 1. Soft Ambient Optical Drop Shadow (directional shadow onto rack background)
  const shadowPath = createPath(pathData, {
    fill: 'none',
    stroke: 'rgba(0, 0, 0, 0.32)',
    'stroke-width': effectiveThickness + 0.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    style: 'transform: translate(0.8px, 1.2px); pointer-events: none;'
  });
  group.appendChild(shadowPath);

  // 2. Darkened Underbelly / Self-Shading (creates 3D cylindrical roundness along lower edge)
  const underbellyShading = createPath(pathData, {
    fill: 'none',
    stroke: 'rgba(5, 8, 15, 0.55)',
    'stroke-width': effectiveThickness,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    style: 'transform: translate(0.3px, 0.4px); pointer-events: none;'
  });
  group.appendChild(underbellyShading);

  // 3. Rich Saturated PVC Cable Jacket Core (full vibrant cable color)
  const path = createPath(pathData, {
    fill: 'none',
    stroke: baseColor,
    'stroke-width': effectiveThickness,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'pointer-events': 'none',
    opacity: 1.0,
    ...(isPowerCable && powerDash ? { 'stroke-dasharray': powerDash } : {})
  });
  group.appendChild(path);

  // Invisible wide hit target for easier mouse clicking/selecting
  const hitTarget = createPath(pathData, {
    fill: 'none',
    stroke: 'transparent',
    'stroke-width': Math.max(14, effectiveThickness + 10),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'pointer-events': 'stroke',
    class: 'cable-hit-target'
  });
  group.appendChild(hitTarget);

  // Preview highlight: yellow glow if cable is in previewDiff
  const previewDiff = stateManager.getState().previewDiff;
  if (previewDiff?.diff) {
    const pd = previewDiff.diff;
    const cableId = cable.id;
    const isAffected =
      pd.removeCables?.includes(cableId) ||
      pd.updateCables?.some(u => u.id === cableId) ||
      pd.updateAnchors?.some(u => u.cableId === cableId);

    if (isAffected) {
      const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glowPath.setAttribute('d', pathData);
      glowPath.setAttribute('fill', 'none');
      glowPath.setAttribute('stroke', '#ffd600');
      glowPath.setAttribute('stroke-width', String(effectiveThickness + 4));
      glowPath.setAttribute('opacity', '0.45');
      glowPath.setAttribute('pointer-events', 'none');
      group.insertBefore(glowPath, group.firstChild);
    }
  }

  // 4. Photorealistic Cylindrical Specular Highlights (Top-Edge Reflection)
  const finish = cable.finish || s.selectedCableFinish || 'gloss';

  if (finish === 'gloss') {
    // High-Gloss Polymer PVC: Soft top sheen + fine specular reflection ridge (NO white glow or core wash-out)
    const glossSheen = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.32)',
      'stroke-width': effectiveThickness * 0.32,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: 'transform: translate(-0.5px, -0.5px); pointer-events: none;'
    });
    group.appendChild(glossSheen);

    const glossRidge = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.65)',
      'stroke-width': Math.max(0.5, effectiveThickness * 0.14),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: 'transform: translate(-0.7px, -0.7px); pointer-events: none;'
    });
    group.appendChild(glossRidge);
  } else if (finish === 'bright') {
    // Bright Sheen: Smooth top-edge light reflection
    const brightHighlight = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.28)',
      'stroke-width': effectiveThickness * 0.30,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: 'transform: translate(-0.5px, -0.5px); pointer-events: none;'
    });
    group.appendChild(brightHighlight);
  } else if (finish === 'satin') {
    // Satin Finish: Soft diffuse top luster
    const satinBevel = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.16)',
      'stroke-width': effectiveThickness * 0.32,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: 'transform: translate(-0.4px, -0.4px); pointer-events: none;'
    });
    group.appendChild(satinBevel);
  } else {
    // Matte Finish: Flat anti-glare subtle top curve
    const matteBevel = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.06)',
      'stroke-width': effectiveThickness * 0.25,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      style: 'transform: translate(-0.3px, -0.3px); pointer-events: none;'
    });
    group.appendChild(matteBevel);
  }

  // Animated Data Packet Flow Overlay
  if (cable.animatedFlow || cable.status === 'active') {
    const flowLine = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.85)',
      'stroke-width': effectiveThickness * 0.35,
      'stroke-linecap': 'round',
      'stroke-dasharray': '4, 10',
      'class': 'cable-flow-line',
      style: 'pointer-events: none;'
    });
    group.appendChild(flowLine);
  }


  // Source connector
  const srcConnectorOrient = isEthernet ? `inward-${srcExitDir}` : srcExitDir;
  group.appendChild(createConnector(sourcePos, cable.color, srcConnectorOrient, isFiber, isPower, isSFP, srcCompact, cable.plugType, srcScale));

  // Dest connector
  const destConnectorOrient = isEthernet ? `inward-${destExitDir}` : destExitDir;
  group.appendChild(createConnector(destPos, cable.color, destConnectorOrient, isFiber, isPower, isSFP, dstCompact, cable.plugType, dstScale));

  // Render tip drag handles only when the cable is selected — a finished Airdrop-Destination
  // cable (destPortId null, floatingDest set permanently) previously kept the glowing handle dot
  // showing forever, since `!cable.destPortId` was always true for it; now the destination
  // connector alone represents a "finished" floating cable, and the handle only reappears (to
  // drag the end onto a real port later) once the cable is actually selected — same as a cable
  // with a real destination port already behaved.
  if (isSelected) {
    const activeEnd = s.activeCableEnd || 'dest';
    group.appendChild(createDragHandle(sourcePos, cable.id, 'source', cable.color, activeEnd === 'source'));
    group.appendChild(createDragHandle(destPos, cable.id, 'dest', cable.color, activeEnd === 'dest'));
  }

  // Render bundle velcro wraps if bundled
  if (cable.bundleId) {
    const bundle = s.bundles.find(b => b.id === cable.bundleId);
    if (bundle) {
      const wrapIndices = [Math.floor(anchors.length * 0.3), Math.floor(anchors.length * 0.7)];
      wrapIndices.forEach(idx => {
        const pt = anchors[idx];
        if (pt) {
          const wrapGroup = createGroup();
          setAttributes(wrapGroup, { transform: `translate(${pt.x}, ${pt.y})`, style: 'pointer-events: none;' });
          const strap = createSVGEl('rect', {
            x: -6, y: -4, width: 12, height: 8,
            fill: bundle.color || '#222',
            stroke: '#ffffff',
            'stroke-width': 0.5,
            rx: 2
          });
          const stitch = createLine(-6, 0, 6, 0, {
            stroke: 'rgba(255,255,255,0.4)',
            'stroke-dasharray': '2,2'
          });
          wrapGroup.appendChild(strap);
          wrapGroup.appendChild(stitch);
          group.appendChild(wrapGroup);
        }
      });
    }
  }




  // When selected: render draggable diamond anchor handles + anchor connector lines
  if (isSelected) {
    const anchorConnLine = createPath(pathData, {
      fill: 'none',
      stroke: cable.color,
      'stroke-width': 1,
      opacity: 0.25,
      'stroke-dasharray': '4,3',
      'stroke-linecap': 'round'
    });
    group.appendChild(anchorConnLine);

    // Render an anchor handle for every waypoint/bend point in the route
    anchors.forEach((pt, idx) => {
      if (!pt) return;
      const anchorGroup = createGroup(`cable-anchor-${cable.id}-${idx}`, 'cable-anchor-handle');
      setAttributes(anchorGroup, {
        'data-cable-id': cable.id,
        'data-anchor-index': String(idx),
        'data-anchor-real-index': String(idx),
        transform: `translate(${pt.x}, ${pt.y})`,
        style: 'cursor: grab;'
      });

      const glow = createSVGEl('circle', {
        cx: 0, cy: 0, r: 10,
        fill: cable.color, opacity: 0.2
      });

      const size = 6;
      const diamond = createSVGEl('polygon', {
        points: `0,${-size} ${size},0 0,${size} ${-size},0`,
        fill: '#1a1a2e',
        stroke: cable.color,
        'stroke-width': 2
      });

      const dot = createSVGEl('circle', {
        cx: 0, cy: 0, r: 2,
        fill: cable.color
      });

      const label = createSVGEl('text', {
        x: 12, y: 4,
        'font-size': '9',
        fill: cable.color,
        'font-family': 'monospace',
        'font-weight': 'bold',
        opacity: 0.85
      });
      label.textContent = `A${idx + 1}`;

      anchorGroup.appendChild(glow);
      anchorGroup.appendChild(diamond);
      anchorGroup.appendChild(dot);
      anchorGroup.appendChild(label);
      group.appendChild(anchorGroup);
    });
  }

  // Add native SVG hover tooltip with physical & logical properties
  const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  const vlanPart = cable.vlan ? ` | VLAN: ${cable.vlan}` : '';
  const portGroupPart = cable.portGroup ? ` | Port Group: ${cable.portGroup}` : '';
  titleEl.textContent = `${cable.name || 'Cable ' + cable.id} [${cable.type}]${vlanPart}${portGroupPart}`;
  group.appendChild(titleEl);

  cableLayer.appendChild(group);
  return group;
}

export function renderCableInProgress(sourcePos: Point, currentPos: Point, cableType: CableType, cableLayer: SVGGElement): SVGGElement {
  const group = createGroup('cable-in-progress', 'cable-in-progress');

  // Direction-aware exit with 8px hysteresis
  const rawDir = getExitDirection(sourcePos, currentPos);
  if (_previewDirLockPos === null) {
    _previewDirection = rawDir;
    _previewDirLockPos = currentPos;
  } else {
    const dx = Math.abs(currentPos.x - _previewDirLockPos.x);
    const dy = Math.abs(currentPos.y - _previewDirLockPos.y);
    if (dx > HYSTERESIS_PX || dy > HYSTERESIS_PX) {
      _previewDirection = rawDir;
      _previewDirLockPos = currentPos;
    }
  }
  const exitOffset = 18;
  let exitPoint: Point;
  switch (_previewDirection) {
    case 'up':    exitPoint = { x: sourcePos.x, y: sourcePos.y - exitOffset }; break;
    case 'down':  exitPoint = { x: sourcePos.x, y: sourcePos.y + exitOffset }; break;
    case 'left':  exitPoint = { x: sourcePos.x - exitOffset, y: sourcePos.y }; break;
    case 'right': exitPoint = { x: sourcePos.x + exitOffset, y: sourcePos.y }; break;
  }

  const s = stateManager.getState();
  const mat = getMaterialProfile(cableType);
  const strokeColor = s.selectedCableColor || CABLE_COLORS[cableType] || CABLE_COLORS.general || mat.defaultColor;

  const pathData = generateOrthogonalPath(sourcePos, currentPos, [exitPoint], 10);

  // Render dashed preview line representing CAT6 wire length
  const line = createPath(pathData, {
    fill: 'none',
    stroke: strokeColor,
    'stroke-width': 2.5,
    'stroke-dasharray': '5,3',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  });
  group.appendChild(line);

  // Render high-fidelity connector plug slightly offset from the cursor position so it is not hidden under the pointer
  const isSFP = ['sfp', 'sfp-plus', 'sfp28', 'qsfp', 'qsfp28', 'dac-twinax'].some(t => cableType.includes(t));
  const isFiber = ['om3', 'om4', 'om5', 'fiber', 'lc', 'sc'].some(t => cableType.includes(t));
  const isPower = ['power', 'pwr', 'c13', 'c14', 'c19', 'c13-power', 'c19-power'].some(t => cableType.includes(t));

  const mouseDirection = _previewDirection;
  const offsetPos = {
    x: currentPos.x + (mouseDirection === 'right' ? -15 : mouseDirection === 'left' ? 15 : 0),
    y: currentPos.y + (mouseDirection === 'down' ? -15 : mouseDirection === 'up' ? 15 : 12)
  };
  const connector = createConnector(offsetPos, strokeColor, mouseDirection, isFiber, isPower, isSFP);
  group.appendChild(connector);

  cableLayer.appendChild(group);
  return group;
}

/**
 * High-Fidelity Enterprise RJ45 Ethernet Connector
 * Features T568B wire core, 50µ gold contact pins with bevel tip highlights,
 * clear polycarbonate crystal body, glass sheen overlays, snagless latch release,
 * and molded rubber strain-relief boot with flex collar ridges.
 */





/**
 * Fiber Duplex LC/SC Connector
 */
function createFiberConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right' | string): SVGGElement {
  const g = createGroup();
  let rot = 0;
  if (orientation === 'down' || orientation === 'inward-down') rot = 0;
  else if (orientation === 'up' || orientation === 'inward-up') rot = 180;
  else if (orientation === 'right' || orientation === 'inward-right') rot = -90;
  else if (orientation === 'left' || orientation === 'inward-left') rot = 90;
  setAttributes(g, { transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(0.38) translate(-15, -14)` });

  // Duplex Ceramic Ferrules
  const ferrule1 = createRect(10, 4, 4, 10, { fill: '#ffffff', stroke: '#90caf9', 'stroke-width': 0.8, rx: 1 });
  const ferrule2 = createRect(16, 4, 4, 10, { fill: '#ffffff', stroke: '#90caf9', 'stroke-width': 0.8, rx: 1 });
  g.appendChild(ferrule1);
  g.appendChild(ferrule2);

  // Duplex Connector Housing
  const body = createRect(8, 14, 14, 18, { fill: '#00bcd4', stroke: '#00838f', 'stroke-width': 1, rx: 1.5 });
  g.appendChild(body);

  // Optical Boot
  const boot = createRect(10, 32, 10, 14, { fill: color || '#00acc1', stroke: '#006064', 'stroke-width': 0.8, rx: 2 });
  g.appendChild(boot);

  return g;
}

/**
 * SFP+ / QSFP28 Metallic Transceiver Cage Connector
 */
function createSFPConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right' | string): SVGGElement {
  const g = createGroup();
  let rot = 0;
  if (orientation === 'down' || orientation === 'inward-down') rot = 0;
  else if (orientation === 'up' || orientation === 'inward-up') rot = 180;
  else if (orientation === 'right' || orientation === 'inward-right') rot = -90;
  else if (orientation === 'left' || orientation === 'inward-left') rot = 90;
  setAttributes(g, { transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(0.36) translate(-20, -14)` });

  // Metallic Zinc Alloy Transceiver Casing
  const body = createRect(11, 10, 18, 26, {
    fill: '#b0b8c0',
    stroke: '#37474f',
    'stroke-width': 1.2,
    rx: 1, ry: 1
  });
  g.appendChild(body);

  // Specular metallic highlight stripe
  const metallicSheen = createRect(13, 11, 4, 24, {
    fill: 'rgba(255, 255, 255, 0.45)'
  });
  g.appendChild(metallicSheen);

  // Pull-Tab Latch Release (Color-coded bail latch)
  const bailLatch = createRect(13, 4, 14, 6, {
    fill: color || '#00acc1',
    stroke: '#102030',
    'stroke-width': 0.8,
    rx: 1.5
  });
  g.appendChild(bailLatch);

  // Optical Boot
  const boot = createRect(14, 36, 12, 16, {
    fill: color || '#00acc1',
    stroke: '#102030',
    'stroke-width': 0.8,
    rx: 2
  });
  g.appendChild(boot);

  return g;
}

/**
 * IEC C13/C14 & C19 Power Connector
 */
function createPowerConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right', plugType?: string): SVGGElement {
  const g = createGroup();
  let rot = 0;
  if (orientation === 'down') rot = 0;
  else if (orientation === 'up') rot = 180;
  else if (orientation === 'right') rot = -90;
  else if (orientation === 'left') rot = 90;
  setAttributes(g, { transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(0.38) translate(-15, -16)` });

  const pt = (plugType ?? '').toUpperCase();
  const isC19 = pt.includes('C19');
  const isIndian = pt.includes('IS6538') || pt.includes('IS1293');
  const isNEMA = !isIndian && (pt.includes('NEMA') || pt.includes('BS') || pt.includes('SCHUKO'));

  if (isC19) {
    // C19 plug housing (inserted)
    g.appendChild(createRect(4, 6, 22, 20, { fill: '#14181c', stroke: '#080b0e', 'stroke-width': 1.2, rx: 2 }));
    g.appendChild(createRect(7, 10, 16, 12, { fill: '#1f262d', stroke: '#2a343d', 'stroke-width': 0.6, rx: 1.5 }));
    for (let i = 0; i < 3; i++) {
      g.appendChild(createRect(6, 11 + i * 4, 18, 1.2, { fill: '#0a0d10' }));
    }
  } else if (isIndian) {
    const cx = 15, cy = 16, r = 11;
    g.appendChild(createSVGEl('circle', { cx, cy, r, fill: '#14181c', stroke: '#080b0e', 'stroke-width': 1.2 }));
    g.appendChild(createSVGEl('circle', { cx, cy, r: r - 2.5, fill: '#1f262d', stroke: '#2a343d', 'stroke-width': 0.6 }));
  } else if (isNEMA) {
    g.appendChild(createRect(5, 6, 20, 20, { fill: '#14181c', stroke: '#080b0e', 'stroke-width': 1.2, rx: 4 }));
    g.appendChild(createRect(7, 9, 16, 14, { fill: '#1f262d', stroke: '#2a343d', 'stroke-width': 0.6, rx: 2 }));
  } else {
    // Default IEC C14 Male Plug — inserted flush into socket
    const cx = 15, cy = 16, w = 18, h = 18;
    // Outer molded collar
    g.appendChild(createPath(iecShroudPath(cx, cy, w, h), { fill: '#14181c', stroke: '#080b0e', 'stroke-width': 1.2 }));
    // Molded body face with inner bevel & grip contour
    g.appendChild(createPath(iecShroudPath(cx, cy, w - 3, h - 3), { fill: '#1e242a', stroke: '#2a333d', 'stroke-width': 0.6 }));
    // Textured grip indent / molded insignia
    g.appendChild(createRect(cx - 4, cy - 2, 8, 5, { fill: '#12161a', rx: 1 }));
    g.appendChild(createRect(cx - 3, cy - 1, 6, 1, { fill: '#2e3842' }));
    g.appendChild(createRect(cx - 3, cy + 1, 6, 1, { fill: '#2e3842' }));
  }

  // Molded rubber strain-relief boot (cable exits naturally downwards from the plug body)
  const bootW = 10, bootH = 14;
  g.appendChild(createRect(15 - bootW / 2, 24, bootW, bootH, {
    fill: color || '#ff4422',
    stroke: '#080b0e',
    'stroke-width': 0.8,
    rx: 2
  }));
  // Boot flex ribs
  for (let b = 0; b < 3; b++) {
    g.appendChild(createRect(15 - (bootW - 2) / 2, 26 + b * 3.5, bootW - 2, 1, {
      fill: 'rgba(0, 0, 0, 0.45)'
    }));
  }

  return g;
}

/**
 * Classifies a cable TYPE alone (no full CableData needed) into which connector shape it should
 * draw as — the same substring rules used for real cable endpoints below, factored out so
 * anything that only knows a `CableType` (e.g. the Cable Types legend, which groups by type
 * across many cable instances) can pick the identical connector graphic without duplicating
 * this list. Cable-instance-only signals (`powerCableType`, PDU-outlet port ids) aren't part of
 * this — see the caller below for where those still apply on top of it.
 */
export function classifyCableConnector(cableType: string): { isFiber: boolean; isPower: boolean; isSFP: boolean } {
  const isSFP = ['sfp', 'sfp-plus', 'sfp28', 'qsfp', 'qsfp28', 'dac-twinax'].some(t => cableType.includes(t));
  const isFiber = ['om3', 'om4', 'om5', 'fiber', 'lc', 'sc'].some(t => cableType.includes(t));
  const isPower = ['power', 'pwr', 'c13', 'c14', 'c19', 'c13-power', 'c19-power'].some(t => cableType.includes(t));
  return { isFiber, isPower, isSFP };
}

/**
 * RJ45 "Plugged In" Front-Face View — orientation: 'inward'
 * Renders the connector as if looking straight at it going INTO the port.
 * Shows the translucent tinted crystal body inside socket, molded rubber boot,
 * 3 flex collar ridges, and cable exit sleeve.
 * Supports all 4 orientations (up, down, left, right) with dynamic auto-scaling.
 */
function createEthernetConnectorInward(
  pos: Point,
  color: string,
  orientation: 'up' | 'down' | 'left' | 'right' | string = 'down',
  compact = false,
  customScale?: number
): SVGGElement {
  const g = createGroup();
  const S = customScale !== undefined ? customScale : (compact ? 1.0 : 1.15);
  const mainColor = color || '#7b2fbe';
  const outline = 'rgba(15, 20, 32, 0.85)';

  let rot = 0;
  if (orientation === 'up' || orientation === 'inward-up') {
    rot = 180;
  } else if (orientation === 'down' || orientation === 'inward-down') {
    rot = 0;
  } else if (orientation === 'left' || orientation === 'inward-left') {
    rot = 90;
  } else if (orientation === 'right' || orientation === 'inward-right') {
    rot = -90;
  }

  setAttributes(g, {
    transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(${S})`,
    opacity: '0.98'
  });

  // ── 1. Translucent Polycarbonate Crystal Plug Head (Inside RJ45 Port Socket) ───────
  // Dark socket cavity void
  const socketCavity = createRect(-3.9, -4.4, 7.8, 4.6, {
    fill: 'rgba(8, 12, 20, 0.88)',
    rx: 0.8, ry: 0.8
  });
  g.appendChild(socketCavity);

  // 8 Gilded 50µ Gold Contact Pins inside the socket cavity
  for (let i = 0; i < 8; i++) {
    const px = -2.8 + i * 0.8;
    const pin = createRect(px - 0.25, -4.0, 0.5, 2.2, {
      fill: '#fbbf24',
      stroke: '#b45309',
      'stroke-width': 0.15,
      rx: 0.15
    });
    g.appendChild(pin);
  }

  // Translucent tinted polycarbonate crystal body
  const crystalBody = createRect(-3.8, -4.2, 7.6, 4.4, {
    fill: `${mainColor}38`,
    stroke: `${mainColor}99`,
    'stroke-width': 0.45,
    rx: 0.6, ry: 0.6
  });
  g.appendChild(crystalBody);

  // Translucent inner latch tab
  const innerLatch = createRect(-1.8, -3.6, 3.6, 3.8, {
    fill: `${mainColor}55`,
    stroke: `${mainColor}88`,
    'stroke-width': 0.35,
    rx: 0.4, ry: 0.4
  });
  g.appendChild(innerLatch);

  // ── 2. Molded Matte Rubber Strain-Relief Boot (Upper Collar Block) ──────────
  const bootBlock = createRect(-3.1, 0, 6.2, 4.6, {
    fill: mainColor,
    stroke: outline,
    'stroke-width': 0.5,
    rx: 1.0, ry: 1.0
  });
  g.appendChild(bootBlock);

  // Molded Snagless Latch Arch Cover (center bump)
  const latchArch = createRect(-1.4, -0.6, 2.8, 3.5, {
    fill: mainColor,
    stroke: outline,
    'stroke-width': 0.4,
    rx: 0.7, ry: 0.7
  });
  g.appendChild(latchArch);

  // Soft ambient depth shadow on right side
  const rightShadow = createRect(1.9, 0.3, 1.0, 4.0, {
    fill: 'rgba(0, 0, 0, 0.25)',
    rx: 0.4
  });
  g.appendChild(rightShadow);

  // ── 3. Three Detailed Flex Collar Ridges (Ribs) with Inset Grooves ─────────
  const grooveCore = createRect(-1.7, 4.6, 3.4, 4.3, {
    fill: 'rgba(10, 15, 25, 0.85)',
    rx: 0.3
  });
  g.appendChild(grooveCore);

  // Ridge 1
  const r1 = createRect(-2.6, 4.6, 5.2, 1.3, {
    fill: mainColor, stroke: outline, 'stroke-width': 0.4, rx: 0.5
  });
  const r1Sh = createLine(-2.3, 5.7, 2.3, 5.7, { stroke: 'rgba(0, 0, 0, 0.35)', 'stroke-width': 0.35 });
  g.appendChild(r1); g.appendChild(r1Sh);

  // Ridge 2
  const r2 = createRect(-2.3, 6.1, 4.6, 1.3, {
    fill: mainColor, stroke: outline, 'stroke-width': 0.4, rx: 0.5
  });
  const r2Sh = createLine(-2.0, 7.2, 2.0, 7.2, { stroke: 'rgba(0, 0, 0, 0.35)', 'stroke-width': 0.35 });
  g.appendChild(r2); g.appendChild(r2Sh);

  // Ridge 3
  const r3 = createRect(-2.0, 7.6, 4.0, 1.3, {
    fill: mainColor, stroke: outline, 'stroke-width': 0.4, rx: 0.5
  });
  const r3Sh = createLine(-1.7, 8.7, 1.7, 8.7, { stroke: 'rgba(0, 0, 0, 0.35)', 'stroke-width': 0.35 });
  g.appendChild(r3); g.appendChild(r3Sh);

  // ── 4. Cable Exit Sleeve ──────────────────────────────────────────────────
  const exitSleeve = createRect(-1.6, 9.1, 3.2, 2.0, {
    fill: mainColor,
    stroke: outline,
    'stroke-width': 0.4,
    rx: 0.4
  });
  g.appendChild(exitSleeve);

  return g;
}

export function createConnector(
  pos: Point,
  color: string,
  orientation: 'up' | 'down' | 'left' | 'right' | 'inward' | string,
  isFiber: boolean,
  isPower: boolean,
  isSFP: boolean,
  compact = false,
  plugType?: string,
  customScale?: number
): SVGGElement {
  if (isSFP) return createSFPConnector(pos, color, orientation as any);
  if (isFiber) return createFiberConnector(pos, color, orientation as any);
  if (isPower) return createPowerConnector(pos, color, orientation as any, plugType);
  
  // Standard Default for ALL Ethernet RJ45 cables: inserted inward style
  const dir = orientation.startsWith('inward-')
    ? orientation.split('-')[1]
    : orientation;
  return createEthernetConnectorInward(pos, color, dir, compact, customScale);
}

/**
 * Draggable Endpoint Handle.
 */
function createDragHandle(pos: Point, cableId: string, handleType: 'source' | 'dest', color: string, isActive = false): SVGGElement {
  const handleGroup = createGroup(`cable-handle-${cableId}-${handleType}`, `cable-drag-handle ${isActive ? 'active-endpoint-handle' : ''}`);
  setAttributes(handleGroup, {
    'data-cable-id-handle': cableId,
    'data-handle-type': handleType,
    transform: `translate(${pos.x}, ${pos.y})`,
    style: 'cursor: pointer;'
  });
  const glow = createSVGEl('circle', {
    cx: 0, cy: 0, r: isActive ? 12 : 10,
    fill: color, opacity: isActive ? 0.75 : 0.45,
    class: 'handle-glow',
    stroke: isActive ? '#00e5ff' : 'none',
    'stroke-width': isActive ? 1.5 : 0
  });
  const core = createSVGEl('circle', {
    cx: 0, cy: 0, r: isActive ? 6 : 5,
    fill: isActive ? '#00e5ff' : '#ffffff',
    stroke: color,
    'stroke-width': 2
  });
  const label = createSVGEl('text', {
    x: 0, y: 3,
    'font-size': '8',
    fill: isActive ? '#000000' : '#1a1a2e',
    'font-family': 'monospace',
    'font-weight': 'bold',
    'text-anchor': 'middle',
    'pointer-events': 'none'
  });
  label.textContent = handleType === 'source' ? '1' : '2';

  handleGroup.appendChild(glow);
  handleGroup.appendChild(core);
  handleGroup.appendChild(label);
  return handleGroup;
}
