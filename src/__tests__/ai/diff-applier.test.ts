import { applyDiff, executeResolvedDiff, ResolvedDiff } from '../../ai/diff-applier';
import { RackDiff } from '../../ai/types';
import { CableData, DeviceData, RackData } from '../../core/types';

const makeDevice = (id: string, rackId = 'r1'): DeviceData => ({
  id, templateId: 'generic', rackId,
  startUnit: 1, name: 'Server', hostname: 'srv', managementIp: '',
  serialNumber: '', description: '', ports: [],
});

const makeCable = (id: string): CableData => ({
  id, name: 'Cable', type: 'general', color: '#fff',
  sourcePortId: 'p1', destPortId: 'p2', bendPoints: [],
  thickness: 2, bendRadius: 10, bundleId: null, notes: '',
});

describe('applyDiff', () => {
  it('null diff makes no changes', () => {
    const diff: RackDiff = { explanation: 'ok', diff: null };
    const result = applyDiff(diff, ['d1'], ['c1']);
    expect(result).toBeNull();
  });

  it('removeDevices filters to existing IDs', () => {
    const diff: RackDiff = {
      explanation: 'removing',
      diff: { removeDevices: ['d1', 'd-nonexistent'] },
    };
    const result = applyDiff(diff, ['d1'], []);
    expect(result?.removeDevices).toEqual(['d1']);
    expect(result?.removeDevices).not.toContain('d-nonexistent');
  });

  it('addCables passes through new cables', () => {
    const diff: RackDiff = {
      explanation: 'adding cable',
      diff: {
        addCables: [{
          id: 'c-new', name: 'New Cable', type: 'general', color: '#fff',
          sourcePortId: 'p1', destPortId: 'p2', bendPoints: [],
          thickness: 2, bendRadius: 10, bundleId: null, notes: '',
        }],
      },
    };
    const result = applyDiff(diff, [], []);
    expect(result?.addCables?.[0].id).toBe('c-new');
  });

  it('returns null when all operations are filtered out', () => {
    const diff: RackDiff = {
      explanation: 'stale',
      diff: { removeDevices: ['d-nonexistent'] },
    };
    const result = applyDiff(diff, [], []);
    expect(result).toBeNull();
  });
});

describe('executeResolvedDiff', () => {
  it('removes devices by ID', () => {
    const devices = [makeDevice('d1'), makeDevice('d2')];
    const resolved: ResolvedDiff = { removeDevices: ['d1'] };
    const { devices: out } = executeResolvedDiff(resolved, devices, [], []);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('d2');
  });

  it('adds devices', () => {
    const resolved: ResolvedDiff = { addDevices: [makeDevice('d-new')] };
    const { devices } = executeResolvedDiff(resolved, [], [], []);
    expect(devices[0].id).toBe('d-new');
  });

  it('updates cable anchor points via updateAnchors', () => {
    const cables = [makeCable('c1')];
    const resolved: ResolvedDiff = {
      updateAnchors: [{ cableId: 'c1', anchors: [{ x: 10, y: 20 }] }],
    };
    const { cables: out } = executeResolvedDiff(resolved, [], cables, []);
    expect(out[0].anchorPoints).toEqual([{ x: 10, y: 20 }]);
  });

  it('does not mutate input arrays', () => {
    const devices = [makeDevice('d1')];
    const resolved: ResolvedDiff = { removeDevices: ['d1'] };
    executeResolvedDiff(resolved, devices, [], []);
    expect(devices).toHaveLength(1); // original unchanged
  });

  it('partial device update preserves existing fields', () => {
    const devices = [makeDevice('d1')];
    const resolved: ResolvedDiff = {
      updateDevices: [{ id: 'd1', name: 'Updated' }],
    };
    const { devices: out } = executeResolvedDiff(resolved, devices, [], []);
    expect(out[0].name).toBe('Updated');
    expect(out[0].rackId).toBe('r1'); // preserved
  });
});
