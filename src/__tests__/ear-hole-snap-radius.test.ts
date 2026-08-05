import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';
import type { DeviceData } from '../core/types';

/**
 * Ear-mount holes (the decorative rack-screw ports every server/switch/firewall auto-gains via
 * injectEarPorts) are packed only 7.5-15px apart, far tighter than the ~35-40px proximity-snap
 * radius the cable-drawing fallback used to apply uniformly to every port. That made them a
 * "magnet": clicking anywhere reasonably close to a device's edge rail — even when clearly aiming
 * at a different, merely-nearby real port — snapped to whichever ear hole happened to be closest.
 * Ear holes now get their own much tighter 1.5px radius (app.ts — the click-to-finish-a-cable
 * fallback, the drag-to-reconnect fallback, and the live hover snap-highlight all three); other
 * ports keep their original radius. (First pass used 8px, then 3px; still felt "magnetic" in
 * practice each time.)
 *
 * The actual root cause, found after a real-hardware-photo screenshot showed a custom port right
 * next to a device's ear-hole rail: shrinking the ear radius alone can't fix this, because the
 * comparison was ONE pass, "closest of all candidates wins" — an ear hole with a tiny cap can
 * still beat a real port that's simultaneously in range, if the ear hole happens to be a fraction
 * of a pixel closer (which is common, since ear holes sit right at the panel edge, near any port
 * calibrated close to that edge). Fixed with a TWO-PASS search: real ports are searched first at
 * their normal radius; ear holes are only even considered if that first pass finds nothing at
 * all. A real port now always wins whenever it's anywhere in normal range, full stop — regardless
 * of whether an ear hole happens to be numerically closer.
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
}

describe('ear-hole proximity-snap radius', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [], cableInProgress: null });
  });

  it('a click 15px from the nearest ear hole (with no other real port nearby) does NOT snap to it', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // Custom Switch (1U): ear holes render in FRONT view (default), same as its manually-added
    // ports (both categories share the front-view branch for 'switch') — the exact scenario where
    // ear holes and real custom ports coexist on screen and used to compete for the same click.
    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'dA', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 5, name: 'Switch A',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'dA-port-0', deviceId: 'dA', name: 'Port 1', type: 'rj45', relativeX: 200, relativeY: 15, connected: false, cableId: null }],
      } as DeviceData, {
        id: 'dB', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 10, name: 'Switch B',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    // Start the cable from a real source port.
    const sourceEl = document.querySelector('[data-port-id="dA-port-0"]') as SVGElement;
    expect(sourceEl).toBeTruthy();
    sourceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe('dA-port-0');

    // dB is a 1U device with the standard 4 ear holes; injectEarPorts pitches them at
    // (i - 0.5) * (30/4) = 3.75, 11.25, 18.75, 26.25, on the left rail at x = -12.5.
    const earPortId = 'dB-ear-left-nic1';
    const earPos = stateManager.getPortWorldPosition(earPortId);
    expect(earPos).toBeTruthy();

    // Click 15px away from that ear hole — inside the OLD 35-40px radius (would have snapped to
    // the ear hole), but outside the new 1.5px ear-specific radius, and nowhere near any real port.
    const clickPoint = { x: earPos!.x + 15, y: earPos!.y };
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));

    // Airdrop Destination is off, so a click that hits nothing real is a no-op — the cable must
    // NOT have connected to the ear hole, and drawing must still be in progress.
    expect(stateManager.getState().cables.length).toBe(0);
    expect(stateManager.getState().cableInProgress?.sourcePortId).toBe('dA-port-0');
    const earPort = stateManager.getDevice('dB')!.ports.find(p => p.id === earPortId);
    expect(earPort?.connected).toBe(false);
  });

  it('a click within the new 1.5px ear radius still snaps (ear holes remain clickable, just not magnetic)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'dA', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 5, name: 'Switch A',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'dA-port-0', deviceId: 'dA', name: 'Port 1', type: 'rj45', relativeX: 200, relativeY: 15, connected: false, cableId: null }],
      } as DeviceData, {
        id: 'dB', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 10, name: 'Switch B',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    const sourceEl = document.querySelector('[data-port-id="dA-port-0"]') as SVGElement;
    sourceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));

    const earPortId = 'dB-ear-left-nic1';
    const earPos = stateManager.getPortWorldPosition(earPortId)!;

    // 1px away — well within the new 1.5px ear radius, so a genuinely close click still connects.
    const clickPoint = { x: earPos.x + 1, y: earPos.y };
    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));

    expect(stateManager.getState().cables.length).toBe(1);
    expect(stateManager.getState().cables[0].destPortId).toBe(earPortId);
  });

  it('a real port wins over a numerically CLOSER ear hole, when both are simultaneously in range', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // dB has both its standard ear holes AND a real custom port placed close to the left ear rail
    // (exactly the "port calibrated near a real hardware photo's edge" scenario) — the ear hole is
    // numerically CLOSER to the click point than the real port is, which is precisely what made
    // the old single-pass "closest of all candidates" comparison pick the ear hole even with a
    // tiny cap on how far it could reach.
    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'dA', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 5, name: 'Switch A',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'dA-port-0', deviceId: 'dA', name: 'Port 1', type: 'rj45', relativeX: 200, relativeY: 15, connected: false, cableId: null }],
      } as DeviceData, {
        id: 'dB', templateId: 'custom-switch-1u', rackId: 'r1', startUnit: 10, name: 'Switch B',
        hostname: '', managementIp: '', serialNumber: '', description: '',
        ports: [{ id: 'dB-custom-0', deviceId: 'dB', name: 'Custom Port', type: 'rj45', relativeX: -3.5, relativeY: 3.75, connected: false, cableId: null }],
      } as DeviceData],
    });
    (app as any).renderAll();
    eventBus.emit('tool:changed', 'cable');

    const sourceEl = document.querySelector('[data-port-id="dA-port-0"]') as SVGElement;
    sourceEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));

    const earPortId = 'dB-ear-left-nic1'; // at (-12.5, 3.75)
    const earPos = stateManager.getPortWorldPosition(earPortId)!;
    const realPortPos = stateManager.getPortWorldPosition('dB-custom-0')!;

    // 1px from the ear hole, 8px from the real custom port — the ear hole is numerically closer.
    const clickPoint = { x: earPos.x + 1, y: earPos.y };
    expect(Math.abs(clickPoint.x - realPortPos.x)).toBe(8);

    const canvasEl = document.getElementById('canvas')!;
    canvasEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: clickPoint.x, clientY: clickPoint.y }));

    const cables = stateManager.getState().cables;
    expect(cables.length).toBe(1);
    expect(cables[0].destPortId).toBe('dB-custom-0'); // the real port, NOT the closer ear hole
  });
});
