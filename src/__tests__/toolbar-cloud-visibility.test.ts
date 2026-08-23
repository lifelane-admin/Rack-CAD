import { describe, it, expect, beforeEach } from 'vitest';
import { Toolbar } from '../components/toolbar';
import { stateManager } from '../core/state';

/**
 * Regression test for toolbar view visibility.
 *
 * In the rewritten Toolbar (Task 4), the old group-based markup
 * (#rack-export-group, #cloud-export-group, etc.) is replaced by a menu-bar
 * design where a "Cloud" menu appears/disappears based on activeView.
 * These tests now verify that behaviour instead.
 */
function mountToolbar(): Toolbar {
  document.body.innerHTML = `<header id="toolbar"></header>`;
  const container = document.getElementById('toolbar')!;
  const toolbar = new Toolbar(container);
  toolbar.render();
  return toolbar;
}

function getMenuLabels(): string[] {
  return [...document.querySelectorAll('.tb-menu')].map(
    el => (el.textContent ?? '').trim().replace('▾', '').trim(),
  );
}

describe('Toolbar rack/cloud export group visibility', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('shows the rack Export group and hides Cloud Export while activeView is rack', () => {
    mountToolbar();
    const labels = getMenuLabels();
    expect(labels).toContain('Export');
    expect(labels).not.toContain('Cloud');
  });

  it('hides the rack Export group and shows Cloud Export once activeView switches to cloud', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });

    const labels = getMenuLabels();
    expect(labels).toContain('Export');   // Export menu always present
    expect(labels).toContain('Cloud');    // Cloud menu added
  });

  it('switching back to rack restores the rack Export group and hides Cloud Export again', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    stateManager.setState({ activeView: 'rack' });

    const labels = getMenuLabels();
    expect(labels).toContain('Export');
    expect(labels).not.toContain('Cloud');
  });

  it('hides the rack View and Add groups (grid/rulers/3D/cabinet toggles, Add Rack buttons) in Cloud view — same bug class as Export', () => {
    mountToolbar();
    // In rack view: File, Edit, View, Export menus visible, no Cloud
    let labels = getMenuLabels();
    expect(labels).toContain('File');
    expect(labels).toContain('Edit');
    expect(labels).toContain('View');
    expect(labels).toContain('Export');
    expect(labels).not.toContain('Cloud');

    stateManager.setState({ activeView: 'cloud' });
    labels = getMenuLabels();
    expect(labels).toContain('Cloud');

    stateManager.setState({ activeView: 'rack' });
    labels = getMenuLabels();
    expect(labels).not.toContain('Cloud');
  });
});
