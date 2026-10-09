import { Point, Transform } from './types';
import { eventBus } from './event-bus';
import { stateManager } from './state';

export class CanvasManager {
  private container!: HTMLElement;
  private svg!: SVGSVGElement;
  private viewportGroup!: SVGGElement;
  private transform: Transform = { x: 0, y: 0, scale: 1 };

  private isPanning = false;
  private startPanPt: Point = { x: 0, y: 0 };
  private startTransform: Transform = { x: 0, y: 0, scale: 1 };

  constructor(containerId: string, svgId: string) {
    const container = document.getElementById(containerId);
    const svg = document.getElementById(svgId) as unknown as SVGSVGElement;
    
    if (!container || !svg) {
      throw new Error('Canvas container or SVG element not found');
    }

    this.container = container;
    this.svg = svg;

    this.initSVGStructure();
    this.bindEvents();
    this.updateTransform();
  }

  private initSVGStructure() {
    this.svg.innerHTML = '';
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Grid Pattern
    const gridPattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    gridPattern.setAttribute('id', 'grid-pattern');
    gridPattern.setAttribute('width', '20');
    gridPattern.setAttribute('height', '20');
    gridPattern.setAttribute('patternUnits', 'userSpaceOnUse');
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '1');
    circle.setAttribute('cy', '1');
    circle.setAttribute('r', '1');
    circle.setAttribute('fill', 'var(--canvas-grid-color, rgba(148, 163, 184, 0.25))');
    gridPattern.appendChild(circle);
    defs.appendChild(gridPattern);

    // Cable Shadow Filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'cable-shadow');
    const feDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
    feDropShadow.setAttribute('dx', '0');
    feDropShadow.setAttribute('dy', '1.5');
    feDropShadow.setAttribute('stdDeviation', '1.8');
    feDropShadow.setAttribute('flood-opacity', '0.5');
    feDropShadow.setAttribute('flood-color', '#000');
    filter.appendChild(feDropShadow);
    defs.appendChild(filter);

    this.svg.appendChild(defs);

    this.viewportGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.viewportGroup.setAttribute('id', 'viewport-group');

    const layerNames = ['grid-layer', 'rack-layer', 'cable-layer', 'label-layer', 'summary-preview-layer', 'interaction-layer'];
    for (const name of layerNames) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', name);
      if (name === 'grid-layer') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '-50000');
        rect.setAttribute('y', '-50000');
        rect.setAttribute('width', '100000');
        rect.setAttribute('height', '100000');
        rect.setAttribute('fill', 'url(#grid-pattern)');
        g.appendChild(rect);
      }
      this.viewportGroup.appendChild(g);
    }
    this.svg.appendChild(this.viewportGroup);
  }

  private bindEvents() {
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.svg.addEventListener('contextmenu', e => {
      e.preventDefault();
      const pt = this.screenToWorld({ x: e.clientX, y: e.clientY });
      eventBus.emit('canvas:rightclick', { point: pt, target: e.target, screenPoint: { x: e.clientX, y: e.clientY } });
    });

    const resizeObserver = new ResizeObserver(() => {
      this.updateRulers();
    });
    resizeObserver.observe(this.container);
  }

  private onMouseDown(e: MouseEvent) {
    // The export-area, text, and label tools own mousedown/mousemove/mouseup entirely
    // themselves (app.ts places the label / draws the drag rectangle) — clicking on empty
    // canvas background otherwise looks exactly like "click background to pan", so without this
    // guard the canvas would pan out from under a placement click instead of placing anything.
    const ownedTool = stateManager.getState().tool;
    if (ownedTool === 'export-area' || ownedTool === 'text' || ownedTool === 'label') return;

    const isPanTool = stateManager.getState().tool === 'pan';
    const isInteractiveTarget = (e.target as Element).closest('.rack') ||
                                 (e.target as Element).closest('.device') ||
                                 (e.target as Element).closest('.cable-element') ||
                                 (e.target as Element).closest('.port-element') ||
                                 (e.target as Element).closest('[data-text-id]') ||
                                 (e.target as Element).closest('[data-image-id]') ||
                                 (e.target as Element).closest('[data-draggable="true"]');
    const isClickedOnBackground = !isInteractiveTarget;

    if (e.button === 1 || isPanTool || (e.button === 0 && isClickedOnBackground)) {
      this.isPanning = true;
      this.startPanPt = { x: e.clientX, y: e.clientY };
      this.startTransform = { ...this.transform };
      this.svg.classList.add('cursor-grabbing');
      e.preventDefault();
    } else if (e.button === 0) {
      const pt = this.screenToWorld({ x: e.clientX, y: e.clientY });
      eventBus.emit('canvas:click', pt);
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (this.isPanning) {
      const dx = e.clientX - this.startPanPt.x;
      const dy = e.clientY - this.startPanPt.y;
      this.transform.x = this.startTransform.x + dx;
      this.transform.y = this.startTransform.y + dy;
      this.updateTransform();
    }
  }

  private onMouseUp() {
    this.isPanning = false;
    this.svg.classList.remove('cursor-grabbing');
  }

  /** Cancels an in-progress (or just-started) pan — called by app.ts's own mousedown handler
   *  when it determines the SAME gesture should actually be its pre-existing rubber-band select
   *  instead (a plain left-click on empty background with the 'select' tool active is ambiguous
   *  between "pan" and "start a rubber-band" — this class's mousedown listener registers first
   *  and optimistically starts a pan; app.ts's listener runs after and, if it decides this should
   *  be a rubber-band, interrupts that pan so the two don't fight over the same drag — panning
   *  would otherwise shift the transform by the same delta the mouse moved, making the
   *  rubber-band's own screenToWorld() collapse back to a zero-size rectangle at mouseup). No-op
   *  if nothing was panning (e.g. the drag actually landed on a rack/device, or the Pan tool). */
  cancelPan(): void {
    this.isPanning = false;
    this.svg.classList.remove('cursor-grabbing');
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 1.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    
    let newScale = this.transform.scale * (direction > 0 ? zoomFactor : 1 / zoomFactor);
    newScale = Math.max(0.1, Math.min(newScale, 10));

    const rect = this.svg.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const worldX = (cursorX - this.transform.x) / this.transform.scale;
    const worldY = (cursorY - this.transform.y) / this.transform.scale;

    this.transform.scale = newScale;
    this.transform.x = cursorX - worldX * newScale;
    this.transform.y = cursorY - worldY * newScale;

    this.updateTransform();
  }

  private updateTransform() {
    this.viewportGroup.setAttribute(
      'transform',
      `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.scale})`
    );
    this.updateRulers();
    eventBus.emit('canvas:transformed', this.transform);
  }

  screenToWorld(point: Point): Point {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (point.x - rect.left - this.transform.x) / this.transform.scale,
      y: (point.y - rect.top - this.transform.y) / this.transform.scale
    };
  }

  worldToScreen(point: Point): Point {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: point.x * this.transform.scale + this.transform.x + rect.left,
      y: point.y * this.transform.scale + this.transform.y + rect.top
    };
  }

  setTransform(transform: Transform) {
    this.transform = { ...transform };
    this.updateTransform();
  }

  getTransform(): Transform {
    return { ...this.transform };
  }

  zoomTo(level: number, center?: Point) {
    const targetScale = Math.max(0.1, Math.min(level, 10));
    const rect = this.svg.getBoundingClientRect();
    const cx = center ? center.x : rect.width / 2;
    const cy = center ? center.y : rect.height / 2;
    
    const worldX = (cx - this.transform.x) / this.transform.scale;
    const worldY = (cy - this.transform.y) / this.transform.scale;

    this.transform.scale = targetScale;
    this.transform.x = cx - worldX * targetScale;
    this.transform.y = cy - worldY * targetScale;
    
    this.updateTransform();
  }

  fitToContent() {
    this.transform = { x: 50, y: 50, scale: 0.5 };
    this.updateTransform();
  }

  getLayer(name: string): SVGGElement | null {
    return this.viewportGroup.querySelector(`#${name}`);
  }
  
  private updateRulers() {
    const hr = document.getElementById('ruler-horizontal');
    const vr = document.getElementById('ruler-vertical');
    if (hr) {
      hr.style.backgroundPositionX = `${this.transform.x}px`;
      hr.style.backgroundSize = `${100 * this.transform.scale}px 100%, ${10 * this.transform.scale}px 100%`;
    }
    if (vr) {
      vr.style.backgroundPositionY = `${this.transform.y}px`;
      vr.style.backgroundSize = `100% ${100 * this.transform.scale}px, 100% ${10 * this.transform.scale}px`;
    }
  }
}
