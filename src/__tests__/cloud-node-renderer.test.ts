import { describe, it, expect } from 'vitest';
import { renderCloudNode } from '../renderers/cloud-node-renderer';
import type { CloudNode } from '../core/types';

function baseNode(overrides: Partial<CloudNode> = {}): CloudNode {
  return {
    id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws',
    x: 10, y: 20, width: 64, height: 64, label: 'Amazon EC2',
    ...overrides,
  };
}

function makeLayer(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
}

describe('renderCloudNode', () => {
  it('renders a group with the correct data-cloud-node-id and translate transform', () => {
    const layer = makeLayer();
    const group = renderCloudNode(baseNode(), '/cloud-icons/aws/amazon-ec2.svg', layer, false);
    expect(group.getAttribute('data-cloud-node-id')).toBe('n1');
    expect(group.getAttribute('transform')).toBe('translate(10, 20)');
    expect(layer.contains(group)).toBe(true);
  });

  it('renders an <image> referencing the given icon path', () => {
    const layer = makeLayer();
    const group = renderCloudNode(baseNode(), '/cloud-icons/aws/amazon-ec2.svg', layer, false);
    const img = group.querySelector('image');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('href')).toBe('/cloud-icons/aws/amazon-ec2.svg');
  });

  it('renders the label text when selected and unselected alike', () => {
    const layer = makeLayer();
    const group = renderCloudNode(baseNode({ label: 'My Server' }), '/x.svg', layer, false);
    expect(group.textContent).toContain('My Server');
  });

  it('adds a selection outline and resize handle only when selected', () => {
    const layer1 = makeLayer();
    const unselected = renderCloudNode(baseNode(), '/x.svg', layer1, false);
    expect(unselected.querySelector('.cloud-node-resize-handle')).toBeNull();

    const layer2 = makeLayer();
    const selected = renderCloudNode(baseNode(), '/x.svg', layer2, true);
    expect(selected.querySelector('.cloud-node-resize-handle')).not.toBeNull();
  });

  it('omits the resize handle for a locked node even when selected', () => {
    const layer = makeLayer();
    const group = renderCloudNode(baseNode({ locked: true }), '/x.svg', layer, true);
    expect(group.querySelector('.cloud-node-resize-handle')).toBeNull();
    expect(group.getAttribute('cursor')).toBe('default');
  });

  it('renders exactly 4 connection handles (top/right/bottom/left) only once selected, not before', () => {
    const layer1 = makeLayer();
    const unselected = renderCloudNode(baseNode(), '/x.svg', layer1, false);
    expect(unselected.querySelectorAll('.cloud-node-connect-handle').length).toBe(0);

    const layer2 = makeLayer();
    const selected = renderCloudNode(baseNode(), '/x.svg', layer2, true);
    const handles = selected.querySelectorAll('.cloud-node-connect-handle');
    expect(handles.length).toBe(4);
    const sides = [...handles].map(h => h.getAttribute('data-handle-side')).sort();
    expect(sides).toEqual(['bottom', 'left', 'right', 'top']);
    expect([...handles].every(h => h.getAttribute('data-cloud-node-id') === 'n1')).toBe(true);
  });

  it('positions the connection handles at the midpoint of each side', () => {
    const layer = makeLayer();
    const group = renderCloudNode(baseNode({ width: 64, height: 64 }), '/x.svg', layer, true);
    const byside = (side: string) => group.querySelector(`.cloud-node-connect-handle[data-handle-side="${side}"]`)!;
    expect(byside('top').getAttribute('cx')).toBe('32');
    expect(byside('top').getAttribute('cy')).toBe('0');
    expect(byside('right').getAttribute('cx')).toBe('64');
    expect(byside('right').getAttribute('cy')).toBe('32');
    expect(byside('bottom').getAttribute('cx')).toBe('32');
    expect(byside('bottom').getAttribute('cy')).toBe('64');
    expect(byside('left').getAttribute('cx')).toBe('0');
    expect(byside('left').getAttribute('cy')).toBe('32');
  });

  it('renders connection handles for a locked selected node too (locking only blocks moving/resizing the node itself)', () => {
    const layer = makeLayer();
    const group = renderCloudNode(baseNode({ locked: true }), '/x.svg', layer, true);
    expect(group.querySelectorAll('.cloud-node-connect-handle').length).toBe(4);
  });

  describe('showHandles independent of selection (hover target during an active connector drag)', () => {
    it('shows handles on an unselected node when showHandles is explicitly true', () => {
      const layer = makeLayer();
      const group = renderCloudNode(baseNode(), '/x.svg', layer, false, true);
      expect(group.querySelectorAll('.cloud-node-connect-handle').length).toBe(4);
    });

    it('draws a solid drop-target outline (not the dashed selection outline) when shown via hover, not selection', () => {
      const layer = makeLayer();
      const group = renderCloudNode(baseNode(), '/x.svg', layer, false, true);
      const rects = [...group.querySelectorAll('rect')];
      const outline = rects.find(r => r.getAttribute('stroke') === '#3fb950');
      expect(outline).toBeDefined();
      expect(outline!.getAttribute('stroke-dasharray')).toBeNull();
      // Not the resize handle either — that only ever appears when truly selected.
      expect(group.querySelector('.cloud-node-resize-handle')).toBeNull();
    });

    it('omits handles when explicitly false even though the node is selected (not a realistic call, but the param should still win)', () => {
      const layer = makeLayer();
      const group = renderCloudNode(baseNode(), '/x.svg', layer, true, false);
      expect(group.querySelectorAll('.cloud-node-connect-handle').length).toBe(0);
      // Selection chrome (dashed outline + resize handle) is untouched by showHandles.
      expect(group.querySelector('.cloud-node-resize-handle')).not.toBeNull();
    });

    it('defaults showHandles to the selected value when omitted (existing call sites unaffected)', () => {
      const layer1 = makeLayer();
      expect(renderCloudNode(baseNode(), '/x.svg', layer1, false).querySelectorAll('.cloud-node-connect-handle').length).toBe(0);
      const layer2 = makeLayer();
      expect(renderCloudNode(baseNode(), '/x.svg', layer2, true).querySelectorAll('.cloud-node-connect-handle').length).toBe(4);
    });
  });
});
