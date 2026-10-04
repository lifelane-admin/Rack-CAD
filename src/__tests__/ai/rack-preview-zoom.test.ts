import { describe, it, expect, beforeEach } from 'vitest';
import { RackPreviewZoom } from '../../ai/workflow/rack-preview-zoom';

function makeContainer() {
  const inner = document.createElement('div');
  inner.className = 'rack-frame-inner';
  const outer = document.createElement('div');
  outer.className = 'rack-preview-container';
  outer.appendChild(inner);
  document.body.appendChild(outer);
  return { outer, inner };
}

describe('RackPreviewZoom', () => {
  let outer: HTMLElement;
  let inner: HTMLElement;
  let zoom: RackPreviewZoom;

  beforeEach(() => {
    ({ outer, inner } = makeContainer());
    zoom = new RackPreviewZoom(outer, inner);
  });

  it('initialises at scale 1.0', () => {
    expect(zoom.getScale()).toBe(1.0);
  });

  it('scrolling up increases scale', () => {
    outer.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    expect(zoom.getScale()).toBeGreaterThan(1.0);
  });

  it('scrolling down decreases scale', () => {
    outer.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    expect(zoom.getScale()).toBeLessThan(1.0);
  });

  it('clamps scale to minimum 0.4', () => {
    for (let i = 0; i < 30; i++) {
      outer.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true }));
    }
    expect(zoom.getScale()).toBeGreaterThanOrEqual(0.4);
  });

  it('clamps scale to maximum 3.0', () => {
    for (let i = 0; i < 30; i++) {
      outer.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true }));
    }
    expect(zoom.getScale()).toBeLessThanOrEqual(3.0);
  });

  it('reset() returns scale to 1.0', () => {
    outer.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
    zoom.reset();
    expect(zoom.getScale()).toBe(1.0);
  });
});
