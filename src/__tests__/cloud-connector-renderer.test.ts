import { describe, it, expect } from 'vitest';
import { renderCloudConnector, inferBestSide, resolveRoutePoints } from '../renderers/cloud-connector-renderer';
import type { CloudConnector } from '../core/types';

function baseConnector(overrides: Partial<CloudConnector> = {}): CloudConnector {
  return { id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', ...overrides };
}

function makeLayer(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
}

describe('renderCloudConnector', () => {
  it('renders a group with the correct data-cloud-connector-id', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector(), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
    expect(group.getAttribute('data-cloud-connector-id')).toBe('conn1');
  });

  it('draws a visible straight path between the given from/to points by default', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector(), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
    const paths = group.querySelectorAll('path');
    // hit-target path + visible path (no selection highlight since selected=false)
    expect(paths.length).toBe(2);
    const visible = [...paths].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible?.getAttribute('d')).toBe('M 0 0 L 100 50');
  });

  it('routes as a right-angle elbow when routing is orthogonal', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector({ routing: 'orthogonal' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
    const visible = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible?.getAttribute('d')).toBe('M 0 0 L 50 0 L 50 50 L 100 50');
  });

  it('adds an extra highlight path when selected', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector(), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, true);
    expect(group.querySelectorAll('path').length).toBe(3);
  });

  it('applies a dashed stroke-dasharray when style is dashed, distinct from dotted', () => {
    const layer1 = makeLayer();
    const dashedGroup = renderCloudConnector(baseConnector({ style: 'dashed' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer1, false);
    const dashed = [...dashedGroup.querySelectorAll('path')].find(l => l.getAttribute('stroke-dasharray'));
    expect(dashed?.getAttribute('stroke-dasharray')).toBe('8,5');

    const layer2 = makeLayer();
    const dottedGroup = renderCloudConnector(baseConnector({ style: 'dotted' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer2, false);
    const dotted = [...dottedGroup.querySelectorAll('path')].find(l => l.getAttribute('stroke-dasharray'));
    expect(dotted?.getAttribute('stroke-dasharray')).toBe('2,3');
  });

  it('defaults to an end-arrow marker and no start marker when unset', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector(), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
    const path = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(path?.getAttribute('marker-end')).toBe('url(#cloud-arrow-arrow)');
    expect(path?.getAttribute('marker-start')).toBeNull();
  });

  it('applies each tip type at the end, and omits the marker entirely for "none"', () => {
    for (const type of ['arrow', 'arrow-open', 'arrow-broad', 'dot', 'diamond']) {
      const layer = makeLayer();
      const group = renderCloudConnector(baseConnector({ endArrow: type as any }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
      const path = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
      expect(path?.getAttribute('marker-end')).toBe(`url(#cloud-arrow-${type})`);
    }

    const layer = makeLayer();
    const noneGroup = renderCloudConnector(baseConnector({ endArrow: 'none' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
    const nonePath = [...noneGroup.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(nonePath?.getAttribute('marker-end')).toBeNull();
  });

  it('supports an independent tip type at the source end (e.g. a bidirectional connector)', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector({ startArrow: 'arrow-open', endArrow: 'arrow' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer, false);
    const path = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(path?.getAttribute('marker-start')).toBe('url(#cloud-arrow-arrow-open)');
    expect(path?.getAttribute('marker-end')).toBe('url(#cloud-arrow-arrow)');
  });

  it('renders the label text at the midpoint when present', () => {
    const layer = makeLayer();
    const group = renderCloudConnector(baseConnector({ label: 'HTTPS' }), { x: 0, y: 0 }, { x: 100, y: 0 }, layer, false);
    expect(group.textContent).toContain('HTTPS');
  });

  describe('smart routing with known sides', () => {
    it('stubs straight out of the source side, straight into the dest side, joined by one bend (right -> left)', () => {
      const layer = makeLayer();
      const group = renderCloudConnector(
        baseConnector({ routing: 'orthogonal' }), { x: 64, y: 32 }, { x: 300, y: 32 }, layer, false, 'right', 'left'
      );
      const visible = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
      // Straight run right from source, single bend (already-aligned Y — no vertical segment needed), straight run left into dest.
      expect(visible?.getAttribute('d')).toBe('M 64 32 L 88 32 L 276 32 L 300 32');
    });

    it('bends correctly when the dest is below and to the right, exiting bottom and entering top', () => {
      const layer = makeLayer();
      const group = renderCloudConnector(
        baseConnector({ routing: 'orthogonal' }), { x: 32, y: 64 }, { x: 300, y: 200 }, layer, false, 'bottom', 'top'
      );
      const visible = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
      expect(visible?.getAttribute('d')).toBe('M 32 64 L 32 88 L 32 176 L 300 176 L 300 200');
    });

    it('routes into a floating (non-node) destination with only a source side known', () => {
      const layer = makeLayer();
      const group = renderCloudConnector(
        baseConnector({ routing: 'orthogonal', destNodeId: null }), { x: 64, y: 32 }, { x: 200, y: 150 }, layer, false, 'right', undefined
      );
      const visible = [...group.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
      expect(visible?.getAttribute('d')).toBe('M 64 32 L 88 32 L 200 32 L 200 150');
    });
  });

  it('applies dash-dot and long-dash patterns distinctly', () => {
    const layer1 = makeLayer();
    const dashDot = renderCloudConnector(baseConnector({ style: 'dash-dot' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer1, false);
    expect([...dashDot.querySelectorAll('path')].find(l => l.getAttribute('stroke-dasharray'))?.getAttribute('stroke-dasharray')).toBe('10,3,2,3');

    const layer2 = makeLayer();
    const longDash = renderCloudConnector(baseConnector({ style: 'long-dash' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer2, false);
    expect([...longDash.querySelectorAll('path')].find(l => l.getAttribute('stroke-dasharray'))?.getAttribute('stroke-dasharray')).toBe('16,6');
  });

  it('uses a custom stroke width when set, defaulting to 2', () => {
    const layer1 = makeLayer();
    const defaultWidth = renderCloudConnector(baseConnector(), { x: 0, y: 0 }, { x: 100, y: 50 }, layer1, false);
    const visible1 = [...defaultWidth.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible1?.getAttribute('stroke-width')).toBe('2');

    const layer2 = makeLayer();
    const customWidth = renderCloudConnector(baseConnector({ width: 5 }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer2, false);
    const visible2 = [...customWidth.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible2?.getAttribute('stroke-width')).toBe('5');
  });

  it('uses the connector color when set, defaulting to the neutral gray', () => {
    const layer1 = makeLayer();
    const defaultColor = renderCloudConnector(baseConnector(), { x: 0, y: 0 }, { x: 100, y: 50 }, layer1, false);
    const visible1 = [...defaultColor.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible1?.getAttribute('stroke')).toBe('#8b949e');

    const layer2 = makeLayer();
    const customColor = renderCloudConnector(baseConnector({ color: '#ff0000' }), { x: 0, y: 0 }, { x: 100, y: 50 }, layer2, false);
    const visible2 = [...customColor.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible2?.getAttribute('stroke')).toBe('#ff0000');
  });

  it('rounds orthogonal corners with a quadratic curve when roundedCorners is true', () => {
    // Uses a route with a real bend (right-angle turn), not a collinear stub-bend-stub route,
    // since a "corner" between 3 collinear points has nothing to round.
    const layer2 = makeLayer();
    const group2 = renderCloudConnector(
      baseConnector({ routing: 'orthogonal', roundedCorners: true }), { x: 32, y: 64 }, { x: 300, y: 200 }, layer2, false, 'bottom', 'top'
    );
    const visible2 = [...group2.querySelectorAll('path')].find(l => l.getAttribute('stroke') !== 'transparent');
    expect(visible2?.getAttribute('d')).not.toContain(' L 32 176 L 300 176 '); // sharp corners gone
    expect(visible2?.getAttribute('d')).toContain('Q'); // replaced with quadratic-curve corners
  });

  describe('resolveRoutePoints', () => {
    it('always returns the auto-computed orthogonal route (no manual override)', () => {
      const pts = resolveRoutePoints({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left', 'orthogonal');
      expect(pts.length).toBeGreaterThan(2); // the stub-bend-stub route, not a 2-point line
    });
  });

  describe('inferBestSide', () => {
    it('picks the side facing the target for a dominant horizontal offset', () => {
      expect(inferBestSide({ x: 0, y: 0 }, { x: 100, y: 5 })).toBe('right');
      expect(inferBestSide({ x: 0, y: 0 }, { x: -100, y: 5 })).toBe('left');
    });

    it('picks the side facing the target for a dominant vertical offset', () => {
      expect(inferBestSide({ x: 0, y: 0 }, { x: 5, y: 100 })).toBe('bottom');
      expect(inferBestSide({ x: 0, y: 0 }, { x: 5, y: -100 })).toBe('top');
    });

    it('is symmetric: the dest-facing side is the reverse call of the source-facing side for two points directly across from each other', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 200, y: 0 };
      expect(inferBestSide(a, b)).toBe('right');
      expect(inferBestSide(b, a)).toBe('left');
    });
  });
});
