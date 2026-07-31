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
    const [, , destExit] = computeSmartRouting(cable, sourcePos, destPos);
    // Old bug: destExit.x = destPos.x + 15 = 115 (toward the source). Fixed: destExit.x < destPos.x.
    expect(destExit.x).toBeLessThan(destPos.x);
  });

  it('exits further RIGHT (away from source) when the drop is to the right of the source', () => {
    const cable = baseCable({ floatingDest: { x: 500, y: 100 } });
    const sourcePos = { x: 100, y: 100 };
    const destPos = { x: 500, y: 100 };
    const [, , destExit] = computeSmartRouting(cable, sourcePos, destPos);
    expect(destExit.x).toBeGreaterThan(destPos.x);
  });

  it('exits further UP (away from source) when the drop is above the source', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 50 } });
    const sourcePos = { x: 100, y: 400 };
    const destPos = { x: 100, y: 50 };
    const [, , destExit] = computeSmartRouting(cable, sourcePos, destPos);
    expect(destExit.y).toBeLessThan(destPos.y);
  });

  it('exits further DOWN (away from source) when the drop is below the source', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 400 } });
    const sourcePos = { x: 100, y: 50 };
    const destPos = { x: 100, y: 400 };
    const [, , destExit] = computeSmartRouting(cable, sourcePos, destPos);
    expect(destExit.y).toBeGreaterThan(destPos.y);
  });

  it('respects an explicit destOrientation override even for a floating destination', () => {
    const cable = baseCable({ floatingDest: { x: 100, y: 100 }, destOrientation: 'right' });
    const sourcePos = { x: 500, y: 100 };
    const destPos = { x: 100, y: 100 };
    const [, , destExit] = computeSmartRouting(cable, sourcePos, destPos);
    expect(destExit.x).toBeGreaterThan(destPos.x); // 'right' orientation forced despite leftward drop
  });
});
