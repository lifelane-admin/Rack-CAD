import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { FloatingToolbar } from '../components/floating-toolbar';

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
