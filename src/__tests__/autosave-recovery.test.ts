import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autoSaveManager, AutoSavePayload } from '../storage/autosave-manager';
import State from '../core/state';
import EventBus from '../core/event-bus';

describe('AutoSaveManager & Auto-Recovery Protection', () => {
  beforeEach(() => {
    localStorage.clear();
    State.setState({ racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], cloudNodes: [], cloudContainers: [], cloudConnectors: [], cloudHierarchies: [], selection: [] });
  });

  it('initializes a temporary working draft session with a default project name', () => {
    autoSaveManager.init();
    const meta = autoSaveManager.getActiveMetadata();

    expect(meta).not.toBeNull();
    expect(meta?.projectName).toBeDefined();
    expect(meta?.projectName.length).toBeGreaterThan(0);
    expect(meta?.isExplicitlySaved).toBe(false);
  });

  it('performs background autosave and serializes project data to localStorage', () => {
    autoSaveManager.init();

    // Add a rack and device to state
    State.setState({
      racks: [{ id: 'rack-test-1', name: 'Server Rack A', units: 42, x: 100, y: 100 }],
      devices: [{
        id: 'dev-test-1',
        name: 'Dell PowerEdge R740',
        rackId: 'rack-test-1',
        startUnit: 10,
        heightUnits: 2,
        ports: [],
      } as any],
    });

    autoSaveManager.performAutoSave();

    const raw = localStorage.getItem('rackslicer_autosave_active_draft');
    expect(raw).not.toBeNull();

    const payload: AutoSavePayload = JSON.parse(raw!);
    expect(payload.rackCount).toBe(1);
    expect(payload.deviceCount).toBe(1);
    expect(payload.status).toBe('autosaved');
    expect(payload.dataJson).toContain('Dell PowerEdge R740');
  });

  it('records autosave snapshots to recovery vault history', () => {
    autoSaveManager.init();

    State.setState({
      racks: [{ id: 'rack-vault-1', name: 'Vault Rack', units: 42, x: 0, y: 0 }],
      devices: [],
    });
    autoSaveManager.performAutoSave();

    const snapshots = autoSaveManager.getVaultSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].rackCount).toBe(1);
  });

  it('updates draft status to saved when user explicitly saves', () => {
    autoSaveManager.init();

    // Make an unsaved change
    State.setState({
      racks: [{ id: 'rack-save-1', name: 'Production Rack', units: 42, x: 0, y: 0 }],
    });
    autoSaveManager.performAutoSave();

    // Explicitly save project with chosen filename
    autoSaveManager.markExplicitlySaved('my-production-datacenter.json');

    const meta = autoSaveManager.getActiveMetadata();
    expect(meta?.isExplicitlySaved).toBe(true);
    expect(meta?.status).toBe('saved');
    expect(meta?.associatedFileName).toBe('my-production-datacenter.json');
    expect(meta?.projectName).toBe('my-production-datacenter');
  });

  it('restores draft state accurately from an autosaved payload', () => {
    autoSaveManager.init();

    const mockPayload: AutoSavePayload = {
      id: 'draft-recover-123',
      projectName: 'Crashed Session Backup',
      isExplicitlySaved: false,
      timestamp: Date.now(),
      createdAt: Date.now() - 60000,
      rackCount: 1,
      deviceCount: 1,
      cableCount: 0,
      cloudNodeCount: 0,
      status: 'autosaved',
      version: 5,
      dataJson: JSON.stringify({
        version: '1.0.0',
        name: 'Recovered Test Project',
        racks: [{ id: 'recovered-rack-1', name: 'Recovered Rack 42U', units: 42, x: 200, y: 50 }],
        devices: [{
          id: 'recovered-dev-1',
          name: 'Cisco Catalyst 9300',
          rackId: 'recovered-rack-1',
          startUnit: 24,
          heightUnits: 1,
          ports: [],
        }],
        cables: [],
      }),
    };

    const restored = autoSaveManager.restoreDraft(mockPayload);
    expect(restored).toBe(true);

    const s = State.getState();
    expect(s.racks.length).toBe(1);
    expect(s.racks[0].name).toBe('Recovered Rack 42U');
    expect(s.devices.length).toBe(1);
    expect(s.devices[0].name).toBe('Cisco Catalyst 9300');
  });

  it('emits autosave:status-changed event when saving and modifying', () => {
    const statusListener = vi.fn();
    EventBus.on('autosave:status-changed' as any, statusListener);

    autoSaveManager.init();
    expect(statusListener).toHaveBeenCalled();

    autoSaveManager.markExplicitlySaved('Saved-Project.json');
    expect(statusListener).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'saved',
      isExplicitlySaved: true,
    }));
  });
});
