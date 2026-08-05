import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Text Box / Label tool — a "Text" toolbar/floating-toolbar tool that places a TextLabel
 * annotation on the canvas, selectable/draggable like any other item, editable via the
 * TextToolPanel (font/size/color/style/align/rotation), deletable, and undo/redo-aware.
 *
 * Note on ordering: this file's "dragging" test asserts an *exact* single-undo-step guarantee
 * (matches how a real single-App-instance session behaves). It's deliberately the first `it()`
 * below — like airdrop-destination.test.ts, every test here mounts a fresh `App`, and since
 * App.init() registers its own 'textlabel:update'/'edit:undo' listeners on the shared eventBus
 * singleton, listeners accumulate across `it()` blocks within one file. A drag's commit funnels
 * through eventBus.emit('textlabel:update', ...), so with N prior App instances still listening,
 * one emit would apply N (mostly redundant) undo-stack pushes instead of one. Running first means
 * exactly one App is registered when it matters. This is a test-environment artifact only — a
 * real running app only ever has one App instance.
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

describe('Text Box tool', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('dragging an existing label moves it and pushes exactly one undo entry', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-1', x: 100, y: 100, text: 'Rack A', fontFamily: 'Inter, sans-serif',
        fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#e6ecf2', align: 'left', backgroundColor: null, rotation: 0,
      }],
    });
    (app as any).renderAll();

    const labelEl = document.querySelector('[data-text-id="lbl-1"]') as SVGElement;
    expect(labelEl).toBeTruthy();

    labelEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    expect(stateManager.getState().selection).toEqual([{ type: 'text', id: 'lbl-1' }]);

    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 160, clientY: 130 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 160, clientY: 130 }));

    const moved = stateManager.getState().textLabels.find(t => t.id === 'lbl-1')!;
    // (100,100) -> (160,130), snapped to the 20px grid (snapEnabled defaults true).
    expect(moved.x).toBe(160);
    expect(moved.y).toBe(140);

    // Exactly one undo step should restore the pre-drag position.
    stateManager.undo();
    const reverted = stateManager.getState().textLabels.find(t => t.id === 'lbl-1')!;
    expect(reverted.x).toBe(100);
    expect(reverted.y).toBe(100);
  });

  it('placing a label via the text tool: click on canvas creates it, selects it, and reverts to select tool', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('tool:changed', 'text');
    expect(stateManager.getState().tool).toBe('text');

    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 400, clientY: 250 }));
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 250 }));

    const labels = stateManager.getState().textLabels;
    expect(labels.length).toBe(1);
    expect(labels[0].x).toBe(400);
    expect(labels[0].y).toBe(250);
    expect(labels[0].text).toBe('Label');

    // Stamp-once: tool reverts to select, and the new label is the active selection.
    expect(stateManager.getState().tool).toBe('select');
    expect(stateManager.getState().selection).toEqual([{ type: 'text', id: labels[0].id }]);

    // It actually rendered into the DOM (label-layer).
    const el = document.querySelector(`[data-text-id="${labels[0].id}"]`);
    expect(el).toBeTruthy();
  });

  it('clicking an already-placed label re-selects it without wiping the selection (click-after-mousedown regression)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-2', x: 50, y: 50, text: 'Zone 1', fontFamily: 'Inter, sans-serif',
        fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#e6ecf2', align: 'left', backgroundColor: null, rotation: 0,
      }],
    });
    (app as any).renderAll();

    const labelEl = document.querySelector('[data-text-id="lbl-2"]') as SVGElement;
    labelEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
    labelEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 50, clientY: 50 }));
    labelEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 }));

    expect(stateManager.getState().selection).toEqual([{ type: 'text', id: 'lbl-2' }]);
  });

  it('editing style via textlabel:update applies live and deleting removes it', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-3', x: 10, y: 10, text: 'Old', fontFamily: 'Inter, sans-serif',
        fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#e6ecf2', align: 'left', backgroundColor: null, rotation: 0,
      }],
      selection: [{ type: 'text', id: 'lbl-3' }],
    });
    (app as any).renderAll();

    eventBus.emit('textlabel:update', {
      id: 'lbl-3',
      data: { text: 'New Label', fontWeight: 'bold', fontStyle: 'italic', underline: true, color: '#ff0000', fontSize: 24, align: 'center', rotation: 45, backgroundColor: '#111111' },
    });

    const updated = stateManager.getState().textLabels.find(t => t.id === 'lbl-3')!;
    expect(updated.text).toBe('New Label');
    expect(updated.fontWeight).toBe('bold');
    expect(updated.fontStyle).toBe('italic');
    expect(updated.underline).toBe(true);
    expect(updated.color).toBe('#ff0000');
    expect(updated.fontSize).toBe(24);
    expect(updated.align).toBe('center');
    expect(updated.rotation).toBe(45);
    expect(updated.backgroundColor).toBe('#111111');

    // Deleting the current selection removes the label.
    stateManager.setState({ selection: [{ type: 'text', id: 'lbl-3' }] });
    eventBus.emit('edit:delete', undefined);
    expect(stateManager.getState().textLabels.find(t => t.id === 'lbl-3')).toBeUndefined();
  });

  it('undo/redo restores a deleted label', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-4', x: 0, y: 0, text: 'Delete me', fontFamily: 'Inter, sans-serif',
        fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#e6ecf2', align: 'left', backgroundColor: null, rotation: 0,
      }],
      selection: [{ type: 'text', id: 'lbl-4' }],
    });

    eventBus.emit('edit:delete', undefined);
    expect(stateManager.getState().textLabels.length).toBe(0);

    // Direct stateManager.undo()/redo() calls — see the file-level note above re: why
    // eventBus.emit('edit:undo'/'edit:redo', ...) isn't used here.
    stateManager.undo();
    expect(stateManager.getState().textLabels.length).toBe(1);
    expect(stateManager.getState().textLabels[0].id).toBe('lbl-4');

    stateManager.redo();
    expect(stateManager.getState().textLabels.length).toBe(0);
  });
});
