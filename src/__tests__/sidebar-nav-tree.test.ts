import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sidebar } from '../components/sidebar';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

function mountSidebar(): Sidebar {
  document.body.innerHTML = `<aside id="sidebar"></aside>`;
  const container = document.getElementById('sidebar')!;
  const sidebar = new Sidebar(container);
  sidebar.render();
  return sidebar;
}

function wireViewSwitch(sidebar: Sidebar): void {
  eventBus.on('view:switch', (view) => {
    stateManager.setState({ activeView: view });
    sidebar.render();
  });
}

describe('Sidebar module header and isolated workspace tabs', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', workflowMode: 'rack', selection: [], activeElevationRackId: undefined });
  });

  it('renders module title header with Switch button for Rack Design', () => {
    mountSidebar();
    const title = document.querySelector('.sidebar-header span:nth-child(2)');
    expect(title?.textContent).toBe('RACK DESIGN');
    const switchBtn = document.getElementById('sb-switch-module');
    expect(switchBtn).not.toBeNull();
  });

  it('emits app:show-landing when Switch button is clicked', () => {
    const handler = vi.fn();
    eventBus.on('app:show-landing' as any, handler);
    mountSidebar();
    const switchBtn = document.getElementById('sb-switch-module') as HTMLButtonElement;
    switchBtn.click();
    expect(handler).toHaveBeenCalled();
  });

  it('hides tab bar in standalone Rack mode', () => {
    mountSidebar();
    const tabsContainer = document.querySelector('.sb-tabs') as HTMLElement;
    expect(tabsContainer.style.display).toBe('none');
  });

  it('hides tab bar in standalone Cloud mode', () => {
    stateManager.setState({ activeView: 'cloud', workflowMode: 'cloud' });
    mountSidebar();
    const tabsContainer = document.querySelector('.sb-tabs') as HTMLElement;
    expect(tabsContainer.style.display).toBe('none');
  });

  it('hides tab bar in standalone Flowchart mode', () => {
    stateManager.setState({ activeView: 'flowchart', workflowMode: 'flowchart' });
    mountSidebar();
    const tabsContainer = document.querySelector('.sb-tabs') as HTMLElement;
    expect(tabsContainer.style.display).toBe('none');
  });

  it('renders contextual tabs in Hybrid mode (Rack Devices & Cloud Services)', () => {
    stateManager.setState({ activeView: 'hybrid', workflowMode: 'hybrid' });
    mountSidebar();
    const tabsContainer = document.querySelector('.sb-tabs') as HTMLElement;
    expect(tabsContainer.style.display).toBe('flex');
    const tabs = [...document.querySelectorAll('.sb-tab')].map(el => el.textContent?.trim());
    expect(tabs).toEqual(['📦 Rack Devices', '☁ Cloud Services']);
  });

  it('renders contextual tabs in Datacenter Elevation mode (Datacenter Floor & Rack Elevation)', () => {
    stateManager.setState({ activeView: 'rack', workflowMode: 'datacenter', activeElevationRackId: 'rack-1' });
    mountSidebar();
    const tabsContainer = document.querySelector('.sb-tabs') as HTMLElement;
    expect(tabsContainer.style.display).toBe('flex');
    const tabs = [...document.querySelectorAll('.sb-tab')].map(el => el.textContent?.trim());
    expect(tabs).toEqual(['🏢 Datacenter Floor', '📦 Rack Elevation']);
  });

  it('switching tabs in Hybrid mode switches view', () => {
    stateManager.setState({ activeView: 'hybrid', workflowMode: 'hybrid' });
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const cloudTab = document.querySelectorAll('.sb-tab')[1] as HTMLElement;
    cloudTab.click();
    expect(stateManager.getState().activeView).toBe('cloud');
  });

  it('search placeholder is "Search components..." on Rack tab', () => {
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder).toContain('Search components');
  });

  it('search placeholder reflects cloud context on Cloud tab', () => {
    stateManager.setState({ activeView: 'cloud', workflowMode: 'cloud' });
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder.toLowerCase()).toContain('search');
    expect(input.placeholder.toLowerCase()).toMatch(/aws|azure|gcp|cloud/);
  });

  it('search placeholder covers both catalogs in Hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid', workflowMode: 'hybrid' });
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder).toContain('rack devices + cloud');
  });
});

describe('Sidebar catalog accordion', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('all category rows are collapsed by default', () => {
    mountSidebar();
    const openItems = document.querySelectorAll('.cat-items.open');
    expect(openItems.length).toBe(0);
  });

  it('clicking a category row expands it', () => {
    mountSidebar();
    const firstRow = document.querySelector('.cat-row') as HTMLElement;
    firstRow.click();
    expect(firstRow.classList.contains('open')).toBe(true);
    const firstItems = firstRow.nextElementSibling as HTMLElement;
    expect(firstItems.classList.contains('open')).toBe(true);
  });

  it('clicking an open row collapses it', () => {
    mountSidebar();
    const firstRow = document.querySelector('.cat-row') as HTMLElement;
    firstRow.click(); // open
    firstRow.click(); // close
    expect(firstRow.classList.contains('open')).toBe(false);
    const firstItems = firstRow.nextElementSibling as HTMLElement;
    expect(firstItems.classList.contains('open')).toBe(false);
  });

  it('accordion: opening a second row collapses the first', () => {
    mountSidebar();
    const rows = document.querySelectorAll('.cat-row');
    const firstRow = rows[0] as HTMLElement;
    const secondRow = rows[1] as HTMLElement;

    firstRow.click(); // open first
    expect(firstRow.classList.contains('open')).toBe(true);

    secondRow.click(); // open second — first should close
    expect(secondRow.classList.contains('open')).toBe(true);
    expect(firstRow.classList.contains('open')).toBe(false);
    expect((firstRow.nextElementSibling as HTMLElement).classList.contains('open')).toBe(false);
  });

  it('expanded row contains draggable catalog items', () => {
    mountSidebar();
    const firstRow = document.querySelector('.cat-row') as HTMLElement;
    firstRow.click();
    const items = firstRow.nextElementSibling!.querySelectorAll('.cat-item');
    expect(items.length).toBeGreaterThan(0);
    expect((items[0] as HTMLElement).draggable).toBe(true);
  });

  it('My Library strip is always visible at top of Rack catalog', () => {
    mountSidebar();
    const strip = document.querySelector('.sb-library-strip');
    expect(strip).not.toBeNull();
  });
});

describe('Sidebar cloud palette', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'cloud', selection: [] });
  });

  it('cloud palette sections use .sidebar-section for AWS/Azure/GCP/Local', () => {
    mountSidebar();
    const sections = document.querySelectorAll('.sidebar-section');
    const labels = [...sections].map(s => s.querySelector('.sidebar-section-title')?.textContent ?? '');
    expect(labels.some(l => l.includes('AWS'))).toBe(true);
    expect(labels.some(l => l.includes('Azure'))).toBe(true);
    expect(labels.some(l => l.includes('Google Cloud'))).toBe(true);
  });

  it('category items inside a collapsed cloud category are not visible', () => {
    mountSidebar();
    const categories = document.querySelectorAll('.cloud-icon-category');
    expect(categories.length).toBeGreaterThan(0);
    const firstCategoryContent = categories[0].querySelector('.cloud-icon-category-content') as HTMLElement;
    expect(firstCategoryContent).not.toBeNull();
    // Collapsed by default — content hidden via CSS (`.collapsed .cloud-icon-category-content { display:none }`)
    expect(categories[0].classList.contains('collapsed')).toBe(true);
  });
});
