import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import type { DeviceData } from '../core/types';

/**
 * "Airdrop Destination" — a floating-toolbar toggle. While drawing a (non-power) cable from a
 * real source port, turning this on lets a click ANYWHERE on the canvas (any rack, any spot, no
 * snapping to a real port) finish the cable there instead of requiring a real destination port.
 * The source end is never affected — it must always be a real port, started the normal way.
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

describe('cable:toggle-airdrop-destination', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [], airdropDestination: false, cableInProgress: null });
  });

  it('flips AppState.airdropDestination', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    expect(stateManager.getState().airdropDestination).toBe(false);
    eventBus.emit('cable:toggle-airdrop-destination', undefined);
    expect(stateManager.getState().airdropDestination).toBe(true);
    eventBus.emit('cable:toggle-airdrop-destination', undefined);
    expect(stateManager.getState().airdropDestination).toBe(false);
  });
});

describe('end-to-end: Airdrop Destination through the real App/canvas', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [], airdropDestination: false, cableInProgress: null });
  });

  function setUpServerWithSourceCableStarted(app: any) {
    stateManager.setState({
      // Server ports (NICs) only render in rear view in this app — matches real hardware.
      cabinetViewMode: 'rear',
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '1U Server',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 's1u-nic1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: false, cableId: null }],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    // Start the cable the normal way: click the real source port.
    const portEl = document.querySelector('[data-port-id="s1u-nic1"]') as SVGElement;
    expect(portEl).toBeTruthy();
    portEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe('s1u-nic1');
  }

  it('with Airdrop Destination on, clicking empty canvas finishes the cable at that exact point (any rack, any spot)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpServerWithSourceCableStarted(app);

    // Set directly rather than via the toggle event — this test file creates several App
    // instances (one per test), each registering its own 'cable:toggle-airdrop-destination'
    // listener on the shared eventBus singleton; emitting the toggle here would flip the flag
    // once per still-registered listener, not once overall (a test-environment artifact — a real
    // running app only ever has one). The toggle mechanism itself is covered separately above.
    stateManager.setState({ airdropDestination: true });

    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 777, clientY: 222 }));

    const cables = stateManager.getState().cables;
    expect(cables.length).toBe(1);
    expect(cables[0].sourcePortId).toBe('s1u-nic1');
    expect(cables[0].destPortId).toBeNull();
    expect(cables[0].floatingDest).toEqual({ x: 777, y: 222 });
    expect(stateManager.getState().cableInProgress).toBeNull();

    // The source port itself must be marked connected — only the destination is floating.
    const device = stateManager.getDevice('d1')!;
    expect(device.ports[0].connected).toBe(true);
  });

  it('with Airdrop Destination on, a click near an unrelated real port still lands exactly where clicked instead of snapping to that port', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // A second, unconnected NIC sitting right next to the source port — close enough that the
    // ordinary proximity-snap fallback (40px) would normally grab it.
    stateManager.setState({
      cabinetViewMode: 'rear',
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '1U Server',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [
          { id: 's1u-nic1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: false, cableId: null },
          { id: 's1u-nic2', deviceId: 'd1', name: 'NIC 2', type: 'rj45', relativeX: 330, relativeY: 8, connected: false, cableId: null },
        ],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    const sourceEl = document.querySelector('[data-port-id="s1u-nic1"]') as SVGElement;
    sourceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe('s1u-nic1');

    stateManager.setState({ airdropDestination: true }); // see note above re: setting directly

    const nic2Pos = stateManager.getPortWorldPosition('s1u-nic2')!;
    // Click well within the 40px proximity-snap radius of NIC 2, but not exactly on it.
    const clickPoint = { x: nic2Pos.x + 15, y: nic2Pos.y + 10 };
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));

    const cables = stateManager.getState().cables;
    expect(cables.length).toBe(1);
    expect(cables[0].destPortId).toBeNull(); // must NOT have snapped to NIC 2
    expect(cables[0].floatingDest).toEqual(clickPoint); // lands exactly where clicked
    expect(stateManager.getDevice('d1')!.ports[1].connected).toBe(false); // NIC 2 untouched
  });

  it('with Airdrop Destination on, clicking DIRECTLY on another real port\'s element still floats at that point instead of connecting to it', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // A second unconnected NIC — the click below lands squarely on its own DOM element, which is
    // the direct SVG hit-test path (checked before any proximity math), not the 40px fallback.
    stateManager.setState({
      cabinetViewMode: 'rear',
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '1U Server',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [
          { id: 's1u-nic1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: false, cableId: null },
          { id: 's1u-nic2', deviceId: 'd1', name: 'NIC 2', type: 'rj45', relativeX: 330, relativeY: 8, connected: false, cableId: null },
        ],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    const sourceEl = document.querySelector('[data-port-id="s1u-nic1"]') as SVGElement;
    sourceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe('s1u-nic1');

    stateManager.setState({ airdropDestination: true }); // see note above re: setting directly

    const nic2Pos = stateManager.getPortWorldPosition('s1u-nic2')!;
    const nic2El = document.querySelector('[data-port-id="s1u-nic2"]') as SVGElement;
    expect(nic2El).toBeTruthy();
    // Click lands right on NIC 2's own element — a direct hit, not just "nearby".
    nic2El.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: nic2Pos.x, clientY: nic2Pos.y }));

    const cables = stateManager.getState().cables;
    expect(cables.length).toBe(1);
    expect(cables[0].destPortId).toBeNull(); // must NOT have connected to NIC 2
    expect(cables[0].floatingDest).toEqual(nic2Pos);
    expect(stateManager.getDevice('d1')!.ports[1].connected).toBe(false); // NIC 2 untouched
  });

  it('with Airdrop Destination off (default), clicking empty canvas does nothing — cableInProgress survives', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setUpServerWithSourceCableStarted(app);

    // airdropDestination left false
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 777, clientY: 222 }));

    expect(stateManager.getState().cables.length).toBe(0);
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe('s1u-nic1');
  });

  it('does not apply to power cables — a power cable-in-progress is left alone even with Airdrop Destination on', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cabinetViewMode: 'rear',
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '', hostname: '',
        managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 's1u-nic1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: false, cableId: null }],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'power');
    const portEl = document.querySelector('[data-port-id="s1u-nic1"]') as SVGElement;
    portEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(stateManager.getState().cableInProgress?.cableType).toBe('power');

    stateManager.setState({ airdropDestination: true }); // see note in the test above
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 777, clientY: 222 }));

    expect(stateManager.getState().cables.length).toBe(0);
    expect(stateManager.getState().cableInProgress?.cableType).toBe('power'); // untouched
  });
});

describe('end-to-end: correcting an already-dropped floating destination by dragging its handle', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [], airdropDestination: false, cableInProgress: null });
  });

  it('commits the NEW position when dragging an already-floating destination handle to another empty spot', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // Seed a device + a cable that's already been airdropped once, exactly as if the user had
    // just finished the drop in a previous action.
    stateManager.setState({
      cabinetViewMode: 'rear',
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '', hostname: '',
        managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 's1u-nic1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: true, cableId: 'cable-1' }],
      } as DeviceData],
      cables: [{
        id: 'cable-1', name: 'Cable 1', type: 'general', color: '#78909c',
        sourcePortId: 's1u-nic1', destPortId: null, floatingDest: { x: 900, y: 900 },
        bendPoints: [], thickness: 3, bendRadius: 10, bundleId: null, notes: '',
        anchorPoints: [], anchorsLocked: false,
      }],
      selection: [{ type: 'cable', id: 'cable-1' }], // selected, so its drag handle is rendered
    });
    (app as any).renderAll();

    const handleEl = document.querySelector('[data-cable-id-handle="cable-1"][data-handle-type="dest"]') as SVGElement;
    expect(handleEl).toBeTruthy();

    // Drag it from its current (900,900) spot to a brand-new empty spot (500, 500) — nowhere
    // near any real port, exactly the "move it for correction" scenario.
    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 900, clientY: 900 }));
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 500, clientY: 500 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 500, clientY: 500 }));

    const updated = stateManager.getCable('cable-1')!;
    expect(updated.destPortId).toBeNull();
    expect(updated.floatingDest).toEqual({ x: 500, y: 500 });
    // Must NOT have snapped back to the original (900, 900) drop point.
    expect(updated.floatingDest).not.toEqual({ x: 900, y: 900 });
  });

  it('still snaps back to the original real port if a real-port-to-real-port drag misses (unchanged prior behavior)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cabinetViewMode: 'rear',
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 5, name: '', hostname: '',
        managementIp: '', serialNumber: '', description: '',
        ports: [
          { id: 's1u-nic1', deviceId: 'd1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 8, connected: true, cableId: 'cable-1' },
          { id: 's1u-nic2', deviceId: 'd1', name: 'NIC 2', type: 'rj45', relativeX: 332, relativeY: 8, connected: true, cableId: 'cable-1' },
        ],
      } as DeviceData],
      cables: [{
        id: 'cable-1', name: 'Cable 1', type: 'general', color: '#78909c',
        sourcePortId: 's1u-nic1', destPortId: 's1u-nic2', bendPoints: [], thickness: 3, bendRadius: 10,
        bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false,
      }],
      selection: [{ type: 'cable', id: 'cable-1' }],
    });
    (app as any).renderAll();

    const originalDestPos = stateManager.getPortWorldPosition('s1u-nic2')!;
    const handleEl = document.querySelector('[data-cable-id-handle="cable-1"][data-handle-type="dest"]') as SVGElement;
    expect(handleEl).toBeTruthy();

    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: originalDestPos.x, clientY: originalDestPos.y }));
    const canvasEl = document.getElementById('canvas')!;
    // Drag far away into empty space — no real port anywhere nearby.
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 2000, clientY: 2000 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 2000, clientY: 2000 }));

    const updated = stateManager.getCable('cable-1')!;
    // The pre-existing safety behavior for a REAL connection must be unchanged: reverts, not left
    // floating out in empty space.
    expect(updated.destPortId).toBe('s1u-nic2');
    expect(updated.floatingDest).toBeFalsy();
  });

  it('allows starting a cable from a floating source when airdropDestination is on, and committing to a floating destination', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [],
      cables: [],
      airdropDestination: true,
      tool: 'cable'
    });

    const canvasEl = document.getElementById('canvas')!;
    
    // First click on empty canvas to start floating source cable
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: 300 }));
    
    expect(stateManager.getState().cableInProgress).toBeTruthy();
    expect(stateManager.getState().cableInProgress!.sourcePortId).toBeNull();
    expect(stateManager.getState().cableInProgress!.floatingSource).toEqual({ x: 200, y: 300 });

    // Second click on empty canvas to complete floating dest cable
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 600, clientY: 700 }));

    const cables = stateManager.getState().cables;
    expect(cables.length).toBe(1);
    expect(cables[0].sourcePortId).toBeNull();
    expect(cables[0].destPortId).toBeNull();
    expect(cables[0].floatingSource).toEqual({ x: 200, y: 300 });
    expect(cables[0].floatingDest).toEqual({ x: 600, y: 700 });
    expect(stateManager.getState().cableInProgress).toBeNull();
  });
});
