import { describe, it, expect, beforeEach } from 'vitest';
import { Toolbar } from '../components/toolbar';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

function mountToolbar(): void {
  document.body.innerHTML = `<header id="toolbar"></header>`;
  const container = document.getElementById('toolbar')!;
  new Toolbar(container).render();
}

describe('Toolbar Cloud menu contextual visibility', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({ activeView: 'rack', selection: [], tool: 'select',
      aiMode: false, aiProvider: 'rules', floatingToolbarVisible: true });
  });

  it('Cloud menu absent in rack view', () => {
    mountToolbar();
    expect(document.getElementById('tb-menu-cloud')).toBeNull();
  });

  it('Cloud menu present after switching to cloud view', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    expect(document.getElementById('tb-menu-cloud')).not.toBeNull();
  });

  it('Cloud menu present in hybrid view', () => {
    stateManager.setState({ activeView: 'hybrid' });
    mountToolbar();
    expect(document.getElementById('tb-menu-cloud')).not.toBeNull();
  });

  it('Cloud menu removed again when switching back to rack', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    stateManager.setState({ activeView: 'rack' });
    expect(document.getElementById('tb-menu-cloud')).toBeNull();
  });
});
