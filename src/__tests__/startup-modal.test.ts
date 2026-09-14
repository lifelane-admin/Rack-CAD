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

  it('picking "Flowchart" switches to standalone flowchart view and renders dedicated palette', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="flowchart"]')!.click();

    expect(stateManager.getState().activeView).toBe('flowchart');
    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search flowchart shapes & logic...');
    
    // Quick action bar buttons
    expect(document.querySelector('#fc-quick-term')).not.toBeNull();
    expect(document.querySelector('#fc-quick-proc')).not.toBeNull();
    expect(document.querySelector('#fc-quick-dec')).not.toBeNull();
    expect(document.querySelector('#fc-quick-data')).not.toBeNull();

    // Categorized sections
    const sectionTitles = [...document.querySelectorAll('.sidebar-section-title')].map(el => el.textContent);
    expect(sectionTitles.some(t => t?.includes('Core Process Logic'))).toBe(true);
    expect(sectionTitles.some(t => t?.includes('Data, Input & Storage'))).toBe(true);
    expect(sectionTitles.some(t => t?.includes('Connectors & Junctions'))).toBe(true);
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

  it('starts with an empty canvas and renders the quick-start prompt in Rack Design mode', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="rack"]')!.click();

    expect(stateManager.getState().racks.length).toBe(0);
    const prompt = document.getElementById('rack-empty-canvas-prompt');
    expect(prompt).not.toBeNull();
    expect(prompt?.textContent).toContain('Empty Rack Canvas');
    expect(prompt?.querySelector('#rack-empty-add-42u')).not.toBeNull();
    expect(prompt?.querySelector('#rack-empty-custom-rack')).not.toBeNull();
  });

  it('clicking "＋ Standard 42U Rack" on empty prompt deploys and automatically selects the rack', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    document.querySelector<HTMLButtonElement>('.startup-card[data-choice="rack"]')!.click();

    const addBtn = document.querySelector<HTMLButtonElement>('#rack-empty-add-42u')!;
    addBtn.click();

    const state = stateManager.getState();
    expect(state.racks.length).toBe(1);
    expect(state.racks[0].units).toBe(42);
    // Auto-select verifies selection is set to the new rack
    expect(state.selection).toEqual([{ type: 'rack', id: state.racks[0].id }]);
    // Prompt is removed once a rack is present
    expect(document.getElementById('rack-empty-canvas-prompt')).toBeNull();
  });
});
