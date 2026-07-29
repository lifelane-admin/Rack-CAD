import { DeviceData, DeviceCategory, RACK_CONSTANTS, AppState } from '../core/types';
import { createGroup, createRect, createCircle, createLinearGradient, createSVGElement, setAttributes } from '../utils/svg-helpers';
import { getTemplate } from '../library/device-catalog';
import { renderPorts } from './port-renderer';
import { renderFrontPanel } from './panel-renderer';
import { stateManager } from '../core/state';

export function renderDevice(device: DeviceData, rackX: number, rackY: number, rackUnits: number, stateOverride?: Partial<AppState>): SVGGElement {
  const template = getTemplate(device.templateId);
  const heightUnits = template?.heightUnits || 1;
  const category: DeviceCategory = template?.category ?? 'server';

  const innerX = rackX + (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2;
  const deviceX = innerX + RACK_CONSTANTS.RAIL_WIDTH;
  const deviceWidth = RACK_CONSTANTS.RACK_INNER_WIDTH - 2 * RACK_CONSTANTS.RAIL_WIDTH; // 350
  const deviceHeight = heightUnits * RACK_CONSTANTS.RU_HEIGHT;

  const deviceY = rackY + RACK_CONSTANTS.RACK_PADDING_TOP + (rackUnits - device.startUnit - heightUnits + 1) * RACK_CONSTANTS.RU_HEIGHT;

  const deviceGroup = createGroup('device-' + device.id, 'device');
  setAttributes(deviceGroup, {
    transform: `translate(${deviceX}, ${deviceY})`,
    'data-device-id': device.id
  });

  const state = { ...stateManager.getState(), ...stateOverride };
  const isRearView = state.cabinetViewMode === 'rear';
  const isSkeleton = state.cabinetDrawMode === 'skeleton';

  // Local definitions for gradients/filters
  const defs = createSVGElement('defs');
  
  // Metallic ear gradient
  const earGrad = createLinearGradient('ear-grad-' + device.id, [
    { offset: '0%', color: '#4a4a4f' },
    { offset: '50%', color: '#88888f' },
    { offset: '100%', color: '#3a3a3f' }
  ]);
  earGrad.setAttribute('x1', '0%');
  earGrad.setAttribute('y1', '0%');
  earGrad.setAttribute('x2', '100%');
  earGrad.setAttribute('y2', '0%');
  
  defs.appendChild(earGrad);
  deviceGroup.appendChild(defs);

  // === RENDER RACK MOUNTING EARS (extends onto rails) ===
  const railW = RACK_CONSTANTS.RAIL_WIDTH;
  
  // Left Ear
  const leftEar = createRect(-railW, 0, railW, deviceHeight, {
    fill: isSkeleton ? 'rgba(56, 189, 248, 0.05)' : `url(#ear-grad-${device.id})`,
    stroke: isSkeleton ? '#38bdf8' : '#1a1a1f',
    'stroke-width': 1,
    rx: 2,
    ry: 2
  });
  deviceGroup.appendChild(leftEar);
  
  // Right Ear
  const rightEar = createRect(deviceWidth, 0, railW, deviceHeight, {
    fill: isSkeleton ? 'rgba(56, 189, 248, 0.05)' : `url(#ear-grad-${device.id})`,
    stroke: isSkeleton ? '#38bdf8' : '#1a1a1f',
    'stroke-width': 1,
    rx: 2,
    ry: 2
  });
  deviceGroup.appendChild(rightEar);

  // === RENDER MAIN PANEL BODY ===
  const hasCustomImage = !!(device.frontPanelImage || template?.frontPanelImage);
  
  if (isSkeleton) {
    // Skeleton Wireframe Chassis
    const panelBg = createRect(0, 0, deviceWidth, deviceHeight, {
      fill: 'rgba(56, 189, 248, 0.04)',
      stroke: '#38bdf8',
      'stroke-width': 1.5,
      'stroke-dasharray': '4,3',
      rx: 1,
      ry: 1
    });
    deviceGroup.appendChild(panelBg);
    
    // Draw visual grid inside wireframe
    for (let x = 30; x < deviceWidth; x += 60) {
      deviceGroup.appendChild(createSVGElement('line', {
        x1: x, y1: 2, x2: x, y2: deviceHeight - 2,
        stroke: '#38bdf8', 'stroke-width': 0.4, opacity: 0.25
      }));
    }
  } else if (isRearView) {
    // Rear View Mode: Draw PSUs, Fan bays, and PCIe slots
    const panelBg = createRect(0, 0, deviceWidth, deviceHeight, {
      fill: '#15171a',
      stroke: '#000000',
      'stroke-width': 1.2,
      rx: 1,
      ry: 1
    });
    deviceGroup.appendChild(panelBg);

    // Draw redundant PSUs for server/ups/pdu/storage/cooling/firewall
    if (category !== 'switch' && category !== 'patch-panel' && category !== 'cable-manager' && category !== 'blank-panel') {
      // Left PSU
      const psuLeft = createGroup(device.id + '-psu-l', 'psu-module');
      psuLeft.appendChild(createRect(8, 4, 38, deviceHeight - 8, { fill: '#282b30', stroke: '#111', rx: 1 }));
      psuLeft.appendChild(createRect(12, 10, 4, deviceHeight - 20, { fill: '#ef4444', rx: 1 })); // Latch
      psuLeft.appendChild(createCircle(22, deviceHeight / 2 - 4, 2, { fill: '#00ff00', filter: 'drop-shadow(0 0 1px #00ff00)' })); // LED
      psuLeft.appendChild(createRect(28, deviceHeight / 2 - 8, 12, 16, { fill: '#0a0a0c', rx: 2 })); // Plug inlet
      deviceGroup.appendChild(psuLeft);

      // Right PSU
      const psuRight = createGroup(device.id + '-psu-r', 'psu-module');
      psuRight.appendChild(createRect(deviceWidth - 46, 4, 38, deviceHeight - 8, { fill: '#282b30', stroke: '#111', rx: 1 }));
      psuRight.appendChild(createRect(deviceWidth - 42, 10, 4, deviceHeight - 20, { fill: '#ef4444', rx: 1 })); // Latch
      psuRight.appendChild(createCircle(deviceWidth - 32, deviceHeight / 2 - 4, 2, { fill: '#00ff00', filter: 'drop-shadow(0 0 1px #00ff00)' })); // LED
      psuRight.appendChild(createRect(deviceWidth - 26, deviceHeight / 2 - 8, 12, 16, { fill: '#0a0a0c', rx: 2 })); // Plug inlet
      deviceGroup.appendChild(psuRight);

      // Draw redundant Fan Cages in the middle
      const fanCount = heightUnits * 2 + 1;
      const startX = 60;
      for (let i = 0; i < fanCount; i++) {
        const fx = startX + i * 28;
        const fy = deviceHeight / 2;
        deviceGroup.appendChild(createCircle(fx, fy, 8, { fill: '#1b1b1e', stroke: '#555', 'stroke-width': 0.8 }));
        deviceGroup.appendChild(createCircle(fx, fy, 2, { fill: '#888' }));
        for (let a = 0; a < 360; a += 90) {
          const rad = (a * Math.PI) / 180;
          deviceGroup.appendChild(createSVGElement('line', {
            x1: fx,
            y1: fy,
            x2: fx + Math.cos(rad) * 6,
            y2: fy + Math.sin(rad) * 6,
            stroke: '#444',
            'stroke-width': 1.5
          }));
        }
      }

      // Draw PCIe expansion brackets
      const pcieX = startX + fanCount * 28 + 15;
      const pcieW = deviceWidth - pcieX - 60;
      if (pcieW > 30) {
        const slotCount = heightUnits === 1 ? 2 : 4;
        const slotH = (deviceHeight - 12) / slotCount;
        for (let i = 0; i < slotCount; i++) {
          const sy = 6 + i * slotH;
          deviceGroup.appendChild(createRect(pcieX, sy, pcieW, slotH - 2, {
            fill: '#42454a',
            stroke: '#1b1c1f',
            rx: 1
          }));
        }
      }
    } else if (category === 'switch') {
      // Switch Rear: power inlets and fan outlets
      deviceGroup.appendChild(createRect(10, 4, 30, deviceHeight - 8, { fill: '#282b30', rx: 1 }));
      deviceGroup.appendChild(createRect(16, deviceHeight / 2 - 6, 12, 12, { fill: '#050507', rx: 1 }));
      
      for (let i = 0; i < 3; i++) {
        const fx = 60 + i * 22;
        deviceGroup.appendChild(createCircle(fx, deviceHeight/2, 6, { fill: '#1b1b1e', stroke: '#444' }));
      }
      deviceGroup.appendChild(createRect(140, 5, deviceWidth - 160, deviceHeight - 10, { fill: '#1d1d23', stroke: '#2e2e38' }));
    }
  } else if (hasCustomImage) {
    // Custom OEM Panel Image Background
    const imgUrl = device.frontPanelImage || template?.frontPanelImage;
    const panelImg = createSVGElement('image', {
      x: 0,
      y: 0,
      width: deviceWidth,
      height: deviceHeight,
      href: imgUrl!,
      preserveAspectRatio: 'none'
    });
    deviceGroup.appendChild(panelImg);
    
    // Add subtle glossy overlays/gradients over the image
    const overlay = createRect(0, 0, deviceWidth, deviceHeight, {
      fill: 'rgba(255, 255, 255, 0.03)',
      stroke: '#000000',
      'stroke-width': 1,
      'pointer-events': 'none'
    });
    deviceGroup.appendChild(overlay);
  } else {
    // High-fidelity SVG panel renderer
    const connectedPortIndices = new Set<number>();
    const connectedPortIds = new Set<string>();
    const usesConnectionState = category === 'switch' || category === 'router' || category === 'firewall' || category === 'console' || category === 'patch-panel';
    if (usesConnectionState && device) {
      const cables = stateManager.getState().cables;
      for (const cable of cables) {
        const port = device.ports.find(p => p.id === cable.sourcePortId || p.id === cable.destPortId);
        if (port) {
          const idx = device.ports.indexOf(port);
          if (idx >= 0) connectedPortIndices.add(idx);
          connectedPortIds.add(port.id);
        }
      }
    }
    const panel = renderFrontPanel(category, template ?? null, device, deviceWidth, deviceHeight, connectedPortIndices, connectedPortIds);
    deviceGroup.appendChild(panel);
  }

  // Draw standard interactive port connectors on top of everything
  renderPorts(device.ports, deviceGroup);

  // Lock icon overlay
  if (device.locked) {
    const lockGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lockGroup.setAttribute('pointer-events', 'none');
    // Background badge
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    badge.setAttribute('x', '4');
    badge.setAttribute('y', '4');
    badge.setAttribute('width', '14');
    badge.setAttribute('height', '14');
    badge.setAttribute('rx', '2');
    badge.setAttribute('fill', 'rgba(0,0,0,0.6)');
    lockGroup.appendChild(badge);
    // Lock body
    const lockBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    lockBody.setAttribute('x', '6');
    lockBody.setAttribute('y', '9');
    lockBody.setAttribute('width', '10');
    lockBody.setAttribute('height', '7');
    lockBody.setAttribute('rx', '1');
    lockBody.setAttribute('fill', '#fb8c00');
    lockGroup.appendChild(lockBody);
    // Lock shackle arc
    const shackle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shackle.setAttribute('d', 'M 8 9 L 8 7 A 3 3 0 0 0 14 7 L 14 9');
    shackle.setAttribute('fill', 'none');
    shackle.setAttribute('stroke', '#fb8c00');
    shackle.setAttribute('stroke-width', '1.5');
    shackle.setAttribute('stroke-linecap', 'round');
    lockGroup.appendChild(shackle);
    deviceGroup.appendChild(lockGroup);
  }

  // Preview highlight: yellow ring if device is in previewDiff
  const previewDiff = stateManager.getState().previewDiff;
  if (previewDiff?.diff) {
    const d = previewDiff.diff;
    const deviceId = device.id;
    const isAffected =
      d.removeDevices?.includes(deviceId) ||
      d.updateDevices?.some(u => u.id === deviceId) ||
      d.addDevices?.some(a => a.id === deviceId);

    if (isAffected) {
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ring.setAttribute('x', String(-3));
      ring.setAttribute('y', String(-3));
      ring.setAttribute('width', String(deviceWidth + 6));
      ring.setAttribute('height', String(deviceHeight + 6));
      ring.setAttribute('rx', '3');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#ffd600');
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('opacity', '0.85');
      ring.setAttribute('pointer-events', 'none');
      deviceGroup.appendChild(ring);
    }
  }

  return deviceGroup;
}
