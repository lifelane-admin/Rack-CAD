import { describe, it, expect } from 'vitest';
import { renderFrontPanel } from '../renderers/panel-renderer';
import { getTemplate } from '../library/device-catalog';

describe('renderFrontPanel', () => {
  const W = 350;

  it('returns an SVGGElement for sw-tplink-sg2424', () => {
    const t = getTemplate('sw-tplink-sg2424')!;
    const result = renderFrontPanel('switch', t, W, 30);
    expect(result).toBeDefined();
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for sw-tplink-sg2448', () => {
    const t = getTemplate('sw-tplink-sg2448')!;
    const result = renderFrontPanel('switch', t, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for server-2u', () => {
    const t = getTemplate('server-2u')!;
    const result = renderFrontPanel('server', t, W, 60);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('handles null template gracefully (renders generic dark rect)', () => {
    const result = renderFrontPanel('server', null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
    const rect = result.querySelector('rect');
    expect(rect).toBeTruthy();
  });

  it('returns SVGGElement for every category', () => {
    const categories = ['server','switch','router','firewall','storage','patch-panel','pdu','ups','blank-panel','cable-manager','cooling','console'] as const;
    for (const cat of categories) {
      const result = renderFrontPanel(cat, null, W, 30);
      expect(result.tagName.toLowerCase()).toBe('g');
    }
  });
});
