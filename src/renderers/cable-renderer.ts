import { CableData, Point, CableType, RACK_CONSTANTS, CABLE_COLORS } from '../core/types';
import { createGroup, createPath, createRect, createLine, createSVGElement as createSVGEl, setAttributes } from '../utils/svg-helpers';
import { generateOrthogonalPath } from '../utils/geometry';
import { stateManager } from '../core/state';
import { computeSmartRouting, get3DefaultAnchors } from '../utils/routing';
import { getExitDirection } from '../utils/routing';
import { getMaterialProfile } from '../core/cable-materials';
import { getTemplate } from '../library/device-catalog';

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

  // Get material specification profile
  const mat = getMaterialProfile(cable.type);

  // Always recompute fresh routing anchors unless user explicitly locked them via dragging
  // This ensures routing algorithm changes always apply to existing cables
  const anchors: Point[] = (cable.anchorsLocked && cable.anchorPoints && cable.anchorPoints.length > 0)
    ? cable.anchorPoints
    : computeSmartRouting(cable, sourcePos, destPos);


  // Full ordered points: source → anchors → dest
  const allPoints: Point[] = [sourcePos, ...anchors, destPos];

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
      'stroke-width': (cable.thickness || mat.renderThicknessPx || 3) + 6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: 0.4,
      style: 'animation: pulse-glow 1.5s infinite alternate;',
      'stroke-dasharray': '5,5'
    });
    group.appendChild(underlayGlow);
  }

  // Detect power cable override
  const isPowerCable = cable.powerCableType === 'power';
  const powerStrokeColor = cable.color && cable.color !== '#212529' ? cable.color : '#ff4422';
  const effectiveThickness = isPowerCable ? 3 : (cable.thickness || mat.renderThicknessPx || 3);

  // Cable Outer Jacket Shadow (Soft drop-shadow for 3D depth)
  const shadowPath = createPath(pathData, {
    fill: 'none',
    stroke: 'rgba(0, 0, 0, 0.45)',
    'stroke-width': effectiveThickness + 1.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    style: 'transform: translate(1px, 2px); pointer-events: none;'
  });
  group.appendChild(shadowPath);

  // Main cable jacket path (solid PBR core)
  const path = createPath(pathData, {
    fill: 'none',
    stroke: isPowerCable ? powerStrokeColor : (cable.color || mat.defaultColor),
    'stroke-width': effectiveThickness,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...(isPowerCable ? { 'stroke-dasharray': '6 3' } : {})
  });
  group.appendChild(path);

  // Power cable: plug-type label at cable midpoint
  if (isPowerCable && cable.plugType) {
    const midX = (sourcePos.x + destPos.x) / 2;
    const midY = (sourcePos.y + destPos.y) / 2;
    const plugLabel = createSVGEl('text', {
      x: midX,
      y: midY - 5,
      'font-size': '7',
      'font-family': 'monospace',
      fill: powerStrokeColor,
      'text-anchor': 'middle',
      'pointer-events': 'none'
    });
    plugLabel.textContent = String(cable.plugType);
    group.appendChild(plugLabel);
  }

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
      glowPath.setAttribute('stroke-width', String((cable.thickness || mat.renderThicknessPx || 3) + 4));
      glowPath.setAttribute('opacity', '0.4');
      glowPath.setAttribute('pointer-events', 'none');
      group.insertBefore(glowPath, group.firstChild);
    }
  }

  // 3D Specular Highlight path overlay (glassmorphism sheen)
  const highlight = createPath(pathData, {
    fill: 'none',
    stroke: 'rgba(255, 255, 255, 0.35)',
    'stroke-width': (cable.thickness || mat.renderThicknessPx || 3) * 0.32,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    style: 'pointer-events: none;'
  });
  group.appendChild(highlight);

  // Animated Data Packet Flow Overlay
  if (cable.animatedFlow || cable.status === 'active') {
    const flowLine = createPath(pathData, {
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.85)',
      'stroke-width': (cable.thickness || mat.renderThicknessPx || 3) * 0.35,
      'stroke-linecap': 'round',
      'stroke-dasharray': '4, 10',
      'class': 'cable-flow-line',
      style: 'pointer-events: none;'
    });
    group.appendChild(flowLine);
  }

  // Determine port orientation for connector facing direction.
  // Since all cables route HORIZONTALLY first to the side rail hole,
  // connectors must always face left or right (never up/down in auto mode).
  // 'right' orientation → cable exits to the RIGHT  (plug faces left into port)
  // 'left'  orientation → cable exits to the LEFT   (plug faces right into port)
  const getEffectiveOrientation = (
    cable: CableData,
    end: 'source' | 'dest',
    points: Point[]
  ): 'up' | 'down' | 'left' | 'right' => {
    const portId  = end === 'source' ? cable.sourcePortId  : cable.destPortId;
    const isEarPort = portId && portId.includes('-ear-');

    // User explicit override always wins, EXCEPT for ear-ports which have fixed orientations
    const userOverride = end === 'source' ? cable.sourceOrientation : cable.destOrientation;
    if (userOverride && userOverride !== 'auto' && !isEarPort) {
      return userOverride;
    }

    const port    = portId ? stateManager.getPort(portId) : null;
    if (!port) {
      return cable.sidePreference || 'right';
    }

    const device = stateManager.getDevice(port.deviceId);
    const template = device ? getTemplate(device.templateId) : null;
    const height = template ? template.heightUnits * 30 : 30;

    // Check device category formatting rules (PBR rules)
    const isHorizontalDevice = device && (
      device.templateId.includes('server') ||
      template?.category === 'server' ||
      template?.category === 'storage' ||
      template?.category === 'ups'
    );

    // Dynamic flow-based orientation: align with the direction the cable is running!
    if (points.length >= 2) {
      const start = end === 'source' ? points[0] : points[points.length - 1];
      const target = end === 'source' ? points[1] : points[points.length - 2];
      
      const dx = target.x - start.x;
      const dy = target.y - start.y;
      
      if (isEarPort) {
        // Ear ports: horizontal connector, direction from relativeX not dx
        // (cable now routes vertically so dx=0; relativeX tells us which side)
        return port.relativeX > 175 ? 'right' : 'left';
      } else if (isHorizontalDevice) {
        // Servers plug in horizontally, direction follows cable flow
        return dx >= 0 ? 'right' : 'left';
      } else {
        // Switch data ports plug in vertically (up or down)
        return dy >= 0 ? 'up' : 'down';
      }
    }

    // Static fallback if points list is empty
    if (isHorizontalDevice || isEarPort) {
      return port.relativeX > 175 ? 'right' : 'left';
    }
    // Switch/patch panels / other network devices:
    // Top-row port (relativeY < height / 2) -> cable exits UPWARD (orientation 'down')
    // Bottom-row port (relativeY >= height / 2) -> cable exits DOWNWARD (orientation 'up')
    return port.relativeY < height / 2 ? 'down' : 'up';
  };

  const srcOrient  = getEffectiveOrientation(cable, 'source', allPoints);
  const destOrient = getEffectiveOrientation(cable, 'dest', allPoints);

  // Determine connector type from cable type
  const cableType = cable.type || 'general';
  const isSFP = ['sfp', 'sfp-plus', 'sfp28', 'qsfp', 'qsfp28', 'dac-twinax'].some(t => cableType.includes(t));
  const isFiber = ['om3', 'om4', 'om5', 'fiber', 'lc', 'sc'].some(t => cableType.includes(t));
  const isPower = ['power', 'pwr', 'c13', 'c14', 'c19', 'c13-power', 'c19-power'].some(t => cableType.includes(t));

  // Compact connector mode: switch ports have tiny 9px sockets — full-size connectors float above them
  const srcPortObj  = cable.sourcePortId ? stateManager.getPort(cable.sourcePortId) : null;
  const srcDevObj   = srcPortObj ? stateManager.getDevice(srcPortObj.deviceId) : null;
  const srcTpl      = srcDevObj ? getTemplate(srcDevObj.templateId) : null;
  const srcCompact  = srcTpl?.category === 'switch';

  const dstPortObj  = cable.destPortId ? stateManager.getPort(cable.destPortId) : null;
  const dstDevObj   = dstPortObj ? stateManager.getDevice(dstPortObj.deviceId) : null;
  const dstTpl      = dstDevObj ? getTemplate(dstDevObj.templateId) : null;
  const dstCompact  = dstTpl?.category === 'switch';

  // Source connector
  group.appendChild(createConnector(sourcePos, cable.color, srcOrient, isFiber, isPower, isSFP, srcCompact, cable.plugType));

  // Dest connector / draggable handle
  if (cable.destPortId) {
    group.appendChild(createConnector(destPos, cable.color, destOrient, isFiber, isPower, isSFP, dstCompact, cable.plugType));
  }

  // Render tip drag handles (both Source & Destination tip handles) when selected or floating
  if (isSelected || cable.floatingSource) {
    group.appendChild(createDragHandle(sourcePos, cable.id, 'source', cable.color));
  }
  if (isSelected || !cable.destPortId || cable.floatingDest) {
    group.appendChild(createDragHandle(destPos, cable.id, 'dest', cable.color));
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

    // Always show exactly 3 handles (first, middle, last of anchor array).
    // Store real index into the anchor array so drag can update the right point.
    const realIdxA2 = Math.floor(anchors.length / 2);
    const handleDefs = [
      { pt: anchors[0],               realIdx: 0,                   label: 'A1' },
      { pt: anchors[realIdxA2],       realIdx: realIdxA2,           label: 'A2' },
      { pt: anchors[anchors.length - 1], realIdx: anchors.length - 1, label: 'A3' },
    ];

    handleDefs.forEach(({ pt, realIdx }, displayIdx) => {
      if (!pt) return;
      const idx = displayIdx;
      const anchorGroup = createGroup(`cable-anchor-${cable.id}-${idx}`, 'cable-anchor-handle');
      setAttributes(anchorGroup, {
        'data-cable-id': cable.id,
        'data-anchor-index': String(idx),
        'data-anchor-real-index': String(realIdx),
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
  const strokeColor = CABLE_COLORS[cableType] || CABLE_COLORS.general || mat.defaultColor;

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
 * Enterprise Ethernet RJ45 Connector
 * Matches user's exact provided SVG image with dark indigo outer silhouette frame,
 * crystal clear polycarbonate shell, 8 gold contact pins, T568B color-coded wires,
 * inner clamp collar, molded strain-relief boot with center recess box,
 * 2 flex collar ridges, and cylindrical wire jacket.
 */
function createEthernetConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right', compact = false): SVGGElement {
  const g = createGroup();

  let rot = 0;
  if (orientation === 'up')    rot = 0;
  else if (orientation === 'down')  rot = 180;
  else if (orientation === 'right') rot = -90;
  else if (orientation === 'left')  rot = 90;

  // compact=true (switch 1U ports ~9px): scale 0.14.  compact=false (servers): scale 0.28.
  const S = compact ? 0.14 : 0.28;
  const TAIL_Y = 38;     // native y of boot end (cable exit point)
  const CRYSTAL_Y = 17;  // native y of crystal/boot junction

  let ax = pos.x;
  let ay = pos.y;

  // Compact (switch) ports: anchor the crystal/boot junction at the port center — crystal
  // sits inside the drawn socket rectangle, boot visible outside toward the cable.
  // Server ports: anchor the boot tail at port center so cable exits from the boot end.
  const TAIL_OFFSET = compact ? CRYSTAL_Y * S : TAIL_Y * S;
  if (orientation === 'right') ax -= TAIL_OFFSET;
  else if (orientation === 'left')  ax += TAIL_OFFSET;
  else if (orientation === 'up')    ay -= TAIL_OFFSET;
  else if (orientation === 'down')  ay += TAIL_OFFSET;

  setAttributes(g, { transform: `translate(${ax}, ${ay}) rotate(${rot}) scale(${S}) translate(-14, 0)`, opacity: '0.92' });

  const mainColor = color || '#7b2fbe';
  const glassWhite = 'rgba(220, 240, 255, 0.82)';
  const outline = 'rgba(20, 28, 50, 0.75)';

  // ── Outer silhouette shell (semi-transparent) ─────────────────────────────
  const outerShell = createPath('M 7 0 L 21 0 L 22 14 L 23 28 L 20 40 L 20 50 L 8 50 L 8 40 L 5 28 L 6 14 Z', {
    fill: 'rgba(18, 24, 48, 0.6)',
    stroke: outline,
    'stroke-width': 0.8,
  });
  g.appendChild(outerShell);

  // ── Crystal polycarbonate head (highly translucent glass) ─────────────────
  const head = createRect(6, 1, 16, 16, {
    fill: glassWhite,
    stroke: 'rgba(100, 160, 255, 0.5)',
    'stroke-width': 0.7,
    rx: 1.5, ry: 1.5
  });
  g.appendChild(head);

  // ── Primary glass glare (top-left bright reflection) ─────────────────────
  const glare1 = createPath('M 7 2 L 10 2 L 8 16 L 7 16 Z', {
    fill: 'rgba(255, 255, 255, 0.7)'
  });
  g.appendChild(glare1);

  // ── Secondary soft glare (right edge rim light) ───────────────────────────
  const glare2 = createPath('M 19 2 L 21 2 L 21 14 L 20 14 Z', {
    fill: 'rgba(255, 255, 255, 0.35)'
  });
  g.appendChild(glare2);

  // ── 8 ultra-thin gold contact pins ───────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const px = 7.2 + i * 1.65;
    const pin = createRect(px, 2, 0.9, 4.5, {
      fill: '#f5c518',
      stroke: '#b8860b',
      'stroke-width': 0.2,
      rx: 0.1
    });
    g.appendChild(pin);
  }

  // ── T568B micro wires (thin, visible through glass) ───────────────────────
  const wireColors = ['#ff9800','#e65100','#81c784','#1e88e5','#90caf9','#43a047','#d7ccc8','#6d4c41'];
  for (let i = 0; i < 8; i++) {
    const wx = 7.3 + i * 1.65;
    const wire = createLine(wx, 7, wx, 12, {
      stroke: wireColors[i],
      'stroke-width': 0.85,
      'stroke-linecap': 'butt',
      opacity: '0.85'
    });
    g.appendChild(wire);
  }

  // ── Thin latch tab (snagless clip) ────────────────────────────────────────
  const latch = createRect(9, 13, 10, 3, {
    fill: 'rgba(180, 200, 230, 0.6)',
    stroke: 'rgba(100, 140, 200, 0.5)',
    'stroke-width': 0.5,
    rx: 0.8
  });
  g.appendChild(latch);

  // ── Boot body (tapered, semi-transparent jacket) ──────────────────────────
  const boot = createPath('M 6 17 L 22 17 L 21 28 L 19 38 L 9 38 L 7 28 Z', {
    fill: `${mainColor}cc`,   // color + 80% opacity hex
    stroke: outline,
    'stroke-width': 0.6
  });
  g.appendChild(boot);

  // ── Boot gloss highlight ──────────────────────────────────────────────────
  const bootGloss = createPath('M 7 18 L 10 18 L 8 37 L 7 37 Z', {
    fill: 'rgba(255,255,255,0.22)'
  });
  g.appendChild(bootGloss);

  // ── Single slim flex rib ──────────────────────────────────────────────────
  const rib = createRect(8, 31, 12, 2.5, {
    fill: `${mainColor}bb`,
    stroke: outline,
    'stroke-width': 0.5,
    rx: 0.8
  });
  g.appendChild(rib);

  // Tail wire jacket removed (as requested, cable lines render directly out of boot)

  return g;
}




/**
 * Fiber Duplex LC/SC Connector
 */
function createFiberConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right'): SVGGElement {
  const g = createGroup();
  let rot = 0;
  if (orientation === 'up') rot = 0;
  else if (orientation === 'down') rot = 180;
  else if (orientation === 'right') rot = -90;
  else if (orientation === 'left') rot = 90;
  setAttributes(g, { transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(0.38) translate(-15, -4)` });

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
function createSFPConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right'): SVGGElement {
  const g = createGroup();
  let rot = 0;
  if (orientation === 'up') rot = 0;
  else if (orientation === 'down') rot = 180;
  else if (orientation === 'right') rot = -90;
  else if (orientation === 'left') rot = 90;
  setAttributes(g, { transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(0.36) translate(-20, -4)` });

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
  if (orientation === 'up') rot = 0;
  else if (orientation === 'down') rot = 180;
  else if (orientation === 'right') rot = -90;
  else if (orientation === 'left') rot = 90;
  setAttributes(g, { transform: `translate(${pos.x}, ${pos.y}) rotate(${rot}) scale(0.38) translate(-15, -10)` });

  const pt = (plugType ?? '').toUpperCase();
  const isC19 = pt.includes('C19');
  const isNEMA = pt.includes('NEMA') || pt.includes('IS') || pt.includes('BS') || pt.includes('SCHUKO');

  // IEC body shape: C19 uses rect, C13/C14/C15 uses rect with cut corners, NEMA uses rounded
  if (isC19) {
    // C19 body — wider rect
    g.appendChild(createRect(4, 8, 22, 22, { fill: '#1b2a32', stroke: '#0a1a22', 'stroke-width': 1.2, rx: 2 }));
    // Horizontal slots (L, N, Earth)
    g.appendChild(createRect(7,  15, 6, 2, { fill: '#000', rx: 0.4 }));
    g.appendChild(createRect(17, 15, 6, 2, { fill: '#000', rx: 0.4 }));
    g.appendChild(createRect(12, 22, 6, 2, { fill: '#000', rx: 0.4 }));
  } else if (isNEMA) {
    // NEMA/Schuko/BS — rounded rect
    g.appendChild(createRect(5, 8, 20, 22, { fill: '#1b2a32', stroke: '#0a1a22', 'stroke-width': 1.2, rx: 6 }));
    // Blade slots (vertical)
    g.appendChild(createRect(8,  14, 3, 7, { fill: '#000', rx: 0.4 }));
    g.appendChild(createRect(19, 14, 3, 7, { fill: '#000', rx: 0.4 }));
    // Ground hole (center)
    g.appendChild(createSVGEl('circle', { cx: 15, cy: 25, r: 2, fill: '#000' }));
  } else {
    // Default C13/C14/C15 — trapezoidal IEC body with vertical slots
    g.appendChild(createRect(6, 10, 18, 20, { fill: '#1b2a32', stroke: '#0a1a22', 'stroke-width': 1.2, rx: 2 }));
    // Vertical slots (L, N, Earth)
    g.appendChild(createRect(8,   14, 3, 6, { fill: '#000', rx: 0.4 }));
    g.appendChild(createRect(19,  14, 3, 6, { fill: '#000', rx: 0.4 }));
    g.appendChild(createRect(13.5, 21, 3, 5, { fill: '#000', rx: 0.4 }));
  }

  // Rubber boot / cable strain relief
  g.appendChild(createRect(8, 30, 14, 14, { fill: color || '#212529', stroke: '#000', 'stroke-width': 0.8, rx: 2 }));

  return g;
}

/**
 * Route to correct connector renderer.
 */
function createConnector(pos: Point, color: string, orientation: 'up' | 'down' | 'left' | 'right', isFiber: boolean, isPower: boolean, isSFP: boolean, compact = false, plugType?: string): SVGGElement {
  if (isSFP) return createSFPConnector(pos, color, orientation);
  if (isFiber) return createFiberConnector(pos, color, orientation);
  if (isPower) return createPowerConnector(pos, color, orientation, plugType);
  return createEthernetConnector(pos, color, orientation, compact);
}

/**
 * Draggable Endpoint Handle.
 */
function createDragHandle(pos: Point, cableId: string, handleType: 'source' | 'dest', color: string): SVGGElement {
  const handleGroup = createGroup(`cable-handle-${cableId}-${handleType}`, 'cable-drag-handle');
  setAttributes(handleGroup, {
    'data-cable-id-handle': cableId,
    'data-handle-type': handleType,
    transform: `translate(${pos.x}, ${pos.y})`,
    style: 'cursor: pointer;'
  });
  const glow = createSVGEl('circle', {
    cx: 0, cy: 0, r: 10,
    fill: color, opacity: 0.45,
    class: 'handle-glow'
  });
  const core = createSVGEl('circle', {
    cx: 0, cy: 0, r: 5,
    fill: '#ffffff',
    stroke: color,
    'stroke-width': 2
  });
  handleGroup.appendChild(glow);
  handleGroup.appendChild(core);
  return handleGroup;
}
