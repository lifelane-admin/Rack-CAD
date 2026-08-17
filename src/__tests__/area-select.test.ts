import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Left-click-and-drag marquee select on empty background.
 *
 * The rack canvas already had its own pre-existing rubber-band select (see the "Nothing was hit
 * — start rubber-band multi-select" / "4. Rubber-band multi-select completion" blocks in
 * app.ts's setupCanvasInteractions()) — missed on first pass here because it's named
 * `isRubberBanding`, not anything matching "marquee"/"area-select". A duplicate, conflicting
 * mechanism was briefly added directly to CanvasManager before this was noticed (both reacted to
 * the same left-drag-on-background gesture and stomped on each other's selection); that's been
 * removed, and the one gap in the pre-existing mechanism (it covered devices/text/images but not
 * racks) has been closed directly in it instead. The Cloud Architecture canvas had no pre-existing
 * mechanism, so it gets a new one (CloudCanvasManager's isAreaSelecting + app.ts's
 * setupCloudAreaSelect/computeAreaSelection).
 *
 * Originally built as RIGHT-click-drag, then swapped to LEFT-click-drag per explicit feedback,
 * specifically to keep right-click free for the context menu with no conflict between the two
 * gestures — covered below for both canvases.
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
          <div id="cloud-viewport" class="hidden">
            <svg id="cloud-canvas"></svg>
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

function stubRect(el: Element, box: { left: number; top: number; right: number; bottom: number }): void {
  (el as any).getBoundingClientRect = () => ({
    ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, toJSON() {},
  });
}

function mouse(type: string, x: number, y: number, button = 0): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
}

function drag(svgEl: Element, fromX: number, fromY: number, toX: number, toY: number, button = 0): void {
  svgEl.dispatchEvent(mouse('mousedown', fromX, fromY, button));
  window.dispatchEvent(mouse('mousemove', toX, toY, button));
  window.dispatchEvent(mouse('mouseup', toX, toY, button));
}

describe('Left-click-drag marquee select', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], cloudHierarchies: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  describe('Cloud Architecture canvas (new mechanism)', () => {
    it('left-dragging a box over two nodes selects both', async () => {
      mountAppSkeleton();
      const { App } = await import('../app');
      const app = new App();
      app.init();
      stateManager.setState({
        cloudNodes: [
          { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
          { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 200, y: 0, width: 64, height: 64, label: 'Athena' },
          { id: 'n3', iconId: 'aws-amazon-ec2', provider: 'aws', x: 800, y: 800, width: 64, height: 64, label: 'S3' },
        ],
      });
      app.setActiveView('cloud');

      stubRect(document.querySelector('[data-cloud-node-id="n1"]')!, { left: 10, top: 10, right: 74, bottom: 74 });
      stubRect(document.querySelector('[data-cloud-node-id="n2"]')!, { left: 210, top: 10, right: 274, bottom: 74 });
      stubRect(document.querySelector('[data-cloud-node-id="n3"]')!, { left: 810, top: 810, right: 874, bottom: 874 });

      const svgEl = document.getElementById('cloud-canvas')!;
      drag(svgEl, 0, 0, 300, 100); // covers n1 and n2, not n3

      const selection = stateManager.getState().selection;
      expect(selection).toHaveLength(2);
      expect(new Set(selection.map(s => s.id))).toEqual(new Set(['n1', 'n2']));
    });

    it('right-click-drag does NOT trigger area-select (avoids conflicting with the context menu)', async () => {
      mountAppSkeleton();
      const { App } = await import('../app');
      const app = new App();
      app.init();
      stateManager.setState({
        cloudNodes: [{ id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' }],
      });
      app.setActiveView('cloud');

      let fired = false;
      eventBus.on('cloud-canvas:area-select', () => { fired = true; });

      const svgEl = document.getElementById('cloud-canvas')!;
      drag(svgEl, 0, 0, 300, 100, /* button */ 2);
      expect(fired).toBe(false);
    });

    it('a right-click on a node (no drag) still opens its normal context menu', async () => {
      mountAppSkeleton();
      const { App } = await import('../app');
      const app = new App();
      app.init();
      stateManager.setState({
        cloudNodes: [{ id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' }],
      });
      app.setActiveView('cloud');

      const nodeEl = document.querySelector('[data-cloud-node-id="n1"]')!;
      nodeEl.dispatchEvent(mouse('mousedown', 30, 30, 2));
      window.dispatchEvent(mouse('mouseup', 30, 30, 2));
      nodeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));

      expect(stateManager.getState().selection).toEqual([{ type: 'cloud-node', id: 'n1' }]);
      const label = [...document.querySelectorAll('.context-menu-item .context-menu-label')]
        .find(el => el.textContent?.includes('EC2'));
      expect(label).toBeTruthy();
    });

    it('a left-click with negligible movement (a plain click, not a drag) does not trigger area-select', async () => {
      mountAppSkeleton();
      const { App } = await import('../app');
      const app = new App();
      app.init();
      stateManager.setState({
        cloudNodes: [{ id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' }],
      });
      app.setActiveView('cloud');

      let fired = false;
      eventBus.on('cloud-canvas:area-select', () => { fired = true; });

      const svgEl = document.getElementById('cloud-canvas')!;
      drag(svgEl, 500, 500, 501, 501); // 1px jitter, below the drag threshold
      expect(fired).toBe(false);
    });
  });

  describe('Rack canvas (pre-existing rubber-band, now extended to cover racks too)', () => {
    it('left-dragging a box over a rack and a device selects both — racks are the gap that was closed; devices already worked', async () => {
      mountAppSkeleton();
      const { App } = await import('../app');
      const app = new App();
      app.init();
      stateManager.setState({
        racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 }],
        devices: [{
          id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 40, name: 'Switch 1',
          hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
        }],
      });

      const svgEl = document.getElementById('canvas')!;
      console.log('DEBUG state before drag:', JSON.stringify({ tool: stateManager.getState().tool, racks: stateManager.getState().racks, canvasRect: svgEl.getBoundingClientRect() }));
      eventBus.on('selection:changed', (s) => console.log('DEBUG selection:changed:', JSON.stringify(s)));
      // World coords == screen coords here (no pan/zoom applied) — same assumption other tests in
      // this suite already rely on. Rack 1 spans roughly x:[0,450], y:[0,1350] (42U); a box from
      // (0,0) to (500,200) comfortably covers the rack's frame and its top device.
      drag(svgEl, 0, 0, 500, 200);

      const selection = stateManager.getState().selection;
      expect(selection.some(s => s.type === 'rack' && s.id === 'r1')).toBe(true);
      expect(selection.some(s => s.type === 'device' && s.id === 'd1')).toBe(true);
    });

    it('right-click-drag does NOT trigger the rubber-band (avoids conflicting with the rack canvas context menu)', async () => {
      mountAppSkeleton();
      const { App } = await import('../app');
      const app = new App();
      app.init();
      stateManager.setState({ racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 }] });

      const svgEl = document.getElementById('canvas')!;
      drag(svgEl, 0, 0, 500, 200, /* button */ 2);

      // No 'selection-rect' left behind, and no selection produced from the right-drag.
      expect(document.getElementById('selection-rect')).toBeNull();
      expect(stateManager.getState().selection).toEqual([]);
    });
  });
});
