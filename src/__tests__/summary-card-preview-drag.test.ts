import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { stateManager } from '../core/state';
import { getAutoSummaryCardOffset } from '../renderers/export-summary-overlay';
import type { RackData } from '../core/types';

/**
 * Rack Load Summary / Cable Types cards — real SVG elements rendered live inside the pannable/
 * zoomable canvas (so they scale and pan correctly with the rack, unlike the old fixed-position
 * HTML overlay panels they replaced), always draggable whenever showLegends is true. There's no
 * separate "preview mode" toggle anymore — this rendering IS the only rendering, and dragging a
 * card sets rack.summaryCardOffset, which the export pipeline (utils/export.ts's exportSVG)
 * reads directly, so wherever a card is dragged live is exactly where it lands in every export.
 *
 * A single App instance is created for the whole file (matches the existing end-to-end pattern
 * in custom-layout-devices.test.ts) — eventBus is a module-level singleton, so a second App()
 * per test would register a second copy of every handler, double-firing it on every emit.
 */
describe('Rack Load Summary / Cable Types cards — drag-to-place on the live canvas', () => {
  beforeAll(async () => {
    document.body.innerHTML = `
      <div id="app">
        <header id="toolbar"></header>
        <div id="workspace">
          <aside id="sidebar"></aside>
          <main id="canvas-container">
            <div id="ruler-corner"></div>
            <div id="ruler-horizontal"></div>
            <div id="ruler-vertical"></div>
            <div id="canvas-viewport"><svg id="canvas"></svg></div>
            <div id="minimap"></div>
          </main>
          <aside id="properties-panel"></aside>
        </div>
        <footer id="statusbar"></footer>
        <div id="context-menu" class="hidden"></div>
      </div>
      <div id="ai-key-modal" class="hidden"></div>
      <div id="export-report-modal" class="hidden"></div>
      <div id="custom-asset-modal" class="hidden"></div>
    `;
    const { App } = await import('../app');
    const app = new App();
    app.init();
    (globalThis as any).__testApp = app;
  });

  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], selection: [], cableInProgress: null,
    });
  });

  function renderAll(): void {
    (globalThis as any).__testApp.renderAll();
  }

  // mousemove is bound to the #canvas SVG element itself (not window) in app.ts's
  // setupCanvasInteractions — only mouseup is window-level. Dispatching mousemove on window
  // (as an earlier draft of this test did) silently never reaches the drag handler.
  function canvasEl(): SVGSVGElement {
    return document.getElementById('canvas') as unknown as SVGSVGElement;
  }

  it('cards render whenever showLegends is on, and disappear when it is off — no separate toggle needed', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 };
    stateManager.setState({ racks: [rack], showLegends: true });
    renderAll();
    expect(document.querySelector('[data-draggable="true"]')).toBeTruthy();

    stateManager.setState({ showLegends: false });
    renderAll();
    expect(document.querySelector('[data-draggable="true"]')).toBeFalsy();

    stateManager.setState({ showLegends: true });
    renderAll();
    expect(document.querySelector('[data-draggable="true"]')).toBeTruthy();
  });

  it('dragging a card commits rack.summaryCardOffset as (auto default + pointer delta), with no history entries added mid-drag', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 };
    stateManager.setState({ racks: [rack], devices: [], showLegends: true });
    renderAll();

    const cardEl = document.querySelector('[data-rack-id="r1"][data-draggable="true"]') as SVGGElement;
    expect(cardEl).toBeTruthy();

    const startOffset = getAutoSummaryCardOffset(rack, []);

    cardEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
    canvasEl().dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 130 }));

    // Still dragging — nothing committed to the rack yet (transient preview only).
    expect(stateManager.getRack('r1')?.summaryCardOffset).toBeUndefined();

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 150, clientY: 130 }));

    const finalOffset = stateManager.getRack('r1')?.summaryCardOffset;
    expect(finalOffset).toBeTruthy();
    expect(finalOffset!.x).toBeCloseTo(startOffset.x + 50);
    expect(finalOffset!.y).toBeCloseTo(startOffset.y + 30);
  });

  it('a second drag starts from the previously-saved offset, not the auto default', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, summaryCardOffset: { x: 900, y: 200 } };
    stateManager.setState({ racks: [rack], devices: [], showLegends: true });
    renderAll();

    const cardEl = document.querySelector('[data-rack-id="r1"][data-draggable="true"]') as SVGGElement;
    expect(cardEl).toBeTruthy();

    cardEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
    canvasEl().dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: -20 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 10, clientY: -20 }));

    const finalOffset = stateManager.getRack('r1')?.summaryCardOffset;
    expect(finalOffset!.x).toBeCloseTo(900 + 10);
    expect(finalOffset!.y).toBeCloseTo(200 - 20);
  });
});
