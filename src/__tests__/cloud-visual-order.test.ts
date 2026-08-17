import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * "Visual Order" (Bring to Front/Forward, Send Backward/to Back) on every cloud canvas object's
 * right-click menu — see app.ts's visualOrderMenuItems(). Also covers the CloudNode context menu
 * itself, which didn't exist before this (right-clicking a node was a silent no-op).
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

function rightClick(x: number, y: number): MouseEvent {
  return new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

function submenuItemByText(topLevelLabel: string, subLabel: string): HTMLElement | null {
  const top = [...document.querySelectorAll('.context-menu-item .context-menu-label')]
    .find(el => el.textContent?.includes(topLevelLabel))
    ?.closest('.context-menu-item') as HTMLElement | undefined;
  if (!top) return null;
  const label = [...top.querySelectorAll('.context-submenu .context-menu-label')]
    .find(el => el.textContent?.includes(subLabel));
  return (label?.closest('.context-menu-item') as HTMLElement | undefined) ?? null;
}

describe('Cloud canvas Visual Order (every object type)', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], cloudHierarchies: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  it('right-clicking a CloudNode now opens a menu (previously a silent no-op) with Visual Order and Delete', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 100, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
    });
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-node-id="n1"]')!.dispatchEvent(rightClick(30, 30));
    expect(stateManager.getState().selection).toEqual([{ type: 'cloud-node', id: 'n1' }]);

    const bringToFront = submenuItemByText('Visual Order', 'Bring to Front')!;
    expect(bringToFront).toBeTruthy();
    bringToFront.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudNodes.map(n => n.id)).toEqual(['n2', 'n1']);
  });

  it('"Send to Back" on a CloudContainer moves it to the start of the array', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    stateManager.setState({
      cloudContainers: [
        { id: 'c1', kind: 'subnet', x: 0, y: 0, width: 300, height: 200, label: 'A' },
        { id: 'c2', kind: 'vpc', x: 0, y: 0, width: 400, height: 300, label: 'B' },
      ],
    });
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="c2"]')!.dispatchEvent(rightClick(50, 50));
    const sendToBack = submenuItemByText('Visual Order', 'Send to Back')!;
    expect(sendToBack).toBeTruthy();
    sendToBack.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudContainers.map(c => c.id)).toEqual(['c2', 'c1']);
  });

  it('"Bring Forward" / "Send Backward" step a CloudHierarchy one position at a time', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    stateManager.setState({
      cloudHierarchies: [
        { id: 'h1', provider: 'azure', x: 0, y: 0, levels: [{ kind: 'account', label: 'A' }] },
        { id: 'h2', provider: 'azure', x: 500, y: 0, levels: [{ kind: 'account', label: 'B' }] },
        { id: 'h3', provider: 'azure', x: 1000, y: 0, levels: [{ kind: 'account', label: 'C' }] },
      ],
    });
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(50, 50));
    submenuItemByText('Visual Order', 'Bring Forward')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(stateManager.getState().cloudHierarchies.map(h => h.id)).toEqual(['h2', 'h1', 'h3']);

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(50, 50));
    submenuItemByText('Visual Order', 'Send Backward')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(stateManager.getState().cloudHierarchies.map(h => h.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('"Bring to Front" on a CloudConnector moves it to the end of the array', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [
        { id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2' },
        { id: 'conn2', sourcePoint: { x: 0, y: 100 }, destPoint: { x: 400, y: 100 } },
      ],
    });
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-connector-id="conn1"]')!.dispatchEvent(rightClick(200, 32));
    const bringToFront = submenuItemByText('Visual Order', 'Bring to Front')!;
    expect(bringToFront).toBeTruthy();
    bringToFront.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudConnectors.map(c => c.id)).toEqual(['conn2', 'conn1']);
  });
});
