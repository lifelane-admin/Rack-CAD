import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LabelSyncManager } from '../../ai/workflow/label-sync-manager';
import { stateManager } from '../../core/state';

vi.mock('../../core/state', () => ({
  stateManager: {
    getState: vi.fn(() => ({ textLabels: [], devices: [], racks: [], cables: [] })),
    setState: vi.fn(),
  },
}));

const mockDevice = (id: string, templateId: string, name: string) => ({
  id, templateId, rackId: 'r1', startUnit: 1, name,
  hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
});

describe('LabelSyncManager', () => {
  let mgr: LabelSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = new LabelSyncManager();
  });

  it('syncLabels creates a label for each device', () => {
    const devices = [
      mockDevice('d1', 'server-2u-enterprise', 'Compute Host 1'),
      mockDevice('d2', 'pdu-basic-8c13', 'PDU A'),
    ];
    mgr.syncLabels(devices);
    expect(stateManager.setState).toHaveBeenCalled();
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.textLabels).toHaveLength(2);
  });

  it('label text uses device name', () => {
    const devices = [mockDevice('d1', 'server-2u-enterprise', 'Dell Proxmox Host 1')];
    mgr.syncLabels(devices);
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.textLabels[0].text).toBe('Dell Proxmox Host 1');
  });

  it('syncLabels is idempotent — does not duplicate existing labels', () => {
    const existingLabel = {
      id: 'ai-label-d1', pointerDeviceId: 'd1', text: 'Dell Proxmox Host 1',
      x: 100, y: 100, fontFamily: 'Inter', fontSize: 12, fontWeight: 'normal' as const,
      fontStyle: 'normal' as const, underline: false, color: '#fff', align: 'left' as const,
      backgroundColor: null, rotation: 0, pointerStyle: 'elbow' as const,
    };
    (stateManager.getState as any).mockReturnValue({ textLabels: [existingLabel], devices: [], racks: [], cables: [] });

    const devices = [mockDevice('d1', 'server-2u-enterprise', 'Dell Proxmox Host 1')];
    mgr.syncLabels(devices);
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.textLabels).toHaveLength(1);
  });

  it('clearAll removes all labels created by the manager', () => {
    const existingLabel = {
      id: 'ai-label-d1', pointerDeviceId: 'd1', text: 'Host 1',
      x: 0, y: 0, fontFamily: 'Inter', fontSize: 12, fontWeight: 'normal' as const,
      fontStyle: 'normal' as const, underline: false, color: '#fff', align: 'left' as const,
      backgroundColor: null, rotation: 0,
    };
    (stateManager.getState as any).mockReturnValue({ textLabels: [existingLabel], devices: [], racks: [], cables: [] });

    mgr.clearAll();
    const call = (stateManager.setState as any).mock.calls[0][0];
    expect(call.textLabels).toHaveLength(0);
  });
});
