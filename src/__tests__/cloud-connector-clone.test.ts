import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Ctrl+D duplicating a selected CloudConnector — see cloneCloudConnector() in utils/clone.ts.
 * Split into its own file rather than added to cloud-connector-editing.test.ts, which already
 * flagged intermittent vitest-worker OOM from too many heavy App mounts accumulating in one file.
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

function ctrlD(): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'd', ctrlKey: true });
}

describe('Ctrl+D duplicates a selected cloud connector', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  it('creates a new, detached connector near the original, preserving its style', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 300, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{
        id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left',
        style: 'dashed', color: '#58a6ff', width: 3, routing: 'orthogonal',
      }],
      selection: [{ type: 'cloud-connector', id: 'conn1' }],
    });
    app.setActiveView('cloud');

    document.dispatchEvent(ctrlD());

    const s = stateManager.getState();
    expect(s.cloudConnectors).toHaveLength(2);
    const clone = s.cloudConnectors.find(c => c.id !== 'conn1')!;
    expect(clone).toBeDefined();

    // Detached, not reattached to n1/n2.
    expect(clone.sourceNodeId).toBeNull();
    expect(clone.destNodeId).toBeNull();
    expect(clone.sourcePoint).toBeTruthy();
    expect(clone.destPoint).toBeTruthy();

    // Style preserved.
    expect(clone.style).toBe('dashed');
    expect(clone.color).toBe('#58a6ff');
    expect(clone.width).toBe(3);

    // The clone becomes the new selection.
    expect(s.selection).toEqual([{ type: 'cloud-connector', id: clone.id }]);
  });

  it('does nothing when no cloud-connector is selected (e.g. a device is selected instead)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [{ id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' }],
      cloudConnectors: [],
      selection: [{ type: 'cloud-node', id: 'n1' }],
    });
    app.setActiveView('cloud');

    document.dispatchEvent(ctrlD());

    expect(stateManager.getState().cloudConnectors).toHaveLength(0);
  });
});
