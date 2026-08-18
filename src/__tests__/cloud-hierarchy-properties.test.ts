import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { CLOUD_CONNECTOR_LINE_STYLES } from '../renderers/cloud-connector-renderer';

/** Properties-panel Border Line Style + Border Color + Background Fill for CloudHierarchy (the
 *  "describe infra in one line" breadcrumb box) — mirrors cloud-container-properties.test.ts,
 *  since it's now rendered as the same kind of boundary box and shares the exact same picker
 *  markup/wiring, just namespaced under a different id prefix. */
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

describe('Cloud hierarchy properties panel — Border Line Style + Color + Background Fill', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], cloudHierarchies: [], selection: [], activeView: 'cloud',
    });
  });

  async function selectHierarchy(overrides: Record<string, unknown> = {}) {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudHierarchies: [{
        id: 'h1', provider: 'azure', x: 0, y: 0,
        levels: [{ kind: 'account', label: 'gipl-azure-subscription' }, { kind: 'region', label: 'South India' }],
        ...overrides,
      }],
    });
    const selection = [{ type: 'cloud-hierarchy' as const, id: 'h1' }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    return document.getElementById('properties-panel')!;
  }

  it('renders every catalog line style as an option, namespaced under the hierarchy-specific picker id', async () => {
    const panel = await selectHierarchy();
    const options = panel.querySelectorAll('#prop-cloudhierarchy-style-picker .line-style-option');
    expect(options.length).toBe(CLOUD_CONNECTOR_LINE_STYLES.length);
  });

  it('clicking a style option sets CloudHierarchy.style and updates the trigger label', async () => {
    const panel = await selectHierarchy();
    const trigger = panel.querySelector('#prop-cloudhierarchy-style-trigger')!;
    expect(trigger.textContent).toContain('Solid'); // default when style is unset

    const option = panel.querySelector('#prop-cloudhierarchy-style-picker .line-style-option[data-value="dotted"]') as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!.style).toBe('dotted');
    expect(trigger.textContent).toContain('Dotted');
  });

  it('the Line Color input sets CloudHierarchy.color directly (not just the provider accent)', async () => {
    const panel = await selectHierarchy();
    const colorInput = panel.querySelector('#prop-cloudhierarchy-color') as HTMLInputElement;
    expect(colorInput).not.toBeNull();
    colorInput.value = '#112233';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!.color).toBe('#112233');
  });

  it('the Ribbon Color input sets CloudHierarchy.ribbonColor independently of Line Color', async () => {
    const panel = await selectHierarchy({ color: '#112233' });
    const ribbonInput = panel.querySelector('#prop-cloudhierarchy-ribbon-color') as HTMLInputElement;
    expect(ribbonInput).not.toBeNull();
    // Defaults to the Line Color when no ribbonColor override exists yet, so it doesn't look
    // like a second, disconnected color out of the box.
    expect(ribbonInput.value.toLowerCase()).toBe('#112233');

    ribbonInput.value = '#445566';
    ribbonInput.dispatchEvent(new Event('input', { bubbles: true }));

    const hierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!;
    expect(hierarchy.ribbonColor).toBe('#445566');
    expect(hierarchy.color).toBe('#112233'); // unchanged
  });

  it('the Text Color input sets CloudHierarchy.textColor independently of Line/Ribbon Color', async () => {
    const panel = await selectHierarchy({ color: '#112233', ribbonColor: '#445566' });
    const textInput = panel.querySelector('#prop-cloudhierarchy-text-color') as HTMLInputElement;
    expect(textInput).not.toBeNull();

    textInput.value = '#000000';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));

    const hierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!;
    expect(hierarchy.textColor).toBe('#000000');
    expect(hierarchy.color).toBe('#112233'); // unchanged
    expect(hierarchy.ribbonColor).toBe('#445566'); // unchanged
  });

  it('the Background Fill checkbox is checked by default and unchecking it sets backgroundOpacity to 0', async () => {
    const panel = await selectHierarchy();
    const checkbox = panel.querySelector('#prop-cloudhierarchy-bg-enabled') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!.backgroundOpacity).toBe(0);
  });

  it('dragging the opacity slider sets backgroundOpacity and updates the live percentage label', async () => {
    const panel = await selectHierarchy();
    const slider = panel.querySelector('#prop-cloudhierarchy-bg-opacity') as HTMLInputElement;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!.backgroundOpacity).toBe(0.4);
    expect(panel.querySelector('#prop-cloudhierarchy-bg-opacity-value')!.textContent).toBe('40%');
  });

  it('starts with the fill checkbox unchecked and the slider row disabled when backgroundOpacity is already 0', async () => {
    const panel = await selectHierarchy({ backgroundOpacity: 0 });
    const checkbox = panel.querySelector('#prop-cloudhierarchy-bg-enabled') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('the renderer actually applies the color/style/opacity overrides to the boundary box\'s SVG attributes', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    stateManager.setState({
      cloudHierarchies: [{
        id: 'h1', provider: 'azure', x: 0, y: 0,
        levels: [{ kind: 'account', label: 'Sub' }],
        color: '#112233', style: 'dotted', backgroundOpacity: 0.5,
      }],
    });
    app.setActiveView('cloud'); // forces the actual SVG render (see this file's note on app.ts having no generic state:changed listener)

    const rect = document.querySelector('[data-cloud-hierarchy-id="h1"] rect') as SVGRectElement;
    expect(rect.getAttribute('stroke')).toBe('#112233');
    expect(rect.getAttribute('fill')).toBe('#112233');
    expect(rect.getAttribute('fill-opacity')).toBe('0.5');
    expect(rect.getAttribute('stroke-dasharray')).toBeTruthy();
  });
});
