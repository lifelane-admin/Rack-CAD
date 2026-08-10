import { describe, it, expect } from 'vitest';
import { renderCloudContainer } from '../renderers/cloud-container-renderer';
import type { CloudContainer } from '../core/types';

function baseContainer(overrides: Partial<CloudContainer> = {}): CloudContainer {
  return {
    id: 'c1', kind: 'vpc', x: 0, y: 0, width: 300, height: 200, label: 'My VPC',
    ...overrides,
  };
}

function makeLayer(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
}

describe('renderCloudContainer', () => {
  it('renders a group with the correct data-cloud-container-id and position', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ x: 5, y: 8 }), layer, false);
    expect(group.getAttribute('data-cloud-container-id')).toBe('c1');
    expect(group.getAttribute('transform')).toBe('translate(5, 8)');
  });

  it('uses the AWS accent color for an aws-provider container', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ provider: 'aws' }), layer, false);
    const rect = group.querySelector('rect');
    expect(rect?.getAttribute('stroke')).toBe('#FF9900');
  });

  it('uses the Azure accent color for an azure-provider container', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ provider: 'azure' }), layer, false);
    const rect = group.querySelector('rect');
    expect(rect?.getAttribute('stroke')).toBe('#0078D4');
  });

  it('falls back to a neutral accent when no provider is set', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ provider: undefined }), layer, false);
    const rect = group.querySelector('rect');
    expect(rect?.getAttribute('stroke')).toBe('#8b949e');
  });

  it('an explicit color override wins over the provider accent', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ provider: 'aws', color: '#123456' }), layer, false);
    const rect = group.querySelector('rect');
    expect(rect?.getAttribute('stroke')).toBe('#123456');
  });

  it('renders the label text', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ label: 'Prod Subnet' }), layer, false);
    expect(group.textContent).toContain('Prod Subnet');
  });

  it('applies distinct border treatments per kind', () => {
    const cases: [CloudContainer['kind'], string | undefined, number][] = [
      ['account', '14,4', 2.5],
      ['region', undefined, 2.5],
      ['vpc', undefined, 2],
      ['resource-group', '10,3,2,3', 1.5],
      ['az', '2,3', 1.5],
      ['subnet', '6,4', 1.5],
      ['generic', '6,4', 1.5],
    ];
    for (const [kind, dasharray, width] of cases) {
      const layer = makeLayer();
      const group = renderCloudContainer(baseContainer({ kind }), layer, false);
      const rect = group.querySelector('rect')!;
      expect(rect.getAttribute('stroke-width')).toBe(String(width));
      expect(rect.getAttribute('stroke-dasharray')).toBe(dasharray ?? null);
    }
  });

  it('draws an icon in the label chip when iconPath is given', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer({ iconId: 'azure-virtual-networks' }), layer, false, '/cloud-icons/azure/virtual-networks.svg');
    const img = group.querySelector('image');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('href')).toBe('/cloud-icons/azure/virtual-networks.svg');
  });

  it('omits the icon element when no iconPath is given', () => {
    const layer = makeLayer();
    const group = renderCloudContainer(baseContainer(), layer, false);
    expect(group.querySelector('image')).toBeNull();
  });

  it('adds a resize handle only when selected and unlocked', () => {
    const layer = makeLayer();
    const unselected = renderCloudContainer(baseContainer(), layer, false);
    expect(unselected.querySelector('.cloud-container-resize-handle')).toBeNull();

    const layer2 = makeLayer();
    const selected = renderCloudContainer(baseContainer(), layer2, true);
    expect(selected.querySelector('.cloud-container-resize-handle')).not.toBeNull();

    const layer3 = makeLayer();
    const lockedSelected = renderCloudContainer(baseContainer({ locked: true }), layer3, true);
    expect(lockedSelected.querySelector('.cloud-container-resize-handle')).toBeNull();
  });
});
