import { describe, it, expect } from 'vitest';
import { renderCable } from '../renderers/cable-renderer';
import { stateManager } from '../core/state';
import type { CableData, DeviceData } from '../core/types';

/**
 * Regression guard: a cable whose destination is a floating point (Airdrop Destination — no real
 * destPortId) must still draw the real connector shape matching its cable type (Ethernet jack /
 * power plug / fiber / SFP), not just the generic circular drag-handle dot. Before the fix,
 * cable-renderer.ts only drew a connector at the destination `if (cable.destPortId)`, so a
 * floating destination rendered as a bare white dot with no connector geometry at all — while a
 * cable with a real destPortId drew the full connector. The source connector is always drawn
 * regardless (sourcePortId is never nullable), so comparing RAW shape counts against a floating
 * cable doesn't isolate the destination — comparing floating vs. a real destPortId (which must
 * produce the SAME shape) does.
 */
function baseCable(overrides: Partial<CableData> = {}): CableData {
  return {
    id: 'c1', name: 'Cable 1', type: 'general', color: '#78909c',
    sourcePortId: 'does-not-exist-p1', destPortId: null,
    bendPoints: [], thickness: 3, bendRadius: 10, bundleId: null, notes: '',
    anchorPoints: [], anchorsLocked: false,
    ...overrides,
  };
}

function shapeCount(cable: CableData, destPos = { x: 500, y: 200 }): number {
  const group = renderCable(cable, { x: 100, y: 100 }, destPos, document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement);
  return group.querySelectorAll('rect, path').length;
}

describe('renderCable: floating-destination connector shape', () => {
  it('draws the same Ethernet-connector geometry at a floating destination as at a real one', () => {
    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '', hostname: '',
        managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'real-p1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: false, cableId: null }],
      } as DeviceData],
    });

    const floatingCount = shapeCount(baseCable({ type: 'cat6', destPortId: null, floatingDest: { x: 500, y: 200 } }));
    const realDestCount = shapeCount(baseCable({ type: 'cat6', destPortId: 'real-p1' }));

    // Before the fix, floatingCount would be strictly less than realDestCount (missing the whole
    // dest connector's rects/paths) — this fails without the fix and passes with it.
    expect(floatingCount).toBe(realDestCount);
    expect(floatingCount).toBeGreaterThan(0);
  });

  it('draws a power-plug connector (pins + strain-relief boot) at a floating destination, matching a real power destination', () => {
    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '', hostname: '',
        managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'real-power-p1', deviceId: 'd1', name: 'PSU', type: 'power', relativeX: 320, relativeY: 8, connected: false, cableId: null }],
      } as DeviceData],
    });

    const floatingCount = shapeCount(baseCable({ type: 'c13-power', powerCableType: 'power', destPortId: null, floatingDest: { x: 500, y: 200 } }));
    const realDestCount = shapeCount(baseCable({ type: 'c13-power', powerCableType: 'power', destPortId: 'real-power-p1' }));

    expect(floatingCount).toBe(realDestCount);
    // 3 brass pins + 1 strain-relief boot rect at the dest end, at minimum, plus the source end's own.
    expect(floatingCount).toBeGreaterThanOrEqual(8);
  });

  it('does NOT show the glowing drag-handle dot for a finished (unselected) floating-destination cable', () => {
    // Was the actual complaint: the handle used to show permanently for any cable with no real
    // destPortId (`!cable.destPortId` was always true for it), so a completed Airdrop-Destination
    // cable never lost its glowing dot, even long after being "finished".
    stateManager.setState({ selection: [] });
    const cable = baseCable({ id: 'unselected-cable', type: 'cat6', floatingDest: { x: 500, y: 200 } });
    const group = renderCable(cable, { x: 100, y: 100 }, { x: 500, y: 200 }, document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement);
    expect(group.querySelector('[data-handle-type="dest"]')).toBeFalsy();
  });

  it('shows the drag handle again once the floating-destination cable is selected (so its end can still be dragged onto a real port)', () => {
    const cable = baseCable({ id: 'selected-cable', type: 'cat6', floatingDest: { x: 500, y: 200 } });
    stateManager.setState({ selection: [{ type: 'cable', id: 'selected-cable' }] });
    const group = renderCable(cable, { x: 100, y: 100 }, { x: 500, y: 200 }, document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement);
    expect(group.querySelector('[data-handle-type="dest"]')).toBeTruthy();
    stateManager.setState({ selection: [] });
  });

  it('rotates the floating-destination connector to face the actual drop direction, not a fixed default', () => {
    // Regression guard for the "lands somewhere unexpected" bug: the connector graphic's own
    // rotation used to be hardcoded (via a static 'right'-orientation fallback) regardless of
    // which way the point was actually dropped relative to the source — a leftward drop still
    // rendered a connector rotated as if approached from the left-facing/'right'-oriented case.
    // Dropping in four opposite directions must not all produce the identical rotation.
    const rotationsOf = (sourcePos: { x: number; y: number }, destPos: { x: number; y: number }) => {
      const cable = baseCable({ type: 'cat6', floatingDest: destPos });
      const group = renderCable(cable, sourcePos, destPos, document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement);
      return Array.from(group.querySelectorAll('g'))
        .map(g => /rotate\(([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '')?.[1])
        .filter((r): r is string => r !== undefined);
    };

    const droppedRight = rotationsOf({ x: 100, y: 100 }, { x: 500, y: 100 });
    const droppedLeft = rotationsOf({ x: 500, y: 100 }, { x: 100, y: 100 });
    const droppedAbove = rotationsOf({ x: 100, y: 400 }, { x: 100, y: 50 });
    const droppedBelow = rotationsOf({ x: 100, y: 50 }, { x: 100, y: 400 });

    // At least one connector rotation must differ across these four opposite-direction drops —
    // if every drop produced the exact same set of rotations, the connector isn't actually
    // responding to drop direction at all.
    const allSame = [droppedLeft, droppedAbove, droppedBelow].every(r => JSON.stringify(r) === JSON.stringify(droppedRight));
    expect(allSame).toBe(false);
  });
});
