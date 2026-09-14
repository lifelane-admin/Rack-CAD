import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

/**
 * The startup landing screen (components/startup-modal.ts) — shown on every app.init(), letting
 * the user pick Rack Design / AWS / Azure / GCP / Hybrid before landing on a canvas. Verifies it
 * drives the exact same state changes a manual sidebar nav-tree click would (see
 * sidebar-nav-tree.test.ts), not a separate/parallel code path.
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

describe('Startup modal', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      tool: 'select', cableInProgress: null, activeView: 'rack',
    });
  });

  it('appears automatically on app.init() with all choices', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    const modal = document.getElementById('startup-modal');
    expect(modal).not.toBeNull();
    const choices = [...modal!.querySelectorAll('.startup-card')].map(el => (el as HTMLElement).dataset.choice);
    expect(choices).toEqual(['rack', 'datacenter', 'flowchart', 'aws', 'azure', 'gcp', 'hybrid']);
  });

  it('picking "Rack Design" closes the modal and switches to the rack view', async () => {
    mountAppSkeleton();
    stateManager.setState({ activeView: 'cloud' });
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="rack"]')!.click();

    expect(document.getElementById('startup-modal')).toBeNull();
    expect(stateManager.getState().activeView).toBe('rack');
  });

  it('picking "Flowchart" switches to cloud diagram and auto-expands the Flowchart category', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="flowchart"]')!.click();

    expect(stateManager.getState().activeView).toBe('cloud');
    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search Flowchart components...');
    const onpremSection = [...document.querySelectorAll('.sidebar-section-title')]
      .find(el => el.textContent?.includes('Local Resources'))
      ?.closest('.sidebar-section');
    expect(onpremSection?.classList.contains('expanded')).toBe(true);

    const flowchartCategory = [...document.querySelectorAll('.cloud-icon-category-title')]
      .find(el => el.textContent?.includes('Flowchart'))
      ?.closest('.cloud-icon-category');
    expect(flowchartCategory?.classList.contains('collapsed')).toBe(false);
  });

  it('picking "AWS" switches to cloud and focuses the AWS palette section, same as the sidebar nav-tree click', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="aws"]')!.click();

    expect(stateManager.getState().activeView).toBe('cloud');
    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search AWS services...');
    const awsSection = [...document.querySelectorAll('.sidebar-section-title')]
      .find(el => el.textContent?.includes('AWS'))
      ?.closest('.sidebar-section');
    expect(awsSection?.classList.contains('expanded')).toBe(true);
  });

  it('picking "Hybrid" switches to hybrid view with the rack catalog AND every cloud provider section collapsed, search unscoped (Local Resources/AWS/Azure/GCP all equally reachable)', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="hybrid"]')!.click();

    expect(stateManager.getState().activeView).toBe('hybrid');
    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search rack devices + cloud services...');

    // Cloud palette (second, hybrid-only container) — every provider section still starts
    // collapsed and unscoped, same guarantee the old unscoped-Cloud-view test made.
    const cloudContainer = document.getElementById('cloud-catalog-container')!;
    const sectionTitles = [...cloudContainer.querySelectorAll('.sidebar-section-title')].map(el => el.textContent);
    expect(sectionTitles.some(t => t?.includes('Local Resources'))).toBe(true);
    expect(sectionTitles.some(t => t?.includes('AWS'))).toBe(true);
    expect([...cloudContainer.querySelectorAll('.sidebar-section')].every(s => !s.classList.contains('expanded'))).toBe(true);

    // The rack device catalog renders alongside it — this is what makes it Hybrid rather than
    // just an unscoped Cloud view.
    expect(document.querySelector('#catalog-container .cat-row')).toBeTruthy();
  });

  it('dismissing via the ✕ button leaves the current view untouched', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.getElementById('startup-modal-close')!.click();

    expect(document.getElementById('startup-modal')).toBeNull();
    expect(stateManager.getState().activeView).toBe('rack');
  });

  it('Escape dismisses the modal without changing the view', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    expect(document.getElementById('startup-modal')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('startup-modal')).toBeNull();
    expect(stateManager.getState().activeView).toBe('rack');
  });
});
