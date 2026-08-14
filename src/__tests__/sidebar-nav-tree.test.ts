import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sidebar } from '../components/sidebar';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

/**
 * The sidebar's top-level workspace navigation tree — On-Prem Infrastructure > Rack Development,
 * and Cloud > AWS/Azure/GCP. Always rendered above the search/catalog regardless of the current
 * view, and is the primary way to switch `activeView` (replaced the old toolbar Workspace
 * buttons, which were easy to miss among the many other icon-only toolbar groups).
 */
function mountSidebar(): Sidebar {
  document.body.innerHTML = `<aside id="sidebar"></aside>`;
  const container = document.getElementById('sidebar')!;
  const sidebar = new Sidebar(container);
  sidebar.render();
  return sidebar;
}

describe('Sidebar navigation tree', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  /** setActiveView (app.ts) normally re-renders the sidebar on 'view:switch' — since no App is
   *  mounted in this test, wire that one piece of behavior directly so clicking a tree leaf
   *  still drives a full round trip through real state + a real re-render, same net effect. */
  function wireViewSwitch(sidebar: Sidebar): void {
    eventBus.on('view:switch', (view) => {
      stateManager.setState({ activeView: view });
      sidebar.render();
    });
  }

  it('renders both top-level groups with all five leaves', () => {
    mountSidebar();
    const labels = [...document.querySelectorAll('.nav-tree-leaf span')].map(el => el.textContent);
    expect(labels).toEqual(['Rack Development', 'AWS', 'Azure', 'GCP', 'Local Resources']);
  });

  it('"Rack Development" is active by default (activeView starts as rack)', () => {
    mountSidebar();
    const rackLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('Rack Development'));
    expect(rackLeaf?.classList.contains('active')).toBe(true);
  });

  it('clicking "AWS" switches activeView to cloud', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const awsLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('AWS')) as HTMLElement;
    awsLeaf.click();
    expect(stateManager.getState().activeView).toBe('cloud');
  });

  it('clicking "Azure" auto-expands the Azure section of the cloud palette', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const azureLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('Azure')) as HTMLElement;
    azureLeaf.click();

    const azureSection = [...document.querySelectorAll('.sidebar-section-title')]
      .find(el => el.textContent?.includes('Azure'))
      ?.closest('.sidebar-section');
    expect(azureSection?.classList.contains('expanded')).toBe(true);
  });

  it('after navigating to Azure via the tree, searching an AWS-only term (EC2) finds nothing', () => {
    vi.useFakeTimers();
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const azureLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('Azure')) as HTMLElement;
    azureLeaf.click();

    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    searchInput.value = 'ec2';
    searchInput.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);

    const resultsTitle = document.querySelector('.sidebar-section-title')!;
    expect(resultsTitle.textContent).toContain('Results in AZURE (0)');
    vi.useRealTimers();
  });

  it('after navigating to Azure via the tree, searching an Azure term finds results scoped to Azure only', () => {
    vi.useFakeTimers();
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const azureLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('Azure')) as HTMLElement;
    azureLeaf.click();

    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    searchInput.value = 'virtual network';
    searchInput.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);

    const resultsTitle = document.querySelector('.sidebar-section-title')!;
    expect(resultsTitle.textContent).toMatch(/Results in AZURE \(\d+\)/);
    const count = Number(resultsTitle.textContent!.match(/\((\d+)\)/)![1]);
    expect(count).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('the search placeholder reflects the focused provider after a tree click', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const gcpLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('GCP')) as HTMLElement;
    gcpLeaf.click();

    const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Search GCP services...');
  });

  it('categories within a provider are collapsed by default, and expand only on click', () => {
    const sidebar = mountSidebar();
    wireViewSwitch(sidebar);
    const azureLeaf = [...document.querySelectorAll('.nav-tree-leaf')].find(el => el.textContent?.includes('Azure')) as HTMLElement;
    azureLeaf.click(); // navigates to cloud + auto-expands the Azure provider section

    const categories = document.querySelectorAll('.cloud-icon-category');
    expect(categories.length).toBeGreaterThan(1); // Azure has many categories (Compute, Storage, Networking, ...)
    expect([...categories].every(c => c.classList.contains('collapsed'))).toBe(true);
    expect(document.querySelectorAll('.cloud-icon-category .cloud-icon-item').length).toBeGreaterThan(0);

    // No icons are actually visible (their containing category is collapsed via CSS) even
    // though the provider section itself is expanded.
    const firstCategoryTitle = document.querySelector('.cloud-icon-category-title') as HTMLElement;
    firstCategoryTitle.click();
    const firstCategory = firstCategoryTitle.closest('.cloud-icon-category')!;
    expect(firstCategory.classList.contains('collapsed')).toBe(false);

    // Clicking again re-collapses it.
    firstCategoryTitle.click();
    expect(firstCategory.classList.contains('collapsed')).toBe(true);
  });
});
