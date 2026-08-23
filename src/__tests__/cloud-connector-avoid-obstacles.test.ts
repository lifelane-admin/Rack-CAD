import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * End-to-end wiring for CloudConnector.avoidObstacles (see cloud-connector-router.ts for the
 * pathfinding itself, already covered in isolation by cloud-connector-router.test.ts). Split into
 * its own file rather than appended to cloud-connector-editing.test.ts, which already documents
 * being kept small to avoid piling up too many heavy App mounts in one worker process.
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

describe('Cloud connector avoidObstacles — end-to-end', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  it('routes around an obstacle node sitting between source and dest when avoidObstacles is on', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 40, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 40, width: 64, height: 64, label: 'Athena' },
        { id: 'obstacle', iconId: 'aws-amazon-cloudsearch', provider: 'aws', x: 180, y: 0, width: 100, height: 140, label: 'Blocker' },
      ],
      cloudConnectors: [{
        id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', sourceSide: 'right', destSide: 'left',
        routing: 'orthogonal', avoidObstacles: true,
      }],
      selection: [],
    });
    app.setActiveView('cloud');

    const path = document.querySelector('[data-cloud-connector-id="conn1"] path:not([stroke="transparent"])')!;
    const d = path.getAttribute('d')!;
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });

    // The obstacle's inflated box (12px padding): x 168-292, y -12-152.
    const hitsObstacle = pts.some((p, i) => {
      if (i === pts.length - 1) return false;
      const next = pts[i + 1];
      if (p.x === next.x) {
        return p.x > 168 && p.x < 292 && Math.min(p.y, next.y) < 152 && Math.max(p.y, next.y) > -12;
      }
      if (p.y === next.y) {
        return p.y > -12 && p.y < 152 && Math.min(p.x, next.x) < 292 && Math.max(p.x, next.x) > 168;
      }
      return false;
    });
    expect(hitsObstacle).toBe(false);
    // A route that had to detour has more than the 2 points of a straight line.
    expect(pts.length).toBeGreaterThan(2);
  });

  it('the properties-panel toggle flips avoidObstacles via cloudconnector:update', async () => {
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
    eventBus.emit('selection:changed', [{ type: 'cloud-connector', id: 'conn1' }]);

    let updated = false;
    eventBus.on('cloudconnector:update', (payload: any) => {
      if (payload.id === 'conn1' && payload.data.avoidObstacles === true) updated = true;
    });

    const checkbox = document.querySelector('#prop-cloudconn-avoid-obstacles') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(updated).toBe(true);
  });
});
