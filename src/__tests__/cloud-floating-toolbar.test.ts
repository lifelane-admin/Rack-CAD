import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/** The Cloud Architecture canvas's floating quick-access toolbar (see
 *  components/cloud-floating-toolbar.ts) — mounted inside #cloud-viewport alongside the rest of
 *  that view. Verified through a real mounted App, same pattern as cloud-architecture.test.ts. */
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

describe('CloudFloatingToolbar', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'rack',
    });
  });

  it('mounts inside #cloud-viewport', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    new App().init();

    const toolbar = document.querySelector('#cloud-viewport #cloud-floating-toolbar');
    expect(toolbar).not.toBeNull();
  });

  it('renders a button for all six basic shapes plus select/pan/connect/container', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    new App().init();

    for (const kind of ['region', 'az', 'vpc', 'subnet', 'resource-group', 'account']) {
      expect(document.querySelector(`#cft-shape-${kind}`)).not.toBeNull();
    }
    expect(document.querySelector('#cft-tool-select')).not.toBeNull();
    expect(document.querySelector('#cft-tool-pan')).not.toBeNull();
    expect(document.querySelector('#cft-tool-connect')).not.toBeNull();
    expect(document.querySelector('#cft-tool-container')).not.toBeNull();
  });

  it('clicking a shape button primes the container-draw tool with that kind (same as the main toolbar\'s Cloud Shapes group)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    new App().init();

    (document.querySelector('#cft-shape-subnet') as HTMLElement).click();
    expect(stateManager.getState().tool).toBe('cloud-container');
  });

  it('clicking the Connect button switches the tool to cloud-connect', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    new App().init();

    (document.querySelector('#cft-tool-connect') as HTMLElement).click();
    expect(stateManager.getState().tool).toBe('cloud-connect');
  });

  it('clicking Select switches back to the select tool', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    new App().init();

    eventBus.emit('tool:changed', 'cloud-connect');
    (document.querySelector('#cft-tool-select') as HTMLElement).click();
    expect(stateManager.getState().tool).toBe('select');
  });
});
