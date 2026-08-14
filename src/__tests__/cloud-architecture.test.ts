import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * End-to-end coverage of the Cloud Architecture canvas through a real mounted App (not just
 * state assertions) — drag-drop-from-palette creates a CloudNode, the container-draw tool
 * creates a CloudContainer, and the connect tool creates a CloudConnector. Mirrors the pattern
 * used by image-asset.test.ts / device-label-pointer.test.ts, extended with #cloud-viewport /
 * #cloud-canvas so CloudCanvasManager actually mounts (see app.ts's init() — it's wrapped in a
 * try/catch and silently no-ops without this markup, which is what most *other* test skeletons
 * in this suite rely on).
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

function dispatchDrop(el: Element, payload: unknown, clientX: number, clientY: number): void {
  const evt = new Event('drop', { bubbles: true, cancelable: true }) as any;
  evt.dataTransfer = { getData: () => JSON.stringify(payload) };
  evt.clientX = clientX;
  evt.clientY = clientY;
  el.dispatchEvent(evt);
}

function mouseEvent(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
}

describe('Cloud Architecture canvas', () => {
  beforeEach(() => {
    // Every test below mounts its own fresh App — without this, eventBus (a module-level
    // singleton) accumulates one full listener set per previous test, and a later test's
    // 'tool:changed' emit gets processed by a STALE app's handler first, which already advances
    // stateManager's `tool` before the current test's own app's handler gets a chance to read
    // the real previous value. See EventBus.clear()'s doc comment.
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  it('dropping a palette icon onto the cloud canvas creates a selected CloudNode at the drop point', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const viewport = document.getElementById('cloud-viewport')!;
    dispatchDrop(viewport, { iconId: 'aws-amazon-ec2' }, 150, 200);

    const s = stateManager.getState();
    expect(s.cloudNodes).toHaveLength(1);
    expect(s.cloudNodes[0].iconId).toBe('aws-amazon-ec2');
    expect(s.cloudNodes[0].provider).toBe('aws');
    // Centered on the drop point (world coords == screen coords here: happy-dom's
    // getBoundingClientRect is all-zero, and the canvas starts untransformed).
    expect(s.cloudNodes[0].x).toBe(150 - s.cloudNodes[0].width / 2);
    expect(s.cloudNodes[0].y).toBe(200 - s.cloudNodes[0].height / 2);
    expect(s.selection).toEqual([{ type: 'cloud-node', id: s.cloudNodes[0].id }]);
  });

  it('dropping an unknown iconId is a no-op', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const viewport = document.getElementById('cloud-viewport')!;
    dispatchDrop(viewport, { iconId: 'does-not-exist' }, 100, 100);

    expect(stateManager.getState().cloudNodes).toHaveLength(0);
  });

  it('the cloud-container tool draws a rectangle from mousedown-drag to mouseup', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('tool:changed', 'cloud-container');

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 20, 20));
    window.dispatchEvent(mouseEvent('mousemove', 120, 90));
    window.dispatchEvent(mouseEvent('mouseup', 120, 90));

    const s = stateManager.getState();
    expect(s.cloudContainers).toHaveLength(1);
    expect(s.cloudContainers[0]).toMatchObject({ x: 20, y: 20, width: 100, height: 70 });
    // Finishing the draw returns to the select tool (mirrors the export-area tool).
    expect(stateManager.getState().tool).toBe('select');
  });

  it('a too-small container drag (accidental click) does not create a container', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('tool:changed', 'cloud-container');

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 20, 20));
    window.dispatchEvent(mouseEvent('mouseup', 22, 22));

    expect(stateManager.getState().cloudContainers).toHaveLength(0);
  });

  it('the cloud-connect tool creates a connector between two clicked nodes', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    // setState alone doesn't trigger a render — app.ts's own state-mutating paths (drop, drag,
    // etc.) call renderCloudAll() themselves, but this test seeds state directly. setActiveView
    // both matches realistic usage (switching to the cloud view renders it) and forces the
    // <g data-cloud-node-id> elements to actually exist in the DOM for the hit-testing below.
    app.setActiveView('cloud');

    eventBus.emit('tool:changed', 'cloud-connect');

    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    const n2El = document.querySelector('[data-cloud-node-id="n2"]')!;

    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    n2El.dispatchEvent(mouseEvent('mousedown', 332, 32));

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(1);
    expect(s.cloudConnectors[0].sourceNodeId).toBe('n1');
    expect(s.cloudConnectors[0].destNodeId).toBe('n2');
  });

  it('the cloud-connect tool also completes on a single press-drag-release gesture (not just two separate clicks)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');
    eventBus.emit('tool:changed', 'cloud-connect');

    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;

    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    // Dispatched on node 2 itself (bubbles up to the svgEl listener that tracks hover) so
    // e.target correctly resolves to node 2 — a window-level dispatch wouldn't reach that
    // listener at all, since window isn't inside #cloud-canvas's subtree. Re-queried fresh for
    // each dispatch (rather than captured once) since the first hover onto an unselected node
    // now triggers a renderCloudAll() (to show its connection handles as a drop target — see
    // the hover-highlight test below), which rebuilds the node layer's DOM and detaches any
    // earlier reference.
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mousemove', 332, 32));
    // Released on node 2 without a second, separate mousedown — this is the gesture a user
    // dragging from one node to another actually performs, and previously did nothing at all.
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mouseup', 332, 32));

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(1);
    expect(s.cloudConnectors[0].sourceNodeId).toBe('n1');
    expect(s.cloudConnectors[0].destNodeId).toBe('n2');
  });

  it('hovering an UNSELECTED node while dragging a connector shows its connection handles as a drop target (previously only a pre-selected node had visible handles at all)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');
    eventBus.emit('tool:changed', 'cloud-connect');

    // n2 was never clicked/selected — before this fix it would render with zero connection
    // handles for the entire duration of the drag, giving the user nothing precise to aim for.
    expect(document.querySelectorAll('.cloud-node-connect-handle[data-cloud-node-id="n2"]').length).toBe(0);

    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mousemove', 332, 32));

    const n2Handles = document.querySelectorAll('.cloud-node-connect-handle[data-cloud-node-id="n2"]');
    expect(n2Handles.length).toBe(4);
    // n2 still isn't actually selected — this is a hover-only highlight, not a selection change.
    expect(stateManager.getState().selection.find(i => i.type === 'cloud-node' && i.id === 'n2')).toBeUndefined();

    // Moving off n2 again drops the highlight.
    document.querySelector('#cloud-canvas')!.dispatchEvent(mouseEvent('mousemove', 500, 500));
    expect(document.querySelectorAll('.cloud-node-connect-handle[data-cloud-node-id="n2"]').length).toBe(0);

    // Release the mouse to finish the gesture (drops onto empty canvas -> a floating-point
    // connector). Without this, cloudConnectSourceId/cloudConnectMouseDownScreen stay set on
    // this app instance's still-registered `window` mouseup listener (mountAppSkeleton() never
    // tears down prior App instances between tests), which would otherwise fire a stray
    // commitCloudConnector() on some LATER test's unrelated mouseup dispatch and silently
    // inflate that test's cloudConnectors count.
    document.querySelector('#cloud-canvas')!.dispatchEvent(mouseEvent('mouseup', 500, 500));
  });

  it('a short release near the mousedown point leaves the source pending for a genuine click-then-click connection (not treated as a completed drag)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');
    eventBus.emit('tool:changed', 'cloud-connect');

    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    const n2El = document.querySelector('[data-cloud-node-id="n2"]')!;

    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    window.dispatchEvent(mouseEvent('mouseup', 33, 33)); // 1-2px — well under the drag threshold
    expect(stateManager.getState().cloudConnectors).toHaveLength(0);

    n2El.dispatchEvent(mouseEvent('mousedown', 332, 32)); // the separate second click
    expect(stateManager.getState().cloudConnectors).toHaveLength(1);
  });

  it('landing the second click directly on the destination node\'s own connection dot completes the connector, instead of restarting a new one sourced from there', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');

    // Select n1 first so its own handles exist, then start (and leave pending, via a release
    // under the drag threshold) a connection from its right handle.
    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    window.dispatchEvent(mouseEvent('mouseup', 32, 32));
    const rightHandle = document.querySelector('.cloud-node-connect-handle[data-handle-side="right"][data-cloud-node-id="n1"]')!;
    rightHandle.dispatchEvent(mouseEvent('mousedown', 64, 32));
    window.dispatchEvent(mouseEvent('mouseup', 65, 33)); // under threshold — leaves the source pending

    // Hover onto n2 so its own connection dots render as a drop target.
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mousemove', 332, 32));
    const n2LeftHandle = document.querySelector('.cloud-node-connect-handle[data-handle-side="left"][data-cloud-node-id="n2"]');
    expect(n2LeftHandle).not.toBeNull();

    // The second click lands squarely on n2's own dot — the most obvious place to aim for, and
    // previously this blew away the pending n1 connection and started a brand new one sourced
    // from n2, instead of landing the connector there.
    n2LeftHandle!.dispatchEvent(mouseEvent('mousedown', 300, 32));

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(1);
    expect(s.cloudConnectors[0].sourceNodeId).toBe('n1');
    expect(s.cloudConnectors[0].destNodeId).toBe('n2');
    expect(s.cloudConnectors[0].destSide).toBe('left');
  });

  it('dragging from a node\'s connection handle (which appears once the node is clicked/selected) creates a connector without switching to the Connect tool', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');
    // Deliberately left as 'select' (the default tool) — the whole point of the connection
    // handles is that no tool switch is required.
    expect(stateManager.getState().tool).toBe('select');

    // Handles don't exist in the DOM until the node is selected — click it first (a plain click,
    // released without moving, so it doesn't also start a drag-move of the node itself).
    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    window.dispatchEvent(mouseEvent('mouseup', 32, 32));

    const rightHandle = document.querySelector('.cloud-node-connect-handle[data-handle-side="right"][data-cloud-node-id="n1"]');
    expect(rightHandle).not.toBeNull();

    rightHandle!.dispatchEvent(mouseEvent('mousedown', 64, 32));
    // Re-queried fresh for each dispatch — the first hover onto n2 triggers a renderCloudAll()
    // (to show its connection handles as a drop target), which rebuilds the node layer's DOM
    // and detaches any earlier captured reference.
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mousemove', 332, 32));
    document.querySelector('[data-cloud-node-id="n2"]')!.dispatchEvent(mouseEvent('mouseup', 332, 32));

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(1);
    expect(s.cloudConnectors[0].sourceNodeId).toBe('n1');
    expect(s.cloudConnectors[0].destNodeId).toBe('n2');
    expect(s.cloudConnectors[0].sourceSide).toBe('right');
    expect(s.tool).toBe('select'); // starting a connection from a handle doesn't force a tool switch
  });

  it('a node\'s connection handles disappear once it\'s deselected', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [{ id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' }],
    });
    app.setActiveView('cloud');
    expect(document.querySelectorAll('.cloud-node-connect-handle').length).toBe(0);

    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    window.dispatchEvent(mouseEvent('mouseup', 32, 32));
    expect(document.querySelectorAll('.cloud-node-connect-handle').length).toBe(4);

    // Click empty canvas to deselect.
    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 500, 500));
    expect(document.querySelectorAll('.cloud-node-connect-handle').length).toBe(0);
  });

  it('clicking a handle then clicking a different node\'s body (not another handle) still completes the connector, while the select tool is active', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');

    const n1El = document.querySelector('[data-cloud-node-id="n1"]')!;
    n1El.dispatchEvent(mouseEvent('mousedown', 32, 32));
    window.dispatchEvent(mouseEvent('mouseup', 32, 32));

    const rightHandle = document.querySelector('.cloud-node-connect-handle[data-handle-side="right"][data-cloud-node-id="n1"]')!;
    const n2El = document.querySelector('[data-cloud-node-id="n2"]')!;

    // Click the handle without dragging (no movement, no drag threshold met)...
    rightHandle.dispatchEvent(mouseEvent('mousedown', 64, 32));
    window.dispatchEvent(mouseEvent('mouseup', 64, 32));
    expect(stateManager.getState().cloudConnectors).toHaveLength(0);

    // ...then a completely separate click on node 2's body (not its handle) completes it,
    // instead of silently selecting/starting to drag node 2 and leaving the connection dangling.
    n2El.dispatchEvent(mouseEvent('mousedown', 332, 32));

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(1);
    expect(s.cloudConnectors[0].sourceNodeId).toBe('n1');
    expect(s.cloudConnectors[0].destNodeId).toBe('n2');
    // Completing the connector selects it (same "create -> select the new thing" pattern as
    // every other cloud object) rather than leaving node 2 selected/dragged as a side effect of
    // the click that landed on its body.
    expect(s.selection).toEqual([{ type: 'cloud-connector', id: s.cloudConnectors[0].id }]);
  });

  it('dropping a boundary-type icon (Azure Virtual Networks) primes the container tool instead of placing a node', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const viewport = document.getElementById('cloud-viewport')!;
    dispatchDrop(viewport, { iconId: 'azure-virtual-networks' }, 150, 200);

    expect(stateManager.getState().cloudNodes).toHaveLength(0);
    expect(stateManager.getState().tool).toBe('cloud-container');
  });

  it('drawing after a boundary-icon drop creates a container labeled/iconed/kinded from that icon', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const viewport = document.getElementById('cloud-viewport')!;
    dispatchDrop(viewport, { iconId: 'azure-virtual-networks' }, 0, 0);
    expect(stateManager.getState().tool).toBe('cloud-container');

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 20, 20));
    window.dispatchEvent(mouseEvent('mouseup', 220, 170));

    const s = stateManager.getState();
    expect(s.cloudContainers).toHaveLength(1);
    expect(s.cloudContainers[0]).toMatchObject({
      kind: 'vpc', provider: 'azure', iconId: 'azure-virtual-networks', label: 'Virtual Networks',
    });
    expect(s.tool).toBe('select');
  });

  it('switching tools away from a primed boundary-icon draw without drawing clears the primed icon', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const viewport = document.getElementById('cloud-viewport')!;
    dispatchDrop(viewport, { iconId: 'azure-virtual-networks' }, 0, 0);
    expect(stateManager.getState().tool).toBe('cloud-container');

    // Bail out via a different tool instead of drawing.
    eventBus.emit('tool:changed', 'select');
    // Manually using the container tool afterward must NOT still be labeled "Virtual Networks".
    eventBus.emit('tool:changed', 'cloud-container');
    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 20, 20));
    window.dispatchEvent(mouseEvent('mouseup', 220, 170));

    const s = stateManager.getState();
    expect(s.cloudContainers).toHaveLength(1);
    expect(s.cloudContainers[0].label).toBe('Container');
    expect(s.cloudContainers[0].iconId).toBeUndefined();
  });

  it('cloud-shape:prime (Region toolbar shape button) primes the container tool with kind+label but no icon', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('cloud-shape:prime' as any, 'region');
    expect(stateManager.getState().tool).toBe('cloud-container');

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 10, 10));
    window.dispatchEvent(mouseEvent('mouseup', 210, 160));

    const s = stateManager.getState();
    expect(s.cloudContainers).toHaveLength(1);
    expect(s.cloudContainers[0]).toMatchObject({ kind: 'region', label: 'Region' });
    expect(s.cloudContainers[0].iconId).toBeUndefined();
    expect(s.tool).toBe('select');
  });

  it('each of the six basic shape kinds primes and draws correctly', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const kinds: Array<[string, string]> = [
      ['az', 'Availability Zone'],
      ['vpc', 'VPC / Virtual Network'],
      ['subnet', 'Subnet'],
      ['resource-group', 'Resource Group'],
      ['account', 'Account / Subscription / Project'],
    ];
    const svgEl = document.getElementById('cloud-canvas')!;
    let x = 10;
    for (const [kind, label] of kinds) {
      eventBus.emit('cloud-shape:prime' as any, kind);
      svgEl.dispatchEvent(mouseEvent('mousedown', x, 10));
      window.dispatchEvent(mouseEvent('mouseup', x + 100, 110));
      x += 150;
    }

    const containers = stateManager.getState().cloudContainers;
    expect(containers).toHaveLength(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
      expect(containers[i].kind).toBe(kinds[i][0]);
      expect(containers[i].label).toBe(kinds[i][1]);
    }
  });

  it('the cloud-export-area tool draws a rectangle from mousedown-drag to mouseup and emits export:cloud-area-selected', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('tool:changed', 'cloud-export-area');
    expect(stateManager.getState().tool).toBe('cloud-export-area');

    let selectedRect: any = null;
    eventBus.on('export:cloud-area-selected', (rect: any) => { selectedRect = rect; });

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 20, 20));
    // Mid-drag: the preview rect should exist and track the drag (mousemove is bound to the
    // svg element itself, same as the container-draw preview, not window).
    svgEl.dispatchEvent(mouseEvent('mousemove', 60, 55));
    const previewRect = document.getElementById('cloud-export-area-rect');
    expect(previewRect).not.toBeNull();
    expect(previewRect!.getAttribute('width')).toBe('40');
    expect(previewRect!.getAttribute('height')).toBe('35');

    window.dispatchEvent(mouseEvent('mouseup', 120, 90));

    expect(selectedRect).toEqual({ x: 20, y: 20, width: 100, height: 70 });
    // Finishing the draw returns to the select tool and removes the preview rect.
    expect(stateManager.getState().tool).toBe('select');
    expect(document.getElementById('cloud-export-area-rect')).toBeNull();
  });

  it('the full user-facing flow (toolbar button -> modal -> Draw Custom Area -> drag) actually exports the drawn rect', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    app.setActiveView('cloud');

    document.getElementById('btn-exp-cloud-svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const modal = document.getElementById('cloud-export-settings-modal');
    expect(modal).not.toBeNull();

    const customRadio = modal!.querySelector('input[name="cloud-export-area"][value="custom"]') as HTMLInputElement;
    expect(customRadio).not.toBeNull();
    customRadio.checked = true;

    document.getElementById('cloud-export-modal-confirm')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Modal closes and the tool arms for a canvas drag.
    expect(document.getElementById('cloud-export-settings-modal')).toBeNull();
    expect(stateManager.getState().tool).toBe('cloud-export-area');

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(mouseEvent('mousedown', 20, 20));
    svgEl.dispatchEvent(mouseEvent('mousemove', 120, 90));
    window.dispatchEvent(mouseEvent('mouseup', 120, 90));

    expect(stateManager.getState().tool).toBe('select');
  });

  it('deleting a selected CloudNode removes it and any connector referencing it', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [{ id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' }],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destPoint: { x: 200, y: 200 } }],
      selection: [{ type: 'cloud-node', id: 'n1' }],
    });

    eventBus.emit('edit:delete', undefined as any);

    const s = stateManager.getState();
    expect(s.cloudNodes).toHaveLength(0);
    expect(s.cloudConnectors).toHaveLength(0);
  });
});
