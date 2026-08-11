import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Endpoint (tip) re-dragging for CloudConnectors — reattaching an already-drawn connector's
 * source/dest to a different node or a floating point. Split out from cloud-architecture.test.ts
 * (which covers node/container/connector creation) purely to keep per-file test-worker memory
 * pressure down: each test here mounts a full App + DOM, and this file had grown large enough to
 * intermittently OOM the vitest worker when combined with the other cloud-architecture end-to-end
 * tests in one file (every test passes individually — this was never a functional bug, just too
 * many heavy App mounts accumulating in one process).
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

function mouseEvent(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
}

describe('Cloud Architecture canvas — connector path editing', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  it('dragging a connector\'s dest-tip handle onto a third node reattaches it there', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
        { id: 'n3', iconId: 'aws-amazon-cloudsearch', provider: 'aws', x: 400, y: 300, width: 64, height: 64, label: 'CloudSearch' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const destHandle = document.querySelector('.cloud-connector-endpoint-handle[data-cloud-connector-id="conn1"][data-end="dest"]')!;
    const svgEl = document.getElementById('cloud-canvas')!;

    destHandle.dispatchEvent(mouseEvent('mousedown', 400, 32));
    svgEl.dispatchEvent(mouseEvent('mousemove', 300, 200));
    // Each mousemove during the drag calls renderCloudAll(), which rebuilds the node layer's
    // DOM from scratch — a node reference captured before the drag would go stale (detached,
    // unable to bubble to svgEl's listener) after that first intermediate render, so n3 is
    // re-queried fresh right before use rather than captured once up front.
    document.querySelector('[data-cloud-node-id="n3"]')!.dispatchEvent(mouseEvent('mousemove', 432, 332));
    document.querySelector('[data-cloud-node-id="n3"]')!.dispatchEvent(mouseEvent('mouseup', 432, 332));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.destNodeId).toBe('n3');
    expect(conn.destPoint).toBeFalsy();
    expect(conn.sourceNodeId).toBe('n1'); // untouched

    // One undo entry for the whole drag.
    stateManager.undo();
    expect(stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!.destNodeId).toBe('n2');
  });

  it('dragging a connector\'s tip onto empty canvas detaches it into a floating point', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const destHandle = document.querySelector('.cloud-connector-endpoint-handle[data-cloud-connector-id="conn1"][data-end="dest"]')!;
    const svgEl = document.getElementById('cloud-canvas')!;

    destHandle.dispatchEvent(mouseEvent('mousedown', 400, 32));
    svgEl.dispatchEvent(mouseEvent('mousemove', 600, 500));
    window.dispatchEvent(mouseEvent('mouseup', 600, 500));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.destNodeId).toBeNull();
    expect(conn.destPoint).toEqual({ x: 600, y: 500 });
  });

  it('dragging a connector tip onto its OWN other end is ignored (no self-loop) — falls back to a floating point at the drop', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const destHandle = document.querySelector('.cloud-connector-endpoint-handle[data-cloud-connector-id="conn1"][data-end="dest"]')!;
    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;

    destHandle.dispatchEvent(mouseEvent('mousedown', 400, 32));
    n1El.dispatchEvent(mouseEvent('mousemove', 32, 32));
    n1El.dispatchEvent(mouseEvent('mouseup', 32, 32));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.destNodeId).toBeNull(); // not reattached to n1 (its own source)
    expect(conn.destPoint).toEqual({ x: 32, y: 32 });
  });

  it('a plain click on an endpoint handle (no drag) leaves the connector completely unchanged', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const destHandle = document.querySelector('.cloud-connector-endpoint-handle[data-cloud-connector-id="conn1"][data-end="dest"]')!;
    destHandle.dispatchEvent(mouseEvent('mousedown', 400, 32));
    window.dispatchEvent(mouseEvent('mouseup', 400, 32)); // no mousemove at all in between

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.destNodeId).toBe('n2');
    expect(conn.destSide).toBe('left');
  });

  it('dragging the crossbar dot moves the connector\'s vertical run to the dragged X, as one undo entry', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 300, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const crossbarHandle = document.querySelector('.cloud-connector-crossbar-handle[data-cloud-connector-id="conn1"]')!;
    expect(crossbarHandle.getAttribute('data-axis')).toBe('x');
    const svgEl = document.getElementById('cloud-canvas')!;

    crossbarHandle.dispatchEvent(mouseEvent('mousedown', 200, 150));
    svgEl.dispatchEvent(mouseEvent('mousemove', 250, 150));
    window.dispatchEvent(mouseEvent('mouseup', 250, 150));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.crossbarOffset).toBe(250);
    // Endpoints untouched — only the crossbar moved.
    expect(conn.sourceNodeId).toBe('n1');
    expect(conn.destNodeId).toBe('n2');

    stateManager.undo();
    expect(stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!.crossbarOffset).toBeFalsy();
  });
});
