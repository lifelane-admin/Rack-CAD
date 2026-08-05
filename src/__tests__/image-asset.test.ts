import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Custom Image tool — an "Insert Image" floating-toolbar button that opens a file picker and
 * drops the uploaded image (PNG/etc., alpha transparency preserved via data URL) onto the
 * canvas as a free-floating, selectable/draggable/resizable ImageAsset.
 *
 * Note on ordering: like text-label.test.ts, this file's drag/resize-vs-undo test is placed
 * first — every `it()` mounts a fresh App, and since drag/resize commits funnel through
 * eventBus.emit('imageasset:update', ...), listeners accumulated from prior `it()` blocks would
 * turn one logical drag into N undo-stack pushes. Running first keeps that test's App the only
 * listener registered when it matters (see the identical note in text-label.test.ts).
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

describe('Custom Image tool', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('dragging an image moves it, resizing preserves aspect ratio, both push exactly one undo entry', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      imageAssets: [{
        id: 'img-1', x: 100, y: 100, width: 100, height: 50,
        src: 'data:image/png;base64,AAAA', opacity: 1, rotation: 0,
      }],
    });
    (app as any).renderAll();

    const imgEl = document.querySelector('[data-image-id="img-1"]') as SVGElement;
    expect(imgEl).toBeTruthy();

    // Drag: smooth 1:1 tracking, no grid rounding mid-drag; snapped only on drop.
    imgEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    expect(stateManager.getState().selection).toEqual([{ type: 'image', id: 'img-1' }]);

    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 155, clientY: 122 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 155, clientY: 122 }));

    const moved = stateManager.getState().imageAssets.find(a => a.id === 'img-1')!;
    // (100,100) -> (155,122), snapped to the 20px grid on drop.
    expect(moved.x).toBe(160);
    expect(moved.y).toBe(120);

    stateManager.undo();
    const revertedAfterDrag = stateManager.getState().imageAssets.find(a => a.id === 'img-1')!;
    expect(revertedAfterDrag.x).toBe(100);
    expect(revertedAfterDrag.y).toBe(100);
    expect(revertedAfterDrag.width).toBe(100);
    expect(revertedAfterDrag.height).toBe(50);

    // Re-apply the drag so the resize test below starts from the moved position (redo it).
    stateManager.redo();

    // Resize via the corner handle — aspect ratio (100:50 = 2:1) must be preserved.
    const handleEl = document.querySelector('.image-resize-handle[data-image-id="img-1"]') as SVGElement | null;
    // Selection must render the handle (image is selected from the drag above).
    expect(handleEl).toBeTruthy();

    handleEl!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 260, clientY: 170 }));
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 310, clientY: 170 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 310, clientY: 170 }));

    const resized = stateManager.getState().imageAssets.find(a => a.id === 'img-1')!;
    expect(resized.width).toBe(150);
    expect(resized.height).toBe(75); // 150 / (100/50) = 75, aspect ratio preserved

    stateManager.undo();
    const revertedAfterResize = stateManager.getState().imageAssets.find(a => a.id === 'img-1')!;
    expect(revertedAfterResize.width).toBe(100);
    expect(revertedAfterResize.height).toBe(50);
  });

  it('inserting an image via image:insert centers it in the viewport, selects it, and renders it', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('image:insert' as any, undefined);
    const fileInput = document.querySelector('input[type="file"]:not(#prop-dev-panel-file)') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    // Simulate picking a 1x1 transparent PNG (the smallest valid PNG data URL) and let the
    // component's FileReader + Image probe pipeline run.
    const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const file = new File([Uint8Array.from(atob(pngDataUrl.split(',')[1]), c => c.charCodeAt(0))], 'logo.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));

    // FileReader + Image onload are async (even against an in-memory blob in jsdom) — poll
    // instead of a fixed sleep, since a busy test run can push actual callback timing well past
    // any single fixed wait.
    const deadline = Date.now() + 2000;
    while (stateManager.getState().imageAssets.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const assets = stateManager.getState().imageAssets;
    expect(assets.length).toBe(1);
    expect(assets[0].src.startsWith('data:image/png')).toBe(true);
    expect(assets[0].opacity).toBe(1);
    expect(stateManager.getState().selection).toEqual([{ type: 'image', id: assets[0].id }]);

    const el = document.querySelector(`[data-image-id="${assets[0].id}"]`);
    expect(el).toBeTruthy();
  });

  it('clicking an already-placed image re-selects it without wiping the selection (click-after-mousedown regression)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      imageAssets: [{
        id: 'img-2', x: 50, y: 50, width: 80, height: 40,
        src: 'data:image/png;base64,AAAA', opacity: 1, rotation: 0,
      }],
    });
    (app as any).renderAll();

    const imgEl = document.querySelector('[data-image-id="img-2"]') as SVGElement;
    imgEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 60, clientY: 60 }));
    imgEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 60, clientY: 60 }));
    imgEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 60 }));

    expect(stateManager.getState().selection).toEqual([{ type: 'image', id: 'img-2' }]);
  });

  it('adjusting opacity via imageasset:update applies live and deleting removes it', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      imageAssets: [{
        id: 'img-3', x: 10, y: 10, width: 60, height: 60,
        src: 'data:image/png;base64,AAAA', opacity: 1, rotation: 0,
      }],
      selection: [{ type: 'image', id: 'img-3' }],
    });
    (app as any).renderAll();

    eventBus.emit('imageasset:update', { id: 'img-3', data: { opacity: 0.4, rotation: 90 } });

    const updated = stateManager.getState().imageAssets.find(a => a.id === 'img-3')!;
    expect(updated.opacity).toBe(0.4);
    expect(updated.rotation).toBe(90);

    stateManager.setState({ selection: [{ type: 'image', id: 'img-3' }] });
    eventBus.emit('edit:delete', undefined);
    expect(stateManager.getState().imageAssets.find(a => a.id === 'img-3')).toBeUndefined();
  });

  it('undo/redo restores a deleted image', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      imageAssets: [{
        id: 'img-4', x: 0, y: 0, width: 40, height: 40,
        src: 'data:image/png;base64,AAAA', opacity: 1, rotation: 0,
      }],
      selection: [{ type: 'image', id: 'img-4' }],
    });

    eventBus.emit('edit:delete', undefined);
    expect(stateManager.getState().imageAssets.length).toBe(0);

    stateManager.undo();
    expect(stateManager.getState().imageAssets.length).toBe(1);
    expect(stateManager.getState().imageAssets[0].id).toBe('img-4');

    stateManager.redo();
    expect(stateManager.getState().imageAssets.length).toBe(0);
  });
});
