import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';

/**
 * Arrow-key pixel nudge for a selected text label — 1px per press, 10px with Shift held,
 * bypassing grid snapping entirely (the only way to land on an exact non-grid pixel; a mouse
 * drop still snaps to the grid when that toggle is on).
 *
 * Kept in its own single-test file: the nudge commits through
 * eventBus.emit('textlabel:update', ...), and every `it()` mounts a fresh App registering its
 * own 'keydown' listener on the shared `document` — with N accumulated listeners a single
 * keypress would apply the delta N times over (same accumulation caveat documented in
 * text-label.test.ts/image-asset.test.ts, here for `document.addEventListener` instead of
 * eventBus). A dedicated file with one test keeps exactly one App/listener in play.
 */
function mountAppSkeleton(): void {
  document.body.innerHTML = `
    <div id="app">
      <header id="toolbar"></header>
      <div id="workspace">
        <aside id="sidebar"></aside>
        <main id="canvas-container">
          <div id="ruler-corner"></div>
          <div id="ruler-horizontal"></div>
          <div id="ruler-vertical"></div>
          <div id="canvas-viewport">
            <svg id="canvas"></svg>
          </div>
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
}

describe('Arrow-key pixel nudge — text label', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('nudges a selected text label 1px per arrow press, 10px with Shift, ignoring the grid', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-nudge', x: 101, y: 101, text: 'Precise', fontFamily: 'Inter, sans-serif',
        fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#e6ecf2', align: 'left', backgroundColor: null, rotation: 0,
      }],
      selection: [{ type: 'text', id: 'lbl-nudge' }],
    });

    const fire = (key: string, shiftKey = false) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));

    fire('ArrowRight');
    let label = stateManager.getState().textLabels.find(t => t.id === 'lbl-nudge')!;
    expect(label.x).toBe(102); // odd starting pixel proves it's NOT grid-snapped
    expect(label.y).toBe(101);

    fire('ArrowDown');
    label = stateManager.getState().textLabels.find(t => t.id === 'lbl-nudge')!;
    expect(label.y).toBe(102);

    fire('ArrowRight', true); // Shift held -> 10px
    label = stateManager.getState().textLabels.find(t => t.id === 'lbl-nudge')!;
    expect(label.x).toBe(112);

    fire('ArrowLeft');
    fire('ArrowUp');
    label = stateManager.getState().textLabels.find(t => t.id === 'lbl-nudge')!;
    expect(label.x).toBe(111);
    expect(label.y).toBe(101);
  });
});
