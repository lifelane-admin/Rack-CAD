import { describe, it, expect } from 'vitest';
import { renderFrontPanel } from '../renderers/panel-renderer';
import { getTemplate } from '../library/device-catalog';

describe('renderFrontPanel', () => {
  const W = 350;

  it('returns an SVGGElement for rs-sw-24p', () => {
    const t = getTemplate('rs-sw-24p')!;
    const result = renderFrontPanel('switch', t, null, W, 30);
    expect(result).toBeDefined();
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for rs-sw-48p', () => {
    const t = getTemplate('rs-sw-48p')!;
    const result = renderFrontPanel('switch', t, null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('returns an SVGGElement for server-2u', () => {
    const t = getTemplate('server-2u')!;
    const result = renderFrontPanel('server', t, null, W, 60);
    expect(result.tagName.toLowerCase()).toBe('g');
  });

  it('handles null template gracefully (renders generic dark rect)', () => {
    const result = renderFrontPanel('server', null, null, W, 30);
    expect(result.tagName.toLowerCase()).toBe('g');
    const rect = result.querySelector('rect');
    expect(rect).toBeTruthy();
  });

  it('returns SVGGElement for every category', () => {
    const categories = ['server','switch','router','firewall','storage','patch-panel','pdu','ups','blank-panel','cable-manager','cooling','console'] as const;
    for (const cat of categories) {
      const result = renderFrontPanel(cat, null, null, W, 30);
      expect(result.tagName.toLowerCase()).toBe('g');
    }
  });
});
