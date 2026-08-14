import { describe, it, expect, beforeEach } from 'vitest';
import { Toolbar } from '../components/toolbar';
import { stateManager } from '../core/state';

/**
 * Regression test for a real bug: the rack canvas's own "Export" group (SVG/PNG/JPEG/PDF/HTML/
 * Report) was never hidden while viewing the Cloud Architecture canvas, unlike every other
 * rack/cloud-specific toolbar group. Its "Export SVG" button looks identical to the Cloud
 * Export group's, but drives the rack canvas's export-area tool — bound to the hidden, non-
 * interactive #canvas element — so clicking it while on the cloud canvas armed a drag tool that
 * silently could never receive the drag (the notification fired, but nothing on-canvas responded
 * to the drag at all). See toolbar.ts's #rack-export-group visibility toggle.
 */
function mountToolbar(): Toolbar {
  document.body.innerHTML = `<header id="toolbar"></header>`;
  const container = document.getElementById('toolbar')!;
  const toolbar = new Toolbar(container);
  toolbar.render();
  return toolbar;
}

describe('Toolbar rack/cloud export group visibility', () => {
  beforeEach(() => {
    stateManager.setState({ activeView: 'rack', selection: [] });
  });

  it('shows the rack Export group and hides Cloud Export while activeView is rack', () => {
    mountToolbar();
    const rackExportGroup = document.getElementById('rack-export-group')!;
    const cloudExportGroup = document.getElementById('cloud-export-group')!;
    expect(rackExportGroup.style.display).not.toBe('none');
    expect(cloudExportGroup.style.display).toBe('none');
  });

  it('hides the rack Export group and shows Cloud Export once activeView switches to cloud', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });

    const rackExportGroup = document.getElementById('rack-export-group')!;
    const cloudExportGroup = document.getElementById('cloud-export-group')!;
    expect(rackExportGroup.style.display).toBe('none');
    expect(cloudExportGroup.style.display).not.toBe('none');
  });

  it('switching back to rack restores the rack Export group and hides Cloud Export again', () => {
    mountToolbar();
    stateManager.setState({ activeView: 'cloud' });
    stateManager.setState({ activeView: 'rack' });

    const rackExportGroup = document.getElementById('rack-export-group')!;
    const cloudExportGroup = document.getElementById('cloud-export-group')!;
    expect(rackExportGroup.style.display).not.toBe('none');
    expect(cloudExportGroup.style.display).toBe('none');
  });

  it('hides the rack View and Add groups (grid/rulers/3D/cabinet toggles, Add Rack buttons) in Cloud view — same bug class as Export', () => {
    mountToolbar();
    const rackViewGroup = document.getElementById('rack-view-group')!;
    const rackAddGroup = document.getElementById('rack-add-group')!;
    expect(rackViewGroup.style.display).not.toBe('none');
    expect(rackAddGroup.style.display).not.toBe('none');

    stateManager.setState({ activeView: 'cloud' });
    expect(rackViewGroup.style.display).toBe('none');
    expect(rackAddGroup.style.display).toBe('none');

    stateManager.setState({ activeView: 'rack' });
    expect(rackViewGroup.style.display).not.toBe('none');
    expect(rackAddGroup.style.display).not.toBe('none');
  });
});
