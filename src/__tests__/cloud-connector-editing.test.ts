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

  it('while a connector\'s tip is being re-dragged, its own rendered group gets pointer-events:none so it can\'t shadow the node underneath it from hover/hit-testing — otherwise, right at its current attachment point (exactly where you\'d drag toward a nearby side of the same node), the connector\'s own 12px-wide hit-path sits on top of the node in paint order and silently eats the hover that\'s supposed to reveal the 4 connection dots', async () => {
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

    const connGroupBefore = document.querySelector('[data-cloud-connector-id="conn1"]') as SVGGElement;
    expect(connGroupBefore.style.pointerEvents).not.toBe('none');

    const destHandle = document.querySelector('.cloud-connector-endpoint-handle[data-cloud-connector-id="conn1"][data-end="dest"]')!;
    destHandle.dispatchEvent(mouseEvent('mousedown', 400, 32));

    // Dispatched directly on the dest node (n2) itself, same as the neighboring reattach test —
    // a window/svg-root-level dispatch wouldn't resolve e.target to anything inside n2's group,
    // so hoverNodeId would never pick it up regardless of this fix.
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mousemove', 405, 20));

    const connGroupDuring = document.querySelector('[data-cloud-connector-id="conn1"]') as SVGGElement;
    expect(connGroupDuring.style.pointerEvents).toBe('none');

    // The dest node's own connect-handle dots are still fully hit-testable underneath — the
    // whole point of the fix.
    const destHandleDot = document.querySelector('[data-cloud-node-id="n2"].cloud-node-connect-handle-hit[data-handle-side="top"]');
    expect(destHandleDot).not.toBeNull();

    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mouseup', 405, 20));

    const connGroupAfter = document.querySelector('[data-cloud-connector-id="conn1"]') as SVGGElement;
    expect(connGroupAfter.style.pointerEvents).not.toBe('none');
  });

  it('re-aiming a connector\'s tip clears stale manual route overrides (crossbar/entry/exit/stub offsets) tuned for the old side — otherwise the line renders bending toward where the old side used to be, ignoring the new direction', async () => {
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
      cloudConnectors: [{
        id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal',
        crossbarOffset: 250, entryOffset: 60, exitOffset: 20, entryStubOffset: 55, exitStubOffset: 380,
      }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const destHandle = document.querySelector('.cloud-connector-endpoint-handle[data-cloud-connector-id="conn1"][data-end="dest"]')!;
    const svgEl = document.getElementById('cloud-canvas')!;

    destHandle.dispatchEvent(mouseEvent('mousedown', 400, 32));
    svgEl.dispatchEvent(mouseEvent('mousemove', 300, 200));
    document.querySelector('[data-cloud-node-id="n3"]')!.dispatchEvent(mouseEvent('mousemove', 432, 332));
    document.querySelector('[data-cloud-node-id="n3"]')!.dispatchEvent(mouseEvent('mouseup', 432, 332));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.destNodeId).toBe('n3'); // the reattach itself still worked
    expect(conn.crossbarOffset).toBeUndefined();
    expect(conn.entryOffset).toBeUndefined();
    expect(conn.exitOffset).toBeUndefined();
    expect(conn.entryStubOffset).toBeUndefined();
    expect(conn.exitStubOffset).toBeUndefined();
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

    const crossbarHandle = document.querySelector('.cloud-connector-crossbar-handle[data-cloud-connector-id="conn1"][data-kind="crossbar"]')!;
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

  it('dragging the entry and exit dots of a perpendicular-sides connector (no crossbar available) sets entryOffset/exitOffset independently, each as one undo entry', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 300, width: 64, height: 64, label: 'Athena' },
      ],
      // Perpendicular sides (right -> top): crossbarHandleFor has nothing to offer here, only
      // routeHandlesFor's entry/exit segments do.
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'top', routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    expect(document.querySelector('[data-cloud-connector-id="conn1"][data-kind="crossbar"]')).toBeNull();

    const svgEl = document.getElementById('cloud-canvas')!;
    const entryHandle = document.querySelector('[data-cloud-connector-id="conn1"][data-kind="entry"]')!;
    entryHandle.dispatchEvent(mouseEvent('mousedown', 200, 150));
    svgEl.dispatchEvent(mouseEvent('mousemove', 200, 90));
    window.dispatchEvent(mouseEvent('mouseup', 200, 90));

    let conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.entryOffset).toBe(90);
    expect(conn.exitOffset).toBeUndefined();

    const exitHandle = document.querySelector('[data-cloud-connector-id="conn1"][data-kind="exit"]')!;
    exitHandle.dispatchEvent(mouseEvent('mousedown', 300, 200));
    svgEl.dispatchEvent(mouseEvent('mousemove', 340, 200));
    window.dispatchEvent(mouseEvent('mouseup', 340, 200));

    conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.entryOffset).toBe(90); // untouched by the second drag
    expect(conn.exitOffset).toBe(340);

    // Two independent drags -> two independent undo entries.
    stateManager.undo();
    conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.exitOffset).toBeFalsy();
    expect(conn.entryOffset).toBe(90);

    stateManager.undo();
    conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.entryOffset).toBeFalsy();
  });

  it('a same-orientation connector shows and lets you independently drag all 3 handles (entry, crossbar, exit) once the crossbar has been moved once', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 300, width: 64, height: 64, label: 'Athena' },
      ],
      // Same orientation (right -> left): entry+crossbar exist from the start; exit only becomes
      // a real, independently-draggable segment once crossbarOffset diverges from the default —
      // see routeHandlesFor()'s doc comment for why.
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', crossbarOffset: 250, routing: 'orthogonal' }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    expect(document.querySelector('[data-cloud-connector-id="conn1"][data-kind="entry"]')).not.toBeNull();
    expect(document.querySelector('[data-cloud-connector-id="conn1"][data-kind="crossbar"]')).not.toBeNull();
    expect(document.querySelector('[data-cloud-connector-id="conn1"][data-kind="exit"]')).not.toBeNull();

    const svgEl = document.getElementById('cloud-canvas')!;

    const entryHandle = document.querySelector('[data-cloud-connector-id="conn1"][data-kind="entry"]')!;
    entryHandle.dispatchEvent(mouseEvent('mousedown', 200, 150));
    svgEl.dispatchEvent(mouseEvent('mousemove', 200, 60));
    window.dispatchEvent(mouseEvent('mouseup', 200, 60));

    const exitHandle = document.querySelector('[data-cloud-connector-id="conn1"][data-kind="exit"]')!;
    exitHandle.dispatchEvent(mouseEvent('mousedown', 350, 300));
    svgEl.dispatchEvent(mouseEvent('mousemove', 350, 320));
    window.dispatchEvent(mouseEvent('mouseup', 350, 320));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.entryOffset).toBe(60);
    expect(conn.exitOffset).toBe(320);
    expect(conn.crossbarOffset).toBe(250); // untouched by the other two drags
  });

  it('once entry/exit have been dragged, the entryStub/exitStub jog handles that appear next to each node are also independently draggable (real screenshot scenario: source top -> dest top, both entry and exit already moved sideways)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-cognitive-search', provider: 'aws', x: 150, y: 350, width: 64, height: 64, label: 'Cognitive Search' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 500, y: 130, width: 64, height: 64, label: 'App Service Plans' },
      ],
      // Both 'top' (same orientation) with entry/exit already dragged sideways — exactly the
      // reported shape: a jog segment appears right next to each node, with no handle of its own
      // before this fix.
      cloudConnectors: [{
        id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'top', destSide: 'top',
        crossbarOffset: 46, entryOffset: 32, exitOffset: 403, routing: 'orthogonal',
      }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    expect(document.querySelector('[data-cloud-connector-id="conn1"][data-kind="entryStub"]')).not.toBeNull();
    expect(document.querySelector('[data-cloud-connector-id="conn1"][data-kind="exitStub"]')).not.toBeNull();

    const svgEl = document.getElementById('cloud-canvas')!;

    const entryStubHandle = document.querySelector('[data-cloud-connector-id="conn1"][data-kind="entryStub"]') as SVGElement;
    const entryStubStart = { x: Number(entryStubHandle.getAttribute('cx')), y: Number(entryStubHandle.getAttribute('cy')) };
    entryStubHandle.dispatchEvent(mouseEvent('mousedown', entryStubStart.x, entryStubStart.y));
    svgEl.dispatchEvent(mouseEvent('mousemove', entryStubStart.x, entryStubStart.y - 15));
    window.dispatchEvent(mouseEvent('mouseup', entryStubStart.x, entryStubStart.y - 15));

    let conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.entryStubOffset).toBe(entryStubStart.y - 15);

    // destSide is also 'top' (vertical), so exitStubOffset — like entryStubOffset above — is a Y
    // coordinate, not X.
    const exitStubHandle = document.querySelector('[data-cloud-connector-id="conn1"][data-kind="exitStub"]') as SVGElement;
    const exitStubStart = { x: Number(exitStubHandle.getAttribute('cx')), y: Number(exitStubHandle.getAttribute('cy')) };
    exitStubHandle.dispatchEvent(mouseEvent('mousedown', exitStubStart.x, exitStubStart.y));
    svgEl.dispatchEvent(mouseEvent('mousemove', exitStubStart.x, exitStubStart.y + 25));
    window.dispatchEvent(mouseEvent('mouseup', exitStubStart.x, exitStubStart.y + 25));

    conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.exitStubOffset).toBe(exitStubStart.y + 25);
    expect(conn.entryStubOffset).toBe(entryStubStart.y - 15); // untouched by the second drag
  });
});
