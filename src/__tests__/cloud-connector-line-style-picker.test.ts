import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { CLOUD_CONNECTOR_LINE_STYLES } from '../renderers/cloud-connector-renderer';

/** Properties-panel picker for CloudConnector.style — a <details>-based popover (see
 *  properties.ts's lineStylePickerMarkup()) instead of a plain <select>, since <option> can't
 *  host the inline SVG dash/double-line preview swatches this feature adds. */
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

describe('Cloud connector Line Style picker (properties panel)', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [], activeView: 'cloud',
    });
  });

  async function selectConnector(style?: string) {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      cloudNodes: [
        { id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws', x: 0, y: 0, width: 64, height: 64, label: 'EC2' },
        { id: 'n2', iconId: 'aws-amazon-athena', provider: 'aws', x: 400, y: 0, width: 64, height: 64, label: 'Athena' },
      ],
      cloudConnectors: [{ id: 'conn1', sourceNodeId: 'n1', destNodeId: 'n2', style: style as any }],
    });
    const selection = [{ type: 'cloud-connector' as const, id: 'conn1' }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    return document.getElementById('properties-panel')!;
  }

  it('renders every catalog line style (including the new double variants) as an option with a preview swatch', async () => {
    const panel = await selectConnector();
    const options = panel.querySelectorAll('#prop-cloudconn-style-picker .line-style-option');
    expect(options.length).toBe(CLOUD_CONNECTOR_LINE_STYLES.length);
    for (const style of CLOUD_CONNECTOR_LINE_STYLES) {
      const opt = panel.querySelector(`.line-style-option[data-value="${style.value}"]`)!;
      expect(opt).not.toBeNull();
      expect(opt.querySelector('svg.line-style-swatch')).not.toBeNull();
      expect(opt.textContent).toContain(style.label);
    }
  });

  it('renders two <line> elements in the swatch for a double-family style, one for single styles', async () => {
    const panel = await selectConnector();
    const doubleOpt = panel.querySelector('.line-style-option[data-value="double-dotted"]')!;
    expect(doubleOpt.querySelectorAll('svg.line-style-swatch line').length).toBe(2);

    const singleOpt = panel.querySelector('.line-style-option[data-value="dashed"]')!;
    expect(singleOpt.querySelectorAll('svg.line-style-swatch line').length).toBe(1);
  });

  it('clicking an option updates the connector style and closes the picker', async () => {
    const panel = await selectConnector('solid');
    const picker = panel.querySelector('#prop-cloudconn-style-picker') as HTMLDetailsElement;
    picker.open = true;

    const doubleOption = panel.querySelector('.line-style-option[data-value="double"]') as HTMLElement;
    doubleOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudConnectors.find(c => c.id === 'conn1')!.style).toBe('double');
    expect(picker.open).toBe(false);
  });

  it('updates the trigger\'s own preview/label after a selection, without a full panel re-render', async () => {
    const panel = await selectConnector('solid');
    const trigger = panel.querySelector('#prop-cloudconn-style-trigger')!;
    expect(trigger.textContent).toContain('Solid');

    const option = panel.querySelector('.line-style-option[data-value="double-dashed"]') as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(trigger.textContent).toContain('Double Dashed');
    expect(trigger.querySelectorAll('svg.line-style-swatch line').length).toBe(2);
  });
});
