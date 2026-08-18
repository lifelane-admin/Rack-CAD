import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Right-click context menu for CloudContainers (VPC/Subnet/AZ/Region/etc. boundary boxes) — line
 * style + color + delete. Before this, right-clicking a container was a silent no-op: the cloud
 * canvas's contextmenu handler (setupCloudContextMenu() in app.ts) only recognized connectors.
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

function menuItemByText(text: string): HTMLElement | null {
  const label = [...document.querySelectorAll('.context-menu-item .context-menu-label')]
    .find(el => el.textContent?.includes(text));
  return (label?.closest('.context-menu-item') as HTMLElement | undefined) ?? null;
}

/** Looks inside a specific top-level item's OWN submenu (not just anywhere in the document) —
 *  needed now that Border/Ribbon Color are two separate submenus that both have a "Purple"
 *  option, so a document-wide search would ambiguously match whichever renders first. */
function submenuItemByText(topLevelLabel: string, subLabel: string): HTMLElement | null {
  const top = menuItemByText(topLevelLabel);
  if (!top) return null;
  const label = [...top.querySelectorAll('.context-submenu .context-menu-label')]
    .find(el => el.textContent?.includes(subLabel));
  return (label?.closest('.context-menu-item') as HTMLElement | undefined) ?? null;
}

describe('Cloud container right-click context menu', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  function setupContainer() {
    stateManager.setState({
      cloudContainers: [{ id: 'ctr1', kind: 'subnet', x: 0, y: 0, width: 300, height: 200, label: 'Prod Subnet' }],
      selection: [],
    });
  }

  it('right-clicking a container selects it and opens a menu with its label', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    const containerEl = document.querySelector('[data-cloud-container-id="ctr1"]')!;
    containerEl.dispatchEvent(rightClick(150, 100));

    expect(stateManager.getState().selection).toEqual([{ type: 'cloud-container', id: 'ctr1' }]);
    expect(menuItemByText('Prod Subnet')).not.toBeNull();
    expect(menuItemByText('Border Line Style')).not.toBeNull();
    expect(menuItemByText('Border Color')).not.toBeNull();
    expect(menuItemByText('Ribbon Color')).not.toBeNull();
    expect(menuItemByText('Text Color')).not.toBeNull();
    expect(menuItemByText('Delete')).not.toBeNull();
  });

  it('picking a line style from the submenu sets CloudContainer.style', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    const dottedItem = [...document.querySelectorAll('.context-submenu .context-menu-label')]
      .find(el => el.textContent === 'Dotted')!.closest('.context-menu-item') as HTMLElement;
    expect(dottedItem).toBeTruthy();
    dottedItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const ctr = stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!;
    expect(ctr.style).toBe('dotted');
  });

  it('picking a color from the Border Color submenu sets CloudContainer.color only, not ribbonColor/textColor', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    const purpleItem = submenuItemByText('Border Color', 'Purple')!;
    expect(purpleItem).toBeTruthy();
    purpleItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const ctr = stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!;
    expect(ctr.color).toBe('#8e24aa');
    expect(ctr.ribbonColor).toBeUndefined();
    expect(ctr.textColor).toBeUndefined();
  });

  it('picking a color from the Ribbon Color submenu sets CloudContainer.ribbonColor only, independent of Border Color', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    const orangeItem = submenuItemByText('Ribbon Color', 'Orange')!;
    expect(orangeItem).toBeTruthy();
    orangeItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const ctr = stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!;
    expect(ctr.ribbonColor).toBe('#FF9900');
    expect(ctr.color).toBeUndefined();
  });

  it('picking a color from the Text Color submenu sets CloudContainer.textColor only, independent of Border/Ribbon Color', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    const whiteItem = submenuItemByText('Text Color', 'White')!;
    expect(whiteItem).toBeTruthy();
    whiteItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const ctr = stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!;
    expect(ctr.textColor).toBe('#FFFFFF');
    expect(ctr.color).toBeUndefined();
    expect(ctr.ribbonColor).toBeUndefined();
  });

  it('"Disable Background Fill" sets backgroundOpacity to 0, and the item flips to "Enable" on the next right-click', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    expect(menuItemByText('Enable Background Fill')).toBeNull();
    menuItemByText('Disable Background Fill')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudContainers.find(c => c.id === 'ctr1')!.backgroundOpacity).toBe(0);

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    expect(menuItemByText('Disable Background Fill')).toBeNull();
    expect(menuItemByText('Enable Background Fill')).not.toBeNull();
  });

  it('"Delete" removes the container and clears selection', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupContainer();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-container-id="ctr1"]')!.dispatchEvent(rightClick(150, 100));
    menuItemByText('Delete')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudContainers).toHaveLength(0);
    expect(stateManager.getState().selection).toEqual([]);
  });

  it('right-clicking empty canvas background is still a no-op (no menu shown)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    app.setActiveView('cloud');

    const svgEl = document.getElementById('cloud-canvas')!;
    svgEl.dispatchEvent(rightClick(400, 300));

    const menuEl = document.querySelector('.context-menu') as HTMLElement | null;
    expect(menuEl?.style.display).not.toBe('block');
  });
});
