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

describe('Sidebar workspace tabs', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('renders workspace tabs: Rack, Cloud, Hybrid, Datacenter', () => {
    mountSidebar();
    const tabs = [...document.querySelectorAll('.sb-tab')].map(el => el.textContent?.trim());
    expect(tabs).toEqual(['Rack', 'Cloud', 'Hybrid', 'Datacenter']);
  });

  it('Rack tab is active by default when activeView is rack', () => {
    mountSidebar();
    const tabs = document.querySelectorAll('.sb-tab');
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs[1].classList.contains('active')).toBe(false);
    expect(tabs[2].classList.contains('active')).toBe(false);
  });

  it('Cloud tab is active when activeView is cloud', () => {
    stateManager.setState({ activeView: 'cloud' });
    mountSidebar();
    const tabs = document.querySelectorAll('.sb-tab');
    expect(tabs[1].classList.contains('active')).toBe(true);
  });

  it('Hybrid tab is active when activeView is hybrid', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountSidebar();
    const tabs = document.querySelectorAll('.sb-tab');
    expect(tabs[2].classList.contains('active')).toBe(true);
  });

  it('clicking Cloud tab from Rack view switches to hybrid (preserves the rack)', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const cloudTab = document.querySelectorAll('.sb-tab')[1] as HTMLElement;
    cloudTab.click();
    expect(stateManager.getState().activeView).toBe('hybrid');
  });

  it('clicking Cloud tab while already in cloud view stays in cloud', () => {
    stateManager.setState({ activeView: 'cloud' });
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const cloudTab = document.querySelectorAll('.sb-tab')[1] as HTMLElement;
    cloudTab.click();
    expect(stateManager.getState().activeView).toBe('cloud');
  });

  it('clicking Rack tab switches to rack', () => {
    stateManager.setState({ activeView: 'hybrid' });
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const rackTab = document.querySelectorAll('.sb-tab')[0] as HTMLElement;
    rackTab.click();
    expect(stateManager.getState().activeView).toBe('rack');
  });

  it('clicking Hybrid tab switches to hybrid', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const hybridTab = document.querySelectorAll('.sb-tab')[2] as HTMLElement;
    hybridTab.click();
    expect(stateManager.getState().activeView).toBe('hybrid');
  });

  it('search placeholder is "Search components..." on Rack tab', () => {
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder).toContain('Search components');
  });

  it('search placeholder reflects cloud context on Cloud tab', () => {
    stateManager.setState({ activeView: 'cloud' });
    mountSidebar();
    const input = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(input.placeholder.toLowerCase()).toContain('search');
    expect(input.placeholder.toLowerCase()).toMatch(/aws|azure|gcp|cloud/);
  });

  it('search placeholder covers both catalogs in Hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid' });
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
