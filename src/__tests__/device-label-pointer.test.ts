import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { RACK_CONSTANTS, DeviceData } from '../core/types';

/**
 * "Add Label" tool — a floating-toolbar button (next to Text) that, while active, requires
 * clicking an actual device: it creates a TextLabel pre-filled with that device's name, carrying
 * a leader-line connector back to a device-local anchor point (core/types.ts's TextLabel
 * pointer* fields). The connector style is switchable per-label between 'elbow' (diagonal +
 * straight, matching the reference screenshot) and 'flexible' (draggable via-points, reusing the
 * exact same floating-toolbar Add/Remove Anchor buttons and drag interaction a cable's anchors
 * already use).
 *
 * None of these tests need the "run first in file" ordering trick used in
 * text-label.test.ts/image-asset.test.ts: label *creation* and the Text Tool panel's style
 * toggle/detach controls set fixed (idempotent) values via eventBus.emit('textlabel:update', ...)
 * — applying the same fixed value more than once (from any other still-registered App instance's
 * listener) is harmless. The flexible-anchor drag's mouseup completion is guarded by a
 * per-App-instance `this.isDraggingLabelAnchor` flag rather than being a bare eventBus reaction,
 * so it's likewise safe regardless of how many prior App instances this file has created.
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

function setUpRackWithDevice() {
  stateManager.setState({
    racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
    devices: [{
      id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: 'Test Server',
      hostname: '', managementIp: '', serialNumber: '', description: '',
      ports: [],
    } as DeviceData],
  });
}

describe('Add Label (device pointer)', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('clicking a device while the label tool is active creates a label pointing at it, pre-filled with the device name', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();
    (app as any).renderAll();

    const origin = stateManager.getDeviceWorldOrigin('d1')!;
    expect(origin).toBeTruthy();

    eventBus.emit('tool:changed', 'label');
    expect(stateManager.getState().tool).toBe('label');

    const deviceEl = document.querySelector('[data-device-id="d1"]') as SVGElement;
    expect(deviceEl).toBeTruthy();
    const clickPos = { x: origin.x + 12, y: origin.y + 8 };
    deviceEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: clickPos.x, clientY: clickPos.y }));

    const labels = stateManager.getState().textLabels;
    expect(labels.length).toBe(1);
    const label = labels[0];
    expect(label.text).toBe('Test Server');
    expect(label.pointerDeviceId).toBe('d1');
    expect(label.pointerStyle).toBe('elbow');
    // Device-local offset, not the raw click point.
    expect(label.pointerAnchorX).toBe(12);
    expect(label.pointerAnchorY).toBe(8);
    // Box placed clear of the rack's right edge.
    expect(label.x).toBe(300 + RACK_CONSTANTS.RACK_OUTER_WIDTH + 40);

    // Stamp-once: tool reverts to select, new label is the active selection.
    expect(stateManager.getState().tool).toBe('select');
    expect(stateManager.getState().selection).toEqual([{ type: 'text', id: label.id }]);
  });

  it('clicking empty canvas with the label tool active does not create a label', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();
    (app as any).renderAll();

    eventBus.emit('tool:changed', 'label');
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 900, clientY: 900 }));

    expect(stateManager.getState().textLabels.length).toBe(0);
    // Tool stays active on a miss — the user's intent to add a label isn't silently discarded.
    expect(stateManager.getState().tool).toBe('label');
  });

  it('the leader line follows the device automatically when it moves to a different rack unit', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();

    const originBefore = stateManager.getDeviceWorldOrigin('d1')!;
    stateManager.setState({
      textLabels: [{
        id: 'lbl-1', x: 800, y: 200, text: 'Test Server', fontFamily: 'Inter, sans-serif',
        fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', underline: false,
        color: '#ffffff', align: 'left', backgroundColor: '#1a4971', rotation: 0,
        pointerDeviceId: 'd1', pointerAnchorX: 10, pointerAnchorY: 5, pointerStyle: 'elbow',
      }],
    });

    const worldBefore = { x: originBefore.x + 10, y: originBefore.y + 5 };

    eventBus.emit('device:update', { id: 'd1', data: { startUnit: 20 } });

    const originAfter = stateManager.getDeviceWorldOrigin('d1')!;
    const worldAfter = { x: originAfter.x + 10, y: originAfter.y + 5 };

    expect(worldAfter.y).not.toBe(worldBefore.y); // moved to a different RU -> different world Y
    expect(originAfter.x).toBe(originBefore.x); // startUnit-only move doesn't change X
  });

  it('toggling Elbow/Flexible via the Text Tool panel seeds a default anchor point on first switch to Flexible', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-2', x: 800, y: 200, text: 'Test Server', fontFamily: 'Inter, sans-serif',
        fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', underline: false,
        color: '#ffffff', align: 'left', backgroundColor: '#1a4971', rotation: 0,
        pointerDeviceId: 'd1', pointerAnchorX: 10, pointerAnchorY: 5, pointerStyle: 'elbow',
      }],
      selection: [{ type: 'text', id: 'lbl-2' }],
    });
    (app as any).renderAll();

    const flexibleBtn = document.querySelector('#text-tool-panel [data-pointer-style="flexible"]') as HTMLButtonElement;
    expect(flexibleBtn).toBeTruthy();
    flexibleBtn.click();

    let label = stateManager.getState().textLabels.find(t => t.id === 'lbl-2')!;
    expect(label.pointerStyle).toBe('flexible');
    expect(label.pointerAnchorPoints?.length).toBe(1);

    const elbowBtn = document.querySelector('#text-tool-panel [data-pointer-style="elbow"]') as HTMLButtonElement;
    elbowBtn.click();
    label = stateManager.getState().textLabels.find(t => t.id === 'lbl-2')!;
    expect(label.pointerStyle).toBe('elbow');
  });

  it('Add/Remove Anchor floating-toolbar buttons operate on a selected flexible pointer label, and its handle is draggable', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-3', x: 800, y: 200, text: 'Test Server', fontFamily: 'Inter, sans-serif',
        fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', underline: false,
        color: '#ffffff', align: 'left', backgroundColor: '#1a4971', rotation: 0,
        pointerDeviceId: 'd1', pointerAnchorX: 10, pointerAnchorY: 5, pointerStyle: 'flexible',
        pointerAnchorPoints: [{ x: 500, y: 300 }],
      }],
      selection: [{ type: 'text', id: 'lbl-3' }],
    });
    // FloatingToolbar's own selected-target cache only updates via 'selection:changed' (matches
    // how every real app.ts selection change already pairs setState({selection}) with this
    // emit) — a direct setState alone, like above, leaves it stale.
    eventBus.emit('selection:changed', [{ type: 'text', id: 'lbl-3' }]);
    (app as any).renderAll();

    const addBtn = document.querySelector('#ft-cab-add-anchor') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    expect(addBtn.disabled).toBe(false);
    addBtn.click();

    let label = stateManager.getState().textLabels.find(t => t.id === 'lbl-3')!;
    expect(label.pointerAnchorPoints?.length).toBe(2);

    const remBtn = document.querySelector('#ft-cab-rem-anchor') as HTMLButtonElement;
    remBtn.click();
    label = stateManager.getState().textLabels.find(t => t.id === 'lbl-3')!;
    expect(label.pointerAnchorPoints?.length).toBe(1);

    // Drag the remaining handle to a new spot.
    (app as any).renderAll();
    const handleEl = document.querySelector('.label-pointer-anchor-handle[data-text-id="lbl-3"]') as SVGElement;
    expect(handleEl).toBeTruthy();
    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 500, clientY: 300 }));
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 650, clientY: 350 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 650, clientY: 350 }));

    label = stateManager.getState().textLabels.find(t => t.id === 'lbl-3')!;
    expect(label.pointerAnchorPoints?.[0]).toEqual({ x: 650, y: 350 });
  });

  it('Detach removes the connector, turning the label back into a plain floating label', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-4', x: 800, y: 200, text: 'Test Server', fontFamily: 'Inter, sans-serif',
        fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', underline: false,
        color: '#ffffff', align: 'left', backgroundColor: '#1a4971', rotation: 0,
        pointerDeviceId: 'd1', pointerAnchorX: 10, pointerAnchorY: 5, pointerStyle: 'elbow',
      }],
      selection: [{ type: 'text', id: 'lbl-4' }],
    });
    (app as any).renderAll();

    const detachBtn = document.querySelector('#text-tool-panel .ttp-detach') as HTMLButtonElement;
    expect(detachBtn).toBeTruthy();
    detachBtn.click();

    const label = stateManager.getState().textLabels.find(t => t.id === 'lbl-4')!;
    expect(label.pointerDeviceId).toBeFalsy();
    expect(label.text).toBe('Test Server'); // still a normal label otherwise
  });

  it('deleting a device-pointer label and undo/redo behave the same as any other label', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-5', x: 800, y: 200, text: 'Test Server', fontFamily: 'Inter, sans-serif',
        fontSize: 15, fontWeight: 'bold', fontStyle: 'normal', underline: false,
        color: '#ffffff', align: 'left', backgroundColor: '#1a4971', rotation: 0,
        pointerDeviceId: 'd1', pointerAnchorX: 10, pointerAnchorY: 5, pointerStyle: 'elbow',
      }],
      selection: [{ type: 'text', id: 'lbl-5' }],
    });

    eventBus.emit('edit:delete', undefined);
    expect(stateManager.getState().textLabels.length).toBe(0);

    stateManager.undo();
    expect(stateManager.getState().textLabels.length).toBe(1);
    expect(stateManager.getState().textLabels[0].pointerDeviceId).toBe('d1');

    stateManager.redo();
    expect(stateManager.getState().textLabels.length).toBe(0);
  });

  it('the starting dot (device-end attachment point) is draggable to reposition where the line starts', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpRackWithDevice();

    const origin = stateManager.getDeviceWorldOrigin('d1')!;
    stateManager.setState({
      textLabels: [{
        id: 'lbl-6', x: 800, y: 200, text: 'Test Server', fontFamily: 'Inter, sans-serif',
        fontSize: 10, fontWeight: 'bold', fontStyle: 'normal', underline: false,
        color: '#ffffff', align: 'left', backgroundColor: '#1a4971', rotation: 0,
        pointerDeviceId: 'd1', pointerAnchorX: 10, pointerAnchorY: 5, pointerStyle: 'elbow',
      }],
      selection: [{ type: 'text', id: 'lbl-6' }],
    });
    eventBus.emit('selection:changed', [{ type: 'text', id: 'lbl-6' }]);
    (app as any).renderAll();

    const startHandle = document.querySelector('.label-pointer-device-handle[data-text-id="lbl-6"]') as SVGElement;
    expect(startHandle).toBeTruthy();

    const startWorld = { x: origin.x + 10, y: origin.y + 5 };
    startHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: startWorld.x, clientY: startWorld.y }));

    const newWorld = { x: origin.x + 40, y: origin.y + 22 };
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: newWorld.x, clientY: newWorld.y }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: newWorld.x, clientY: newWorld.y }));

    const label = stateManager.getState().textLabels.find(t => t.id === 'lbl-6')!;
    expect(label.pointerAnchorX).toBe(40);
    expect(label.pointerAnchorY).toBe(22);

    // Exactly one undo step restores the original attachment point.
    stateManager.undo();
    const reverted = stateManager.getState().textLabels.find(t => t.id === 'lbl-6')!;
    expect(reverted.pointerAnchorX).toBe(10);
    expect(reverted.pointerAnchorY).toBe(5);
  });
});
