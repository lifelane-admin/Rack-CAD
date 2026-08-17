import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * Right-click context menu for CloudHierarchy (the "describe infra in one line" breadcrumb box)
 * — Edit… + Border Line Style / Background Fill / Delete like CloudContainer (see
 * cloud-container-context-menu.test.ts), plus two INDEPENDENT color pickers (Line Color for the
 * boundary box, Ribbon Color for the label chip) since a hierarchy has two colorable elements
 * where a container only has one.
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
 *  needed now that Line Color and Ribbon Color are two separate submenus that each have their
 *  own "Purple" option, so a document-wide search would ambiguously match whichever renders
 *  first. */
function submenuItemByText(topLevelLabel: string, subLabel: string): HTMLElement | null {
  const top = menuItemByText(topLevelLabel);
  if (!top) return null;
  const label = [...top.querySelectorAll('.context-submenu .context-menu-label')]
    .find(el => el.textContent?.includes(subLabel));
  return (label?.closest('.context-menu-item') as HTMLElement | undefined) ?? null;
}

describe('Cloud hierarchy right-click context menu', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], cloudHierarchies: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'cloud',
    });
  });

  function setupHierarchy() {
    stateManager.setState({
      cloudHierarchies: [{
        id: 'h1', provider: 'azure', x: 0, y: 0,
        levels: [{ kind: 'account', label: 'gipl-azure-subscription' }, { kind: 'region', label: 'South India' }],
      }],
      selection: [],
    });
  }

  it('right-clicking a hierarchy box selects it and opens a menu with Edit/style/color/delete', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupHierarchy();
    app.setActiveView('cloud');

    const el = document.querySelector('[data-cloud-hierarchy-id="h1"]')!;
    el.dispatchEvent(rightClick(150, 100));

    expect(stateManager.getState().selection).toEqual([{ type: 'cloud-hierarchy', id: 'h1' }]);
    expect(menuItemByText('Edit')).not.toBeNull();
    expect(menuItemByText('Border Line Style')).not.toBeNull();
    expect(menuItemByText('Line Color')).not.toBeNull();
    expect(menuItemByText('Ribbon Color')).not.toBeNull();
    expect(menuItemByText('Delete')).not.toBeNull();
  });

  it('picking a line style from the submenu sets CloudHierarchy.style', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupHierarchy();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(150, 100));
    const dottedItem = [...document.querySelectorAll('.context-submenu .context-menu-label')]
      .find(el => el.textContent === 'Dotted')!.closest('.context-menu-item') as HTMLElement;
    expect(dottedItem).toBeTruthy();
    dottedItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!.style).toBe('dotted');
  });

  it('picking a color from the Line Color submenu sets CloudHierarchy.color only, not ribbonColor', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupHierarchy();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(150, 100));
    const purpleItem = submenuItemByText('Line Color', 'Purple')!;
    expect(purpleItem).toBeTruthy();
    purpleItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const hierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!;
    expect(hierarchy.color).toBe('#8e24aa');
    expect(hierarchy.ribbonColor).toBeUndefined();
  });

  it('picking a color from the Ribbon Color submenu sets CloudHierarchy.ribbonColor only, not color — the two are independent', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupHierarchy();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(150, 100));
    const orangeItem = submenuItemByText('Ribbon Color', 'Orange')!;
    expect(orangeItem).toBeTruthy();
    orangeItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const hierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!;
    expect(hierarchy.ribbonColor).toBe('#FF9900');
    expect(hierarchy.color).toBeUndefined();

    // Renderer proof, not just state: the boundary box border and the chip fill actually differ.
    const rects = document.querySelectorAll('[data-cloud-hierarchy-id="h1"] rect');
    const boxStroke = (rects[0] as SVGRectElement).getAttribute('stroke');
    const chipFill = (rects[1] as SVGRectElement).getAttribute('fill');
    expect(chipFill).toBe('#FF9900');
    expect(boxStroke).not.toBe('#FF9900');
  });

  it('"Disable Background Fill" sets backgroundOpacity to 0, and the item flips to "Enable" on the next right-click', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupHierarchy();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(150, 100));
    expect(menuItemByText('Enable Background Fill')).toBeNull();
    menuItemByText('Disable Background Fill')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies.find(h => h.id === 'h1')!.backgroundOpacity).toBe(0);

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(150, 100));
    expect(menuItemByText('Disable Background Fill')).toBeNull();
    expect(menuItemByText('Enable Background Fill')).not.toBeNull();
  });

  it('"Delete" removes the hierarchy and clears selection', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();
    setupHierarchy();
    app.setActiveView('cloud');

    document.querySelector('[data-cloud-hierarchy-id="h1"]')!.dispatchEvent(rightClick(150, 100));
    menuItemByText('Delete')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(stateManager.getState().cloudHierarchies).toHaveLength(0);
    expect(stateManager.getState().selection).toEqual([]);
  });
});
