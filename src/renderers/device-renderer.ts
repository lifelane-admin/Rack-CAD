import { DeviceData, RACK_CONSTANTS } from '../core/types';
import { createGroup, createRect, createText, createCircle, createSVGElement, setAttributes, createLinearGradient } from '../utils/svg-helpers';
import { getTemplate } from '../library/device-catalog';
import { renderPorts } from './port-renderer';

export function renderDevice(device: DeviceData, rackX: number, rackY: number, rackUnits: number): SVGGElement {
  const template = getTemplate(device.templateId);
  const heightUnits = template?.heightUnits || 1;
  const category = template?.category || 'server';

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
  
  // Honeycomb pattern for server backgrounds
  const honeycombPattern = createSVGElement('pattern', {
    id: 'honeycomb-' + device.id,
    width: 6,
    height: 10,
    patternUnits: 'userSpaceOnUse'
  });
  const path = createSVGElement('path', {
    d: 'M 3 0 L 6 2 L 6 8 L 3 10 L 0 8 L 0 2 Z',
    fill: 'none',
    stroke: '#111115',
    'stroke-width': 1
  });
  honeycombPattern.appendChild(path);
  
  defs.appendChild(earGrad);
  defs.appendChild(honeycombPattern);
  deviceGroup.appendChild(defs);

  // === RENDER RACK MOUNTING EARS (extends onto rails) ===
  const railW = RACK_CONSTANTS.RAIL_WIDTH;
  
  // Left Ear
  const leftEar = createRect(-railW, 0, railW, deviceHeight, {
    fill: `url(#ear-grad-${device.id})`,
    stroke: '#1a1a1f',
    'stroke-width': 1,
    rx: 2,
    ry: 2
  });
  deviceGroup.appendChild(leftEar);
  
  // Right Ear
  const rightEar = createRect(deviceWidth, 0, railW, deviceHeight, {
    fill: `url(#ear-grad-${device.id})`,
    stroke: '#1a1a1f',
    'stroke-width': 1,
    rx: 2,
    ry: 2
  });
  deviceGroup.appendChild(rightEar);

  // Screw heads on ears (skip for servers to avoid overlapping ear ports)
  if (category !== 'server') {
    for (let u = 0; u < heightUnits; u++) {
      const screwY1 = u * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RU_HEIGHT / 4;
      const screwY2 = u * RACK_CONSTANTS.RU_HEIGHT + 3 * RACK_CONSTANTS.RU_HEIGHT / 4;
      
      // Left Screws
      deviceGroup.appendChild(createCircle(-railW + 8, screwY1, 3, { fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
      deviceGroup.appendChild(createCircle(-railW + 8, screwY2, 3, { fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
      // Right Screws
      deviceGroup.appendChild(createCircle(deviceWidth + 8, screwY1, 3, { fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
      deviceGroup.appendChild(createCircle(deviceWidth + 8, screwY2, 3, { fill: '#111', stroke: '#555', 'stroke-width': 0.5 }));
    }
  }

  // === RENDER MAIN PANEL BODY ===
  const hasCustomImage = !!(device.frontPanelImage || template?.frontPanelImage);
  
  if (hasCustomImage) {
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
    // Falls back to high-fidelity vector graphics
    let bgFill = '#1b1b22';
    if (category === 'switch') bgFill = '#222228';
    else if (category === 'firewall') bgFill = '#331a1a';
    else if (category === 'blank-panel') bgFill = '#121215';

    const panelBg = createRect(0, 0, deviceWidth, deviceHeight, {
      fill: bgFill,
      stroke: '#000000',
      'stroke-width': 1,
      rx: 1,
      ry: 1
    });
    deviceGroup.appendChild(panelBg);

    // Decorative ventilation grills for server/firewall
    if (category === 'server' || category === 'firewall') {
      const grill = createRect(10, 5, deviceWidth - 110, deviceHeight - 10, {
        fill: `url(#honeycomb-${device.id})`,
        opacity: 0.85
      });
      deviceGroup.appendChild(grill);
      
      // Highlight panel frames
      const frameHighlight = createRect(8, 3, deviceWidth - 106, deviceHeight - 6, {
        fill: 'none',
        stroke: '#44444a',
        'stroke-width': 1,
        opacity: 0.5
      });
      deviceGroup.appendChild(frameHighlight);
    }

    // Cable managers visual details
    if (category === 'cable-manager') {
      if (device.templateId === 'brush-panel-1u') {
        // Draw brush cutout slot
        const slot = createRect(20, 8, deviceWidth - 40, deviceHeight - 16, {
          fill: '#050508',
          stroke: '#30363d',
          'stroke-width': 1,
          rx: 2
        });
        deviceGroup.appendChild(slot);

        // Draw brush fiber lines inside slot
        const fiberCount = 60;
        const fiberSpacing = (deviceWidth - 40) / fiberCount;
        for (let i = 1; i < fiberCount; i++) {
          const fx = 20 + i * fiberSpacing;
          const fiber = createSVGElement('line', {
            x1: fx,
            y1: 8,
            x2: fx,
            y2: deviceHeight - 8,
            stroke: '#1a1a20',
            'stroke-width': 1,
            opacity: 0.65
          });
          deviceGroup.appendChild(fiber);
        }
      } else if (device.templateId === 'd-ring-1u') {
        // Draw horizontal steel channel line
        deviceGroup.appendChild(createSVGElement('line', {
          x1: 15,
          y1: deviceHeight / 2,
          x2: deviceWidth - 15,
          y2: deviceHeight / 2,
          stroke: '#30363d',
          'stroke-width': 1.5
        }));

        // Draw 5 silver loops (D-Rings)
        const ringCount = 5;
        const spacing = (deviceWidth - 80) / (ringCount - 1);
        for (let i = 0; i < ringCount; i++) {
          const rx = 40 + i * spacing;
          const ry = deviceHeight / 2;
          const loopGroup = createGroup();
          setAttributes(loopGroup, { transform: `translate(${rx}, ${ry})` });
          
          const ringPath = createSVGElement('path', {
            d: 'M -10 -4 L 10 -4 C 12 -4, 12 12, 10 12 L -10 12 C -12 12, -12 -4, -10 -4 Z',
            fill: 'none',
            stroke: '#8b949e',
            'stroke-width': 2.5,
            'stroke-linecap': 'round'
          });
          loopGroup.appendChild(ringPath);
          deviceGroup.appendChild(loopGroup);
        }
      } else if (device.templateId === 'finger-duct-2u' || device.templateId === 'finger-duct-4u') {
        // Cover plate panel
        const cover = createRect(10, 6, deviceWidth - 20, deviceHeight - 12, {
          fill: '#101014',
          stroke: '#30363d',
          'stroke-width': 1,
          rx: 3
        });
        deviceGroup.appendChild(cover);

        // Draw 10 horizontal slits/opening windows representing slots
        const slitCount = 10;
        const spacing = (deviceWidth - 40) / slitCount;
        for (let i = 0; i < slitCount; i++) {
          const sx = 20 + i * spacing;
          const slit = createRect(sx + 3, 10, spacing - 6, deviceHeight - 20, {
            fill: '#050508',
            stroke: '#21262d',
            'stroke-width': 0.8,
            rx: 2
          });
          deviceGroup.appendChild(slit);

          const bracket = createRect(sx + 1, 6, 2, deviceHeight - 12, {
            fill: '#21262d'
          });
          deviceGroup.appendChild(bracket);
        }
      }
    }
  }

  // === RENDER TEXT LOGICAL OVERLAYS ===
  // Displays hostname and logical details on the left side of the device chassis
  if (category === 'server') {
    // Status/Power LED
    deviceGroup.appendChild(createCircle(15, deviceHeight / 2, 3, { fill: '#00ff00', filter: 'drop-shadow(0 0 2px #00ff00)' }));
    deviceGroup.appendChild(createCircle(25, deviceHeight / 2, 2, { fill: '#fb8c00', opacity: 0.8 }));
    
    // Small decorative LCD screen
    const lcdScreen = createRect(38, deviceHeight / 2 - 6, 12, 12, { fill: '#0d1117', stroke: '#30363d', 'stroke-width': 0.5, rx: 1 });
    deviceGroup.appendChild(lcdScreen);
    deviceGroup.appendChild(createCircle(44, deviceHeight / 2, 1.5, { fill: '#58a6ff', opacity: 0.8 }));
  } else if (category === 'switch') {
    // Small glowing green LED for active state
    deviceGroup.appendChild(createCircle(8, deviceHeight / 2, 2, { fill: '#00ff00', filter: 'drop-shadow(0 0 1px #00ff00)' }));
  } else {
    // For other devices, no labels are drawn
  }

  // Draw standard interactive port connectors on top of everything
  renderPorts(device.ports, deviceGroup);

  return deviceGroup;
}
