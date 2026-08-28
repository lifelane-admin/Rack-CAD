import { describe, it, expect } from 'vitest';
import { computeSmartRouting } from '../utils/routing';
import type { CableData } from '../core/types';

/**
 * Regression guard: a cable with a floating destination (Airdrop Destination — no real
 * destPortId) used to always compute its exit point as if the destination orientation were
 * 'right', regardless of which direction the drop actually was relative to the source. That
 * displaced the visible cable route (and, via cable-renderer.ts's matching fix, the connector
 * graphic) away from the exact drop point whenever the true direction wasn't rightward — e.g.
 * dropping to the LEFT of the source still exited further right, toward the source, instead of
 * away from it. The fix derives the exit direction from the actual straight-line direction to
 * the drop point.
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

describe('computeSmartRouting: floating-destination exit direction', () => {
  it('exits further LEFT (away from source) when the drop is to the left of the source, not toward it', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 100 } });
    const sourcePos = { x: 500, y: 100 };
    const destPos = { x: 100, y: 100 };
    const pts = computeSmartRouting(cable, sourcePos, destPos);
    const destExit = pts[pts.length - 1];
    // Old bug: destExit.x = destPos.x + 15 = 115 (toward the source). Fixed: destExit.x < destPos.x.
    expect(destExit.x).toBeLessThan(destPos.x);
  });

  it('exits further RIGHT (away from source) when the drop is to the right of the source', () => {
    const cable = baseCable({ floatingDest: { x: 500, y: 100 } });
    const sourcePos = { x: 100, y: 100 };
    const destPos = { x: 500, y: 100 };
    const pts = computeSmartRouting(cable, sourcePos, destPos);
    const destExit = pts[pts.length - 1];
    expect(destExit.x).toBeGreaterThan(destPos.x);
  });

  it('exits further UP (away from source) when the drop is above the source', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 50 } });
    const sourcePos = { x: 100, y: 400 };
    const destPos = { x: 100, y: 50 };
    const pts = computeSmartRouting(cable, sourcePos, destPos);
    const destExit = pts[pts.length - 1];
    expect(destExit.y).toBeLessThan(destPos.y);
  });

  it('exits further DOWN (away from source) when the drop is below the source', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 400 } });
    const sourcePos = { x: 100, y: 50 };
    const destPos = { x: 100, y: 400 };
    const pts = computeSmartRouting(cable, sourcePos, destPos);
    const destExit = pts[pts.length - 1];
    expect(destExit.y).toBeGreaterThan(destPos.y);
  });

  it('respects an explicit destOrientation override even for a floating destination', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 100 }, destOrientation: 'right' });
    const sourcePos = { x: 500, y: 100 };
    const destPos = { x: 100, y: 100 };
    const pts = computeSmartRouting(cable, sourcePos, destPos);
    const destExit = pts[pts.length - 1];
    expect(destExit.x).toBeGreaterThan(destPos.x); // 'right' orientation forced despite leftward drop
  });
});

import { stateManager } from '../core/state';

describe('computeSmartRouting: intelligent enterprise channel and color bundling', () => {
  it('routes left ear blade connections through the Left vertical channel (X ≈ rack.x + 14)', () => {
    const rack = { id: 'r1', units: 42, x: 100, y: 50 } as any;
    const device1 = {
      id: 'd1', rackId: 'r1', templateId: 'server-2u', startUnit: 10,
      ports: [{ id: 'd1-ear-left-nic1', deviceId: 'd1', relativeX: 12, relativeY: 15, type: 'rj45', connected: true, cableId: 'c1' }]
    } as any;
    const device2 = {
      id: 'd2', rackId: 'r1', templateId: 'cisco-catalyst-9300-48p', startUnit: 35,
      ports: [{ id: 'd2-p1', deviceId: 'd2', relativeX: 150, relativeY: 10, type: 'rj45', connected: true, cableId: 'c1' }]
    } as any;

    const cable = baseCable({
      id: 'c1',
      sourcePortId: 'd1-ear-left-nic1',
      destPortId: 'd2-p1',
      color: '#9c27b0'
    });

    stateManager.setState({
      racks: [rack],
      devices: [device1, device2],
      cables: [cable],
    });

    const sourcePos = { x: 137, y: 200 };
    const destPos = { x: 250, y: 500 };

    const pts = computeSmartRouting(cable, sourcePos, destPos);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    // Intermediate waypoint should be positioned in the left channel (near rack.x + 14 = 114)
    const channelPt = pts.find(p => Math.abs(p.x - 114) <= 15);
    expect(channelPt).toBeTruthy();
  });

  it('multiple cables of the same color share the exact same vertical trunk line', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 } as any;
    const device1 = {
      id: 'd1', rackId: 'r1', templateId: 'server-2u', startUnit: 10,
      ports: [
        { id: 'd1-p1', deviceId: 'd1', relativeX: 50, relativeY: 10, type: 'rj45', connected: true, cableId: 'c1' },
        { id: 'd1-p2', deviceId: 'd1', relativeX: 80, relativeY: 10, type: 'rj45', connected: true, cableId: 'c2' },
      ]
    } as any;
    const device2 = {
      id: 'd2', rackId: 'r1', templateId: 'switch-48p', startUnit: 35,
      ports: [
        { id: 'd2-p1', deviceId: 'd2', relativeX: 60, relativeY: 10, type: 'rj45', connected: true, cableId: 'c1' },
        { id: 'd2-p2', deviceId: 'd2', relativeX: 90, relativeY: 10, type: 'rj45', connected: true, cableId: 'c2' },
      ]
    } as any;

    const cable1 = baseCable({ id: 'c1', color: '#7b2fbe', sourcePortId: 'd1-p1', destPortId: 'd2-p1' });
    const cable2 = baseCable({ id: 'c2', color: '#7b2fbe', sourcePortId: 'd1-p2', destPortId: 'd2-p2' });
    const cable3 = baseCable({ id: 'c3', color: '#00e5ff' });

    stateManager.setState({
      racks: [rack],
      devices: [device1, device2],
      cables: [cable1, cable2, cable3],
    });

    const sourcePos1 = { x: 100, y: 100 };
    const destPos1 = { x: 110, y: 400 };
    const pts1 = computeSmartRouting(cable1, sourcePos1, destPos1);

    const sourcePos2 = { x: 130, y: 120 };
    const destPos2 = { x: 140, y: 420 };
    const pts2 = computeSmartRouting(cable2, sourcePos2, destPos2);

    // Both purple cables should have identical vertical trunk X coordinate
    const trunkX1 = pts1[1].x;
    const trunkX2 = pts2[1].x;
    expect(trunkX1).toBe(trunkX2);
  });

  it('channels through a 1U Brush Panel cable manager installed between server and switch', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 } as any;
    const server = {
      id: 'd1', rackId: 'r1', templateId: 'server-2u', startUnit: 10,
      ports: [{ id: 'd1-p1', deviceId: 'd1', relativeX: 50, relativeY: 10, type: 'rj45', connected: true, cableId: 'c1' }]
    } as any;
    const cableManager = {
      id: 'cm1', rackId: 'r1', templateId: 'brush-panel-1u', startUnit: 34,
      ports: []
    } as any;
    const switchDevice = {
      id: 'd2', rackId: 'r1', templateId: 'switch-48p', startUnit: 35,
      ports: [{ id: 'd2-p1', deviceId: 'd2', relativeX: 60, relativeY: 10, type: 'rj45', connected: true, cableId: 'c1' }]
    } as any;

    const cable = baseCable({ id: 'c1', color: '#00e5ff', sourcePortId: 'd1-p1', destPortId: 'd2-p1' });

    stateManager.setState({
      racks: [rack],
      devices: [server, cableManager, switchDevice],
      cables: [cable],
    });

    const sourcePos = { x: 100, y: 800 };
    const destPos = { x: 110, y: 250 };
    const pts = computeSmartRouting(cable, sourcePos, destPos);

    // Exactly 3 non-redundant corner waypoints (server ear turn, cable manager channel turn, switch entry turn)
    expect(pts.length).toBe(3);
  });
});
