import { describe, it, expect } from 'vitest';
import { renderTextLabel, DEFAULT_PADDING_X, DEFAULT_PADDING_Y } from '../renderers/text-label-renderer';
import { TextLabel } from '../core/types';

/**
 * The background box for an opaque (non-transparent) label was noticeably taller/wider than the
 * text itself — the box height used the same 1.3x-per-line factor meant for spacing BETWEEN
 * lines, plus a flat 6px padding on every side. Fixed to a tight default (a smaller,
 * line-height-independent factor for a single line's own height, tighter default padding) with
 * backgroundPaddingX/Y now exposed so the user can grow/shrink the box explicitly instead.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function baseLabel(overrides: Partial<TextLabel> = {}): TextLabel {
  return {
    id: 'lbl', x: 0, y: 0, text: 'NPCI Router 1', fontFamily: 'Inter, sans-serif',
    fontSize: 20, fontWeight: 'normal', fontStyle: 'normal', underline: false,
    color: '#1e88e5', align: 'left', backgroundColor: '#1f2937', rotation: 0,
    ...overrides,
  };
}

function renderAndGetBgRect(label: TextLabel): SVGRectElement {
  const layer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const group = renderTextLabel(label, layer, false);
  // First child is the background rect whenever backgroundColor is set (see renderer).
  return group.querySelector('rect') as SVGRectElement;
}

describe('Text label background box sizing', () => {
  it('defaults to a box tightly fit to the font size, not the old 1.3x line-height factor', () => {
    const label = baseLabel();
    const rect = renderAndGetBgRect(label);
    const height = Number(rect.getAttribute('height'));

    // Old behavior: fontSize * 1.3 + PADDING(6)*2 = 20*1.3 + 12 = 38. New behavior must be
    // meaningfully tighter than that while still comfortably covering ascenders/descenders.
    expect(height).toBeLessThan(30);
    expect(height).toBeGreaterThan(18);
  });

  it('uses the exported DEFAULT_PADDING_X/Y when the label sets no explicit padding', () => {
    const label = baseLabel();
    const rect = renderAndGetBgRect(label);
    const x = Number(rect.getAttribute('x'));
    const y = Number(rect.getAttribute('y'));
    // toBeCloseTo (not toBe) since -DEFAULT_PADDING_X is -0 when the default is 0, and
    // Object.is(-0, 0) is false even though they're numerically equal.
    expect(x).toBeCloseTo(-DEFAULT_PADDING_X); // align:'left' -> bgLeft is 0, so x = 0 - paddingX
    expect(y).toBeCloseTo(-DEFAULT_PADDING_Y);
  });

  it('grows the box when backgroundPaddingX/Y are increased', () => {
    const tight = renderAndGetBgRect(baseLabel());
    const loose = renderAndGetBgRect(baseLabel({ backgroundPaddingX: 20, backgroundPaddingY: 15 }));

    expect(Number(loose.getAttribute('width'))).toBeGreaterThan(Number(tight.getAttribute('width')));
    expect(Number(loose.getAttribute('height'))).toBeGreaterThan(Number(tight.getAttribute('height')));
  });

  it('shrinks the box when backgroundPaddingX/Y are set to 0', () => {
    const rect = renderAndGetBgRect(baseLabel({ backgroundPaddingX: 0, backgroundPaddingY: 0 }));
    expect(Number(rect.getAttribute('x'))).toBe(0);
    expect(Number(rect.getAttribute('y'))).toBe(0);
  });
});
