import { describe, it, expect, beforeEach } from 'vitest';
import { renderPort } from '../renderers/port-renderer';
import { createGroup } from '../utils/svg-helpers';
import { stateManager } from '../core/state';
import type { DeviceData, PortData } from '../core/types';

/**
 * Regular (non-ear-hole) ports on a device with a custom front-panel image — e.g. the "Custom
 * Layout" Switch/Firewall templates once you've uploaded a real hardware photo and manually
 * calibrated ports to match it — go through the SAME "no dedicated panel renderer" code path as
 * plain server/storage/pdu ports (device-renderer.ts's hasCustomImage branch forces
 * hasCustomPanel=false). That path had the identical bug already fixed for ear holes: the visible
 * port rect/inner-jack were real painted (filled) shapes with no pointer-events override, so they
 * were independently clickable at their own size, AND the invisible hit-target itself added 3px
 * of padding per side (6px total added to width/height). A real hardware photo's ports can sit as
 * close as ~9-14px apart (see the Custom Switch/Firewall reference screenshots), so that combo
 * let a cable "reach" and snap to a neighboring port well before the cursor was actually on it.
 */
describe('regular custom-port hit-target (device with a custom front-panel image)', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [] });
  });

  function seedCustomImageDevice(): void {
    stateManager.setState({
      devices: [{
        id: 'devX', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 1, name: '',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        frontPanelImage: 'data:image/png;base64,iVBORw0KGgo=',
        ports: [],
      } as DeviceData],
    });
  }

  function customPort(overrides: Partial<PortData> = {}): PortData {
    return {
      id: 'devX-port-0', deviceId: 'devX', name: 'Port 1', type: 'rj45',
      relativeX: 100, relativeY: 15, connected: false, cableId: null,
      ...overrides,
    };
  }

  it('the visible port rect and inner jack are non-interactive — only the hitTarget can be clicked', () => {
    seedCustomImageDevice();
    const deviceGroup = createGroup('device-devX', 'device');
    const portGroup = renderPort(customPort(), deviceGroup, 0, stateManager.getDevice('devX')!);

    const rects = Array.from(portGroup.querySelectorAll('rect'));
    const nonHitTargetRects = rects.filter(r => !r.classList.contains('port-hover-target'));
    expect(nonHitTargetRects.length).toBeGreaterThan(0); // the visible port body (+ inner jack) exist
    for (const r of nonHitTargetRects) {
      expect(r.getAttribute('pointer-events')).toBe('none');
    }
  });

  it('the hitTarget padding is 1px/side (was 3px) — default 12x10 port becomes a 14x12 hit box, not 18x16', () => {
    seedCustomImageDevice();
    const deviceGroup = createGroup('device-devX', 'device');
    const portGroup = renderPort(customPort(), deviceGroup, 0, stateManager.getDevice('devX')!);

    const hitTarget = portGroup.querySelector('.port-hover-target') as SVGRectElement;
    expect(hitTarget).toBeTruthy();
    expect(parseFloat(hitTarget.getAttribute('width')!)).toBe(14); // 12 (default w) + 2*1
    expect(parseFloat(hitTarget.getAttribute('height')!)).toBe(12); // 10 (default h) + 2*1
  });

  it('an explicit portW/portH override shrinks the hitTarget below the 12x10 type default', () => {
    seedCustomImageDevice();
    const deviceGroup = createGroup('device-devX', 'device');
    // Matches what "+ Add Port" (properties.ts) now actually gives a manually-added custom port.
    const portGroup = renderPort(customPort({ portW: 9, portH: 9 }), deviceGroup, 0, stateManager.getDevice('devX')!);

    const hitTarget = portGroup.querySelector('.port-hover-target') as SVGRectElement;
    expect(parseFloat(hitTarget.getAttribute('width')!)).toBe(11); // 9 + 2*1
    expect(parseFloat(hitTarget.getAttribute('height')!)).toBe(11);
  });

  it('two 9px-wide custom ports placed 12px apart (a real 48-port switch photo\'s typical pitch) have no overlapping hit-boxes', () => {
    seedCustomImageDevice();
    const deviceGroup = createGroup('device-devX', 'device');

    const portA = renderPort(customPort({ id: 'devX-port-0', relativeX: 100, portW: 9, portH: 9 }), deviceGroup, 0, stateManager.getDevice('devX')!);
    const portB = renderPort(customPort({ id: 'devX-port-1', relativeX: 112, portW: 9, portH: 9 }), deviceGroup, 1, stateManager.getDevice('devX')!);

    const hitA = portA.querySelector('.port-hover-target') as SVGRectElement;
    const hitB = portB.querySelector('.port-hover-target') as SVGRectElement;

    // Hit-box A spans [relativeX - w/2 - 1, relativeX + w/2 + 1] in local (port-group) space,
    // which translates to world space via each port's own translate(relativeX, relativeY).
    const halfWidthA = parseFloat(hitA.getAttribute('width')!) / 2;
    const halfWidthB = parseFloat(hitB.getAttribute('width')!) / 2;
    const rightEdgeA = 100 + halfWidthA;
    const leftEdgeB = 112 - halfWidthB;
    expect(rightEdgeA).toBeLessThan(leftEdgeB); // no overlap
  });
});
