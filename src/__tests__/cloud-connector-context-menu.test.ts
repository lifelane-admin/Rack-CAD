import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Right-click context menu + manual waypoints for CloudConnectors (mirrors the rack canvas's
 * cable "Add/Remove Routing Anchor Point" pattern — see setupCloudContextMenu() in app.ts and
 * CloudConnector.waypoints in core/types.ts). The cloud canvas had no contextmenu handling at
 * all before this.
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

function rightClick(x: number, y: number): MouseEvent {
  return new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

function menuItemByText(text: string): HTMLElement | null {
  const label = [...document.querySelectorAll('.context-menu-item .context-menu-label')]
    .find(el => el.textContent?.includes(text));
  return (label?.closest('.context-menu-item') as HTMLElement | undefined) ?? null;
}

describe('Cloud connector right-click context menu', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  function setupConnector() {
    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal', label: 'Data Flow' }],
      selection: [],
    });
  }

  it('right-clicking a connector selects it and opens a menu with its label', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    app.setActiveView('cloud');

    const connEl = document.querySelector('[data-cloud-connector-id="conn1"]')!;
    connEl.dispatchEvent(rightClick(150, 32));

    expect(stateManager.getState().selection).toEqual([{ type: 'cloud-connector', id: 'conn1' }]);
    expect(menuItemByText('Data Flow')).not.toBeNull();
    expect(menuItemByText('Add Waypoint Here')).not.toBeNull();
    expect(menuItemByText('Duplicate Connector')).not.toBeNull();
    expect(menuItemByText('Delete Connector')).not.toBeNull();
  });

  it('"Add Waypoint Here" adds a manual waypoint the connector now routes through', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    app.setActiveView('cloud');

    const connEl = document.querySelector('[data-cloud-connector-id="conn1"]')!;
    connEl.dispatchEvent(rightClick(150, 100));

    menuItemByText('Add Waypoint Here')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.waypoints).toHaveLength(1);
    expect(conn.waypoints![0]).toEqual({ x: 150, y: 100 });
  });

  it('right-clicking an existing waypoint offers "Remove Waypoint" instead of "Add"', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    stateManager.setState({
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal', waypoints: [{ x: 150, y: 100 }] }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const waypointHandle = document.querySelector('[data-cloud-connector-id="conn1"].cloud-connector-waypoint-handle') as SVGElement;
    expect(waypointHandle).toBeTruthy();
    waypointHandle.dispatchEvent(rightClick(150, 100));

    expect(menuItemByText('Add Waypoint Here')).toBeNull();
    const removeItem = menuItemByText('Remove Waypoint')!;
    expect(removeItem).not.toBeNull();

    removeItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.waypoints).toEqual([]);
  });

  it('dragging a waypoint handle repositions that specific point', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    stateManager.setState({
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal', waypoints: [{ x: 150, y: 100 }] }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    const svgEl = document.getElementById('cloud-canvas')!;
    const waypointHandle = document.querySelector('[data-cloud-connector-id="conn1"].cloud-connector-waypoint-handle') as SVGElement;
    waypointHandle.dispatchEvent(mouseEvent('mousedown', 150, 100));
    svgEl.dispatchEvent(mouseEvent('mousemove', 200, 180));
    window.dispatchEvent(mouseEvent('mouseup', 200, 180));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.waypoints).toEqual([{ x: 200, y: 180 }]);
  });

  it('"Duplicate Connector" from the menu creates a detached clone, same as Ctrl+D', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-connector-id="conn1"]')!.dispatchEvent(rightClick(150, 32));
    menuItemByText('Duplicate Connector')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(2);
    const clone = s.cloudConnectors.find(c => c.id !== 'conn1')!;
    expect(clone.sourceNodeId).toBeNull();
  });

  it('"Delete Connector" from the menu removes it and clears selection', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-connector-id="conn1"]')!.dispatchEvent(rightClick(150, 32));
    menuItemByText('Delete Connector')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudConnectors).toHaveLength(0);
    expect(stateManager.getState().selection).toEqual([]);
  });

  it('"Reset Routing" only appears once waypoints exist, and clears them', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupConnector();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-connector-id="conn1"]')!.dispatchEvent(rightClick(150, 32));
    expect(menuItemByText('Reset Routing')).toBeNull();

    stateManager.setState({
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left', routing: 'orthogonal', waypoints: [{ x: 150, y: 100 }] }],
    });
    document.querySelector('[data-cloud-connector-id="conn1"]')!.dispatchEvent(rightClick(150, 32));
    const resetItem = menuItemByText('Reset Routing')!;
    expect(resetItem).not.toBeNull();
    resetItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const conn = stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!;
    expect(conn.waypoints).toBeUndefined();
  });
});
