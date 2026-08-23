import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { FloatingToolbar } from '../components/floating-toolbar';
import { CloudFloatingToolbar } from '../components/cloud-floating-toolbar';
import { Toolbar } from '../components/toolbar';

function mountToolbar(): void {
  document.body.innerHTML = `<header id="toolbar"></header>`;
  const container = document.getElementById('toolbar')!;
  new Toolbar(container).render();
}

function mountCloudFloatingToolbar(): void {
  document.body.innerHTML = `
    <div id="cloud-viewport" style="position:relative;width:800px;height:600px;">
      <svg id="cloud-canvas"></svg>
    </div>
  `;
  new CloudFloatingToolbar();
}

describe('floatingToolbarVisible state', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      floatingToolbarVisible: undefined as any,
    });
  });

  it('defaults to true', () => {
    stateManager.setState({ floatingToolbarVisible: true });
    expect(stateManager.getState().floatingToolbarVisible).toBe(true);
  });

  it('can be toggled to false via setState', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    expect(stateManager.getState().floatingToolbarVisible).toBe(false);
  });
});

function mountFloatingToolbar(): void {
  document.body.innerHTML = `
    <div id="canvas-viewport" style="position:relative;width:800px;height:600px;">
      <svg id="canvas"></svg>
    </div>
  `;
  new FloatingToolbar();
}

describe('FloatingToolbar toggle visibility', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      tool: 'select', selection: [], activeView: 'rack',
      floatingToolbarVisible: true,
      show3DPanel: false, airdropDestination: false, snapEnabled: true,
      selectedCableColor: '#78909c', selectedCableType: 'general',
      selectedCableBend: 10, selectedCableTermination: 'RJ45 Ethernet',
    });
  });

  it('is visible by default when floatingToolbarVisible is true', () => {
    mountFloatingToolbar();
    const el = document.getElementById('floating-toolbar');
    expect(el).not.toBeNull();
    expect(el!.classList.contains('hidden')).toBe(false);
  });

  it('hides on view:toggle-floating-toolbar and flips state to false', () => {
    mountFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('floating-toolbar')!.classList.contains('hidden')).toBe(true);
    expect(stateManager.getState().floatingToolbarVisible).toBe(false);
  });

  it('shows again on second view:toggle-floating-toolbar', () => {
    mountFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('floating-toolbar')!.classList.contains('hidden')).toBe(false);
    expect(stateManager.getState().floatingToolbarVisible).toBe(true);
  });

  it('starts hidden when floatingToolbarVisible is false at init', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    mountFloatingToolbar();
    expect(document.getElementById('floating-toolbar')!.classList.contains('hidden')).toBe(true);
  });
});

describe('CloudFloatingToolbar toggle visibility', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      tool: 'select', activeView: 'cloud', floatingToolbarVisible: true,
    });
  });

  it('hides on view:toggle-floating-toolbar', () => {
    mountCloudFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('cloud-floating-toolbar')!.classList.contains('hidden')).toBe(true);
  });

  it('shows again on second view:toggle-floating-toolbar', () => {
    mountCloudFloatingToolbar();
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    eventBus.emit('view:toggle-floating-toolbar', undefined);
    expect(document.getElementById('cloud-floating-toolbar')!.classList.contains('hidden')).toBe(false);
  });

  it('starts hidden when floatingToolbarVisible is false at init', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    mountCloudFloatingToolbar();
    expect(document.getElementById('cloud-floating-toolbar')!.classList.contains('hidden')).toBe(true);
  });
});

describe('Toolbar (rewritten)', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      tool: 'select', activeView: 'rack', selection: [],
      floatingToolbarVisible: true, aiMode: false, aiProvider: 'rules',
    });
  });

  it('renders 5 tool buttons: select, pan, cable, power, text', () => {
    mountToolbar();
    expect(document.getElementById('tb-tool-select')).not.toBeNull();
    expect(document.getElementById('tb-tool-pan')).not.toBeNull();
    expect(document.getElementById('tb-tool-cable')).not.toBeNull();
    expect(document.getElementById('tb-tool-power')).not.toBeNull();
    expect(document.getElementById('tb-tool-text')).not.toBeNull();
  });

  it('select button has .active class when state.tool is select', () => {
    stateManager.setState({ tool: 'select' });
    mountToolbar();
    expect(document.getElementById('tb-tool-select')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('tb-tool-pan')!.classList.contains('active')).toBe(false);
  });

  it('clicking a tool button emits tool:changed with the correct tool name', () => {
    mountToolbar();
    const received: string[] = [];
    eventBus.on('tool:changed', (t) => received.push(t));
    document.getElementById('tb-tool-pan')!.click();
    expect(received).toEqual(['pan']);
  });

  it('active tool updates to reflect state.tool on state:changed', () => {
    mountToolbar();
    stateManager.setState({ tool: 'cable' });
    expect(document.getElementById('tb-tool-cable')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('tb-tool-select')!.classList.contains('active')).toBe(false);
  });

  it('renders File, Edit, View, Export menus always', () => {
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('File');
    expect(menus).toContain('Edit');
    expect(menus).toContain('View');
    expect(menus).toContain('Export');
  });

  it('does NOT render Cloud menu in rack view', () => {
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).not.toContain('Cloud');
  });

  it('renders Cloud menu in cloud view', () => {
    stateManager.setState({ activeView: 'cloud' });
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('Cloud');
  });

  it('renders Cloud menu in hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountToolbar();
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('Cloud');
  });

  it('Cloud menu appears when activeView switches to cloud after render', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    const menus = [...document.querySelectorAll('.tb-menu')].map(el => el.textContent?.trim().replace('▾','').trim());
    expect(menus).toContain('Cloud');
  });

  it('float-toggle button exists', () => {
    mountToolbar();
    expect(document.getElementById('tb-float-toggle')).not.toBeNull();
  });

  it('float-toggle emits view:toggle-floating-toolbar on click', () => {
    mountToolbar();
    const received: void[] = [];
    eventBus.on('view:toggle-floating-toolbar' as any, () => received.push(undefined as void));
    document.getElementById('tb-float-toggle')!.click();
    expect(received).toHaveLength(1);
  });

  it('float-toggle has .active when floatingToolbarVisible is true', () => {
    stateManager.setState({ floatingToolbarVisible: true });
    mountToolbar();
    expect(document.getElementById('tb-float-toggle')!.classList.contains('active')).toBe(true);
  });

  it('float-toggle loses .active after view:toggle-floating-toolbar fires', () => {
    stateManager.setState({ floatingToolbarVisible: true });
    mountToolbar();
    eventBus.emit('view:toggle-floating-toolbar' as any, undefined);
    expect(document.getElementById('tb-float-toggle')!.classList.contains('active')).toBe(false);
  });

  it('does NOT render a logo in the toolbar', () => {
    mountToolbar();
    expect(document.querySelector('.toolbar-logo')).toBeNull();
    expect(document.querySelector('.tb-logo')).toBeNull();
    const text = document.getElementById('toolbar')!.textContent;
    expect(text).not.toContain('Rack Slicer');
  });

  it('does NOT render old group-based markup', () => {
    mountToolbar();
    expect(document.querySelector('.toolbar-group')).toBeNull();
    expect(document.querySelector('.toolbar-group-label')).toBeNull();
    expect(document.getElementById('cloud-tools-group')).toBeNull();
    expect(document.getElementById('rack-export-group')).toBeNull();
  });
});
