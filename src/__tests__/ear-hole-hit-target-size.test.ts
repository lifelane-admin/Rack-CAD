import { describe, it, expect } from 'vitest';
import { renderPort } from '../renderers/port-renderer';
import { createGroup } from '../utils/svg-helpers';
import type { PortData } from '../core/types';

/**
 * Ear-hole ports carry their own invisible clickable hit-target circle baked directly into the
 * port graphic (separate from — and checked BEFORE — any of app.ts's distance-based proximity-
 * snap fallbacks). At r=6 (original) it was nearly as wide as the tightest hole pitch (7.5px, a
 * 1U device's 4 holes over its 30px height), so a raw click anywhere near a hole landed inside
 * SOME hole's hit target directly, no matter how small the fallback radii were shrunk.
 *
 * A first pass shrunk just the hit-target circle to r=3, which turned out to barely change
 * anything: the visible bezel/hole/pin are real painted (filled) shapes with no pointer-events
 * override, so they were independently hit-testable at their own ~2.8-3.2px radius regardless of
 * the invisible hitTarget's size. Now r=1.5, AND the bezel/hole/pin/glow-ring all get
 * pointer-events:none so the hitTarget circle is the only thing that can register a click.
 *
 * Confirmed at the attribute level since happy-dom has no real layout engine to geometrically
 * verify "clicking N px away doesn't hit it" the way a real browser would.
 */
describe('ear-hole hit-target size', () => {
  function earPort(overrides: Partial<PortData> = {}): PortData {
    return {
      id: 'devX-ear-left-nic1', deviceId: 'devX', name: 'Left Ear Network 1 (RJ45)',
      type: 'rj45', relativeX: -12.5, relativeY: 3.75, connected: false, cableId: null,
      ...overrides,
    };
  }

  it('renders a hit-target circle of r=1.5, well under half the tightest hole pitch (3.75px)', () => {
    const deviceGroup = createGroup('device-devX', 'device');
    const portGroup = renderPort(earPort(), deviceGroup);

    const hitTarget = portGroup.querySelector('.port-hover-target') as SVGCircleElement;
    expect(hitTarget).toBeTruthy();
    expect(parseFloat(hitTarget.getAttribute('r')!)).toBe(1.5);
  });

  it('makes the visible bezel/hole/pin/glow-ring non-interactive, so only the hitTarget can be clicked', () => {
    const deviceGroup = createGroup('device-devX', 'device');
    const portGroup = renderPort(earPort(), deviceGroup);

    const decorativeSelectors = ['.ear-port-hole', '.port-neon-ring'];
    for (const sel of decorativeSelectors) {
      const el = portGroup.querySelector(sel);
      expect(el, `expected ${sel} to exist`).toBeTruthy();
      expect(el!.getAttribute('pointer-events')).toBe('none');
    }

    // The bezel and pin circles aren't selectable by class, but are the only remaining <circle>
    // children besides the hit-target — every circle other than .port-hover-target must be inert.
    const allCircles = Array.from(portGroup.querySelectorAll('circle'));
    const nonHitTargetCircles = allCircles.filter(c => !c.classList.contains('port-hover-target'));
    expect(nonHitTargetCircles.length).toBeGreaterThan(0);
    for (const c of nonHitTargetCircles) {
      expect(c.getAttribute('pointer-events')).toBe('none');
    }
  });

  it('applies the same tight, non-interactive treatment to the power and hybrid ear-port variants too', () => {
    const deviceGroup = createGroup('device-devX', 'device');

    const powerGroup = renderPort(earPort({ id: 'devX-ear-left-nic2', type: 'power' }), deviceGroup);
    const powerHit = powerGroup.querySelector('.port-hover-target') as SVGCircleElement;
    expect(parseFloat(powerHit.getAttribute('r')!)).toBe(1.5);
    expect(powerGroup.querySelector('.ear-port-hole')!.getAttribute('pointer-events')).toBe('none');

    const hybridGroup = renderPort(earPort({ id: 'devX-ear-right-nic4', type: 'hybrid' }), deviceGroup);
    const hybridHit = hybridGroup.querySelector('.port-hover-target') as SVGCircleElement;
    expect(parseFloat(hybridHit.getAttribute('r')!)).toBe(1.5);
    expect(hybridGroup.querySelector('.ear-port-hole')!.getAttribute('pointer-events')).toBe('none');
  });
});
