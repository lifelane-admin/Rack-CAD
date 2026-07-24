const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSVGElement(tag: string, attributes?: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  if (attributes) {
    setAttributes(el, attributes);
  }
  return el;
}

export function setAttributes(element: Element, attributes: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
}

export function createGroup(id?: string, className?: string): SVGGElement {
  const attrs: Record<string, string> = {};
  if (id) attrs.id = id;
  if (className) attrs.class = className;
  return createSVGElement('g', attrs) as SVGGElement;
}

export function createRect(x: number, y: number, w: number, h: number, attrs?: Record<string, string | number>): SVGRectElement {
  return createSVGElement('rect', { x, y, width: w, height: h, ...attrs }) as SVGRectElement;
}

export function createCircle(cx: number, cy: number, r: number, attrs?: Record<string, string | number>): SVGCircleElement {
  return createSVGElement('circle', { cx, cy, r, ...attrs }) as SVGCircleElement;
}

export function createLine(x1: number, y1: number, x2: number, y2: number, attrs?: Record<string, string | number>): SVGLineElement {
  return createSVGElement('line', { x1, y1, x2, y2, ...attrs }) as SVGLineElement;
}

export function createText(x: number, y: number, text: string, attrs?: Record<string, string | number>): SVGTextElement {
  const el = createSVGElement('text', { x, y, ...attrs }) as SVGTextElement;
  el.textContent = text;
  return el;
}

export function createPath(d: string, attrs?: Record<string, string | number>): SVGPathElement {
  return createSVGElement('path', { d, ...attrs }) as SVGPathElement;
}

export function createPattern(id: string, width: number, height: number, children: SVGElement[]): SVGPatternElement {
  const el = createSVGElement('pattern', { id, width, height, patternUnits: 'userSpaceOnUse' }) as SVGPatternElement;
  children.forEach(child => el.appendChild(child));
  return el;
}

export function createLinearGradient(id: string, stops: Array<{ offset: string; color: string; opacity?: string }>): SVGLinearGradientElement {
  const el = createSVGElement('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '0%' }) as SVGLinearGradientElement;
  stops.forEach(s => {
    const stop = createSVGElement('stop', { offset: s.offset, 'stop-color': s.color });
    if (s.opacity) stop.setAttribute('stop-opacity', s.opacity);
    el.appendChild(stop);
  });
  return el;
}

export function createFilter(id: string, children: SVGElement[]): SVGFilterElement {
  const el = createSVGElement('filter', { id }) as SVGFilterElement;
  children.forEach(child => el.appendChild(child));
  return el;
}
