import { Point, Transform } from './types';
import { eventBus } from './event-bus';
import { stateManager } from './state';

/**
 * Independent pan/zoom/layer manager for the Cloud Architecture canvas — deliberately NOT a
 * second instance of CanvasManager. CanvasManager hardcodes its own SVG layer names and emits
 * shared, unnamespaced events ('canvas:click', 'canvas:transformed') on the single global
 * eventBus; a second instance pointed at a different SVG would still fire those same event
 * names, cross-talking with app.ts's existing rack-canvas handlers. This mirrors
 * CanvasManager's mechanics but with its own SVG id, its own layer set, and namespaced
 * 'cloud-canvas:*' events so the two canvases can never interfere with each other.
 */
export class CloudCanvasManager {
  private container!: HTMLElement;
  private svg!: SVGSVGElement;
  private viewportGroup!: SVGGElement;
  private transform: Transform = { x: 0, y: 0, scale: 1 };

  private isPanning = false;
  private startPanPt: Point = { x: 0, y: 0 };
  private startTransform: Transform = { x: 0, y: 0, scale: 1 };

  // Left-click-and-drag marquee select on empty background (see 'cloud-canvas:area-select' in
  // types.ts) — mirrors CanvasManager's identical mechanics; right-click stays reserved for the
  // context menu only, with no drag handling of its own.
  private isAreaSelecting = false;
  private areaSelectDragged = false;
  private areaSelectStartWorld: Point = { x: 0, y: 0 };
  private areaSelectStartScreen: Point = { x: 0, y: 0 };
  private areaSelectEl: SVGRectElement | null = null;
  private static readonly AREA_SELECT_DRAG_THRESHOLD = 4;

  constructor(containerId: string, svgId: string) {
    const container = document.getElementById(containerId);
    const svg = document.getElementById(svgId) as unknown as SVGSVGElement;

    if (!container || !svg) {
      throw new Error('Cloud canvas container or SVG element not found');
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

    const gridPattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    gridPattern.setAttribute('id', 'cloud-grid-pattern');
    gridPattern.setAttribute('width', '20');
    gridPattern.setAttribute('height', '20');
    gridPattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '1');
    circle.setAttribute('cy', '1');
    circle.setAttribute('r', '1');
    circle.setAttribute('fill', '#888');
    gridPattern.appendChild(circle);
    defs.appendChild(gridPattern);

    // Connector line-tip markers — one per CloudArrowType (excluding 'none', which just omits
    // the marker-start/marker-end attribute entirely). id pattern: cloud-arrow-<type>. All use
    // orient="auto-start-reverse" so the SAME marker definition correctly flips to point
    // outward whether it's used as marker-start or marker-end.
    const makeMarker = (id: string, shape: 'path' | 'circle', d: string, fill: 'context-stroke' | 'none', stroke?: 'context-stroke') => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '7');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('orient', 'auto-start-reverse');
      const el = document.createElementNS('http://www.w3.org/2000/svg', shape);
      if (shape === 'path') el.setAttribute('d', d);
      el.setAttribute('fill', fill);
      if (stroke) { el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', '1.5'); }
      marker.appendChild(el);
      defs.appendChild(marker);
    };
    makeMarker('cloud-arrow-arrow', 'path', 'M 0 0 L 10 5 L 0 10 z', 'context-stroke');
    makeMarker('cloud-arrow-arrow-open', 'path', 'M 1 1 L 9 5 L 1 9', 'none', 'context-stroke');
    makeMarker('cloud-arrow-arrow-broad', 'path', 'M 0 1 L 10 5 L 0 9 z', 'context-stroke');
    makeMarker('cloud-arrow-diamond', 'path', 'M 5 0 L 10 5 L 5 10 L 0 5 z', 'context-stroke');
    const dotMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    dotMarker.setAttribute('id', 'cloud-arrow-dot');
    dotMarker.setAttribute('viewBox', '0 0 10 10');
    dotMarker.setAttribute('refX', '5');
    dotMarker.setAttribute('refY', '5');
    dotMarker.setAttribute('markerWidth', '6');
    dotMarker.setAttribute('markerHeight', '6');
    const dotCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dotCircle.setAttribute('cx', '5'); dotCircle.setAttribute('cy', '5'); dotCircle.setAttribute('r', '4');
    dotCircle.setAttribute('fill', 'context-stroke');
    dotMarker.appendChild(dotCircle);
    defs.appendChild(dotMarker);

    this.svg.appendChild(defs);

    this.viewportGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.viewportGroup.setAttribute('id', 'cloud-viewport-group');

    const layerNames = ['cloud-grid-layer', 'cloud-container-layer', 'cloud-hierarchy-layer', 'cloud-node-layer', 'cloud-connector-layer', 'cloud-interaction-layer'];
    for (const name of layerNames) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', name);
      if (name === 'cloud-grid-layer') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '-50000');
        rect.setAttribute('y', '-50000');
        rect.setAttribute('width', '100000');
        rect.setAttribute('height', '100000');
        rect.setAttribute('fill', 'url(#cloud-grid-pattern)');
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
      eventBus.emit('cloud-canvas:rightclick', { point: pt, target: e.target, screenPoint: { x: e.clientX, y: e.clientY } });
    });
  }

  private onMouseDown(e: MouseEvent) {
    // The container-draw and connect tools own mousedown/mousemove/mouseup entirely themselves
    // (app.ts draws the rectangle / connector line) — without this bypass, clicking empty cloud
    // canvas to start one of those gestures would just pan the canvas instead.
    const ownedTool = stateManager.getState().tool;
    if (ownedTool === 'cloud-container' || ownedTool === 'cloud-connect' || ownedTool === 'cloud-export-area') return;

    const isPanTool = ownedTool === 'pan';
    const isInteractiveTarget = (e.target as Element).closest('[data-cloud-node-id]') ||
                                 (e.target as Element).closest('[data-cloud-container-id]') ||
                                 (e.target as Element).closest('[data-cloud-connector-id]') ||
                                 (e.target as Element).closest('[data-cloud-hierarchy-id]') ||
                                 (e.target as Element).closest('[data-draggable="true"]');
    const isClickedOnBackground = !isInteractiveTarget;

    if (e.button === 1 || isPanTool) {
      this.isPanning = true;
      this.startPanPt = { x: e.clientX, y: e.clientY };
      this.startTransform = { ...this.transform };
      this.svg.classList.add('cursor-grabbing');
      e.preventDefault();
    } else if (e.button === 0 && isClickedOnBackground) {
      // Left-drag on background is marquee select, not pan — panning off background still works
      // via the middle mouse button (above) or the explicit Pan tool (isPanTool, above).
      this.isAreaSelecting = true;
      this.areaSelectDragged = false;
      this.areaSelectStartWorld = this.screenToWorld({ x: e.clientX, y: e.clientY });
      this.areaSelectStartScreen = { x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
      const pt = this.screenToWorld({ x: e.clientX, y: e.clientY });
      eventBus.emit('cloud-canvas:click', pt);
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

    if (this.isAreaSelecting) {
      const dx = e.clientX - this.areaSelectStartScreen.x;
      const dy = e.clientY - this.areaSelectStartScreen.y;
      if (!this.areaSelectDragged && Math.hypot(dx, dy) > CloudCanvasManager.AREA_SELECT_DRAG_THRESHOLD) {
        this.areaSelectDragged = true;
      }
      if (this.areaSelectDragged) {
        this.updateAreaSelectRect(e);
      }
    }
  }

  private updateAreaSelectRect(e: MouseEvent): void {
    const current = this.screenToWorld({ x: e.clientX, y: e.clientY });
    const x = Math.min(current.x, this.areaSelectStartWorld.x);
    const y = Math.min(current.y, this.areaSelectStartWorld.y);
    const w = Math.abs(current.x - this.areaSelectStartWorld.x);
    const h = Math.abs(current.y - this.areaSelectStartWorld.y);

    if (!this.areaSelectEl) {
      const layer = this.getLayer('cloud-interaction-layer');
      if (!layer) return;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('fill', 'rgba(88,166,255,0.08)');
      rect.setAttribute('stroke', '#58a6ff');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4,2');
      rect.setAttribute('pointer-events', 'none');
      layer.appendChild(rect);
      this.areaSelectEl = rect;
    }
    this.areaSelectEl.setAttribute('x', String(x));
    this.areaSelectEl.setAttribute('y', String(y));
    this.areaSelectEl.setAttribute('width', String(w));
    this.areaSelectEl.setAttribute('height', String(h));
  }

  private onMouseUp(e: MouseEvent) {
    this.isPanning = false;
    this.svg.classList.remove('cursor-grabbing');

    if (this.isAreaSelecting) {
      this.isAreaSelecting = false;
      this.areaSelectEl?.remove();
      this.areaSelectEl = null;
      if (this.areaSelectDragged) {
        const sx = this.areaSelectStartScreen, ex = { x: e.clientX, y: e.clientY };
        eventBus.emit('cloud-canvas:area-select', {
          left: Math.min(sx.x, ex.x), top: Math.min(sx.y, ex.y),
          right: Math.max(sx.x, ex.x), bottom: Math.max(sx.y, ex.y),
        });
      }
      this.areaSelectDragged = false;
    }
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
    eventBus.emit('cloud-canvas:transformed', this.transform);
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

  fitToContent() {
    this.transform = { x: 50, y: 50, scale: 0.5 };
    this.updateTransform();
  }

  getLayer(name: string): SVGGElement | null {
    return this.viewportGroup.querySelector(`#${name}`);
  }
}
