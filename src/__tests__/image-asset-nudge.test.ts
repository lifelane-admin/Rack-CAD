import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';

/**
 * Arrow-key pixel nudge for a selected image asset — same mechanism/rationale as
 * text-label-nudge.test.ts (see that file's header comment for why this is its own
 * single-test file rather than sharing one with the text-label case).
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

describe('Arrow-key pixel nudge — image asset', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('nudges a selected image asset 1px per arrow press', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      imageAssets: [{
        id: 'img-nudge', x: 50, y: 50, width: 40, height: 40,
        src: 'data:image/png;base64,AAAA', opacity: 1, rotation: 0,
      }],
      selection: [{ type: 'image', id: 'img-nudge' }],
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    const asset = stateManager.getState().imageAssets.find(a => a.id === 'img-nudge')!;
    expect(asset.x).toBe(50);
    expect(asset.y).toBe(49);
  });
});
