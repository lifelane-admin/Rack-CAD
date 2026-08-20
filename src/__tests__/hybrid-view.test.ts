import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { Toolbar } from '../components/toolbar';
import { Sidebar } from '../components/sidebar';

/**
 * Hybrid view — the rack canvas and the Cloud Architecture canvas shown side by side in
 * #canvas-split, split by the draggable #splitter-hybrid, 2D only (see app.ts's setActiveView()
 * and mountHybridSplitter()). Each pane keeps its own independent pan/zoom — deliberately not
 * locked together, since a rack elevation and a cloud diagram have very different native scales.
 * The splitter's own pointer-drag resizing is NOT covered here (jsdom doesn't do layout, so a
 * flex-basis percentage change can't be observed) — that needs a real-browser check. What IS
 * covered: the DOM/state side-effects setActiveView('hybrid') is responsible for, and
 * toolbar/sidebar visibility once both canvases are up.
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
            <div class="splitter-3d hidden" id="splitter-3d"></div>
            <div id="canvas-3d" class="hidden"></div>
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

describe('Hybrid view', () => {
  beforeEach(() => {
    eventBus.clear();
    document.body.classList.remove('hybrid-active');
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], cloudHierarchies: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'rack', show3DPanel: false,
    });
  });

  it('switching to hybrid shows both viewports, adds body.hybrid-active, and keeps the 3D panel hidden', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('view:switch', 'hybrid');

    expect(stateManager.getState().activeView).toBe('hybrid');
    expect(document.getElementById('canvas-viewport')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('cloud-viewport')!.classList.contains('hidden')).toBe(false);
    expect(document.body.classList.contains('hybrid-active')).toBe(true);
    expect(document.getElementById('splitter-3d')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('canvas-3d')!.classList.contains('hidden')).toBe(true);
  });

  it('switching away from hybrid back to rack removes body.hybrid-active and hides the cloud viewport again', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('view:switch', 'hybrid');
    eventBus.emit('view:switch', 'rack');

    expect(document.body.classList.contains('hybrid-active')).toBe(false);
    expect(document.getElementById('cloud-viewport')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('canvas-viewport')!.classList.contains('hidden')).toBe(false);
  });

  it('the rack floating toolbar\'s 3D toggle cannot reveal the 3D panel while hybrid is active', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    eventBus.emit('view:switch', 'hybrid');
    eventBus.emit('view:toggle-3d-panel', undefined);

    expect(stateManager.getState().show3DPanel).toBe(true); // preference recorded...
    expect(document.getElementById('splitter-3d')!.classList.contains('hidden')).toBe(true); // ...but not shown
    expect(document.getElementById('canvas-3d')!.classList.contains('hidden')).toBe(true);
  });

  it('dropping a cloud icon onto the rack canvas in hybrid view is a no-op — the two panes are separate drop targets now, not overlapping', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({ activeView: 'hybrid' });
    const rackViewport = document.getElementById('canvas-viewport')!;
    dispatchDrop(rackViewport, { iconId: 'aws-amazon-ec2' }, 150, 200);

    expect(stateManager.getState().cloudNodes).toHaveLength(0);
  });

  it('does NOT create a CloudNode from a rack-canvas drop outside hybrid view either', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // activeView stays 'rack' (the beforeEach default)
    const rackViewport = document.getElementById('canvas-viewport')!;
    dispatchDrop(rackViewport, { iconId: 'aws-amazon-ec2' }, 150, 200);

    expect(stateManager.getState().cloudNodes).toHaveLength(0);
  });
});

describe('Hybrid view — toolbar group visibility', () => {
  function mountToolbar(): Toolbar {
    document.body.innerHTML = `<header id="toolbar"></header>`;
    const container = document.getElementById('toolbar')!;
    const toolbar = new Toolbar(container);
    toolbar.render();
    return toolbar;
  }

  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('shows every rack AND cloud toolbar group at once in hybrid view', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'hybrid' });

    for (const id of ['rack-export-group', 'rack-view-group', 'rack-add-group', 'cloud-tools-group', 'cloud-shapes-group', 'cloud-export-group']) {
      expect(document.getElementById(id)!.style.display, `#${id} should be visible in hybrid`).not.toBe('none');
    }
  });
});

describe('Hybrid view — sidebar dual-render', () => {
  function mountSidebar(): Sidebar {
    document.body.innerHTML = `<aside id="sidebar"></aside>`;
    const container = document.getElementById('sidebar')!;
    const sidebar = new Sidebar(container);
    sidebar.render();
    return sidebar;
  }

  beforeEach(() => {
    stateManager.setState({ activeView: 'hybrid', selection: [] });
  });

  it('renders both the rack device catalog and the cloud icon palette without one clearing the other', () => {
    mountSidebar();

    const rackContainer = document.getElementById('catalog-container');
    const cloudContainer = document.getElementById('cloud-catalog-container');
    expect(rackContainer).toBeTruthy();
    expect(cloudContainer).toBeTruthy();
    // Both actually have content — if one's render() wiped the other's shared container (the
    // bug this test guards against), one of these would come back empty.
    expect(rackContainer!.children.length).toBeGreaterThan(0);
    expect(cloudContainer!.children.length).toBeGreaterThan(0);
  });

  it('marks the Hybrid tab active while hybrid is the active view', () => {
    mountSidebar();
    const hybridTab = [...document.querySelectorAll('.sb-tab')].find(el => el.textContent?.trim() === 'Hybrid');
    expect(hybridTab?.classList.contains('active')).toBe(true);
  });
});
