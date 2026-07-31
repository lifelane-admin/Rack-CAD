import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { exportJSON } from '../utils/export';

/**
 * Regression coverage for the real bug: opening a project (via the toolbar's Open button, or the
 * File System Access API path in App) updated state correctly but never re-rendered the canvas,
 * so the previously-displayed racks/devices stayed on screen and the newly-loaded project's
 * devices appeared "missing." Root cause: the canvas is NOT reactive to 'state:changed' — App
 * re-renders only in response to specific events, and nothing called renderAll() after
 * 'project:load' unless routed through a dead code path the real Open button never used.
 *
 * Full DOM skeleton mirrors index.html's required element IDs so the real App class (not a
 * stand-in) can be constructed and exercised end-to-end.
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

describe('end-to-end: opening a project actually redraws the canvas', () => {
  beforeEach(() => {
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [] });
  });

  it('emitting project:load (as the real Open flow does) results in the loaded devices being drawn', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    // Build a saved project file containing a device the fresh/blank app does not currently have.
    const project = {
      version: '1.0.0', name: 'Rack Slicer Project', created: new Date(0).toISOString(),
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [{
        id: 'dev-saved-1', templateId: 'server-1u', rackId: 'r1', startUnit: 1,
        name: 'Saved Server', hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
      }],
      cables: [], bundles: [], customTemplates: [],
    };

    // This is exactly what both the toolbar's Open button and App's own openProject() do: read
    // the file's text and emit 'project:load' with it — no direct call to importJSON or renderAll.
    eventBus.emit('project:load', JSON.stringify(project));

    expect(stateManager.getState().devices.some(d => d.id === 'dev-saved-1')).toBe(true);

    // The actual regression: the canvas SVG must contain the newly-loaded device, not just the
    // state object. A stale (missing) render was invisible to state-only assertions.
    const canvas = document.getElementById('canvas')!;
    const drawn = canvas.querySelector('[data-device-id="dev-saved-1"]');
    expect(drawn).toBeTruthy();
  });

  it('Save then Open round-trip preserves every device placed, not a subset', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true }],
      devices: [
        { id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 1, name: 'A', hostname: '', managementIp: '', serialNumber: '', description: '', ports: [] },
        { id: 'd2', templateId: 'server-2u', rackId: 'r1', startUnit: 3, name: 'B', hostname: '', managementIp: '', serialNumber: '', description: '', ports: [] },
        { id: 'd3', templateId: 'sw-enterprise', rackId: 'r1', startUnit: 6, name: 'C', hostname: '', managementIp: '', serialNumber: '', description: '', ports: [] },
      ],
      cables: [],
    } as any);

    const savedJson = exportJSON();

    // Simulate closing and reopening: reset to a blank project, then load the saved JSON back —
    // exactly the toolbar Open flow's 'project:load' emission.
    stateManager.setState({ racks: [], devices: [], cables: [], bundles: [], selection: [] });
    eventBus.emit('project:load', savedJson);

    const restoredIds = stateManager.getState().devices.map(d => d.id).sort();
    expect(restoredIds).toEqual(['d1', 'd2', 'd3']);

    const canvas = document.getElementById('canvas')!;
    for (const id of ['d1', 'd2', 'd3']) {
      expect(canvas.querySelector(`[data-device-id="${id}"]`), `device ${id} missing from canvas after reopen`).toBeTruthy();
    }
  });
});
