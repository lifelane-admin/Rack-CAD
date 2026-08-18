import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { CLOUD_CONNECTOR_LINE_STYLES } from '../renderers/cloud-connector-renderer';

/** Properties-panel Border Line Style + Border Color for CloudContainer (VPC/Subnet/AZ/Region/
 *  etc.) — reuses the exact same <details>-based picker markup/wiring CloudConnector.style
 *  already had (see properties.ts's lineStylePickerMarkup()/wireLineStylePicker()), namespaced
 *  with a different id prefix so both pickers can coexist without clashing ids. */
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

describe('Cloud container properties panel — Border Line Style + Color', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [], activeView: 'cloud',
    });
  });

  async function selectContainer(overrides: Record<string, unknown> = {}) {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudContainers: [{ id: 'ctr1', kind: 'subnet', x: 0, y: 0, width: 300, height: 200, label: 'Prod Subnet', ...overrides }],
    });
    const selection = [{ type: 'cloud-container' as const, id: 'ctr1' }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    return document.getElementById('properties-panel')!;
  }

  it('renders every catalog line style as an option, namespaced under the container-specific picker id', async () => {
    const panel = await selectContainer();
    const options = panel.querySelectorAll('#prop-cloudcontainer-style-picker .line-style-option');
    expect(options.length).toBe(CLOUD_CONNECTOR_LINE_STYLES.length);
  });

  it('clicking a style option sets CloudContainer.style and updates the trigger label', async () => {
    const panel = await selectContainer();
    const trigger = panel.querySelector('#prop-cloudcontainer-style-trigger')!;
    expect(trigger.textContent).toContain('Solid'); // default when style is unset

    const option = panel.querySelector('#prop-cloudcontainer-style-picker .line-style-option[data-value="double-dash-dot"]') as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!.style).toBe('double-dash-dot');
    expect(trigger.textContent).toContain('Double Dash-Dot');
  });

  it('the connector picker and container picker coexist without id collisions when both are on screen sequentially', async () => {
    // Render connector properties first, then switch to a container — the connector picker's
    // ids must not linger/clash with the container picker's own ids.
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2' }],
      cloudContainers: [{ id: 'ctr1', kind: 'subnet', x: 0, y: 0, width: 300, height: 200, label: 'Prod Subnet' }],
    });
    eventBus.emit('selection:changed', [{ type: 'cloud-connector', id: 'conn1' }]);
    stateManager.setState({ selection: [{ type: 'cloud-connector', id: 'conn1' }] });

    eventBus.emit('selection:changed', [{ type: 'cloud-container', id: 'ctr1' }]);
    stateManager.setState({ selection: [{ type: 'cloud-container', id: 'ctr1' }] });

    const panel = document.getElementById('properties-panel')!;
    expect(panel.querySelector('#prop-cloudcontainer-style-picker')).not.toBeNull();
    expect(panel.querySelector('#prop-cloudconn-style-picker')).toBeNull();
  });

  it('the Border Color input sets CloudContainer.color directly (not just a provider preset)', async () => {
    const panel = await selectContainer();
    const colorInput = panel.querySelector('#prop-cloudcontainer-color') as HTMLInputElement;
    expect(colorInput).not.toBeNull();
    colorInput.value = '#112233';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!.color).toBe('#112233');
  });

  it('the Ribbon Color input sets CloudContainer.ribbonColor independently of Border Color', async () => {
    const panel = await selectContainer();
    const ribbonInput = panel.querySelector('#prop-cloudcontainer-ribbon-color') as HTMLInputElement;
    expect(ribbonInput).not.toBeNull();
    ribbonInput.value = '#ffeb3b';
    ribbonInput.dispatchEvent(new Event('input', { bubbles: true }));

    const ctr = stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!;
    expect(ctr.ribbonColor).toBe('#ffeb3b');
    expect(ctr.color).toBeUndefined();
  });

  it('the Text Color input sets CloudContainer.textColor independently of Border/Ribbon Color', async () => {
    const panel = await selectContainer();
    const textInput = panel.querySelector('#prop-cloudcontainer-text-color') as HTMLInputElement;
    expect(textInput).not.toBeNull();
    textInput.value = '#8b0000';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));

    const ctr = stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!;
    expect(ctr.textColor).toBe('#8b0000');
    expect(ctr.color).toBeUndefined();
    expect(ctr.ribbonColor).toBeUndefined();
  });

  it('the Background Fill checkbox is checked by default and unchecking it sets backgroundOpacity to 0', async () => {
    const panel = await selectContainer();
    const checkbox = panel.querySelector('#prop-cloudcontainer-bg-enabled') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!.backgroundOpacity).toBe(0);
  });

  it('dragging the opacity slider sets backgroundOpacity and updates the live percentage label', async () => {
    const panel = await selectContainer();
    const slider = panel.querySelector('#prop-cloudcontainer-bg-opacity') as HTMLInputElement;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!.backgroundOpacity).toBe(0.4);
    expect(panel.querySelector('#prop-cloudcontainer-bg-opacity-value')!.textContent).toBe('40%');
  });

  it('starts with the fill checkbox unchecked and the slider row disabled when backgroundOpacity is already 0', async () => {
    const panel = await selectContainer({ backgroundOpacity: 0 });
    const checkbox = panel.querySelector('#prop-cloudcontainer-bg-enabled') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});
